"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3, LoaderCircle, LogOut, Plus, RefreshCw } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { calendarRange, isoWeekday, localDateAt, localDateTimeToIso, moveAnchor, shiftLocalDate, type CalendarView } from "@/lib/calendar-date";
import type { CalendarEventDto } from "@/lib/calendar-service";
import AvailabilityEditor, { type AvailabilityWindowDto } from "@/components/calendar/availability-editor";
import CalendarEventDialog, { type CalendarTaskOption } from "@/components/calendar/calendar-event-dialog";
import BrandLogo from "@/components/brand-logo";
import PlanningPanel from "@/components/calendar/planning-panel";

type Availability = { configured: boolean; timeZone: string; windows: AvailabilityWindowDto[] };
type Props = { userName: string; timeZone: string; initialAnchor: string; initialEvents: CalendarEventDto[]; initialTasks: CalendarTaskOption[]; availability: Availability };
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = Array.from({ length: 14 }, (_, index) => index + 7);
const eventTone = (type: CalendarEventDto["eventType"]) => type === "COMMITMENT" ? "fixed" : type === "UNAVAILABLE" ? "unavailable" : "task-session";
function labelDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00.000Z`));
}
function timeLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function taskDate(event: CalendarEventDto, timeZone: string) { return localDateAt(timeZone, new Date(event.startAt)); }

export default function CalendarManager({ userName, timeZone, initialAnchor, initialEvents, initialTasks, availability }: Props) {
  const router = useRouter();
  const [anchor, setAnchor] = useState(initialAnchor);
  const [view, setView] = useState<CalendarView>("month");
  const [events, setEvents] = useState(initialEvents);
  const [tasks, setTasks] = useState(initialTasks);
  const [availabilityConfigured, setAvailabilityConfigured] = useState(availability.configured);
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<{ event: CalendarEventDto | null; date: string; time: string; taskId?: string } | null>(null);
  const range = useMemo(() => calendarRange(anchor, view, timeZone), [anchor, view, timeZone]);
  const visibleDates = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week") { const first = shiftLocalDate(anchor, 1 - isoWeekday(anchor)); return Array.from({ length: 7 }, (_, index) => shiftLocalDate(first, index)); }
    const first = `${anchor.slice(0, 7)}-01`; const offset = isoWeekday(first) - 1;
    return Array.from({ length: 42 }, (_, index) => shiftLocalDate(first, index - offset));
  }, [anchor, view]);

  useEffect(() => {
    let active = true;
    fetch(`/api/calendar/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)
      .then(async (response) => { const body = await response.json() as { events?: CalendarEventDto[]; error?: string }; if (!response.ok) throw new Error(body.error ?? "Could not load calendar events."); if (active) { setEvents(body.events ?? []); setError(""); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load calendar events."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range.from, range.to, retryCount]);

  const eventsFor = (date: string) => events.filter((event) => taskDate(event, timeZone) === date).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const renderAgendaDay = (date: string) => <section className="calendar-agenda-day" key={date}><header><strong>{labelDate(date, { weekday: "short", month: "short", day: "numeric" })}</strong>{date === today && <span>Today</span>}<button onClick={() => openCreate(date)} aria-label={`Add event on ${date}`}><Plus size={14} /></button></header><div className="calendar-time-list">{hours.map((hour) => { const time = `${String(hour).padStart(2, "0")}:00`; const hourEvents = eventsFor(date).filter((event) => Number(new Intl.DateTimeFormat("en", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date(event.startAt))) === hour); return <div className="calendar-time-row" key={hour}><span>{new Intl.DateTimeFormat("en", { timeZone, hour: "numeric" }).format(new Date(localDateTimeToIso(date, time, timeZone)))}</span><button className="calendar-time-slot" onClick={() => openCreate(date, time)} aria-label={`Add event ${time} on ${date}`} />{hourEvents.map((event) => <button className={`calendar-agenda-event ${eventTone(event.eventType)}`} key={event.id} onClick={() => setModal({ event, date, time })}><time>{timeLabel(event.startAt, timeZone)}–{timeLabel(event.endAt, timeZone)}</time><strong>{event.title}</strong><span>{event.eventType === "TASK_SESSION" ? event.taskTitle ?? "Task session" : event.eventType === "COMMITMENT" ? "Fixed commitment" : "Unavailable time"}</span></button>)}</div>; })}</div></section>;
  const headerDate = view === "month" ? labelDate(`${anchor.slice(0, 7)}-15`, { month: "long", year: "numeric" }) : view === "day" ? labelDate(anchor, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : `${labelDate(visibleDates[0]!, { month: "short", day: "numeric" })} – ${labelDate(visibleDates[6]!, { month: "short", day: "numeric", year: "numeric" })}`;
  const today = localDateAt(timeZone);

  function openCreate(date = anchor, time = "09:00", taskId?: string) { setToast(""); setModal({ event: null, date, time, ...(taskId ? { taskId } : {}) }); }
  function changeAnchor(next: string) { if (next === anchor) return; setLoading(true); setError(""); setAnchor(next); }
  function changeView(next: CalendarView) { if (next === view) return; setLoading(true); setError(""); setView(next); }
  async function refreshEvents(taskId: string | null) {
    setModal(null); setToast("Calendar saved.");
    const [eventResponse, taskResponse] = await Promise.all([
      fetch(`/api/calendar/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),
      fetch("/api/calendar/unscheduled-tasks"),
    ]);
    if (eventResponse.ok) { const body = await eventResponse.json() as { events: CalendarEventDto[] }; setEvents(body.events); }
    if (taskResponse.ok) { const body = await taskResponse.json() as { tasks: CalendarTaskOption[] }; setTasks(body.tasks); }
    if (taskId && !taskResponse.ok) setTasks((current) => current.filter((task) => task.id !== taskId));
    router.refresh();
  }
  async function refreshAfterPlan() {
    setToast("Approved plan added to your calendar.");
    const [eventResponse, taskResponse] = await Promise.all([
      fetch(`/api/calendar/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),
      fetch("/api/calendar/unscheduled-tasks"),
    ]);
    if (eventResponse.ok) { const body = await eventResponse.json() as { events: CalendarEventDto[] }; setEvents(body.events); }
    if (taskResponse.ok) { const body = await taskResponse.json() as { tasks: CalendarTaskOption[] }; setTasks(body.tasks); }
    router.refresh();
  }
  async function deleteEvent(event: CalendarEventDto) {
    if (!window.confirm(`Delete “${event.title}” from your calendar?`)) return;
    setError("");
    const response = await fetch(`/api/calendar/events/${event.id}`, { method: "DELETE" });
    const body = await response.json() as { error?: string };
    if (!response.ok) { setError(body.error ?? "Could not delete this event."); return; }
    setEvents((current) => current.filter((item) => item.id !== event.id)); setModal(null); setToast("Calendar event deleted.");
    const tasksResponse = await fetch("/api/calendar/unscheduled-tasks");
    if (tasksResponse.ok) { const body = await tasksResponse.json() as { tasks: CalendarTaskOption[] }; setTasks(body.tasks); }
    router.refresh();
  }

  return <div className="calendar-workspace">
    <header className="calendar-topbar"><Link href="/" className="goals-brand" aria-label="MichaelOS home"><BrandLogo /></Link><nav aria-label="Workspace"><Link href="/">Today</Link><Link href="/tasks">Tasks</Link><Link href="/goals">Goals</Link><Link href="/habits">Habits</Link><Link className="current" href="/calendar" aria-current="page">Calendar</Link></nav><div className="goals-account"><span>{userName}</span><button onClick={async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); }} aria-label="Sign out"><LogOut size={15} /></button></div></header>
    <main className="calendar-content">
      <div className="calendar-heading"><div><div className="section-kicker">YOUR SPACE · {timeZone}</div><h1>Calendar</h1><p>Plan your time manually. Task deadlines remain separate from scheduled sessions.</p></div><button className="calendar-primary" onClick={() => openCreate()}><Plus size={15} />Add event</button></div>
      <section className="calendar-panel">
        <div className="calendar-toolbar"><div className="calendar-date-controls"><button onClick={() => changeAnchor(moveAnchor(anchor, view, -1))} aria-label="Previous period"><ChevronLeft size={17} /></button><button onClick={() => changeAnchor(moveAnchor(anchor, view, 1))} aria-label="Next period"><ChevronRight size={17} /></button><button className="calendar-today" onClick={() => changeAnchor(today)}>Today</button><h2>{headerDate}</h2><span>{loading && <LoaderCircle size={14} className="calendar-spin" />}</span></div><div className="calendar-view-toggle" role="group" aria-label="Calendar view">{(["month", "week", "day"] as const).map((value) => <button key={value} aria-pressed={view === value} className={view === value ? "selected" : ""} onClick={() => changeView(value)}>{value[0]!.toUpperCase()}{value.slice(1)}</button>)}</div></div>
        {error && <div className="calendar-inline-error" role="alert"><span>{error}</span><button onClick={() => { setLoading(true); setError(""); setRetryCount((count) => count + 1); }} aria-label="Retry loading"><RefreshCw size={14} /></button></div>}
        {toast && <p className="calendar-toast" role="status">{toast}</p>}
        {!loading && !error && events.length === 0 && <p className="calendar-empty-note calendar-period-empty" role="status">No events in this period. Choose a day or time slot to schedule something.</p>}
        <div className="calendar-legend"><span><i className="task-session" />Flexible task session</span><span><i className="fixed" />Fixed commitment</span><span><i className="unavailable" />Unavailable</span><span className="availability-state">{availabilityConfigured ? "Availability configured" : "Availability not configured"}</span></div>
        {view === "month" ? <><div className="calendar-month-grid"><div className="calendar-weekday-row">{weekdays.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-month-cells">{visibleDates.map((date) => <div className={`calendar-month-cell ${date.slice(0, 7) !== anchor.slice(0, 7) ? "outside" : ""} ${date === today ? "today" : ""}`} key={date}><button className="calendar-cell-date" onClick={() => { changeAnchor(date); changeView("day"); }} aria-label={`Show ${date}`}>{Number(date.slice(-2))}</button><button className="calendar-cell-add" onClick={() => openCreate(date)} aria-label={`Add event on ${date}`}><Plus size={12} /></button><div className="calendar-cell-events">{eventsFor(date).slice(0, 3).map((event) => <button className={`calendar-event-chip ${eventTone(event.eventType)}`} key={event.id} onClick={() => setModal({ event, date, time: "09:00" })}><time>{timeLabel(event.startAt, timeZone)}</time><span>{event.title}</span></button>)}{eventsFor(date).length > 3 && <button className="calendar-more-events" onClick={() => { changeAnchor(date); changeView("day"); }}>+{eventsFor(date).length - 3} more</button>}</div></div>)}</div></div><div className="calendar-mobile-agenda">{renderAgendaDay(anchor)}</div></> : <div className={`calendar-agenda ${view === "day" ? "single-day" : ""}`}>{visibleDates.map(renderAgendaDay)}</div>}
      </section>
      <PlanningPanel timeZone={timeZone} initialDate={today} onApplied={() => void refreshAfterPlan()} />
      <div className="calendar-lower-grid"><section className="unscheduled-card"><header><div><span className="calendar-card-icon"><CalendarDays size={17} /></span><div><h2>Unscheduled tasks</h2><p>Active tasks without a future calendar session.</p></div></div><Link href="/tasks" aria-label="Manage tasks"><ArrowRight size={15} /></Link></header>{tasks.length ? <div className="unscheduled-list">{tasks.slice(0, 8).map((task) => <div key={task.id}><span className={`task-priority priority-${task.priority.toLowerCase()}`} /><div><strong>{task.title}</strong><span>{task.estimatedDurationMinutes ? `${task.estimatedDurationMinutes} min` : "Duration not set"}{task.dueDate ? ` · Due ${task.dueDate}` : ""}</span></div><button onClick={() => openCreate(today, "09:00", task.id)} aria-label={`Schedule ${task.title}`}><CalendarClock size={15} />Schedule</button></div>)}</div> : <p className="calendar-empty-note">No active unscheduled tasks. New task sessions can be linked to tasks you create later.</p>}</section>
        <AvailabilityEditor timeZone={availability.timeZone} initialWindows={availability.windows} onConfiguredChange={setAvailabilityConfigured} /></div>
      <p className="calendar-contract-note"><Clock3 size={13} />No automatic scheduling is active. Conflicting events are reported; existing events are never shifted automatically.</p>
    </main>
    {modal && <CalendarEventDialog event={modal.event} initialDate={modal.date} initialTime={modal.time} initialTaskId={modal.taskId} timeZone={timeZone} tasks={tasks} onClose={() => setModal(null)} onSaved={(taskId) => void refreshEvents(taskId)} onDelete={modal.event ? () => void deleteEvent(modal.event!) : undefined} />}
  </div>;
}
