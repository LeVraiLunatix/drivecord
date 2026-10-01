/**
 * Best-effort audit trail of API calls. Written after the response is sent,
 * never allowed to fail (or slow) a request, and purged after 30 days.
 */
import { isIP } from "net";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export const AUDIT_RETENTION_DAYS = 30;

/** IPv4 → /24 (`1.2.3.0`), IPv6 → /48 (`2001:db8:1::`). Enough to spot abuse, not to track a person. */
export function truncateIp(ip: string): string {
  const v = ip.trim().toLowerCase();
  const mapped = v.startsWith("::ffff:") && isIP(v.slice(7)) === 4 ? v.slice(7) : v;
  const kind = isIP(mapped);
  if (kind === 4) return `${mapped.split(".").slice(0, 3).join(".")}.0`;
  if (kind === 6) {
    // Expand `::` so the first three groups are really the first three.
    const [head = "", tail = ""] = mapped.split("::");
    const h = head ? head.split(":") : [];
    const t = tail ? tail.split(":") : [];
    const groups = mapped.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
    return `${groups.slice(0, 3).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::`;
  }
  return "unknown";
}

export type AuditEntry = {
  apiKeyId?: string | null;
  appId?: string | null;
  userId?: string | null;
  route: string;
  method: string;
  status: number;
  ip: string;
};

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.apiAuditLog.create({
      data: {
        apiKeyId: entry.apiKeyId ?? null,
        appId: entry.appId ?? null,
        userId: entry.userId ?? null,
        route: entry.route,
        method: entry.method,
        status: entry.status,
        ip: truncateIp(entry.ip),
      },
    });
    // Lazy retention: at most one purge an hour, whichever request gets there first.
    const gate = await rateLimit("apiaudit:purge", 1, 3600);
    if (gate.ok) {
      await prisma.apiAuditLog.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - AUDIT_RETENTION_DAYS * 86_400_000) } },
      });
    }
  } catch (err) {
    console.warn("[api-audit] write failed", err instanceof Error ? err.message : err);
  }
}
