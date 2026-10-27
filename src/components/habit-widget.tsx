"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Circle, Flame, LoaderCircle, Plus } from "lucide-react";
import type { HabitDto } from "@/lib/habit-service";
import { adjustHabitCompletion } from "@/lib/habit-summary";

type Summary = { active: number; scheduledToday: number; completedToday: number };
async function responseData(response: Response) {
  const data = await response.json() as { habits?: HabitDto[]; summary?: Summary; error?: string };
  if (!response.ok) throw new Error(data.error || "We couldn't update your habits.");
  return data;
}

export default function HabitWidget({ initialHabits, initialSummary, onSummaryChange, onRefreshNeeded }: { initialHabits: HabitDto[]; initialSummary: Summary; onSummaryChange?: (summary: Summary) => void; onRefreshNeeded?: () => void }) {
  const [habits, setHabits] = useState(initialHabits);
  const [summary, setSummary] = useState(initialSummary);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function refresh() {
    const data = await responseData(await fetch("/api/habits/summary", { cache: "no-store" }));
    setHabits(data.habits ?? []);
    if (data.summary) { setSummary(data.summary); onSummaryChange?.(data.summary); }
  }
  async function toggle(habit: HabitDto) {
    setBusy(habit.id); setError("");
    let saved = false;
    const completedToday = !habit.completedToday;
    let createdCheckIn: HabitDto["checkIns"][number] | null = null;
    try {
      if (habit.completedToday) {
        const checkIn = habit.checkIns.find((item) => item.localDate === habit.today);
        if (!checkIn) throw new Error("Today's check-in couldn't be found. Refresh and try again.");
        const response = await fetch(`/api/habits/${habit.id}/check-ins/${checkIn.id}`, { method: "DELETE" });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "We couldn't undo this check-in.");
      } else {
        const response = await fetch(`/api/habits/${habit.id}/check-ins`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
        const data = await response.json() as { error?: string; checkIn?: HabitDto["checkIns"][number] };
        if (!response.ok) throw new Error(data.error || "We couldn't record this check-in.");
        createdCheckIn = data.checkIn ?? null;
      }
      saved = true;
      setHabits((current) => current.map((item) => item.id === habit.id ? { ...item, completedToday, checkIns: completedToday && createdCheckIn ? [createdCheckIn, ...item.checkIns.filter((checkIn) => checkIn.localDate !== habit.today)] : item.checkIns.filter((checkIn) => checkIn.localDate !== habit.today) } : item));
      const nextSummary = adjustHabitCompletion(summary, habit.completedToday, habit.todayScheduled);
      setSummary(nextSummary);
      onSummaryChange?.(nextSummary);
      try { await refresh(); }
      catch {
        setError("Your check-in was saved, but the summary could not refresh. It will update when you reload.");
        onRefreshNeeded?.();
      }
    } catch (cause) { if (!saved) setError(cause instanceof Error ? cause.message : "We couldn't update this habit."); }
    finally { setBusy(null); }
  }
  return <section className="panel habits-panel"><div className="panel-heading"><div><div className="section-kicker">YOUR ROUTINE</div><h3>Habits <span className="muted-inline">· {summary.completedToday} of {summary.scheduledToday} today</span></h3></div><Link className="habit-manage-link" href="/habits">Manage</Link></div>
    {error && <p className="habit-widget-error" role="alert">{error}</p>}
    {habits.length ? <div className="habit-list">{habits.map((habit, index) => <div className="habit-row" key={habit.id}><span className={`habit-symbol habit-symbol-${index % 3}`}><Flame size={14} /></span><div className="habit-copy"><strong>{habit.title}</strong><span>{habit.currentStreak ? `${habit.currentStreak} day streak` : habit.frequency === "DAILY" ? "Every day" : "Scheduled today"}</span></div><button className={`habit-toggle ${habit.completedToday ? "habit-checked" : ""}`} disabled={busy !== null} onClick={() => void toggle(habit)} aria-label={`${habit.completedToday ? "Undo" : "Complete"} ${habit.title} for today`}>{busy === habit.id ? <LoaderCircle size={14} /> : habit.completedToday ? <Check size={13} /> : <Circle size={15} />}</button></div>)}</div> : <div className="habit-widget-empty"><p>{summary.active ? "No active habits are scheduled for today." : "Start with one small action you want to repeat."}</p><Link href="/habits">{summary.active ? "View your habits" : <><Plus size={12} />Create a habit</>}</Link></div>}
  </section>;
}
