/**
 * Email sending via Resend.
 *
 * Reuses the existing `AUTH_RESEND_KEY` (Auth.js naming convention) and
 * `EMAIL_FROM` env vars. The Resend client is created lazily so the module can
 * be imported at build time without the key being present.
 *
 * Templates are inline HTML (no extra dependency) but styled to match the
 * Drivecord brand. Only transactional verification codes go through here.
 */
import { Resend } from "resend";

export type EmailPurpose = "signup" | "login_24h" | "2fa" | "email_change";

let _resend: Resend | null = null;

function getResend(): Resend {
  const key = process.env.AUTH_RESEND_KEY;
  if (!key) {
    throw new Error(
      "AUTH_RESEND_KEY est manquant — impossible d'envoyer l'email de vérification.",
    );
  }
  return (_resend ??= new Resend(key));
}

const FROM = process.env.EMAIL_FROM ?? "Drivecord <no-reply@drivecord.app>";

const COPY: Record<
  EmailPurpose,
  { subject: string; title: string; intro: string }
> = {
  signup: {
    subject: "Confirme ton inscription à Drivecord",
    title: "Bienvenue sur Drivecord",
    intro: "Voici ton code pour confirmer ton adresse email :",
  },
  login_24h: {
    subject: "Code de connexion Drivecord",
    title: "Nouvelle connexion",
    intro:
      "Pour sécuriser ton compte, confirme cette connexion avec ce code :",
  },
  "2fa": {
    subject: "Ton code de vérification Drivecord",
    title: "Double authentification",
    intro: "Voici ton code de vérification à usage unique :",
  },
  email_change: {
    subject: "Confirme ta nouvelle adresse email",
    title: "Changement d'adresse email",
    intro: "Confirme ta nouvelle adresse avec ce code :",
  },
};

function renderHtml(
  code: string,
  purpose: EmailPurpose,
  expiresMinutes: number,
): string {
  const c = COPY[purpose];
  const spaced = code.split("").join("&#8202;"); // hair-space for readability
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#0b0b12;color:#e7e7ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b12;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#13131d;border:1px solid #232334;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <div style="display:inline-block;width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6,#d946ef);"></div>
            <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:600;margin-top:12px;">drivecord</div>
          </td></tr>
          <tr><td style="padding:8px 32px 0;">
            <h1 style="font-size:20px;line-height:1.3;margin:12px 0 8px;">${c.title}</h1>
            <p style="font-size:14px;line-height:1.6;color:#a7a7b8;margin:0 0 20px;">${c.intro}</p>
          </td></tr>
          <tr><td style="padding:0 32px;">
            <div style="background:#0b0b12;border:1px solid #2a2a3d;border-radius:12px;padding:18px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#fff;">${spaced}</div>
          </td></tr>
          <tr><td style="padding:18px 32px 28px;">
            <p style="font-size:13px;line-height:1.6;color:#7a7a8c;margin:0;">Ce code expire dans <strong style="color:#a7a7b8;">${expiresMinutes} minutes</strong>. Si tu n'es pas à l'origine de cette demande, ignore cet email — ton compte reste protégé.</p>
          </td></tr>
        </table>
        <p style="font-size:11px;color:#55556a;margin:16px 0 0;">Drivecord · ton cloud illimité, propulsé par Discord</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * Send a 6-digit verification code by email. Throws if Resend rejects the send
 * or the API key is missing — callers should catch and surface a generic error.
 */
export async function sendVerificationEmail(
  email: string,
  code: string,
  purpose: EmailPurpose,
  expiresMinutes = 10,
): Promise<void> {
  const c = COPY[purpose];
  const { error } = await getResend().emails.send({
    from: FROM,
    to: email,
    subject: c.subject,
    html: renderHtml(code, purpose, expiresMinutes),
  });
  if (error) {
    throw new Error(`Échec de l'envoi de l'email : ${error.message}`);
  }
}
