"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, CalendarDays, Check, Circle, Flame, LoaderCircle, Pencil, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import MichaelPresence from "@/components/michael/michael-presence";
import MichaelCapture from "@/components/michael/michael-capture";
import type { HabitDto } from "@/lib/habit-service";
import { revertTodayCheckIn, savedTodayCheckInId, withTodayCheckIn } from "@/lib/habit-optimistic";
import { isHabitScheduled, shiftLocalDate } from "@/lib/habit-stats";
import HabitFormDialog, { type HabitFormValues } from "@/components/habit-form-dialog";
import { habitTimeLabel } from "@/lib/calendar-habits";
import { EmptyState, ErrorState } from "@/components/ux/ux-states";
import { notify } from "@/lib/notifications";
import { useWorkspaceSummary } from "@/components/authenticated-app-shell";
import { useConfirmation } from "@/components/ux/confirmation-provider";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { habitSummaryQuery } from "@/lib/workspace-summary-queries";
import { apiQueryOptions, ApiQueryError } from "@/lib/api-query";
import { queryKeys } from "@/lib/query-keys";
import { queryStaleTimes } from "@/lib/query-client";
import { AnimatedItem, AnimatedList } from "@/components/motion/animated-list";

type HabitResponse = { habit?: HabitDto; habits?: HabitDto[]; error?: string; alreadyCompleted?: boolean };
async function parseResponse(response: Response): Promise<HabitResponse> {
  const body = await response.json() as HabitResponse;
  if (!response.ok) throw new Error(body.error || "Something went wrong. Please try again.");
  return body;
}

/**
 * The Michael line on Habits: one sentence from the saved streak figures, by
 * fixed rules (no model call). Its action only prefills the assistant.
 */
function habitLine(habits: HabitDto[]): { text: string; action?: { label: string; href: string } } | null {
  const active = habits.filter((habit) => habit.status === "ACTIVE");
  if (!active.length) return null;
  const due = active.filter((habit) => habit.todayScheduled && !habit.completedToday).sort((a, b) => b.currentStreak - a.currentStreak);
  const next = due[0];
  if (!next) {
    const scheduled = active.filter((habit) => habit.todayScheduled).length;
    return { text: scheduled ? "Every habit scheduled for today is done. Nice work." : "No habits are scheduled for today." };
  }
  const record = next.currentStreak + 1 > next.bestStreak ? " — your best so far" : next.currentStreak + 1 === next.bestStreak ? " — matching your best" : "";
  const history = next.eligibleDays ? `${next.title}: ${next.completedDays} of the last ${next.eligibleDays} scheduled days. ` : "";
  const streak = next.currentStreak > 0 ? `A check-in today makes it a ${next.currentStreak + 1}-day streak${record}.` : "A check-in today starts a new streak.";
  return { text: `${history}${streak}`, action: { label: "Find a time today", href: `/assistant?prompt=${encodeURIComponent(`When could I fit in ${next.title} today?`)}` } };
}

export default function HabitManager({ initialHabits, timeZone }: { initialHabits: HabitDto[]; timeZone: string }) {
  const router = useRouter();
  const confirm = useConfirmation();
  const { userId, setHabitSummary } = useWorkspaceSummary();
  const queryClient = useQueryClient();
  const habitsQuery = useQuery({
    ...apiQueryOptions<{ habits?: HabitDto[] }>({ queryKey: queryKeys.lifestyle.habits(userId), path: "/api/habits", staleTime: queryStaleTimes.habits }),
    initialData: { habits: initialHabits },
  });
  const queryDenied = habitsQuery.error instanceof ApiQueryError && [401, 403].includes(habitsQuery.error.status);
  const queryError = habitsQuery.error instanceof Error ? habitsQuery.error.message : "";
  const habits = useMemo(() => queryDenied ? [] : habitsQuery.data.habits ?? [], [habitsQuery.data.habits, queryDenied]);
  const [filter, setFilter] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [editing, setEditing] = useState<HabitDto | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  // Check-ins in flight, and habits whose server-computed numbers are still being refreshed.
  const [checking, setChecking] = useState<ReadonlySet<string>>(new Set());
  const [statsPending, setStatsPending] = useState<ReadonlySet<string>>(new Set());
  const addTo = (set: ReadonlySet<string>, id: string) => new Set(set).add(id);
  const removeFrom = (set: ReadonlySet<string>, id: string) => { const next = new Set(set); next.delete(id); return next; };
  // The habit just checked in, so only its tick plays the confirmation.
  const [justCompleted, setJustCompleted] = useState<string | null>(null);
  const [error, setError] = useState("");
  const visible = useMemo(() => habits.filter((habit) => habit.status === filter), [filter, habits]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.habitsRoot(userId) });
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.habitSummary(userId), exact: true, refetchType: "none" });
      const dashboard = await queryClient.fetchQuery({ ...habitSummaryQuery(userId), staleTime: 0 });
      setHabitSummary(dashboard.summary);
    } catch { /* The habit mutation succeeded; the persistent shell can refresh its summary on navigation. */ }
    router.refresh();
  }
  async function retryRefresh() {
    setError("");
    try { await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Habits could not be loaded."); }
  }
  async function saveHabit(values: HabitFormValues) {
    setBusy("form"); setError("");
    try {
      const response = await fetch(editing ? `/api/habits/${editing.id}` : "/api/habits", {
        method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values),
      });
      await parseResponse(response); await refresh(); setEditing(undefined); notify.success(editing ? "Habit updated" : "Habit created");
    } catch (cause) { const message = cause instanceof Error ? cause.message : "We couldn't save this habit."; setError(message); notify.error("Habit could not be saved", message); throw new Error(message); }
    finally { setBusy(null); }
  }
  async function patchHabit(habit: HabitDto, data: Record<string, unknown>, message: string) {
    setBusy(habit.id); setError("");
    try { await parseResponse(await fetch(`/api/habits/${habit.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) })); await refresh(); notify.success(message); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "We couldn't update this habit."; setError(message); notify.error("Habit could not be updated", message); }
    finally { setBusy(null); }
  }
  async function removeHabit(habit: HabitDto) {
    setBusy(habit.id); setError("");
    try { await parseResponse(await fetch(`/api/habits/${habit.id}`, { method: "DELETE" })); await refresh(); notify.success("Habit deleted"); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "We couldn't delete this habit."; setError(message); notify.error("Habit could not be deleted", message); }
    finally { setBusy(null); }
  }
  /**
   * Optimistic (CLAUDE.md §9.5): the tick and today's square flip at once, a
   * "Saving…" status shows while the request is in flight, and the refresh of
   * server-computed numbers (streaks, percentages) runs in the background with
   * those numbers marked as updating. A failure puts the habit back, unless a
   * newer change replaced it, and says the change was not saved.
   */
  async function checkIn(habit: HabitDto) {
    if (checking.has(habit.id)) return;
    const completed = !habit.completedToday;
    const savedId = completed ? null : savedTodayCheckInId(habit);
    if (!completed && !savedId) { setError("Today's check-in is still being saved. Try again in a moment."); return; }
    const key = queryKeys.lifestyle.habits(userId);
    await queryClient.cancelQueries({ queryKey: key });
    queryClient.setQueryData<{ habits?: HabitDto[] }>(key, (data) => ({ ...data, habits: (data?.habits ?? []).map((item) => item.id === habit.id ? withTodayCheckIn(item, completed) : item) }));
    setError("");
    setJustCompleted(completed ? habit.id : null);
    setChecking((current) => addTo(current, habit.id));
    setStatsPending((current) => addTo(current, habit.id));
    let saved = false;
    try {
      if (completed) {
        const response = await parseResponse(await fetch(`/api/habits/${habit.id}/check-ins`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }));
        notify.success(response.alreadyCompleted ? "Habit already completed today" : "Habit checked in for today");
      } else {
        await parseResponse(await fetch(`/api/habits/${habit.id}/check-ins/${savedId}`, { method: "DELETE" }));
        notify.success("Today's check-in was undone");
      }
      saved = true;
    } catch (cause) {
      queryClient.setQueryData<{ habits?: HabitDto[] }>(key, (data) => ({ ...data, habits: revertTodayCheckIn(data?.habits ?? [], habit, completed) }));
      setJustCompleted(null);
      const message = cause instanceof Error ? cause.message : "We couldn't update today's check-in.";
      setError(`${message} Your change was not saved and has been undone.`);
      notify.error("Habit check-in wasn't saved", "Your change has been undone.");
    } finally {
      setChecking((current) => removeFrom(current, habit.id));
    }
    // Server numbers (streaks, percentages, the shell's summary) refresh in the background; the screen stays usable.
    void (saved ? refresh() : Promise.resolve()).catch(() => undefined).finally(() => setStatsPending((current) => removeFrom(current, habit.id)));
  }

  const line = habitLine(habits);
  return <main className="m-page m-habits"><div className="habits-content">
      <header className="m-page-head">
        <div className="m-page-head-copy"><div className="m-eyebrow">Small things, often</div><h1 className="m-display">Your <span className="m-glow">habits</span></h1><p className="m-muted">Build a rhythm you can return to, one day at a time. Michael reads your streaks when you ask. Times use {timeZone}.</p></div>
        <div className="m-page-head-actions"><button className="m-btn m-btn-p" onClick={() => setEditing(null)}><Plus size={16} aria-hidden="true" />New habit</button></div>
      </header>
      <div className="habit-summary-row m-habits-summary"><span><CalendarDays size={14} />{habits.filter((habit) => habit.status === "ACTIVE" && habit.todayScheduled).length} scheduled today</span><span><Check size={14} />{habits.filter((habit) => habit.status === "ACTIVE" && habit.todayScheduled && habit.completedToday).length} completed</span></div>
      <div className="m-seg m-habits-filter" role="tablist" aria-label="Filter habits">{(["ACTIVE", "ARCHIVED"] as const).map((status) => <button key={status} role="tab" aria-selected={filter === status} className={filter === status ? "m-on" : ""} onClick={() => setFilter(status)}>{status === "ACTIVE" ? "Active" : "Archived"} · {habits.filter((habit) => habit.status === status).length}</button>)}</div>
      {line && <section className="m-ai m-line" aria-label="Michael">
        <span className="m-orbw" aria-hidden="true" style={{ width: 34, height: 34 }}><span className="m-ring" /><span className="m-ring m-r2" /><MichaelPresence state="idle" size="md" /></span>
        <p><span className="m-neon">Michael · </span>{line.text}</p>
        {line.action && <div className="m-line-actions"><Link className="m-btn m-btn-p m-btn-sm" href={line.action.href}><Sparkles size={14} aria-hidden="true" />{line.action.label}</Link></div>}
      </section>}
      {(error || queryError) && <div className="task-alert" role="alert">{error || queryError}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}
      {visible.length === 0 ? error || queryError ? <ErrorState title="Habits couldn’t load" description={error || queryError} onRetry={() => void retryRefresh()} /> : <EmptyState icon={<Flame size={20} />} title={filter === "ACTIVE" ? "Start with a small repeatable action" : "No archived habits"} description={filter === "ACTIVE" ? "Create a habit that fits your routine. You can change its days whenever you need." : "Archived habits stay here with their completion history."} action={filter === "ACTIVE" ? <button className="task-create-button" onClick={() => setEditing(null)}><Plus size={14} />Create your first habit</button> : undefined} /> : <div className="habit-manager-list"><AnimatedList key={filter}>{visible.map((habit) => {
        const working = busy === habit.id || checking.has(habit.id);
        const saving = checking.has(habit.id);
        const updating = statsPending.has(habit.id);
        const dates = Array.from({ length: 14 }, (_, index) => shiftLocalDate(habit.today, index - 13));
        const completed = new Set(habit.checkIns.map((checkIn) => checkIn.localDate));
        return <AnimatedItem as="article" className="habit-manager-card" key={habit.id}>
          <header><span className="habit-manager-icon"><Flame size={16} /></span><div className="habit-manager-title"><div className="habit-manager-tags"><span className={habit.status === "ACTIVE" ? "habit-active-pill" : "habit-archived-pill"}>{habit.status === "ACTIVE" ? "Active" : "Archived"}</span><span>{habit.frequency === "DAILY" ? "Every day" : `Selected days · ${habit.weekdays.map((day) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day]).join(", ")}`}</span>{habit.startTime && <span className="habit-time-tag">{habitTimeLabel(habit.startTime, habit.endTime)}</span>}</div><h2>{habit.title}</h2>{habit.description && <p>{habit.description}</p>}</div><div className="habit-manager-actions"><button title="Edit habit" aria-label={`Edit ${habit.title}`} disabled={working} onClick={() => setEditing(habit)}><Pencil size={14} /></button><button title={habit.status === "ACTIVE" ? "Archive habit" : "Reactivate habit"} aria-label={`${habit.status === "ACTIVE" ? "Archive" : "Reactivate"} ${habit.title}`} disabled={working} onClick={() => void patchHabit(habit, { status: habit.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" }, habit.status === "ACTIVE" ? "Habit archived." : "Habit reactivated.")}>{habit.status === "ACTIVE" ? <Archive size={14} /> : <RotateCcw size={14} />}</button><button className="danger" title="Delete habit" aria-label={`Delete ${habit.title}`} disabled={working} onClick={() => void confirm({ title: `Delete “${habit.title}” and its check-in history?`, description: "This action cannot be undone.", confirmLabel: "Delete habit", destructive: true }, () => removeHabit(habit))}><Trash2 size={14} /></button></div></header>
          {habit.status === "ACTIVE" && habit.todayScheduled ? <button className={`habit-checkin-button ${habit.completedToday ? "is-done" : ""}${saving ? " is-saving" : ""}`} disabled={working} aria-busy={saving} onClick={() => void checkIn(habit)}>{habit.completedToday ? <Check size={14} className={justCompleted === habit.id ? "motion-pop" : undefined} /> : <Circle size={14} />}{habit.completedToday ? (saving ? "Completed today · saving…" : "Completed today · undo") : (saving ? "Not done today · saving…" : "Mark today complete")}</button> : <div className="habit-not-scheduled">{habit.status === "ARCHIVED" ? "Archived · history retained" : "Not scheduled today"}</div>}
          <div className={`habit-stat-grid${updating ? " is-updating" : ""}`} aria-busy={updating}><div><span><Flame size={14} /></span><strong>{habit.currentStreak}</strong><small>Current streak</small></div><div><span><Flame size={14} /></span><strong>{habit.bestStreak}</strong><small>Best streak</small></div><div><span><Check size={14} /></span><strong>{habit.completionPercentage}%</strong><small>Last 30 days · {habit.completedDays}/{habit.eligibleDays}</small></div></div>
          <div className="habit-history"><div className="habit-history-heading"><strong>Recent history</strong><span>Last 14 local dates</span></div><div className="habit-history-days">{dates.map((date) => {
            const scheduled = isHabitScheduled(habit.frequency, habit.weekdays, date);
            const done = completed.has(date);
            const label = new Intl.DateTimeFormat("en", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00Z`));
            return <span key={date} role="img" className={`habit-history-day ${scheduled ? "scheduled" : "unscheduled"} ${done ? "completed" : ""}`} title={`${label}: ${!scheduled ? "not scheduled" : done ? "completed" : "not completed"}`} aria-label={`${label}: ${!scheduled ? "not scheduled" : done ? "completed" : "not completed"}`}>{scheduled ? done ? <Check size={10} /> : <i /> : <span>·</span>}</span>;
          })}</div></div>
          {(saving || busy === habit.id) && <span className="habit-saving" role="status"><LoaderCircle size={12} className="spin" />Saving…</span>}
          {!saving && updating && <span className="habit-saving habit-updating" role="status"><LoaderCircle size={12} className="spin" />Saved · updating streaks…</span>}
        </AnimatedItem>;
      })}</AnimatedList></div>}
      <MichaelCapture kind="habit" label="Describe a new habit for Michael" placeholder="Describe a habit — “Read 20 pages before bed, weekdays”" fills={["Title", "Frequency", "Days"]} />
    </div>
    {editing !== undefined && <HabitFormDialog key={editing?.id ?? "new"} habit={editing} onClose={() => setEditing(undefined)} onSave={saveHabit} />}
  </main>;
}
