import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, CalendarDays, Check, Clock3, Flame, Lock, NotebookPen, Target } from "lucide-react";
import MichaelPresence from "@/components/michael/michael-presence";
import { LIFESTYLE_TOOL_NAMES } from "@/lib/ai/tools";
import { toolLabel } from "@/lib/ai/tool-labels";
import { getAIUiStatus } from "@/lib/ai/config";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { getGoalDashboardData } from "@/lib/goal-service";
import { listHabits } from "@/lib/habit-service";
import { getTaskSummary } from "@/lib/task-service";
import { getPersonalContext } from "@/lib/account-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import { hasProductPermission } from "@/lib/product-authorization";

export const instant = false;

const dayNames: Record<string, string> = { MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun" };

export default async function InsightsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/login");
  if (!(await hasProductPermission(session.user.id, "LIFESTYLE_OS_ACCESS"))) redirect("/products?access=denied");
  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const timeZone = effectiveTimeZone(profile.timeZone);
  const [taskSummary, { summary: goalSummary }, { habits }, context] = await Promise.all([
    getTaskSummary(session.user.id, timeZone),
    getGoalDashboardData(session.user.id, timeZone),
    listHabits(session.user.id, timeZone, { status: "ACTIVE" }),
    getPersonalContext(session.user.id),
  ]);
  const workDays = profile.workDays.map((day) => dayNames[day] ?? day).join(", ");
  const missedHabitDays = habits.reduce((sum, habit) => sum + Math.max(habit.eligibleDays - habit.completedDays, 0), 0);

  const sources = LIFESTYLE_TOOL_NAMES.map(toolLabel).filter((tool) => tool.kind === "read");
  const { providerName } = getAIUiStatus();
  return <main className="m-page m-insights">
    <div className="m-insights-content">
      <header className="m-page-head"><div className="m-page-head-copy"><div className="m-eyebrow">Your data, made clear</div><h1 className="m-display">What <span className="m-glow">Michael</span> knows</h1><p className="m-muted">A transparent snapshot of the details and activity you’ve chosen to save, and exactly what Michael is able to read.</p></div></header>
      <div className="knowledge-privacy-banner"><Activity size={18} /><p>This page summarizes saved information. It does not make judgments or generate AI recommendations.</p></div>
      <div className="knowledge-privacy-banner"><NotebookPen size={18} /><p>Michael also reads what you wrote about yourself in <Link className="m-settings-inline-link" href="/settings/context">My Context</Link>{context.updatedAt ? "" : " — you haven’t written anything yet"}.</p></div>
      <div className="knowledge-page-grid">
        <section className="knowledge-page-card"><div className="knowledge-page-title"><span><Clock3 size={17} /></span><div><h2>Your routine</h2><p>From your saved profile preferences</p></div></div><dl className="knowledge-details">{profile.locationLabel && <div><dt>Based in</dt><dd>{profile.locationLabel}</dd></div>}<div><dt>Time zone</dt><dd>{timeZone}</dd></div><div><dt>Day starts</dt><dd>{profile.wakeUpTime}</dd></div><div><dt>Bedtime</dt><dd>{profile.bedtime}</dd></div><div><dt>Focus & break</dt><dd>{profile.focusSessionMinutes} min focus · {profile.breakDurationMinutes} min break</dd></div><div><dt>Work days</dt><dd>{workDays || "Not set"}</dd></div>{profile.workStartTime && profile.workEndTime && <div><dt>Work hours</dt><dd>{profile.workStartTime}–{profile.workEndTime}</dd></div>}<div><dt>Planning style</dt><dd>{profile.planningStyle.toLowerCase().replaceAll("_", " ")}</dd></div></dl><Link className="knowledge-page-link" href="/insights/routine">Edit routine <span aria-hidden="true">→</span></Link></section>
        <section className="knowledge-page-card"><div className="knowledge-page-title"><span><Check size={17} /></span><div><h2>Task activity</h2><p>Current counts from your task list</p></div></div><div className="knowledge-metric-grid"><div><strong>{taskSummary.outstanding}</strong><span>Outstanding</span></div><div><strong>{taskSummary.completed}</strong><span>Completed</span></div><div><strong>{taskSummary.overdue}</strong><span>Overdue</span></div></div><Link className="knowledge-page-link" href="/tasks">Review tasks <span aria-hidden="true">→</span></Link></section>
        <section className="knowledge-page-card"><div className="knowledge-page-title"><span><Target size={17} /></span><div><h2>Goals</h2><p>Progress you have recorded</p></div></div><div className="knowledge-metric-grid"><div><strong>{goalSummary.active}</strong><span>Active</span></div><div><strong>{goalSummary.completed}</strong><span>Completed</span></div><div><strong>{goalSummary.approaching}</strong><span>Due soon</span></div></div><Link className="knowledge-page-link" href="/goals">Review goals <span aria-hidden="true">→</span></Link></section>
        <section className="knowledge-page-card knowledge-habits-card"><div className="knowledge-page-title"><span><Flame size={17} /></span><div><h2>Habit patterns</h2><p>Completion history over the last 30 local days · {timeZone}</p></div></div>{habits.length ? <><div className="knowledge-habit-list">{habits.map((habit) => <div className="knowledge-habit" key={habit.id}><div><strong>{habit.title}</strong><span>{habit.completedDays} of {habit.eligibleDays} scheduled days completed · {Math.max(habit.eligibleDays - habit.completedDays, 0)} missed</span><div className="knowledge-habit-bar" aria-hidden="true"><div className="motion-fill" style={{ width: `${habit.completionPercentage}%` }} /></div></div><div><b>{habit.completionPercentage}%</b><small>{habit.currentStreak} day streak</small></div></div>)}</div><p className="knowledge-footnote">Across active habits: {missedHabitDays} scheduled days in this period had no check-in. Unscheduled days are excluded.</p></> : <p className="knowledge-empty">No active habits yet. Once you track habits, their scheduled-day history will appear here.</p>}<Link className="knowledge-page-link" href="/habits">Review habits <span aria-hidden="true">→</span></Link></section>
      </div>
      <section className="m-ai m-insights-sources" aria-labelledby="insights-sources-title">
        <div className="m-insights-sources-head"><span className="m-orbw" aria-hidden="true" style={{ width: 36, height: 36 }}><span className="m-ring" /><span className="m-ring m-r2" /><MichaelPresence state="idle" size="md" /></span><div><h2 className="m-h2" id="insights-sources-title">What Michael may use</h2><p className="m-muted">Michael reads these only when a question needs them. It cannot save or change anything itself.</p></div></div>
        <ul className="m-insights-source-list">{sources.map((source) => <li key={source.label}><strong>{source.label}</strong><span className="m-muted">{source.detail}</span></li>)}</ul>
        {providerName && <p className="m-muted m-insights-provider"><Lock size={14} aria-hidden="true" /> Messages and the context Michael reads are processed by {providerName}.</p>}
      </section>
      <section className="knowledge-data-boundaries"><div><CalendarDays size={17} /><h2>What isn’t tracked yet</h2></div><p>MichaelOS can summarize habit check-ins, but it does not keep a history of task rescheduling, so it won’t infer that pattern. Conversations with Michael are saved to your account so you can reopen them; you can delete any of them from the Michael AI page.</p></section>
    </div>
  </main>;
}
