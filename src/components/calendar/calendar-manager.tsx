"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState, useSyncExternalStore, ViewTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, Circle, Clock3, Flame, LoaderCircle, Plus, RefreshCw, Sparkles } from "lucide-react";
import MichaelPresence from "@/components/michael/michael-presence";
import { calendarRange, isoWeekday, localDateAt, localDateTimeToIso, localDayStartIso, moveAnchor, shiftLocalDate, type CalendarView } from "@/lib/calendar-date";
import type { CalendarEventDto } from "@/lib/calendar-service";
import { eventOverlapsLocalDate } from "@/lib/calendar-event-date";
import { initialScrollMinute, layoutDayEvents, localMinuteOfDay, type DayLayoutItem } from "@/lib/calendar-day-layout";
import { HABIT_STATE_LABEL, habitsOnDate, habitTimeLabel, timedHabitBlocks, type CalendarHabit, type CalendarHabitInput, type TimedHabitBlock } from "@/lib/calendar-habits";
import type { HabitDto } from "@/lib/habit-service";
import AvailabilityEditor, { type AvailabilityWindowDto } from "@/components/calendar/availability-editor";
import CalendarEventDialog, { type CalendarTaskOption } from "@/components/calendar/calendar-event-dialog";
import PlanningPanel from "@/components/calendar/planning-panel";
import ConfirmDialog from "@/components/ux/confirm-dialog";
import { notify } from "@/lib/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceSummary } from "@/components/authenticated-app-shell";
import { apiQueryOptions, ApiQueryError } from "@/lib/api-query";
import { queryKeys } from "@/lib/query-keys";
import { queryStaleTimes } from "@/lib/query-client";

type Availability = { configured: boolean; timeZone: string; windows: AvailabilityWindowDto[] };
type Props = { timeZone: string; initialAnchor: string; initialEvents: CalendarEventDto[]; initialTasks: CalendarTaskOption[]; availability: Availability; initialHabits: HabitDto[] };
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = Array.from({ length: 24 }, (_, index) => index);
const eventTone = (type: CalendarEventDto["eventType"]) => type === "COMMITMENT" ? "fixed" : type === "UNAVAILABLE" ? "unavailable" : "task-session";
type GridItem = { kind: "event"; startAt: string; endAt: string; event: CalendarEventDto } | { kind: "habit"; startAt: string; endAt: string; habit: TimedHabitBlock };
const eventKindLabel = (type: CalendarEventDto["eventType"]) => type === "TASK_SESSION" ? "Task session" : type === "COMMITMENT" ? "Fixed commitment" : "Unavailable time";
/** Height of one hour in the day and week grids. */
const HOUR_PX = 48;
/** An event shorter than this on screen shows title and time on one line. */
const COMPACT_EVENT_PX = 44;
// The current minute, for the "now" line. Null on the server, so the server
// and first client render agree; it appears after hydration.
const subscribeMinute = (onChange: () => void) => { const id = window.setInterval(onChange, 30_000); return () => window.clearInterval(id); };
const currentMinuteStamp = () => Math.floor(Date.now() / 60_000);
function labelDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00.000Z`));
}
function timeLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function CalendarManager({ timeZone, initialAnchor, initialEvents, initialTasks, availability, initialHabits }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId } = useWorkspaceSummary();
  const [anchor, setAnchor] = useState(initialAnchor);
  const [view, setView] = useState<CalendarView>("month");
  const [mobileWeekDate, setMobileWeekDate] = useState(initialAnchor);
  const range = useMemo(() => calendarRange(anchor, view, timeZone), [anchor, view, timeZone]);
  const eventQueryKey = queryKeys.lifestyle.calendar(userId, { from: range.from, to: range.to, timeZone });
  const eventsQuery = useQuery({
    ...apiQueryOptions<{ events?: CalendarEventDto[] }>({ queryKey: eventQueryKey, path: `/api/calendar/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, staleTime: queryStaleTimes.calendar }),
    initialData: { events: initialEvents },
  });
  const eventQueryDenied = eventsQuery.error instanceof ApiQueryError && [401, 403].includes(eventsQuery.error.status);
  const fetchedEvents = eventsQuery.data.events;
  const events = useMemo(() => eventQueryDenied ? [] : fetchedEvents ?? [], [eventQueryDenied, fetchedEvents]);
  // The Habits page's own query, so a check-in there (or on My Day) updates here.
  const habitsQuery = useQuery({
    ...apiQueryOptions<{ habits?: HabitDto[] }>({ queryKey: queryKeys.lifestyle.habits(userId), path: "/api/habits", staleTime: queryStaleTimes.habits }),
    initialData: { habits: initialHabits },
  });
  const fetchedHabits = habitsQuery.data.habits;
  const habitInputs = useMemo<CalendarHabitInput[]>(() => (fetchedHabits ?? []).map((habit) => ({
    id: habit.id, title: habit.title, frequency: habit.frequency, weekdays: habit.weekdays, status: habit.status, startTime: habit.startTime, endTime: habit.endTime,
    createdLocalDate: localDateAt(timeZone, new Date(habit.createdAt)), checkIns: habit.checkIns,
  })), [fetchedHabits, timeZone]);
  const [tasks, setTasks] = useState(initialTasks);
  const [availabilityConfigured, setAvailabilityConfigured] = useState(availability.configured);
  const loading = eventsQuery.isFetching;
  const [error, setError] = useState("");
  const [deletingEvent, setDeletingEvent] = useState<CalendarEventDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [modal, setModal] = useState<{ event: CalendarEventDto | null; date: string; time: string; taskId?: string } | null>(null);
  const visibleDates = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week") { const first = shiftLocalDate(anchor, 1 - isoWeekday(anchor)); return Array.from({ length: 7 }, (_, index) => shiftLocalDate(first, index)); }
    const first = `${anchor.slice(0, 7)}-01`; const offset = isoWeekday(first) - 1;
    return Array.from({ length: 42 }, (_, index) => shiftLocalDate(first, index - offset));
  }, [anchor, view]);

  useEffect(() => {
    const availabilityKey = queryKeys.lifestyle.availability(userId);
    const unscheduledKey = queryKeys.lifestyle.unscheduledTasks(userId);
    if (!queryClient.getQueryData(availabilityKey)) queryClient.setQueryData(availabilityKey, availability);
    if (!queryClient.getQueryData(unscheduledKey)) queryClient.setQueryData(unscheduledKey, { tasks: initialTasks });
  }, [availability, initialTasks, queryClient, userId]);
  const eventQueryError = eventsQuery.error instanceof Error ? eventsQuery.error.message : "";
  const displayError = error || eventQueryError;

  const eventsFor = (date: string) => events.filter((event) => eventOverlapsLocalDate(event.startAt, event.endAt, date, timeZone)).sort((a, b) => a.startAt.localeCompare(b.startAt));
  // Each visible day's events placed in the hour grid (day and week views).
  const layoutsByDate = useMemo(() => {
    const result = new Map<string, DayLayoutItem<GridItem>[]>();
    if (view === "month") return result;
    // Timed habits share the grid with events, so overlaps split the width
    // instead of one hiding the other.
    const items: GridItem[] = [
      ...events.map((event) => ({ kind: "event" as const, startAt: event.startAt, endAt: event.endAt, event })),
      ...timedHabitBlocks(habitInputs, visibleDates, localDateAt(timeZone), timeZone).map((habit) => ({ kind: "habit" as const, startAt: habit.startAt, endAt: habit.endAt, habit })),
    ];
    for (const date of visibleDates) {
      try {
        const startMs = Date.parse(localDayStartIso(date, timeZone));
        const endMs = Date.parse(localDayStartIso(shiftLocalDate(date, 1), timeZone));
        result.set(date, layoutDayEvents(items, { startMs, endMs, timeZone }));
      } catch { result.set(date, []); }
    }
    return result;
  }, [events, habitInputs, timeZone, view, visibleDates]);
  const minuteStamp = useSyncExternalStore(subscribeMinute, currentMinuteStamp, () => null);
  const nowMinute = minuteStamp === null ? null : localMinuteOfDay(new Date(minuteStamp * 60_000).toISOString(), timeZone);
  const agendaRef = useRef<HTMLDivElement>(null);
  const layoutsRef = useRef(layoutsByDate);
  useEffect(() => { layoutsRef.current = layoutsByDate; }, [layoutsByDate]);
  // Open each day/week at the first event (or 7 AM), once per period — not on
  // every refetch, which would yank the grid while the user is scrolling it.
  useEffect(() => {
    if (view === "month" || !agendaRef.current) return;
    const all = [...layoutsRef.current.values()].flat();
    agendaRef.current.scrollTop = (initialScrollMinute(all) / 60) * HOUR_PX;
  }, [view, anchor]);
  const renderAgendaDay = (date: string) => (
    <section className={`calendar-agenda-day ${view === "week" && date === mobileWeekDate ? "calendar-selected-day" : ""}`} key={date}>
      <header><strong>{labelDate(date, { weekday: "short", month: "short", day: "numeric" })}</strong>{date === today && <span>Today</span>}<button onClick={() => openCreate(date)} aria-label={`Add event on ${date}`}><Plus size={14} /></button></header>
      {renderHabitRow(habitsOnDate(habitInputs, date, today).filter((habit) => !habit.startTime))}
      <div className="calendar-timeline" style={{ "--cal-hour": `${HOUR_PX}px` } as CSSProperties}>
        {hours.map((hour) => {
          const time = `${String(hour).padStart(2, "0")}:00`;
          let slot: string | null = null;
          try { slot = localDateTimeToIso(date, time, timeZone); } catch { /* Skip nonexistent DST wall-clock slots. */ }
          const dayStart = Date.parse(localDayStartIso(date, timeZone));
          const labelInstant = slot ? new Date(slot) : new Date(dayStart + hour * 3_600_000);
          return <div className="calendar-time-row" key={hour}><span>{new Intl.DateTimeFormat("en", { timeZone, hour: "numeric" }).format(labelInstant)}</span><button className="calendar-time-slot" disabled={!slot} onClick={() => openCreate(date, time)} aria-label={`Add event ${time} on ${date}`} /></div>;
        })}
        <div className="calendar-timeline-events">
          {(layoutsByDate.get(date) ?? []).map(({ item, startMinute, endMinute, continuesBefore, continuesAfter, column, columns }) => {
            const height = ((endMinute - startMinute) / 60) * HOUR_PX;
            const position = { top: `${(startMinute / 60) * HOUR_PX}px`, height: `${height - 2}px`, left: `calc(${column} * 100% / ${columns})`, width: `calc(100% / ${columns} - 3px)` };
            if (item.kind === "habit") {
              const habit = item.habit;
              const label = `${habit.title}, habit, ${habitTimeLabel(habit.startTime!, habit.endTime)}, ${HABIT_STATE_LABEL[habit.state]}`;
              return <Link key={`${habit.key}:${date}`} href="/habits" className={`calendar-timed-event habit habit-${habit.state}${height < COMPACT_EVENT_PX ? " compact" : ""}`} style={position} title={label} aria-label={label}>
                <strong>{habit.state === "done" ? "✓ " : ""}{habit.title}</strong><time>{habitTimeLabel(habit.startTime!, habit.endTime)}</time>
              </Link>;
            }
            const event = item.event;
            const range = `${continuesBefore ? "Continues" : timeLabel(event.startAt, timeZone)} – ${continuesAfter ? "continues" : timeLabel(event.endAt, timeZone)}`;
            const title = event.eventType === "TASK_SESSION" ? event.taskTitle ?? event.title : event.title;
            return <button
              type="button"
              className={`calendar-timed-event ${eventTone(event.eventType)}${height < COMPACT_EVENT_PX ? " compact" : ""}`}
              key={event.id}
              style={position}
              title={`${title} · ${range} · ${eventKindLabel(event.eventType)}`}
              aria-label={`${title}, ${range}, ${eventKindLabel(event.eventType)}`}
              onClick={() => setModal({ event, date, time: continuesBefore ? "00:00" : timeLabel(event.startAt, timeZone) })}
            >
              <strong>{title}</strong><time>{range}</time>
            </button>;
          })}
        </div>
        {date === today && nowMinute !== null && <div className="calendar-now-line" style={{ top: `${(nowMinute / 60) * HOUR_PX}px` }} aria-hidden="true" />}
      </div>
    </section>
  );
  function renderHabitRow(dayHabits: CalendarHabit[]) {
    // Every day in the week reserves the same habit-row height (the busiest
    // day's), so the hour grids below stay aligned across columns.
    if (!maxHabitRows) return null;
    return <div className="calendar-habit-row" aria-label="Habits this day">
      {dayHabits.map((habit) => <Link key={habit.id} href="/habits" className={`calendar-habit-pill habit-${habit.state}`} title={`${habit.title} · habit · ${HABIT_STATE_LABEL[habit.state]}`} aria-label={`${habit.title}, habit, ${HABIT_STATE_LABEL[habit.state]}`}>
        {habit.state === "done" ? <Check size={11} aria-hidden="true" /> : <Circle size={9} aria-hidden="true" />}<span>{habit.title}</span>
      </Link>)}
    </div>;
  }
  function renderHabitChip(date: string) {
    const dayHabits = habitsOnDate(habitInputs, date, today);
    if (!dayHabits.length) return null;
    const done = dayHabits.filter((habit) => habit.state === "done").length;
    const tracked = dayHabits.some((habit) => habit.state !== "upcoming" && habit.state !== "unknown");
    const label = tracked ? `${done}/${dayHabits.length} habits` : `${dayHabits.length} habit${dayHabits.length === 1 ? "" : "s"}`;
    return <button className="calendar-habit-chip" onClick={() => { changeAnchor(date); changeView("day"); }} title={dayHabits.map((habit) => `${habit.title} — ${HABIT_STATE_LABEL[habit.state]}`).join("\n")} aria-label={`${label} on ${date}: ${dayHabits.map((habit) => `${habit.title} ${HABIT_STATE_LABEL[habit.state]}`).join(", ")}`}>
      <Flame size={11} aria-hidden="true" /><span>{label}</span>
    </button>;
  }
  const headerDate = view === "month" ? labelDate(`${anchor.slice(0, 7)}-15`, { month: "long", year: "numeric" }) : view === "day" ? labelDate(anchor, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : `${labelDate(visibleDates[0]!, { month: "short", day: "numeric" })} – ${labelDate(visibleDates[6]!, { month: "short", day: "numeric", year: "numeric" })}`;
  const today = localDateAt(timeZone);
  const maxHabitRows = view === "month" ? 0 : Math.max(0, ...visibleDates.map((date) => habitsOnDate(habitInputs, date, today).filter((habit) => !habit.startTime).length));
  const plannerStartDate = anchor < today ? today : anchor;

  function openCreate(date = anchor, time = "09:00", taskId?: string) { setModal({ event: null, date, time, ...(taskId ? { taskId } : {}) }); }
  // Period changes run as transitions so the grid can crossfade (a plain
  // setState never triggers a view transition).
  function changeAnchor(next: string) { if (next === anchor) return; setError(""); startTransition(() => { setAnchor(next); setMobileWeekDate(next); }); }
  function changeView(next: CalendarView) { if (next === view) return; setError(""); startTransition(() => { setView(next); if (next === "week") setMobileWeekDate(anchor); }); }
  async function refreshEvents(taskId: string | null) {
    setModal(null); notify.success("Calendar event saved");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.calendarRoot(userId), refetchType: "none" }),
      queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.unscheduledTasks(userId) }),
    ]);
    const [, taskData] = await Promise.all([
      eventsQuery.refetch(),
      queryClient.fetchQuery(apiQueryOptions<{ tasks?: CalendarTaskOption[] }>({ queryKey: queryKeys.lifestyle.unscheduledTasks(userId), path: "/api/calendar/unscheduled-tasks", staleTime: 0 })),
    ]);
    setTasks(taskData.tasks ?? []);
    if (taskId && !taskData.tasks) setTasks((current) => current.filter((task) => task.id !== taskId));
    router.refresh();
  }
  async function refreshAfterPlan() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.calendarRoot(userId), refetchType: "none" }),
      queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.unscheduledTasks(userId) }),
    ]);
    const [, taskData] = await Promise.all([
      eventsQuery.refetch(),
      queryClient.fetchQuery(apiQueryOptions<{ tasks?: CalendarTaskOption[] }>({ queryKey: queryKeys.lifestyle.unscheduledTasks(userId), path: "/api/calendar/unscheduled-tasks", staleTime: 0 })),
    ]);
    setTasks(taskData.tasks ?? []);
    router.refresh();
  }
  async function deleteEvent(event: CalendarEventDto) {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/calendar/events/${event.id}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not delete this event.");
      queryClient.setQueryData<{ events?: CalendarEventDto[] }>(eventQueryKey, (current) => ({ events: (current?.events ?? []).filter((item) => item.id !== event.id) })); setModal(null); setDeletingEvent(null); notify.success("Calendar event deleted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.calendarRoot(userId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.lifestyle.unscheduledTasks(userId) }),
      ]);
      const tasksBody = await queryClient.fetchQuery(apiQueryOptions<{ tasks?: CalendarTaskOption[] }>({ queryKey: queryKeys.lifestyle.unscheduledTasks(userId), path: "/api/calendar/unscheduled-tasks", staleTime: 0 }));
      setTasks(tasksBody.tasks ?? []);
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not delete this event.";
      setError(message); notify.error("Calendar event could not be deleted", message);
    } finally { setDeleting(false); }
  }

  const openTaskCount = tasks.length;
  return <div className="calendar-workspace m-calendar">
    <main className="calendar-content m-page">
      <header className="m-page-head">
        <div className="m-page-head-copy"><div className="m-eyebrow">Your space · {timeZone}</div><h1 className="m-display"><span className="m-glow">Calendar</span></h1><p className="m-muted">Plan your time by hand, or let Michael place tasks around your fixed commitments. Task deadlines stay separate from scheduled sessions.</p></div>
        <div className="m-page-head-actions"><a className="m-btn" href="#planner-heading"><Sparkles size={15} aria-hidden="true" />Plan with Michael</a><button className="m-btn m-btn-p" onClick={() => openCreate()}><Plus size={16} aria-hidden="true" />Add event</button></div>
      </header>
      <section className="m-ai m-line" aria-label="Michael">
        <span className="m-orbw" aria-hidden="true" style={{ width: 34, height: 34 }}><span className="m-ring" /><span className="m-ring m-r2" /><MichaelPresence state="idle" size="md" /></span>
        <p><span className="m-neon">Michael · </span>{!availabilityConfigured ? "Set your available hours below and I can place tasks around them. Nothing is scheduled until you approve it." : openTaskCount > 0 ? `I can place your ${openTaskCount === 1 ? "unscheduled task" : `${openTaskCount} unscheduled tasks`} around your fixed commitments and available hours. Proposed sessions stay drafts until you approve them.` : "Every active task already has a time. I can still re-plan a week around new commitments when you ask."}</p>
        <div className="m-line-actions"><a className="m-btn m-btn-p m-btn-sm" href="#planner-heading"><Sparkles size={14} aria-hidden="true" />Draft a schedule</a></div>
      </section>
      <section className="m-card calendar-panel">
        <div className="calendar-toolbar"><div className="calendar-date-controls"><button onClick={() => changeAnchor(moveAnchor(anchor, view, -1))} aria-label="Previous period"><ChevronLeft size={17} /></button><button onClick={() => changeAnchor(moveAnchor(anchor, view, 1))} aria-label="Next period"><ChevronRight size={17} /></button><button className="calendar-today" onClick={() => changeAnchor(today)}>Today</button><h2>{headerDate}</h2><span>{loading && <LoaderCircle size={14} className="calendar-spin" />}</span></div><div className="m-seg calendar-view-toggle" role="group" aria-label="Calendar view">{(["month", "week", "day"] as const).map((value) => <button key={value} aria-pressed={view === value} className={view === value ? "m-on selected" : ""} onClick={() => changeView(value)}>{value[0]!.toUpperCase()}{value.slice(1)}</button>)}</div></div>
        {displayError && <div className="calendar-inline-error" role="alert"><span>{displayError}</span><button onClick={() => { setError(""); void eventsQuery.refetch(); }} aria-label="Retry loading"><RefreshCw size={14} /></button></div>}
        {!loading && !displayError && events.length === 0 && <p className="calendar-empty-note calendar-period-empty" role="status">No events in this period. Choose a day or time slot to schedule something.</p>}
        <div className="calendar-legend"><span><i className="task-session" />Flexible task session</span><span><i className="fixed" />Fixed commitment</span><span><i className="unavailable" />Unavailable</span><span><i className="habit" />Habit</span><span className="availability-state">{availabilityConfigured ? "Availability configured" : "Availability not configured"}</span></div>
        {/* Keyed by view and period: moving to another week or month is "same place,
            different content", so it crossfades while the toolbar stays still. */}
        <ViewTransition key={`${view}:${anchor}`} enter="timeline-in" exit="timeline-out" default="none"><div className="calendar-period">
        {view === "month" ? <><div className="calendar-month-grid"><div className="calendar-weekday-row">{weekdays.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-month-cells">{visibleDates.map((date) => <div className={`calendar-month-cell ${date.slice(0, 7) !== anchor.slice(0, 7) ? "outside" : ""} ${date === today ? "today" : ""}`} key={date}><button className="calendar-cell-date" onClick={() => { changeAnchor(date); changeView("day"); }} aria-label={`Show ${date}`}>{Number(date.slice(-2))}</button><button className="calendar-cell-add" onClick={() => openCreate(date)} aria-label={`Add event on ${date}`}><Plus size={12} /></button><div className="calendar-cell-events">{eventsFor(date).slice(0, 3).map((event) => { const startsToday = localDateAt(timeZone, new Date(event.startAt)) === date; return <button className={`calendar-event-chip ${eventTone(event.eventType)}`} key={event.id} onClick={() => setModal({ event, date, time: startsToday ? timeLabel(event.startAt, timeZone) : "00:00" })}><time>{startsToday ? timeLabel(event.startAt, timeZone) : "↳"}</time><span>{event.title}</span></button>})}{eventsFor(date).length > 3 && <button className="calendar-more-events" onClick={() => { changeAnchor(date); changeView("day"); }}>+{eventsFor(date).length - 3} more</button>}{renderHabitChip(date)}</div></div>)}</div></div><div className="calendar-mobile-agenda">{renderAgendaDay(anchor)}</div></> : <>{view === "week" && <div className="calendar-mobile-week-strip" role="group" aria-label="Choose a day in this week">{visibleDates.map((date) => <button key={date} type="button" aria-pressed={date === mobileWeekDate} onClick={() => setMobileWeekDate(date)}><span>{labelDate(date, { weekday: "short" })}</span><strong>{Number(date.slice(-2))}</strong></button>)}</div>}<div ref={agendaRef} className={`calendar-agenda ${view === "day" ? "single-day" : ""} ${view === "week" ? "calendar-agenda-week" : ""}`} style={{ "--habit-rows": maxHabitRows } as CSSProperties}>{visibleDates.map(renderAgendaDay)}</div></>}
        </div></ViewTransition>
      </section>
      <PlanningPanel timeZone={timeZone} initialDate={plannerStartDate} onApplied={() => void refreshAfterPlan()} />
      <div className="calendar-lower-grid"><section className="unscheduled-card"><header><div><span className="calendar-card-icon"><CalendarDays size={17} /></span><div><h2>Unscheduled tasks</h2><p>Active tasks without a future calendar session.</p></div></div><Link href="/tasks" aria-label="Manage tasks"><ArrowRight size={15} /></Link></header>{tasks.length ? <div className="unscheduled-list">{tasks.slice(0, 8).map((task) => <div key={task.id}><span className={`task-priority priority-${task.priority.toLowerCase()}`} /><div><strong>{task.title}</strong><span>{task.estimatedDurationMinutes ? `${task.estimatedDurationMinutes} min` : "Duration not set"}{task.dueDate ? ` · Due ${task.dueDate}` : ""}</span></div><button onClick={() => openCreate(today, "09:00", task.id)} aria-label={`Schedule ${task.title}`}><CalendarClock size={15} />Schedule</button></div>)}</div> : <p className="calendar-empty-note">No active unscheduled tasks. New task sessions can be linked to tasks you create later.</p>}</section>
        <AvailabilityEditor timeZone={availability.timeZone} initialWindows={availability.windows} onConfiguredChange={setAvailabilityConfigured} /></div>
      <p className="calendar-contract-note"><Clock3 size={13} />No automatic scheduling is active. Conflicting events are reported; existing events are never shifted automatically.</p>
    </main>
    {modal && <CalendarEventDialog event={modal.event} initialDate={modal.date} initialTime={modal.time} initialTaskId={modal.taskId} timeZone={timeZone} tasks={tasks} onClose={() => setModal(null)} onSaved={(taskId) => void refreshEvents(taskId)} onDelete={modal.event ? () => setDeletingEvent(modal.event) : undefined} />}
    <ConfirmDialog open={deletingEvent !== null} title="Delete this calendar event?" description={deletingEvent ? `“${deletingEvent.title}” will be removed from your calendar.` : "This event will be removed from your calendar."} confirmLabel="Delete event" destructive busy={deleting} onOpenChange={(open) => { if (!open && !deleting) setDeletingEvent(null); }} onConfirm={() => { if (deletingEvent) void deleteEvent(deletingEvent); }} />
  </div>;
}
