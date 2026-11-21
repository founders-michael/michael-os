import "server-only";

import { emailTheme } from "@/emails/theme";
import { MICHAEL_LOGO_PNG_BASE64 } from "@/emails/assets/michael-logo";
import { LOGO_CONTENT_ID, renderEmail, type EmailTemplateName, type EmailTemplateProps } from "@/emails/render";
import type { InlineAttachment } from "@/lib/email-sender";

/**
 * A template rendered for sending: the logo travels inside the email as an
 * inline attachment (`cid:`), so it shows in every client without the app
 * being publicly hosted and without remote-image prompts. The logo is bundled
 * as base64 (src/emails/assets/michael-logo.ts), never read from disk.
 */
const LOGO: InlineAttachment = { filename: emailTheme.logo.file, content: MICHAEL_LOGO_PNG_BASE64, contentId: LOGO_CONTENT_ID };

export async function buildEmail<N extends EmailTemplateName>(name: N, props: EmailTemplateProps[N]) {
  const message = await renderEmail(name, props, { kind: "cid", contentId: LOGO_CONTENT_ID });
  return { ...message, inline: [LOGO] };
}
