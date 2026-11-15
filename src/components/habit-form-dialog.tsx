"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import AppDialog from "@/components/ui/app-dialog";
import type { HabitDto } from "@/lib/habit-service";

const dayOptions = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" },
];
export type HabitFormValues = { title: string; description: string; frequency: "DAILY" | "SELECTED_DAYS"; weekdays: number[]; startTime: string | null; endTime: string | null };

export default function HabitFormDialog({ habit, onClose, onSave }: { habit: HabitDto | null; onClose: () => void; onSave: (values: HabitFormValues) => Promise<void> }) {
  const [title, setTitle] = useState(habit?.title ?? "");
  const [description, setDescription] = useState(habit?.description ?? "");
  const [frequency, setFrequency] = useState<"DAILY" | "SELECTED_DAYS">(habit?.frequency ?? "DAILY");
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? []);
  const [startTime, setStartTime] = useState(habit?.startTime ?? "");
  const [endTime, setEndTime] = useState(habit?.endTime ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (frequency === "SELECTED_DAYS" && weekdays.length === 0) { setError("Choose at least one day for this habit."); return; }
    if (endTime && !startTime) { setError("Add a start time before an end time."); return; }
    if (endTime && endTime === startTime) { setError("Choose an end time different from the start."); return; }
    setSaving(true);
    try { await onSave({ title: title.trim(), description: description.trim(), frequency, weekdays: frequency === "DAILY" ? [] : [...weekdays].sort((a, b) => a - b), startTime: startTime || null, endTime: startTime && endTime ? endTime : null }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't save this habit."); }
    finally { setSaving(false); }
  }

  return <AppDialog
    open
    onOpenChange={(next) => { if (!next) onClose(); }}
    title={habit ? "Edit habit" : "Create a habit"}
    kicker="SMALL THINGS, OFTEN"
    className="habit-dialog"
    closeDisabled={saving}
  ><form onSubmit={(event) => void submit(event)}>
    <label className="task-form-field">Habit name<input autoFocus required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Take a morning walk" /></label>
    <label className="task-form-field">Description <span>Optional</span><textarea rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A small reminder for yourself" /></label>
    <fieldset className="habit-frequency-field"><legend>Frequency</legend><label><input type="radio" name="habit-frequency" value="DAILY" checked={frequency === "DAILY"} onChange={() => setFrequency("DAILY")} /> Every day</label><label><input type="radio" name="habit-frequency" value="SELECTED_DAYS" checked={frequency === "SELECTED_DAYS"} onChange={() => setFrequency("SELECTED_DAYS")} /> Selected days</label></fieldset>
    {frequency === "SELECTED_DAYS" && <fieldset className="habit-weekday-field"><legend>Choose days</legend><div>{dayOptions.map((day) => <label key={day.value} className={weekdays.includes(day.value) ? "selected" : ""}><input type="checkbox" checked={weekdays.includes(day.value)} onChange={(event) => setWeekdays((current) => event.target.checked ? [...current, day.value] : current.filter((value) => value !== day.value))} />{day.label}</label>)}</div></fieldset>}
    <fieldset className="habit-time-field"><legend>Time <span>Optional</span></legend>
      <label>Starts<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
      <label>Ends<input type="time" value={endTime} disabled={!startTime} onChange={(event) => setEndTime(event.target.value)} /></label>
      <p>Leave empty for an any-time habit. An end before the start runs past midnight.</p>
    </fieldset>
    {error && <div className="task-alert" role="alert">{error}</div>}<footer><button type="button" className="task-cancel-button" disabled={saving} onClick={onClose}>Cancel</button><button className="task-create-button" type="submit" disabled={saving}>{saving && <LoaderCircle size={13} />}{habit ? "Save changes" : "Create habit"}</button></footer>
  </form></AppDialog>;
}
