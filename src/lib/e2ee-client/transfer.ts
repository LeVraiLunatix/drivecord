"use client";

/**
 * Client side of the "approve from another device" flow (protocol in
 * lib/crypto/e2ee/keys.ts). Two roles:
 *   - the NEW device   → `requestKeyTransfer`: asks, shows the 6-digit code, receives MK.
 *   - an UNLOCKED one  → `ApproverSession`: reviews the request, shows the same code,
 *                        and seals MK to the new device only once the user confirms.
 */
import { authFetch } from "@/lib/api-base";
import { publicOrigin } from "@/lib/site-link";
import {
  approvalCommitment,
  approveDevice,
  b64decode,
  b64urlDecode,
  b64urlEncode,
  b64encode,
  completeApproval,
  createApprovalRequest,
  createApproverNonce,
  sasCode,
  verifyApprovalCommitment,
} from "@/lib/crypto/e2ee";
import { getKeyringSnapshot, getMk, unlockWithTransferredKey } from "./keyring";

export type TransferState = {
  id: string;
  status: "pending" | "approved" | "denied" | "expired";
  label: string;
  commitment: string;
  approverNonce: string | null;
  requesterPublicKey: string | null;
  requesterNonce: string | null;
  approverPublicKey: string | null;
  sealedMk: string | null;
  expiresAt: string;
};

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Erreur serveur.");
  return data as T;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });

const POLL_MS = 1500;

// ── QR code: the fast path ───────────────────────────────────────────────────
//
// The new device shows a QR code holding its request id AND the values it committed to (public
// key + nonce). Scanning it with an unlocked phone is itself the authenticated channel: the phone
// checks them against the server's commitment, so nobody has to compare the 6-digit code. The
// values sit in the URL fragment, which browsers never send to a server.

export type QrPayload = { id: string; publicKey: Uint8Array; nonce: Uint8Array };

export function buildApprovalUrl(origin: string, p: QrPayload): string {
  return `${origin}/approve-device#${new URLSearchParams({ id: p.id, k: b64urlEncode(p.publicKey), n: b64urlEncode(p.nonce) })}`;
}

export function parseApprovalFragment(hash: string): QrPayload | null {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  const id = q.get("id");
  const k = q.get("k");
  const n = q.get("n");
  if (!id || !k || !n) return null;
  try {
    const publicKey = b64urlDecode(k);
    const nonce = b64urlDecode(n);
    return publicKey.length === 32 && nonce.length === 16 ? { id, publicKey, nonce } : null;
  } catch {
    return null;
  }
}

// ── New device ───────────────────────────────────────────────────────────────

export async function requestKeyTransfer(
  label: string,
  opts: { onCode: (code: string) => void; onQr?: (url: string) => void; signal?: AbortSignal },
): Promise<void> {
  const userId = getKeyringSnapshot().userId;
  if (!userId) throw new Error("Non connecté.");
  const req = createApprovalRequest();
  const { id } = await api<{ id: string }>("/api/e2ee/transfer", {
    method: "POST",
    body: JSON.stringify({ commitment: await approvalCommitment(req.publicKey, req.nonce), label }),
  });

  opts.onQr?.(buildApprovalUrl(publicOrigin(), { id, publicKey: req.publicKey, nonce: req.nonce }));

  let revealed = false;
  for (;;) {
    await sleep(POLL_MS, opts.signal);
    const st = await api<TransferState>(`/api/e2ee/transfer/${id}`);
    if (st.status === "denied") throw new Error("La demande a été refusée.");
    if (st.status === "expired") throw new Error("La demande a expiré. Recommence.");

    if (st.status === "pending" && st.approverNonce && !revealed) {
      // The approver has picked r2: only now do we reveal our key and nonce.
      await api(`/api/e2ee/transfer/${id}`, {
        method: "POST",
        body: JSON.stringify({ action: "reveal", requesterPublicKey: b64encode(req.publicKey), requesterNonce: b64encode(req.nonce) }),
      });
      revealed = true;
      opts.onCode(await sasCode(req.nonce, b64decode(st.approverNonce), req.publicKey));
    }

    if (st.status === "approved" && st.sealedMk && st.approverPublicKey) {
      const mk = await completeApproval(userId, req.secretKey, req.publicKey, b64decode(st.approverPublicKey), st.sealedMk);
      unlockWithTransferredKey(mk);
      return;
    }
  }
}

// ── Unlocked device ──────────────────────────────────────────────────────────

export async function listPendingTransfers(): Promise<TransferState[]> {
  const d = await api<{ requests: Omit<TransferState, "status" | "approverPublicKey" | "sealedMk">[] }>("/api/e2ee/transfer");
  return d.requests.map((r) => ({ ...r, status: "pending", approverPublicKey: null, sealedMk: null }));
}

/** One review of one request. Keeps r2 in memory: the code must use OUR nonce, never the server's echo. */
export class ApproverSession {
  private r2 = createApproverNonce();
  private requesterKey: Uint8Array | null = null;

  constructor(readonly id: string) {}

  /** Step 2: pick r2 (after the request's commitment is fixed). */
  async challenge(): Promise<void> {
    await api(`/api/e2ee/transfer/${this.id}`, { method: "POST", body: JSON.stringify({ action: "challenge", approverNonce: b64encode(this.r2) }) });
  }

  /** Wait for the new device's reveal, verify it against the commitment, return the code to compare. */
  async awaitCode(signal?: AbortSignal): Promise<string> {
    for (;;) {
      const st = await api<TransferState>(`/api/e2ee/transfer/${this.id}`);
      if (st.status !== "pending") throw new Error("Cette demande n'est plus valable.");
      if (st.requesterPublicKey && st.requesterNonce) {
        const pub = b64decode(st.requesterPublicKey);
        const nonce = b64decode(st.requesterNonce);
        if (!(await verifyApprovalCommitment(st.commitment, pub, nonce))) {
          throw new Error("La demande est incohérente (possible falsification) : refusée.");
        }
        this.requesterKey = pub;
        return sasCode(nonce, this.r2, pub);
      }
      await sleep(POLL_MS, signal);
    }
  }

  /**
   * Approval from a scanned QR code: the request's commitment must match the key and nonce in the
   * QR, which replaces the code comparison. Returns the device label to show beforehand.
   */
  static async inspectQr(qr: QrPayload): Promise<{ label: string }> {
    const st = await api<TransferState>(`/api/e2ee/transfer/${qr.id}`);
    if (st.status !== "pending") throw new Error("Cette demande n'est plus valable : relance-la sur le nouvel appareil.");
    if (!(await verifyApprovalCommitment(st.commitment, qr.publicKey, qr.nonce))) throw new Error("Ce QR code ne correspond pas à la demande : refusé.");
    return { label: st.label };
  }

  /** After the user confirmed in the UI: pick r2, wait for the reveal, check it is the QR's key, seal MK. */
  async approveWithQr(qr: QrPayload, signal?: AbortSignal): Promise<void> {
    await ApproverSession.inspectQr(qr);
    this.requesterKey = qr.publicKey;
    await this.challenge();
    const expected = b64encode(qr.publicKey);
    for (let i = 0; i < 40; i++) {
      const st = await api<TransferState>(`/api/e2ee/transfer/${this.id}`);
      if (st.status !== "pending") throw new Error("Cette demande n'est plus valable.");
      if (st.requesterPublicKey) {
        if (st.requesterPublicKey !== expected) throw new Error("La demande est incohérente (possible falsification) : refusée.");
        return this.approve();
      }
      await sleep(1000, signal);
    }
    throw new Error("Le nouvel appareil ne répond pas. Réessaie.");
  }

  /** Only after the user confirmed the two codes match. */
  async approve(): Promise<void> {
    if (!this.requesterKey) throw new Error("Code non vérifié.");
    const userId = getKeyringSnapshot().userId;
    if (!userId) throw new Error("Non connecté.");
    const { approverPublicKey, sealedMk } = await approveDevice(userId, getMk(), this.requesterKey);
    await api(`/api/e2ee/transfer/${this.id}`, {
      method: "POST",
      body: JSON.stringify({ action: "approve", approverPublicKey: b64encode(approverPublicKey), sealedMk }),
    });
  }

  async deny(): Promise<void> {
    await api(`/api/e2ee/transfer/${this.id}`, { method: "POST", body: JSON.stringify({ action: "deny" }) });
  }
}
