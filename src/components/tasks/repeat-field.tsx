"use client";

/**
 * The "Repeat" field of the task form. Presets cover the common cases (every
 * day, every weekday, weekly, monthly); Custom adds an interval, chosen days
 * and an end date. It edits a draft only; `repeatToRule` turns the draft into
 * the rule the API validates (recurrence.ts), and the label shown under the
 * field is the same `describeRule` every screen uses.
 */
import { Repeat } from "lucide-react";
import { describeRule, isoWeekday, type RecurrenceRule } from "@/lib/recurrence";
import { REPEAT_DAYS as DAYS, repeatToRule, type RepeatDraft } from "@/lib/recurrence-form";
export { emptyRepeat, repeatFromTask, repeatToRule, type RepeatDraft } from "@/lib/recurrence-form";

export default function RepeatField({ value, onChange, dueDate }: { value: RepeatDraft; onChange: (next: RepeatDraft) => void; dueDate: string }) {
  const rule = repeatToRule(value, dueDate);
  const label = rule ? describeRule(rule as RecurrenceRule) : null;
  const set = (patch: Partial<RepeatDraft>) => onChange({ ...value, ...patch });
  const unit = value.frequency === "DAILY" ? "day" : value.frequency === "WEEKLY" ? "week" : "month";

  return <div className="task-form-field m-repeat">
    <label htmlFor="task-repeat">Repeat <span>Optional · the next one appears when you complete this one</span></label>
    <select id="task-repeat" value={value.preset} onChange={(event) => set({ preset: event.target.value as RepeatDraft["preset"] })}>
      <option value="none">Doesn&apos;t repeat</option>
      <option value="daily">Every day</option>
      <option value="weekdays">Every weekday (Mon–Fri)</option>
      <option value="weekly">Weekly{dueDate ? ` on ${DAYS[isoWeekday(dueDate) - 1]![1]}` : ""}</option>
      <option value="monthly">Monthly{dueDate ? ` on day ${Number(dueDate.slice(8, 10))}` : ""}</option>
      <option value="custom">Custom…</option>
    </select>

    {value.preset === "custom" && <div className="m-repeat-custom">
      <div className="m-repeat-every">
        <span>Every</span>
        <input type="number" min={1} max={99} aria-label="Repeat interval" value={value.interval} onChange={(event) => set({ interval: Number(event.target.value) })} />
        <select aria-label="Repeat unit" value={value.frequency} onChange={(event) => set({ frequency: event.target.value as RepeatDraft["frequency"] })}>
          <option value="DAILY">{value.interval === 1 ? "day" : "days"}</option>
          <option value="WEEKLY">{value.interval === 1 ? "week" : "weeks"}</option>
          <option value="MONTHLY">{value.interval === 1 ? "month" : "months"}</option>
        </select>
      </div>
      {value.frequency === "WEEKLY" && <div className="m-repeat-days" role="group" aria-label="Repeat on these days">
        {DAYS.map(([day, name]) => {
          const on = value.weekdays.includes(day);
          return <button key={day} type="button" className={on ? "m-on" : ""} aria-pressed={on} onClick={() => set({ weekdays: on ? value.weekdays.filter((d) => d !== day) : [...value.weekdays, day] })}>{name}</button>;
        })}
      </div>}
      {value.frequency === "MONTHLY" && <label className="m-repeat-inline">On day
        <input type="number" min={1} max={31} value={value.monthDay} onChange={(event) => set({ monthDay: Number(event.target.value) })} />
        <small>A shorter month uses its last day.</small>
      </label>}
      <label className="m-repeat-inline">Ends <small>Optional</small>
        <input type="date" value={value.endsOn} min={dueDate || undefined} onChange={(event) => set({ endsOn: event.target.value })} />
      </label>
      <span className="sr-only">Repeats every {value.interval} {unit}</span>
    </div>}

    {label && <p className="m-repeat-label"><Repeat size={13} aria-hidden="true" />{label}{!dueDate && " · choose a due date for the first one"}</p>}
  </div>;
}
