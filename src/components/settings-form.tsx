"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Clock3, LoaderCircle, Plus, UserRound, X } from "lucide-react";
import BrandLogo from "@/components/brand-logo";
import type { ProfileFormData } from "@/lib/profile-validation";

const weekdays: { value: ProfileFormData["workDays"][number]; label: string }[] = [
  { value: "MONDAY", label: "Mon" }, { value: "TUESDAY", label: "Tue" }, { value: "WEDNESDAY", label: "Wed" },
  { value: "THURSDAY", label: "Thu" }, { value: "FRIDAY", label: "Fri" }, { value: "SATURDAY", label: "Sat" }, { value: "SUNDAY", label: "Sun" },
];

const planningStyles: { value: ProfileFormData["planningStyle"]; label: string; detail: string }[] = [
  { value: "STRUCTURED", label: "Structured", detail: "Clear blocks and a steady plan" },
  { value: "BALANCED", label: "Balanced", detail: "A plan with room to breathe" },
  { value: "FLEXIBLE", label: "Flexible", detail: "Gentle guidance that can shift" },
];

export default function SettingsForm({ initialData }: { initialData: ProfileFormData }) {
  const [data, setData] = useState(initialData);
  const [priorityDraft, setPriorityDraft] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof ProfileFormData>(key: K, value: ProfileFormData[K]) {
    setData((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    setFieldErrors({});
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, workStartTime: data.workStartTime || null, workEndTime: data.workEndTime || null, onboardingStep: 5 }),
      });
      const result: { error?: string; fields?: Record<string, string[]> } = await response.json();
      if (!response.ok) {
        setError(result.error || "We couldn't save your settings. Please try again.");
        setFieldErrors(Object.fromEntries(Object.entries(result.fields ?? {}).map(([key, messages]) => [key, messages?.[0] ?? ""])));
        return;
      }
      setSaved(true);
    } catch {
      setError("We couldn't reach MichaelOS. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function addPriority() {
    const priority = priorityDraft.trim();
    if (!priority || data.priorities.length >= 3 || data.priorities.includes(priority)) return;
    update("priorities", [...data.priorities, priority]);
    setPriorityDraft("");
  }

  return (
    <main className="settings-page">
      <header className="settings-header"><Link className="brand onboarding-brand" href="/" aria-label="MichaelOS"><BrandLogo /></Link><Link className="settings-back" href="/"><ArrowLeft size={16} /> Back to your day</Link></header>
      <div className="settings-content">
        <div className="settings-heading"><span className="settings-heading-icon"><UserRound size={20} /></span><div><div className="section-kicker">YOUR ACCOUNT</div><h1>Settings</h1><p>Update your profile, routine, and planning preferences.</p></div></div>
        <form className="settings-form" onSubmit={submit}>
          <section className="settings-section" aria-labelledby="settings-personal-heading">
            <div className="settings-section-heading"><span className="settings-section-icon"><UserRound size={17} /></span><div><h2 id="settings-personal-heading">Personal details</h2><p>How MichaelOS addresses you and which local time to use.</p></div></div>
            <div className="settings-field-grid">
              <label className="settings-field">Preferred name<input value={data.preferredName} maxLength={80} required onChange={(event) => update("preferredName", event.target.value)} />{fieldErrors.preferredName && <small className="settings-field-error">{fieldErrors.preferredName}</small>}</label>
              <label className="settings-field">Time zone<input value={data.timeZone} required placeholder="Asia/Kolkata" onChange={(event) => update("timeZone", event.target.value)} /><small>Use an IANA identifier, for example Asia/Kolkata.</small>{fieldErrors.timeZone && <small className="settings-field-error">{fieldErrors.timeZone}</small>}</label>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="settings-routine-heading">
            <div className="settings-section-heading"><span className="settings-section-icon"><Clock3 size={17} /></span><div><h2 id="settings-routine-heading">Daily routine</h2><p>These are personal time-of-day preferences in your selected time zone.</p></div></div>
            <div className="settings-field-grid settings-time-grid">
              <label className="settings-field">Wake-up time<input type="time" value={data.wakeUpTime} required onChange={(event) => update("wakeUpTime", event.target.value)} />{fieldErrors.wakeUpTime && <small className="settings-field-error">{fieldErrors.wakeUpTime}</small>}</label>
              <label className="settings-field">Bedtime<input type="time" value={data.bedtime} required onChange={(event) => update("bedtime", event.target.value)} />{fieldErrors.bedtime && <small className="settings-field-error">{fieldErrors.bedtime}</small>}</label>
              <label className="settings-field">Work or study starts<input type="time" value={data.workStartTime ?? ""} onChange={(event) => update("workStartTime", event.target.value || null)} />{fieldErrors.workStartTime && <small className="settings-field-error">{fieldErrors.workStartTime}</small>}</label>
              <label className="settings-field">Usually wraps up<input type="time" value={data.workEndTime ?? ""} onChange={(event) => update("workEndTime", event.target.value || null)} />{fieldErrors.workEndTime && <small className="settings-field-error">{fieldErrors.workEndTime}</small>}</label>
            </div>
            <fieldset className="settings-days"><legend>Typical work or study days</legend><div>{weekdays.map(({ value, label }) => <button key={value} className={data.workDays.includes(value) ? "selected" : ""} type="button" aria-pressed={data.workDays.includes(value)} onClick={() => update("workDays", data.workDays.includes(value) ? data.workDays.filter((day) => day !== value) : [...data.workDays, value])}>{label}</button>)}</div>{fieldErrors.workDays && <small className="settings-field-error">{fieldErrors.workDays}</small>}</fieldset>
          </section>

          <section className="settings-section" aria-labelledby="settings-priorities-heading">
            <div className="settings-section-heading"><span className="settings-section-icon"><Check size={17} /></span><div><h2 id="settings-priorities-heading">Priorities</h2><p>Keep up to three personal priorities in view. These are profile notes, not goals.</p></div></div>
            <div className="settings-priority-input"><input value={priorityDraft} maxLength={100} disabled={data.priorities.length >= 3} placeholder="Add a priority" onChange={(event) => setPriorityDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPriority(); } }} /><button type="button" disabled={!priorityDraft.trim() || data.priorities.length >= 3} onClick={addPriority}><Plus size={16} /> Add</button></div>
            <div className="settings-priority-list">{data.priorities.map((priority) => <span key={priority}>{priority}<button type="button" aria-label={`Remove ${priority}`} onClick={() => update("priorities", data.priorities.filter((item) => item !== priority))}><X size={15} /></button></span>)}</div>
            {fieldErrors.priorities && <small className="settings-field-error">{fieldErrors.priorities}</small>}
          </section>

          <section className="settings-section" aria-labelledby="settings-planning-heading">
            <div className="settings-section-heading"><span className="settings-section-icon"><Clock3 size={17} /></span><div><h2 id="settings-planning-heading">Planning preferences</h2><p>Set your preferred focus rhythm and planning style.</p></div></div>
            <div className="settings-field-grid">
              <label className="settings-field">Focus session<select value={data.focusSessionMinutes} onChange={(event) => update("focusSessionMinutes", Number(event.target.value))}>{[25, 40, 50, 60, 75, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select>{fieldErrors.focusSessionMinutes && <small className="settings-field-error">{fieldErrors.focusSessionMinutes}</small>}</label>
              <label className="settings-field">Break between sessions<select value={data.breakDurationMinutes} onChange={(event) => update("breakDurationMinutes", Number(event.target.value))}>{[0, 5, 10, 15, 20, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes ? `${minutes} minutes` : "No preference"}</option>)}</select>{fieldErrors.breakDurationMinutes && <small className="settings-field-error">{fieldErrors.breakDurationMinutes}</small>}</label>
            </div>
            <fieldset className="settings-planning-style"><legend>Planning style</legend><div>{planningStyles.map((style) => <label key={style.value} className={data.planningStyle === style.value ? "selected" : ""}><input type="radio" name="planningStyle" value={style.value} checked={data.planningStyle === style.value} onChange={() => update("planningStyle", style.value)} /><span><strong>{style.label}</strong><small>{style.detail}</small></span></label>)}</div>{fieldErrors.planningStyle && <small className="settings-field-error">{fieldErrors.planningStyle}</small>}</fieldset>
          </section>

          {error && <p className="settings-error" role="alert">{error}</p>}
          <div className="settings-save-row" aria-live="polite">{saved && <span className="settings-saved"><Check size={16} /> Changes saved</span>}<button className="settings-save-button" type="submit" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} />Saving…</> : "Save changes"}</button></div>
        </form>
      </div>
    </main>
  );
}
