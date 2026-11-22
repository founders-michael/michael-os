import { Section, Text } from "@react-email/components";
import { DetailList, EmailLayout, Intro, Note, ProgressBar } from "@/emails/components";
import { emailTheme } from "@/emails/theme";
import type { EmailBase } from "@/emails/types";

/** One goal as the check-in shows it: where it stands and the next step. */
export type GoalDigestItem = {
  title: string;
  progress: number;
  /** "Wed, 31 Dec · 40 days left" (or "· overdue"), or null with no target date. */
  targetLabel: string | null;
  milestones: { completed: number; total: number } | null;
  /** The next unfinished milestone: the goal's next step. */
  nextStep: string | null;
};

/** The goal check-in: every active goal's progress and next step, daily, weekly or monthly as chosen. */
export type GoalDigestEmailProps = EmailBase & {
  /** "This week", "Today" or "This month". */
  periodLabel: string;
  goals: GoalDigestItem[];
  goalsUrl: string;
};

const c = emailTheme.colors;

export function goalDigestTitle(props: Pick<GoalDigestEmailProps, "goals">) {
  const n = props.goals.length;
  return `Your goals: ${n} in progress`;
}

export default function GoalDigestEmail(props: GoalDigestEmailProps) {
  const kind = emailTheme.kinds.goal;
  const title = goalDigestTitle(props);
  return <EmailLayout kind="goal" preview={`${props.periodLabel}'s goal check-in`} title={title} base={props} action={{ label: "Open goals", href: props.goalsUrl }}>
    <Intro base={props} fallback="here's where your goals stand, and the next step for each." />
    {props.goals.map((goal) => <Section key={goal.title} style={{ padding: "14px 16px 2px", margin: "0 0 10px", border: `1px solid ${c.border}`, borderRadius: emailTheme.radius.panel }}>
      <Text style={{ margin: "0 0 8px", color: c.text, fontSize: 16, fontWeight: 700 }}>{goal.title}</Text>
      <ProgressBar percent={goal.progress} accent={kind.accent} label={`${Math.round(goal.progress)}% complete`} />
      {goal.targetLabel && <Text style={{ margin: "0 0 4px", color: c.muted, fontSize: 13 }}>{`Target: ${goal.targetLabel}`}</Text>}
      {goal.milestones && goal.milestones.total > 0 && <Text style={{ margin: "0 0 4px", color: c.muted, fontSize: 13 }}>{`Milestones: ${goal.milestones.completed} of ${goal.milestones.total} done`}</Text>}
      <Text style={{ margin: "0 0 12px", color: c.text, fontSize: 14 }}>
        <span style={{ color: kind.accent, fontWeight: 700 }}>Next step: </span>{goal.nextStep ?? "Add a milestone to plan the next step."}
      </Text>
    </Section>)}
    <DetailList tint={kind.tint} extras={props.extras} rows={[]} />
    <Note extras={props.extras} accent={kind.accent} tint={kind.tint} />
  </EmailLayout>;
}
