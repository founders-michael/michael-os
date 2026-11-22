import { createElement, type ComponentType } from "react";
import { render } from "@react-email/render";
import TaskReminderEmail, { type TaskReminderEmailProps } from "@/emails/task-reminder";
import GoalDigestEmail, { goalDigestTitle, type GoalDigestEmailProps } from "@/emails/goal-digest";
import HabitDigestEmail, { habitDigestTitle, type HabitDigestEmailProps } from "@/emails/habit-digest";
import { emailTheme } from "@/emails/theme";
import type { LogoSource } from "@/emails/types";

/**
 * Every email template, by name: its component and its subject line. Adding a
 * template is one entry here plus its file; sending, previews and tests pick
 * it up from this table.
 */
type WithoutLogo<P> = Omit<P, "logo">;
export const emailTemplates = {
  taskReminder: { component: TaskReminderEmail, subject: (p: WithoutLogo<TaskReminderEmailProps>) => `Reminder: ${p.title}` },
  goalDigest: { component: GoalDigestEmail, subject: (p: WithoutLogo<GoalDigestEmailProps>) => `${p.periodLabel}'s goal check-in: ${goalDigestTitle(p).replace("Your goals: ", "")}` },
  habitDigest: { component: HabitDigestEmail, subject: (p: WithoutLogo<HabitDigestEmailProps>) => habitDigestTitle(p) },
} as const;

export type EmailTemplateName = keyof typeof emailTemplates;
export type EmailTemplateProps = {
  taskReminder: WithoutLogo<TaskReminderEmailProps>;
  goalDigest: WithoutLogo<GoalDigestEmailProps>;
  habitDigest: WithoutLogo<HabitDigestEmailProps>;
};

/** The logo's content id when it travels as an inline attachment (`cid:` in the HTML). */
export const LOGO_CONTENT_ID = "michael-logo";

/** Subject, HTML and plain text for one email. The caller decides where the logo comes from. */
export async function renderEmail<N extends EmailTemplateName>(name: N, props: EmailTemplateProps[N], logo: LogoSource) {
  const template = emailTemplates[name];
  // The table pairs each name with its own props type; TypeScript cannot follow that through the generic.
  const component = template.component as unknown as ComponentType<Record<string, unknown>>;
  const element = createElement(component, { ...(props as Record<string, unknown>), logo });
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  const subject = (template.subject as (p: EmailTemplateProps[N]) => string)(props).slice(0, 200);
  return { subject, html, text };
}

export { emailTheme };
