"use client";

import { useState } from "react";
import { CalendarClock, Clock3, LoaderCircle, X } from "lucide-react";
import type { CalendarEventDto } from "@/lib/calendar-service";
import { localDateTimeToIso, shiftLocalDate } from "@/lib/calendar-date";

export type CalendarTaskOption = { id: string; title: string; priority: "LOW" | "MEDIUM" | "HIGH"; estimatedDurationMinutes: number | null; dueDate: string | null };
type Props = { event: CalendarEventDto | null; initialDate: string; initialTime: string; initialTaskId?: string; timeZone: string; tasks: CalendarTaskOption[]; onClose: () => void; onSaved: (taskId: string | null) => void; onDelete?: () => void };
function initialLocal(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const get = (name: string) => parts.find((part) => part.type === name)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export default function CalendarEventDialog({ event, initialDate, initialTime, initialTaskId, timeZone, tasks, onClose, onSaved, onDelete }: Props) {
  const local = event ? initialLocal(event.startAt, timeZone) : { date: initialDate, time: initialTime };
  const endHour = Number(initialTime.slice(0, 2)) + 1;
  const endLocal = event ? initialLocal(event.endAt, timeZone) : { date: endHour >= 24 ? shiftLocalDate(initialDate, 1) : initialDate, time: `${String(endHour % 24).padStart(2, "0")}:${initialTime.slice(3)}` };
  const [title, setTitle] = useState(event?.title ?? tasks.find((task) => task.id === initialTaskId)?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [eventType, setEventType] = useState<"TASK_SESSION" | "COMMITMENT" | "UNAVAILABLE">(event?.eventType ?? "TASK_SESSION");
  const [schedulingMode, setSchedulingMode] = useState<"FIXED" | "FLEXIBLE">(event?.schedulingMode ?? "FLEXIBLE");
  const [taskId, setTaskId] = useState(event?.taskId ?? initialTaskId ?? "");
  const [startDate, setStartDate] = useState(local.date); const [startTime, setStartTime] = useState(local.time);
  const [endDate, setEndDate] = useState(endLocal.date); const [endTime, setEndTime] = useState(endLocal.time);
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError("");
    try {
      const startAt = localDateTimeToIso(startDate, startTime, timeZone);
      const endAt = localDateTimeToIso(endDate, endTime, timeZone);
      if (Date.parse(startAt) >= Date.parse(endAt)) throw new Error("End time must be after start time.");
      const payload = { title, description: description || null, ...(event ? {} : { eventType }), schedulingMode: eventType === "TASK_SESSION" ? schedulingMode : "FIXED", taskId: eventType === "TASK_SESSION" && taskId ? taskId : null, startAt, endAt, timeZone };
      const response = await fetch(event ? `/api/calendar/events/${event.id}` : "/api/calendar/events", { method: event ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { error?: string; conflicts?: Array<{ title: string }> };
      if (!response.ok) throw new Error(body.conflicts?.length ? `${body.error} Conflicts: ${body.conflicts.map((conflict) => conflict.title).join(", ")}.` : body.error ?? "Could not save this event.");
      onSaved(eventType === "TASK_SESSION" && taskId ? taskId : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this event."); }
    finally { setPending(false); }
  }

  return <div className="calendar-modal-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) onClose(); }} onKeyDown={(e) => {
    if (e.key === "Escape" && !pending) { onClose(); return; }
    if (e.key !== "Tab") return;
    const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'));
    const first = focusable[0]; const last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}><section className="calendar-event-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-event-heading" tabIndex={-1}>
    <header><div><span className="calendar-dialog-icon"><CalendarClock size={17} /></span><div><h2 id="calendar-event-heading">{event ? "Edit calendar event" : "Add to your calendar"}</h2><p>Times are interpreted in {timeZone}.</p></div></div><button type="button" className="calendar-close" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></header>
    <form onSubmit={(e) => void submit(e)}>
      <label>Event type<select value={eventType} disabled={!!event} onChange={(e) => setEventType(e.target.value as typeof eventType)}><option value="TASK_SESSION">Task session</option><option value="COMMITMENT">Fixed commitment</option><option value="UNAVAILABLE">Unavailable time</option></select></label>
      <label>Title<input autoFocus maxLength={160} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={eventType === "TASK_SESSION" ? "Focus session" : eventType === "COMMITMENT" ? "Appointment" : "Lunch break"} /></label>
      {eventType === "TASK_SESSION" && <><label>Related task (optional)<select value={taskId} onChange={(e) => { const task = tasks.find((item) => item.id === e.target.value); setTaskId(e.target.value); if (task && !title) setTitle(task.title); }}><option value="">No linked task</option>{event?.taskId && !tasks.some((task) => task.id === event.taskId) && <option value={event.taskId}>{event.taskTitle ?? "Linked task"}</option>}{tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label><label>Scheduling mode<select value={schedulingMode} onChange={(e) => setSchedulingMode(e.target.value as typeof schedulingMode)}><option value="FLEXIBLE">Flexible session</option><option value="FIXED">Keep at this time</option></select></label></>}
      <div className="calendar-time-fields"><label>Start date<input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label>Start time<input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label><label>End date<input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label><label>End time<input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label></div>
      <label>Description<textarea rows={3} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" /></label>
      {error && <p role="alert" className="calendar-form-error">{error}</p>}
      <div className="calendar-dialog-actions">{event && onDelete && <button className="calendar-dialog-delete" type="button" onClick={onDelete} disabled={pending}>Delete</button>}<button type="button" onClick={onClose} disabled={pending}>Cancel</button><button type="submit" disabled={pending}>{pending ? <LoaderCircle size={15} className="calendar-spin" /> : <Clock3 size={15} />}{pending ? "Saving…" : event ? "Save changes" : "Add event"}</button></div>
    </form>
  </section></div>;
}
