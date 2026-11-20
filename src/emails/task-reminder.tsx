import { Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

/**
 * The task reminder email (React Email). Rendered to HTML and plain text by
 * src/lib/reminder-email.ts and sent through Resend.
 *
 * Email clients cannot use the app's CSS variables, so this file uses the
 * light theme's literal values (michael-theme.css), the same ones the
 * verification email uses. It is the one place in the app where colours are
 * written as hex.
 */
export type TaskReminderEmailProps = {
  greetingName: string | null;
  title: string;
  /** "Due Fri, 21 Nov" or null for no due date. */
  dueLabel: string | null;
  /** "Reminder set for 09:00 (Asia/Kolkata)". */
  reminderLabel: string;
  taskUrl: string;
  settingsUrl: string;
};

const colors = { page: "#F5F7FA", card: "#FFFFFF", text: "#0B1220", muted: "#526071", faint: "#5F6B7B", border: "#E3E8EE", accent: "#047857" };

export default function TaskReminderEmail({ greetingName, title, dueLabel, reminderLabel, taskUrl, settingsUrl }: TaskReminderEmailProps) {
  return <Html lang="en">
    <Head />
    <Preview>{`Reminder: ${title}`}</Preview>
    <Body style={{ margin: 0, padding: "24px 12px", backgroundColor: colors.page, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      <Container style={{ maxWidth: 520, margin: "0 auto", padding: 28, backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14 }}>
        <Text style={{ margin: "0 0 4px", color: colors.accent, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>MICHAELOS REMINDER</Text>
        <Heading as="h1" style={{ margin: "0 0 12px", color: colors.text, fontSize: 22, lineHeight: "30px" }}>{title}</Heading>
        <Text style={{ margin: "0 0 4px", color: colors.text, fontSize: 15 }}>{greetingName ? `Hi ${greetingName}, here's the reminder you set.` : "Here's the reminder you set."}</Text>
        <Section style={{ margin: "12px 0 20px" }}>
          {dueLabel && <Text style={{ margin: "0 0 2px", color: colors.muted, fontSize: 14 }}>{dueLabel}</Text>}
          <Text style={{ margin: 0, color: colors.muted, fontSize: 14 }}>{reminderLabel}</Text>
        </Section>
        <Button href={taskUrl} style={{ display: "inline-block", padding: "12px 18px", backgroundColor: colors.accent, color: "#FFFFFF", borderRadius: 10, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>Open in MichaelOS</Button>
        <Hr style={{ margin: "24px 0 12px", borderColor: colors.border }} />
        <Text style={{ margin: 0, color: colors.faint, fontSize: 12, lineHeight: "18px" }}>
          You get this because you set a reminder on this task. To stop reminder emails, turn them off in <Link href={settingsUrl} style={{ color: colors.accent }}>Settings → Notifications</Link>.
        </Text>
      </Container>
    </Body>
  </Html>;
}

/** Shown by the React Email preview server, if it is ever run. */
TaskReminderEmail.PreviewProps = {
  greetingName: "Sam", title: "Submit the tax form", dueLabel: "Due Fri, 21 Nov", reminderLabel: "Reminder set for 09:00 (Asia/Kolkata)",
  taskUrl: "https://example.com/tasks", settingsUrl: "https://example.com/settings/notifications",
} satisfies TaskReminderEmailProps;
