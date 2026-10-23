import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, CalendarDays, Check, Clock3, Flame, Target } from "lucide-react";
import WorkspacePageHeader from "@/components/workspace-page-header";
import { auth } from "@/lib/auth";
import { getGoalDashboardData } from "@/lib/goal-service";
import { listHabits } from "@/lib/habit-service";
import { getProfileForUser } from "@/lib/profile-service";
import { getTaskDashboardData } from "@/lib/task-service";
import { effectiveTimeZone } from "@/lib/time-zone";

export const instant = false;

const dayNames: Record<string, string> = { MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun" };

export default async function InsightsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const profile = await getProfileForUser(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const timeZone = effectiveTimeZone(profile.timeZone);
  const [{ summary: taskSummary }, { summary: goalSummary }, { habits }] = await Promise.all([
    getTaskDashboardData(session.user.id, timeZone),
    getGoalDashboardData(session.user.id, timeZone),
    listHabits(session.user.id, timeZone, { status: "ACTIVE" }),
  ]);
  const userName = profile.preferredName || session.user.name || session.user.email;
  const workDays = profile.workDays.map((day) => dayNames[day] ?? day).join(", ");
  const missedHabitDays = habits.reduce((sum, habit) => sum + Math.max(habit.eligibleDays - habit.completedDays, 0), 0);

  return <main className="goals-workspace">
    <WorkspacePageHeader userName={userName} active="Insights" />
    <div className="goals-content product-page-content">
      <div className="goals-heading"><div><div className="section-kicker">YOUR DATA, MADE CLEAR</div><h1>What Michael knows</h1><p>A transparent snapshot of the details and activity you’ve chosen to save.</p></div></div>
      <div className="knowledge-privacy-banner"><Activity size={18} /><p>This page summarizes saved information. It does not make judgments or generate AI recommendations.</p></div>
      <div className="knowledge-page-grid">
        <section className="knowledge-page-card"><div className="knowledge-page-title"><span><Clock3 size={17} /></span><div><h2>Your routine</h2><p>From your saved profile preferences</p></div></div><dl className="knowledge-details"><div><dt>Time zone</dt><dd>{timeZone}</dd></div><div><dt>Day starts</dt><dd>{profile.wakeUpTime}</dd></div><div><dt>Bedtime</dt><dd>{profile.bedtime}</dd></div><div><dt>Focus & break</dt><dd>{profile.focusSessionMinutes} min focus · {profile.breakDurationMinutes} min break</dd></div><div><dt>Work days</dt><dd>{workDays || "Not set"}</dd></div>{profile.workStartTime && profile.workEndTime && <div><dt>Work hours</dt><dd>{profile.workStartTime}–{profile.workEndTime}</dd></div>}<div><dt>Planning style</dt><dd>{profile.planningStyle.toLowerCase().replaceAll("_", " ")}</dd></div></dl></section>
        <section className="knowledge-page-card"><div className="knowledge-page-title"><span><Check size={17} /></span><div><h2>Task activity</h2><p>Current counts from your task list</p></div></div><div className="knowledge-metric-grid"><div><strong>{taskSummary.outstanding}</strong><span>Outstanding</span></div><div><strong>{taskSummary.completed}</strong><span>Completed</span></div><div><strong>{taskSummary.overdue}</strong><span>Overdue</span></div></div><Link className="knowledge-page-link" href="/tasks">Review tasks <span aria-hidden="true">→</span></Link></section>
        <section className="knowledge-page-card"><div className="knowledge-page-title"><span><Target size={17} /></span><div><h2>Goals</h2><p>Progress you have recorded</p></div></div><div className="knowledge-metric-grid"><div><strong>{goalSummary.active}</strong><span>Active</span></div><div><strong>{goalSummary.completed}</strong><span>Completed</span></div><div><strong>{goalSummary.approaching}</strong><span>Due soon</span></div></div><Link className="knowledge-page-link" href="/goals">Review goals <span aria-hidden="true">→</span></Link></section>
        <section className="knowledge-page-card knowledge-habits-card"><div className="knowledge-page-title"><span><Flame size={17} /></span><div><h2>Habit patterns</h2><p>Completion history over the last 30 local days · {timeZone}</p></div></div>{habits.length ? <><div className="knowledge-habit-list">{habits.map((habit) => <div className="knowledge-habit" key={habit.id}><div><strong>{habit.title}</strong><span>{habit.completedDays} of {habit.eligibleDays} scheduled days completed · {Math.max(habit.eligibleDays - habit.completedDays, 0)} missed</span></div><div><b>{habit.completionPercentage}%</b><small>{habit.currentStreak} day streak</small></div></div>)}</div><p className="knowledge-footnote">Across active habits: {missedHabitDays} scheduled days in this period had no check-in. Unscheduled days are excluded.</p></> : <p className="knowledge-empty">No active habits yet. Once you track habits, their scheduled-day history will appear here.</p>}<Link className="knowledge-page-link" href="/habits">Review habits <span aria-hidden="true">→</span></Link></section>
      </div>
      <section className="knowledge-data-boundaries"><div><CalendarDays size={17} /><h2>What isn’t tracked yet</h2></div><p>MichaelOS can summarize habit check-ins, but it does not currently keep a history of task rescheduling or save assistant prompts. It won’t infer those patterns until the app supports them.</p></section>
    </div>
  </main>;
}
