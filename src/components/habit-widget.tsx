"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Circle, Flame, LoaderCircle, Plus } from "lucide-react";
import type { HabitDto } from "@/lib/habit-service";
import { adjustHabitCompletion } from "@/lib/habit-summary";
import { revertTodayCheckIn, savedTodayCheckInId, withTodayCheckIn } from "@/lib/habit-optimistic";
import { useQueryClient } from "@tanstack/react-query";
import { habitSummaryQuery } from "@/lib/workspace-summary-queries";
import { queryKeys } from "@/lib/query-keys";
import { useWorkspaceSummary } from "@/components/authenticated-app-shell";

type Summary = { active: number; scheduledToday: number; completedToday: number };
export default function HabitWidget({ initialHabits, initialSummary, onSummaryChange, onRefreshNeeded }: { initialHabits: HabitDto[]; initialSummary: Summary; onSummaryChange?: (summary: Summary) => void; onRefreshNeeded?: () => void }) {
  const { userId } = useWorkspaceSummary();
  const queryClient = useQueryClient();
  const [habits, setHabits] = useState(initialHabits);
  const [summary, setSummary] = useState(initialSummary);
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState("");
  // The habit the user just checked in, so only its tick plays the confirmation.
  const [justCompleted, setJustCompleted] = useState<string | null>(null);
  async function refresh() {
    const data = await queryClient.fetchQuery({ ...habitSummaryQuery(userId), staleTime: 0 });
    setHabits(data.habits ?? []);
    if (data.summary) { setSummary(data.summary); onSummaryChange?.(data.summary); }
  }
  /**
   * Optimistic (CLAUDE.md §9.5): the tick and the "N of M today" count change at
   * once, the button shows it is saving, and the server's numbers (streaks)
   * refresh in the background. A failure puts the habit back and says so.
   */
  async function toggle(habit: HabitDto) {
    if (saving.has(habit.id)) return;
    const completed = !habit.completedToday;
    const savedId = completed ? null : savedTodayCheckInId(habit);
    if (!completed && !savedId) { setError("Today's check-in is still being saved. Try again in a moment."); return; }
    const previousSummary = summary;
    const nextSummary = adjustHabitCompletion(summary, habit.completedToday, habit.todayScheduled);
    setHabits((current) => current.map((item) => item.id === habit.id ? withTodayCheckIn(item, completed) : item));
    setSummary(nextSummary); onSummaryChange?.(nextSummary);
    setJustCompleted(completed ? habit.id : null);
    setError("");
    setSaving((current) => new Set(current).add(habit.id));
    let saved = false;
    try {
      const response = completed
        ? await fetch(`/api/habits/${habit.id}/check-ins`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) })
        : await fetch(`/api/habits/${habit.id}/check-ins/${savedId}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || (completed ? "We couldn't record this check-in." : "We couldn't undo this check-in."));
      saved = true;
    } catch (cause) {
      setHabits((current) => revertTodayCheckIn(current, habit, completed));
      setSummary(previousSummary); onSummaryChange?.(previousSummary);
      setJustCompleted(null);
      setError(`${cause instanceof Error ? cause.message : "We couldn't update this habit."} Your change was not saved and has been undone.`);
    } finally {
      setSaving((current) => { const next = new Set(current); next.delete(habit.id); return next; });
    }
    if (!saved) return;
    // Streaks and the shared summary are the server's; refresh them without holding the screen.
    void queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.habitsRoot(userId) })
      .then(() => refresh())
      .catch(() => { setError("Your check-in was saved, but the summary could not refresh. It will update when you reload."); onRefreshNeeded?.(); });
  }
  return <section className="panel habits-panel"><div className="panel-heading"><div><div className="section-kicker">YOUR ROUTINE</div><h3>Habits <span className="muted-inline">· {summary.completedToday} of {summary.scheduledToday} today</span></h3></div><Link className="habit-manage-link" href="/habits">Manage</Link></div>
    {error && <p className="habit-widget-error" role="alert">{error}</p>}
    {habits.length ? <div className="habit-list">{habits.map((habit, index) => <div className="habit-row" key={habit.id}><span className={`habit-symbol habit-symbol-${index % 3}`}><Flame size={14} /></span><div className="habit-copy"><strong>{habit.title}</strong><span>{saving.has(habit.id) ? "Saving…" : habit.currentStreak ? `${habit.currentStreak} day streak` : habit.frequency === "DAILY" ? "Every day" : "Scheduled today"}</span></div><button className={`habit-toggle ${habit.completedToday ? "habit-checked" : ""}${saving.has(habit.id) ? " is-saving" : ""}`} disabled={saving.has(habit.id)} aria-busy={saving.has(habit.id)} onClick={() => void toggle(habit)} aria-label={`${habit.completedToday ? "Undo" : "Complete"} ${habit.title} for today${saving.has(habit.id) ? " (saving)" : ""}`}>{habit.completedToday ? <Check size={13} className={justCompleted === habit.id ? "motion-pop" : undefined} /> : <Circle size={15} />}{saving.has(habit.id) && <LoaderCircle size={22} className="habit-toggle-ring spin" aria-hidden="true" />}</button></div>)}</div> : <div className="habit-widget-empty"><p>{summary.active ? "No active habits are scheduled for today." : "Start with one small action you want to repeat."}</p><Link href="/habits">{summary.active ? "View your habits" : <><Plus size={12} />Create a habit</>}</Link></div>}
  </section>;
}
