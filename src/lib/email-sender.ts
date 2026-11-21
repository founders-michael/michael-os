import "server-only";

import { isUndeliverableTestAddress } from "@/lib/verification-email";

/**
 * Sends transactional email through Resend's HTTP API.
 *
 * `RESEND_API_KEY` and `EMAIL_FROM` configure it. Without a key, development
 * logs that a message was suppressed (and the verification link, so the flow
 * can be finished locally); production refuses, because a user waiting on an
 * email that was never sent is locked out. Reserved test domains are never
 * sent to — see `isUndeliverableTestAddress`.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;
const DEVELOPMENT_FROM = "MichaelOS <onboarding@resend.dev>";

export class EmailDeliveryError extends Error {}

/** An inline image: referenced from the HTML as `cid:<contentId>` (the email logo). */
export type InlineAttachment = { filename: string; content: string; contentId: string };
export type OutgoingEmail = { to: string; subject: string; html: string; text: string; devLink?: string; headers?: Record<string, string>; inline?: InlineAttachment[] };

export async function sendEmail(message: OutgoingEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const production = process.env.NODE_ENV === "production";

  if (isUndeliverableTestAddress(message.to) || (!apiKey && !production)) {
    // The address is deliberately not logged (rule 5): only that a message was suppressed.
    console.info(`[email] Not sent (${apiKey ? "reserved test address" : "RESEND_API_KEY not set"}): ${message.subject}${message.devLink && !production ? ` — ${message.devLink}` : ""}`);
    return;
  }
  if (!apiKey) throw new EmailDeliveryError("Email delivery is not configured.");

  const from = process.env.EMAIL_FROM ?? (production ? undefined : DEVELOPMENT_FROM);
  if (!from) throw new EmailDeliveryError("EMAIL_FROM must be set to send email.");

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from, to: [message.to], subject: message.subject, html: message.html, text: message.text,
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.inline?.length ? { attachments: message.inline.map(({ filename, content, contentId }) => ({ filename, content, content_id: contentId })) } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    console.error("[email] Resend request failed before a response.");
    throw new EmailDeliveryError("We couldn't send the email.");
  }
  if (!response.ok) {
    console.error(`[email] Resend rejected the message (${response.status}).`);
    throw new EmailDeliveryError("We couldn't send the email.");
  }
}
