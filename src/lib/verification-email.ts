/**
 * The verification email and the rules around who receives one.
 *
 * Pure, so the copy and the escaping are unit-tested; `email-sender.ts` does
 * the sending. Email clients ignore CSS variables and stylesheets, so the
 * colours below are the light theme's token values written inline
 * (`--m-bg`, `--m-surface`, `--m-text`, `--m-muted`, `--m-fill`, `--m-onfill`,
 * `--m-border`) — the one place outside michael-theme.css that spells them.
 */

/** How long a verification link stays valid. Better Auth signs it with this. */
export const EMAIL_VERIFICATION_EXPIRES_SECONDS = 60 * 60;

const RESERVED_TEST_DOMAINS = [".test", ".example", ".invalid", ".localhost"];
const RESERVED_EXAMPLE_DOMAINS = ["example.com", "example.net", "example.org"];

/**
 * Addresses on the domains RFC 2606 / RFC 6761 reserve for testing can never
 * receive mail. Smoke scripts sign up with them; sending would only bounce
 * and damage the sending domain's reputation, so these are logged instead.
 */
export function isUndeliverableTestAddress(email: string) {
  const at = email.lastIndexOf("@");
  const domain = at < 0 ? "" : email.slice(at + 1).trim().toLowerCase();
  if (!domain) return true;
  return RESERVED_TEST_DOMAINS.some((suffix) => domain.endsWith(suffix) || domain === suffix.slice(1))
    || RESERVED_EXAMPLE_DOMAINS.some((reserved) => domain === reserved || domain.endsWith(`.${reserved}`));
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** First name only, trimmed and bounded: a greeting, not a place for a payload. */
function greetingName(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.slice(0, 40);
}

export function buildVerificationEmail({ name, url, expiresInSeconds = EMAIL_VERIFICATION_EXPIRES_SECONDS }: { name: string; url: string; expiresInSeconds?: number }) {
  const first = greetingName(name);
  const minutes = Math.round(expiresInSeconds / 60);
  const lifetime = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minutes`;
  const greeting = first ? `Hi ${first},` : "Hi,";
  const subject = "Verify your email for MichaelOS";

  const text = [
    greeting,
    "",
    "Confirm this is your email address to finish setting up MichaelOS:",
    url,
    "",
    `The link works once and expires in ${lifetime}.`,
    "If you didn't create a MichaelOS account, you can ignore this email.",
  ].join("\n");

  const safeUrl = escapeHtml(url);
  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B1220">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid #E3E8EE;border-radius:18px">
<tr><td style="padding:32px">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5F6B7B;font-weight:600">MichaelOS</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-.02em">Verify your email</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${escapeHtml(greeting)}</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5">Confirm this is your email address to finish setting up MichaelOS.</p>
<a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#0B1220;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none">Verify email</a>
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#526071">The link works once and expires in ${lifetime}. If the button doesn't work, paste this into your browser:<br><a href="${safeUrl}" style="color:#047857;word-break:break-all">${safeUrl}</a></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#526071">If you didn't create a MichaelOS account, you can ignore this email.</p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  return { subject, text, html };
}
