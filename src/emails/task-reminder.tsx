import { DetailList, EmailLayout, Intro, Note, Quote } from "@/emails/components";
import { emailTheme } from "@/emails/theme";
import type { EmailBase } from "@/emails/types";

/** A task reminder. Optional fields render only when given; `extras` adds more (types.ts). */
export type TaskReminderEmailProps = EmailBase & {
  title: string;
  /** "Sat, 22 Nov", or null for no due date. */
  dueLabel: string | null;
  /** "09:00 (Asia/Kolkata)". */
  reminderLabel: string;
  priority?: "Low" | "Medium" | "High" | null;
  /** "Every Mon, Thu" for a repeating task. */
  repeatLabel?: string | null;
  /** Titles of the goals this task supports. */
  goals?: string[];
  /** The task's notes; shown clipped. */
  notes?: string | null;
  taskUrl: string;
};

export default function TaskReminderEmail(props: TaskReminderEmailProps) {
  const kind = emailTheme.kinds.task;
  return <EmailLayout kind="task" preview={`Reminder: ${props.title}`} title={props.title} base={props} action={{ label: "Open task", href: props.taskUrl }}>
    <Intro base={props} fallback="here's the reminder you set." />
    <DetailList tint={kind.tint} extras={props.extras} rows={[
      props.dueLabel ? { label: "Due", value: props.dueLabel } : null,
      { label: "Reminder", value: props.reminderLabel },
      props.priority ? { label: "Priority", value: props.priority } : null,
      props.repeatLabel ? { label: "Repeats", value: props.repeatLabel } : null,
      props.goals?.length ? { label: props.goals.length === 1 ? "Goal" : "Goals", value: props.goals.join(", ") } : null,
    ]} />
    {props.notes && <Quote text={props.notes} />}
    <Note extras={props.extras} accent={kind.accent} tint={kind.tint} />
  </EmailLayout>;
}
