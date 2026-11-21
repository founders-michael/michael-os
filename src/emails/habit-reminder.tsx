import { DetailList, EmailLayout, Intro, Note, StatRow } from "@/emails/components";
import { emailTheme } from "@/emails/theme";
import type { EmailBase } from "@/emails/types";

/** A habit nudge: today's habit, with the streak that is riding on it. */
export type HabitReminderEmailProps = EmailBase & {
  title: string;
  /** "Every day" or "Mon, Wed, Fri". */
  scheduleLabel: string;
  /** "07:00" or "07:00–07:30", or null for any time. */
  timeLabel?: string | null;
  currentStreak: number;
  bestStreak?: number | null;
  /** 0–100 over the habit's eligible days. */
  completionPercent?: number | null;
  doneToday: boolean;
  habitsUrl: string;
};

export default function HabitReminderEmail(props: HabitReminderEmailProps) {
  const kind = emailTheme.kinds.habit;
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  const stats = [
    { value: days(props.currentStreak), label: "current streak" },
    ...(props.bestStreak !== null && props.bestStreak !== undefined ? [{ value: days(props.bestStreak), label: "best streak" }] : []),
    ...(props.completionPercent !== null && props.completionPercent !== undefined ? [{ value: `${Math.round(props.completionPercent)}%`, label: "completed" }] : []),
  ];
  return <EmailLayout kind="habit" preview={props.doneToday ? `${props.title}: done today` : `Time for ${props.title}`} title={props.title} base={props} action={{ label: "Open habits", href: props.habitsUrl }}>
    <Intro base={props} fallback={props.doneToday ? "this one is already done today. Nice." : props.currentStreak > 0 ? "keep your streak going today." : "today is a good day to start."} />
    <StatRow stats={stats} accent={kind.accent} />
    <DetailList tint={kind.tint} extras={props.extras} rows={[
      { label: "Schedule", value: props.scheduleLabel },
      props.timeLabel ? { label: "Time", value: props.timeLabel } : null,
      { label: "Today", value: props.doneToday ? "Done" : "Not done yet" },
    ]} />
    <Note extras={props.extras} accent={kind.accent} tint={kind.tint} />
  </EmailLayout>;
}
