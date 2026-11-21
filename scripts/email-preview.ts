/**
 * Renders every email template with its sample content to .email-previews/
 * (not committed), so a design change can be checked in a browser without
 * sending anything: `npm run email:preview`, then open the printed files.
 * The logo is embedded as a data URI here; sent emails attach it instead.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { emailTemplates, renderEmail, type EmailTemplateName } from "../src/emails/render";
import { emailSamples } from "../src/emails/samples";
import { MICHAEL_LOGO_PNG_BASE64 } from "../src/emails/assets/michael-logo";

const out = path.join(process.cwd(), ".email-previews");
await mkdir(out, { recursive: true });
const logo = MICHAEL_LOGO_PNG_BASE64;
const samples = emailSamples("http://localhost:3000");
for (const name of Object.keys(emailTemplates) as EmailTemplateName[]) {
  const { subject, html } = await renderEmail(name, samples[name] as never, { kind: "src", src: `data:image/png;base64,${logo}` });
  const file = path.join(out, `${name}.html`);
  await writeFile(file, html);
  console.log(`${subject}\n  ${file}`);
}
