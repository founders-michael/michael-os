"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Archive, CalendarDays, Check, Flame, LoaderCircle, LogOut, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import BrandLogo from "@/components/brand-logo";
import type { HabitDto } from "@/lib/habit-service";
import { isHabitScheduled, shiftLocalDate } from "@/lib/habit-stats";
import HabitFormDialog, { type HabitFormValues } from "@/components/habit-form-dialog";

type HabitResponse = { habit?: HabitDto; habits?: HabitDto[]; error?: string; alreadyCompleted?: boolean };
async function parseResponse(response: Response): Promise<HabitResponse> {
  const body = await response.json() as HabitResponse;
  if (!response.ok) throw new Error(body.error || "Something went wrong. Please try again.");
  return body;
}

export default function HabitManager({ initialHabits, userName, timeZone }: { initialHabits: HabitDto[]; userName: string; timeZone: string }) {
  const router = useRouter();
  const [habits, setHabits] = useState(initialHabits);
  const [filter, setFilter] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [editing, setEditing] = useState<HabitDto | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const visible = useMemo(() => habits.filter((habit) => habit.status === filter), [filter, habits]);

  async function refresh() {
    const data = await parseResponse(await fetch("/api/habits", { cache: "no-store" }));
    setHabits(data.habits ?? []);
    router.refresh();
  }
  async function saveHabit(values: HabitFormValues) {
    setBusy("form"); setError(""); setNotice("");
    try {
      const response = await fetch(editing ? `/api/habits/${editing.id}` : "/api/habits", {
        method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values),
      });
      await parseResponse(response); await refresh(); setEditing(undefined); setNotice(editing ? "Habit updated." : "Habit created.");
    } catch (cause) { const message = cause instanceof Error ? cause.message : "We couldn't save this habit."; setError(message); throw new Error(message); }
    finally { setBusy(null); }
  }
  async function patchHabit(habit: HabitDto, data: Record<string, unknown>, message: string) {
    setBusy(habit.id); setError(""); setNotice("");
    try { await parseResponse(await fetch(`/api/habits/${habit.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) })); await refresh(); setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't update this habit."); }
    finally { setBusy(null); }
  }
  async function removeHabit(habit: HabitDto) {
    if (!window.confirm(`Delete “${habit.title}” and its completion history? This cannot be undone.`)) return;
    setBusy(habit.id); setError("");
    try { await parseResponse(await fetch(`/api/habits/${habit.id}`, { method: "DELETE" })); await refresh(); setNotice("Habit deleted."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't delete this habit."); }
    finally { setBusy(null); }
  }
  async function checkIn(habit: HabitDto) {
    setBusy(habit.id); setError(""); setNotice("");
    try {
      if (habit.completedToday) {
        const checkIn = habit.checkIns.find((entry) => entry.localDate === habit.today);
        if (!checkIn) throw new Error("Today's check-in couldn't be found. Refresh and try again.");
        await parseResponse(await fetch(`/api/habits/${habit.id}/check-ins/${checkIn.id}`, { method: "DELETE" }));
        setNotice("Today's check-in was undone.");
      } else {
        const response = await parseResponse(await fetch(`/api/habits/${habit.id}/check-ins`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }));
        setNotice(response.alreadyCompleted ? "This habit was already checked in today." : "Habit checked in for today.");
      }
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't update today's check-in."); }
    finally { setBusy(null); }
  }

  return <main className="habits-workspace">
    <header className="habits-topbar"><Link href="/" className="goals-brand" aria-label="MichaelOS home"><BrandLogo /></Link><nav aria-label="Workspace"><Link href="/">Today</Link><Link href="/tasks">Tasks</Link><Link href="/goals">Goals</Link><Link className="current" href="/habits" aria-current="page">Habits</Link></nav><div className="goals-account"><span>{userName}</span><button onClick={async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); }} aria-label="Sign out"><LogOut size={15} /></button></div></header>
    <div className="habits-content"><Link className="tasks-back-link" href="/"><ArrowLeft size={13} />Back to your day</Link>
      <div className="goals-heading"><div><div className="section-kicker">SMALL THINGS, OFTEN</div><h1>Your habits</h1><p>Build a rhythm you can return to, one day at a time. Times use {timeZone}.</p></div><button className="task-create-button" onClick={() => setEditing(null)}><Plus size={14} />New habit</button></div>
      <div className="habit-summary-row"><span><CalendarDays size={14} />{habits.filter((habit) => habit.status === "ACTIVE" && habit.todayScheduled).length} scheduled today</span><span><Check size={14} />{habits.filter((habit) => habit.status === "ACTIVE" && habit.todayScheduled && habit.completedToday).length} completed</span></div>
      <div className="goal-filter-bar" role="tablist" aria-label="Filter habits">{(["ACTIVE", "ARCHIVED"] as const).map((status) => <button key={status} role="tab" aria-selected={filter === status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "ACTIVE" ? "Active" : "Archived"}<span>{habits.filter((habit) => habit.status === status).length}</span></button>)}</div>
      {error && <div className="task-alert" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}
      {notice && <div className="task-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={13} /></button></div>}
      {visible.length === 0 ? <section className="habit-empty"><span><Flame size={20} /></span><strong>{filter === "ACTIVE" ? "Start with a small repeatable action" : "No archived habits"}</strong><p>{filter === "ACTIVE" ? "Create a habit that fits your routine. You can change its days whenever you need." : "Archived habits stay here with their completion history."}</p>{filter === "ACTIVE" && <button className="task-create-button" onClick={() => setEditing(null)}><Plus size={14} />Create your first habit</button>}</section> : <div className="habit-manager-list">{visible.map((habit) => {
        const working = busy === habit.id;
        const dates = Array.from({ length: 14 }, (_, index) => shiftLocalDate(habit.today, index - 13));
        const completed = new Set(habit.checkIns.map((checkIn) => checkIn.localDate));
        return <article className="habit-manager-card" key={habit.id}>
          <header><span className="habit-manager-icon"><Flame size={16} /></span><div className="habit-manager-title"><div className="habit-manager-tags"><span className={habit.status === "ACTIVE" ? "habit-active-pill" : "habit-archived-pill"}>{habit.status === "ACTIVE" ? "Active" : "Archived"}</span><span>{habit.frequency === "DAILY" ? "Every day" : `Selected days · ${habit.weekdays.map((day) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day]).join(", ")}`}</span></div><h2>{habit.title}</h2>{habit.description && <p>{habit.description}</p>}</div><div className="habit-manager-actions"><button title="Edit habit" aria-label={`Edit ${habit.title}`} disabled={working} onClick={() => setEditing(habit)}><Pencil size={14} /></button><button title={habit.status === "ACTIVE" ? "Archive habit" : "Reactivate habit"} aria-label={`${habit.status === "ACTIVE" ? "Archive" : "Reactivate"} ${habit.title}`} disabled={working} onClick={() => void patchHabit(habit, { status: habit.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" }, habit.status === "ACTIVE" ? "Habit archived." : "Habit reactivated.")}>{habit.status === "ACTIVE" ? <Archive size={14} /> : <RotateCcw size={14} />}</button><button className="danger" title="Delete habit" aria-label={`Delete ${habit.title}`} disabled={working} onClick={() => void removeHabit(habit)}><Trash2 size={14} /></button></div></header>
          {habit.status === "ACTIVE" && habit.todayScheduled ? <button className={`habit-checkin-button ${habit.completedToday ? "is-done" : ""}`} disabled={working} onClick={() => void checkIn(habit)}>{working ? <LoaderCircle size={14} /> : <Check size={14} />}{habit.completedToday ? "Completed today · undo" : "Mark today complete"}</button> : <div className="habit-not-scheduled">{habit.status === "ARCHIVED" ? "Archived · history retained" : "Not scheduled today"}</div>}
          <div className="habit-stat-grid"><div><span><Flame size={14} /></span><strong>{habit.currentStreak}</strong><small>Current streak</small></div><div><span><Flame size={14} /></span><strong>{habit.bestStreak}</strong><small>Best streak</small></div><div><span><Check size={14} /></span><strong>{habit.completionPercentage}%</strong><small>Last 30 days · {habit.completedDays}/{habit.eligibleDays}</small></div></div>
          <div className="habit-history"><div className="habit-history-heading"><strong>Recent history</strong><span>Last 14 local dates</span></div><div className="habit-history-days">{dates.map((date) => {
            const scheduled = isHabitScheduled(habit.frequency, habit.weekdays, date);
            const done = completed.has(date);
            const label = new Intl.DateTimeFormat("en", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00Z`));
            return <span key={date} role="img" className={`habit-history-day ${scheduled ? "scheduled" : "unscheduled"} ${done ? "completed" : ""}`} title={`${label}: ${!scheduled ? "not scheduled" : done ? "completed" : "not completed"}`} aria-label={`${label}: ${!scheduled ? "not scheduled" : done ? "completed" : "not completed"}`}>{scheduled ? done ? <Check size={10} /> : <i /> : <span>·</span>}</span>;
          })}</div></div>
          {working && <span className="habit-saving" role="status"><LoaderCircle size={12} />Saving…</span>}
        </article>;
      })}</div>}
    </div>
    {editing !== undefined && <HabitFormDialog key={editing?.id ?? "new"} habit={editing} onClose={() => setEditing(undefined)} onSave={saveHabit} />}
  </main>;
}
