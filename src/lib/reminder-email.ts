import "server-only";

import { createElement } from "react";
import { render } from "@react-email/render";
import TaskReminderEmail, { type TaskReminderEmailProps } from "@/emails/task-reminder";

/** The reminder email as Resend sends it: subject, HTML and a plain-text part, from the React Email template. */
export async function buildTaskReminderEmail(props: TaskReminderEmailProps) {
  const element = createElement(TaskReminderEmail, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: `Reminder: ${props.title}`.slice(0, 200), html, text };
}
