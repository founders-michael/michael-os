import { Section, Text } from "@react-email/components";
import { DetailList, EmailLayout, Intro, Note } from "@/emails/components";
import { emailTheme } from "@/emails/theme";
import type { EmailBase } from "@/emails/types";

/** One habit as the nudge lists it. */
export type HabitDigestItem = {
  title: string;
  /** "07:00" or "07:00–07:30", or null for any time today. */
  timeLabel: string | null;
  currentStreak: number;
  doneToday: boolean;
};

/**
 * The habit nudge: today's habits in the morning, what is still to do in the
 * evening. One email for all of them, at the time the user chose.
 */
export type HabitDigestEmailProps = EmailBase & {
  slot: "morning" | "evening";
  /** "Monday, 23 Nov" on the user's clock. */
  dayLabel: string;
  habits: HabitDigestItem[];
  /** How many of today's habits are already done (for the evening line). */
  doneCount: number;
  habitsUrl: string;
};

const c = emailTheme.colors;

export function habitDigestTitle(props: Pick<HabitDigestEmailProps, "slot" | "habits">) {
  const n = props.habits.length;
  return props.slot === "morning" ? `Today's habits: ${n} to do` : `Still to do today: ${n} ${n === 1 ? "habit" : "habits"}`;
}

export default function HabitDigestEmail(props: HabitDigestEmailProps) {
  const kind = emailTheme.kinds.habit;
  const title = habitDigestTitle(props);
  return <EmailLayout kind="habit" preview={title} title={title} base={props} action={{ label: "Open habits", href: props.habitsUrl }}>
    <Intro base={props} fallback={props.slot === "morning" ? `here's what's on for ${props.dayLabel}.` : props.doneCount > 0 ? `${props.doneCount} done today. A few still to go.` : "these are still open today."} />
    <Section style={{ margin: "0 0 4px" }}>
      {props.habits.map((habit) => <Section key={habit.title} style={{ padding: "10px 14px", margin: "0 0 8px", backgroundColor: kind.tint, borderRadius: emailTheme.radius.panel }}>
        <Text style={{ margin: 0, color: c.text, fontSize: 15, fontWeight: 600 }}>{habit.title}</Text>
        <Text style={{ margin: "2px 0 0", color: c.muted, fontSize: 13 }}>
          {`${habit.timeLabel ?? "Any time today"} · ${habit.currentStreak > 0 ? `${habit.currentStreak}-day streak` : "Start a streak today"}${habit.doneToday ? " · Done" : ""}`}
        </Text>
      </Section>)}
    </Section>
    <DetailList tint={kind.tint} extras={props.extras} rows={[]} />
    <Note extras={props.extras} accent={kind.accent} tint={kind.tint} />
  </EmailLayout>;
}
