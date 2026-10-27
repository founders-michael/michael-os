"use client";

import { useState } from "react";
import { Check, Clock3, LoaderCircle, Plus, Trash2 } from "lucide-react";

export type AvailabilityWindowDto = { id?: string; weekday: number; startTime: string; endTime: string; timeZone: string; active: boolean };
const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function AvailabilityEditor({ timeZone, initialWindows, onConfiguredChange }: { timeZone: string; initialWindows: AvailabilityWindowDto[]; onConfiguredChange: (configured: boolean) => void }) {
  const [windows, setWindows] = useState(initialWindows.map((window, index) => ({ ...window, timeZone: window.timeZone || timeZone, key: window.id ?? `initial-${index}` })));
  const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const configured = windows.some((window) => window.active);
  function addWindow() { setWindows((current) => [...current, { key: crypto.randomUUID(), weekday: 1, startTime: "09:00", endTime: "17:00", timeZone, active: true }]); setMessage(""); setError(""); }
  function patch(key: string, update: Partial<AvailabilityWindowDto>) { setWindows((current) => current.map((window) => window.key === key ? { ...window, ...update } : window)); setMessage(""); }
  async function save() {
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/calendar/availability", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ windows: windows.map((window) => ({ ...(window.id ? { id: window.id } : {}), weekday: window.weekday, startTime: window.startTime, endTime: window.endTime, timeZone: window.timeZone, active: window.active })) }) });
      const body = await response.json() as { error?: string; configured?: boolean };
      if (!response.ok) throw new Error(body.error ?? "Could not save availability.");
      onConfiguredChange(body.configured ?? false);
      setMessage("Availability saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save availability."); }
    finally { setPending(false); }
  }

  return <section className="availability-card" aria-labelledby="availability-title">
    <header><span className="calendar-card-icon"><Clock3 size={17} /></span><div><h2 id="availability-title">Weekly availability</h2><p>New windows default to <strong>{timeZone}</strong>; saved windows keep their timezone.</p></div><span className={configured ? "availability-badge configured" : "availability-badge"}>{configured ? "Configured" : "Not configured"}</span></header>
    {!configured && <p className="availability-unconfigured">No weekly availability is configured. Calendar events can still be added; MichaelOS will not infer work hours from your profile.</p>}
    {windows.length > 0 && <div className="availability-list">{windows.map((window) => <div className="availability-row" key={window.key}>
      <label className="sr-only" htmlFor={`day-${window.key}`}>Weekday</label><select id={`day-${window.key}`} value={window.weekday} onChange={(e) => patch(window.key, { weekday: Number(e.target.value) })}>{weekdayNames.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select>
      <label className="sr-only" htmlFor={`start-${window.key}`}>Start time</label><input id={`start-${window.key}`} type="time" value={window.startTime} onChange={(e) => patch(window.key, { startTime: e.target.value })} />
      <span aria-hidden="true">to</span><label className="sr-only" htmlFor={`end-${window.key}`}>End time</label><input id={`end-${window.key}`} type="time" value={window.endTime} onChange={(e) => patch(window.key, { endTime: e.target.value })} /><span className="availability-window-zone" title={`Local times interpreted in ${window.timeZone}`}>{window.timeZone}</span>
      <label className="availability-active"><input type="checkbox" checked={window.active} onChange={(e) => patch(window.key, { active: e.target.checked })} />Active</label>
      <button type="button" onClick={() => setWindows((current) => current.filter((entry) => entry.key !== window.key))} aria-label={`Remove ${weekdayNames[window.weekday - 1]} availability`}><Trash2 size={15} /></button>
    </div>)}</div>}
    <div className="availability-actions"><button type="button" className="availability-add" onClick={addWindow}><Plus size={14} />Add window</button><button type="button" className="availability-save" disabled={pending} onClick={() => void save()}>{pending ? <LoaderCircle size={14} className="calendar-spin" /> : <Check size={14} />}{pending ? "Saving…" : "Save availability"}</button></div>
    {error && <p className="calendar-form-error" role="alert">{error}</p>}{message && <p className="calendar-success" role="status">{message}</p>}
    <p className="availability-note">Availability indicates a preferred window only. It does not account for existing commitments or mean every activity can be placed there.</p>
  </section>;
}
