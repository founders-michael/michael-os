import { createElement, type ComponentType } from "react";
import { render } from "@react-email/render";
import TaskReminderEmail, { type TaskReminderEmailProps } from "@/emails/task-reminder";
import GoalReminderEmail, { type GoalReminderEmailProps } from "@/emails/goal-reminder";
import HabitReminderEmail, { type HabitReminderEmailProps } from "@/emails/habit-reminder";
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
  goalReminder: { component: GoalReminderEmail, subject: (p: WithoutLogo<GoalReminderEmailProps>) => `Goal check-in: ${p.title}` },
  habitReminder: { component: HabitReminderEmail, subject: (p: WithoutLogo<HabitReminderEmailProps>) => p.doneToday ? `${p.title}: done today` : `Habit reminder: ${p.title}` },
} as const;

export type EmailTemplateName = keyof typeof emailTemplates;
export type EmailTemplateProps = {
  taskReminder: WithoutLogo<TaskReminderEmailProps>;
  goalReminder: WithoutLogo<GoalReminderEmailProps>;
  habitReminder: WithoutLogo<HabitReminderEmailProps>;
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
