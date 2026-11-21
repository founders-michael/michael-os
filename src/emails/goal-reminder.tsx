import { DetailList, EmailLayout, Intro, Note, ProgressBar } from "@/emails/components";
import { emailTheme } from "@/emails/theme";
import type { EmailBase } from "@/emails/types";

/** A goal check-in: where the goal stands and what comes next. */
export type GoalReminderEmailProps = EmailBase & {
  title: string;
  /** 0–100, as the goal records it. */
  progress: number;
  /** "Wed, 31 Dec", or null for no target date. */
  targetLabel?: string | null;
  /** "40 days left", computed by the caller on the owner's clock. */
  timeLeftLabel?: string | null;
  milestones?: { completed: number; total: number } | null;
  nextMilestone?: string | null;
  goalUrl: string;
};

export default function GoalReminderEmail(props: GoalReminderEmailProps) {
  const kind = emailTheme.kinds.goal;
  return <EmailLayout kind="goal" preview={`${props.title}: ${Math.round(props.progress)}% there`} title={props.title} base={props} action={{ label: "Open goal", href: props.goalUrl }}>
    <Intro base={props} fallback="here's where this goal stands." />
    <ProgressBar percent={props.progress} accent={kind.accent} label={`${Math.round(props.progress)}% complete`} />
    <DetailList tint={kind.tint} extras={props.extras} rows={[
      props.targetLabel ? { label: "Target", value: props.timeLeftLabel ? `${props.targetLabel} · ${props.timeLeftLabel}` : props.targetLabel } : null,
      props.milestones ? { label: "Milestones", value: `${props.milestones.completed} of ${props.milestones.total} done` } : null,
      props.nextMilestone ? { label: "Next", value: props.nextMilestone } : null,
    ]} />
    <Note extras={props.extras} accent={kind.accent} tint={kind.tint} />
  </EmailLayout>;
}
