/**
 * Sends one email of every template, with sample content, to an address you
 * name, through Resend (RESEND_API_KEY and EMAIL_FROM in .env.local), with the
 * logo attached inline exactly as real reminders are sent:
 *
 *   npm run email:send-samples -- you@example.com
 */
import dotenv from "dotenv";
import { emailTemplates, LOGO_CONTENT_ID, renderEmail, type EmailTemplateName } from "../src/emails/render";
import { emailSamples } from "../src/emails/samples";
import { emailTheme } from "../src/emails/theme";
import { MICHAEL_LOGO_PNG_BASE64 } from "../src/emails/assets/michael-logo";

dotenv.config({ path: ".env.local" });
const to = process.argv[2];
if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error("Usage: npm run email:send-samples -- you@example.com");
const { RESEND_API_KEY: apiKey, EMAIL_FROM: from } = process.env;
if (!apiKey || !from) throw new Error("Set RESEND_API_KEY and EMAIL_FROM in .env.local.");
const origin = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
const logo = MICHAEL_LOGO_PNG_BASE64;
const samples = emailSamples(origin);
for (const name of Object.keys(emailTemplates) as EmailTemplateName[]) {
  const { subject, html, text } = await renderEmail(name, samples[name] as never, { kind: "cid", contentId: LOGO_CONTENT_ID });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from, to: [to], subject, html, text,
      headers: { "List-Unsubscribe": `<${samples[name].settingsUrl}>` },
      attachments: [{ filename: emailTheme.logo.file, content: logo, content_id: LOGO_CONTENT_ID }],
    }),
  });
  console.log(`${response.status} ${subject} ${response.ok ? "" : await response.text()}`);
}
