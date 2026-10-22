"use client";

import { useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import type { HabitDto } from "@/lib/habit-service";

const dayOptions = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" },
];
export type HabitFormValues = { title: string; description: string; frequency: "DAILY" | "SELECTED_DAYS"; weekdays: number[] };

export default function HabitFormDialog({ habit, onClose, onSave }: { habit: HabitDto | null; onClose: () => void; onSave: (values: HabitFormValues) => Promise<void> }) {
  const [title, setTitle] = useState(habit?.title ?? "");
  const [description, setDescription] = useState(habit?.description ?? "");
  const [frequency, setFrequency] = useState<"DAILY" | "SELECTED_DAYS">(habit?.frequency ?? "DAILY");
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (frequency === "SELECTED_DAYS" && weekdays.length === 0) { setError("Choose at least one day for this habit."); return; }
    setSaving(true);
    try { await onSave({ title: title.trim(), description: description.trim(), frequency, weekdays: frequency === "DAILY" ? [] : [...weekdays].sort((a, b) => a - b) }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't save this habit."); }
    finally { setSaving(false); }
  }

  return <div className="task-dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="task-dialog habit-dialog" role="dialog" aria-modal="true" aria-labelledby="habit-dialog-title"><header><div><div className="section-kicker">SMALL THINGS, OFTEN</div><h2 id="habit-dialog-title">{habit ? "Edit habit" : "Create a habit"}</h2></div><button className="task-dialog-close" aria-label="Close dialog" disabled={saving} onClick={onClose}><X size={17} /></button></header><form onSubmit={(event) => void submit(event)}>
    <label className="task-form-field">Habit name<input autoFocus required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Take a morning walk" /></label>
    <label className="task-form-field">Description <span>Optional</span><textarea rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A small reminder for yourself" /></label>
    <fieldset className="habit-frequency-field"><legend>Frequency</legend><label><input type="radio" name="habit-frequency" value="DAILY" checked={frequency === "DAILY"} onChange={() => setFrequency("DAILY")} /> Every day</label><label><input type="radio" name="habit-frequency" value="SELECTED_DAYS" checked={frequency === "SELECTED_DAYS"} onChange={() => setFrequency("SELECTED_DAYS")} /> Selected days</label></fieldset>
    {frequency === "SELECTED_DAYS" && <fieldset className="habit-weekday-field"><legend>Choose days</legend><div>{dayOptions.map((day) => <label key={day.value} className={weekdays.includes(day.value) ? "selected" : ""}><input type="checkbox" checked={weekdays.includes(day.value)} onChange={(event) => setWeekdays((current) => event.target.checked ? [...current, day.value] : current.filter((value) => value !== day.value))} />{day.label}</label>)}</div></fieldset>}
    {error && <div className="task-alert" role="alert">{error}</div>}<footer><button type="button" className="task-cancel-button" disabled={saving} onClick={onClose}>Cancel</button><button className="task-create-button" type="submit" disabled={saving}>{saving && <LoaderCircle size={13} />}{habit ? "Save changes" : "Create habit"}</button></footer>
  </form></section></div>;
}
