import type { ReactNode } from "react";
import { Body, Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from "@react-email/components";
import { emailTheme, type EmailKind } from "@/emails/theme";
import type { EmailBase, EmailExtras, LogoSource } from "@/emails/types";

/**
 * The building blocks every MichaelOS email is made of. Templates compose
 * these; they never style the frame, logo or footer themselves, so every email
 * looks like the same product.
 */
const c = emailTheme.colors;

function logoSrc(logo: LogoSource) {
  return logo.kind === "cid" ? `cid:${logo.contentId}` : logo.src;
}

export function EmailLayout({ kind, preview, title, base, children, action }: {
  kind: EmailKind; preview: string; title: string; base: EmailBase; children: ReactNode;
  action: { label: string; href: string };
}) {
  const accent = emailTheme.kinds[kind];
  const extras = base.extras;
  return <Html lang="en">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={{ margin: 0, padding: "24px 12px", backgroundColor: c.page, fontFamily: emailTheme.font }}>
      <Container style={{ maxWidth: 560, margin: "0 auto" }}>
        <Section style={{ padding: "4px 4px 18px" }}>
          <Img src={logoSrc(base.logo)} width={emailTheme.logo.width} height={emailTheme.logo.height} alt={emailTheme.logo.alt} style={{ display: "block", border: 0 }} />
        </Section>
        <Section style={{ backgroundColor: c.card, border: `1px solid ${c.border}`, borderRadius: emailTheme.radius.card, borderTop: `4px solid ${accent.accent}`, padding: "28px 28px 24px" }}>
          <Text style={{ margin: "0 0 6px", color: accent.accent, fontSize: 12, fontWeight: 700, letterSpacing: 1.2 }}>{accent.kicker}</Text>
          <Text style={{ margin: "0 0 14px", color: c.text, fontSize: 24, lineHeight: "32px", fontWeight: 700 }}>{title}</Text>
          {children}
          <Section style={{ margin: "22px 0 0" }}>
            <Button href={action.href} style={{ display: "inline-block", padding: "12px 20px", backgroundColor: accent.accent, color: c.onAccent, borderRadius: emailTheme.radius.button, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>{action.label}</Button>
            {extras?.secondaryAction && <Link href={extras.secondaryAction.href} style={{ marginLeft: 16, color: accent.accent, fontSize: 14, fontWeight: 600 }}>{extras.secondaryAction.label}</Link>}
          </Section>
        </Section>
        <EmailFooter extras={extras} settingsUrl={base.settingsUrl} accent={accent.accent} />
      </Container>
    </Body>
  </Html>;
}

function EmailFooter({ extras, settingsUrl, accent }: { extras?: EmailExtras; settingsUrl: string; accent: string }) {
  return <Section style={{ padding: "18px 8px 0" }}>
    {extras?.footerNote && <Text style={{ margin: "0 0 10px", color: c.muted, fontSize: 13, lineHeight: "20px" }}>{extras.footerNote}</Text>}
    <Hr style={{ margin: "0 0 12px", borderColor: c.border }} />
    <Text style={{ margin: 0, color: c.faint, fontSize: 12, lineHeight: "18px" }}>
      You get this because reminder emails are on for your {emailTheme.brand} account. To change what you get, or turn them off, go to <Link href={settingsUrl} style={{ color: accent }}>Settings → Notifications</Link>.
    </Text>
  </Section>;
}

/** The opening line: the extras' intro when given, otherwise the template's default. */
export function Intro({ base, fallback }: { base: EmailBase; fallback: string }) {
  const text = base.extras?.intro ?? (base.greetingName ? `Hi ${base.greetingName}, ${fallback}` : fallback.charAt(0).toUpperCase() + fallback.slice(1));
  return <Text style={{ margin: "0 0 16px", color: c.text, fontSize: 15, lineHeight: "22px" }}>{text}</Text>;
}

/** Labelled facts in a soft panel; the template's rows first, then any from the extras. */
export function DetailList({ rows, extras, tint }: { rows: Array<{ label: string; value: string } | null>; extras?: EmailExtras; tint: string }) {
  const all = [...rows.filter((row): row is { label: string; value: string } => row !== null), ...(extras?.details ?? [])];
  if (all.length === 0) return null;
  return <Section style={{ backgroundColor: tint, borderRadius: emailTheme.radius.panel, padding: "12px 16px" }}>
    {all.map(({ label, value }) => <Text key={`${label}:${value}`} style={{ margin: "4px 0", fontSize: 14, lineHeight: "20px", color: c.text }}>
      <span style={{ color: c.muted, display: "inline-block", minWidth: 110 }}>{label}</span> {value}
    </Text>)}
  </Section>;
}

/** A row of big numbers ("12 day streak"), for habits and goals. */
export function StatRow({ stats, accent }: { stats: Array<{ value: string; label: string }>; accent: string }) {
  return <Section style={{ margin: "0 0 16px" }}>
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse" }}>
      <tbody><tr>
        {stats.map((stat) => <td key={stat.label} style={{ padding: "0 8px 0 0", verticalAlign: "top" }}>
          <Text style={{ margin: 0, color: accent, fontSize: 26, lineHeight: "32px", fontWeight: 700 }}>{stat.value}</Text>
          <Text style={{ margin: 0, color: c.muted, fontSize: 12, lineHeight: "16px" }}>{stat.label}</Text>
        </td>)}
      </tr></tbody>
    </table>
  </Section>;
}

/** A progress bar built from a table, which every email client renders (no CSS gradients or flexbox). */
export function ProgressBar({ percent, accent, label }: { percent: number; accent: string; label: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return <Section style={{ margin: "0 0 16px" }}>
    <Text style={{ margin: "0 0 6px", color: c.text, fontSize: 14, fontWeight: 600 }}>{label}</Text>
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse", backgroundColor: c.track, borderRadius: 999 }}>
      <tbody><tr>
        {value > 0 && <td width={`${value}%`} style={{ height: 10, backgroundColor: accent, borderRadius: 999, fontSize: 0, lineHeight: "10px" }}>&nbsp;</td>}
        {value < 100 && <td style={{ height: 10, fontSize: 0, lineHeight: "10px" }}>&nbsp;</td>}
      </tr></tbody>
    </table>
  </Section>;
}

/** The extras' highlighted note, or nothing. */
export function Note({ extras, accent, tint }: { extras?: EmailExtras; accent: string; tint: string }) {
  if (!extras?.note) return null;
  return <Section style={{ margin: "16px 0 0", backgroundColor: tint, borderLeft: `3px solid ${accent}`, borderRadius: 8, padding: "10px 14px" }}>
    {extras.note.title && <Text style={{ margin: "0 0 2px", color: c.text, fontSize: 14, fontWeight: 700 }}>{extras.note.title}</Text>}
    <Text style={{ margin: 0, color: c.text, fontSize: 14, lineHeight: "20px" }}>{extras.note.text}</Text>
  </Section>;
}

/** Free text from the user (task notes), clipped so an email never carries a whole document. */
export function Quote({ text, max = 280 }: { text: string; max?: number }) {
  const clipped = text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  return <Text style={{ margin: "14px 0 0", padding: "0 0 0 12px", borderLeft: `3px solid ${c.border}`, color: c.muted, fontSize: 14, lineHeight: "20px", whiteSpace: "pre-line" }}>{clipped}</Text>;
}
