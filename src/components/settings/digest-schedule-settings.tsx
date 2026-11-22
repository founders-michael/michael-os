"use client";

/**
 * Settings → Notifications → Schedule: when habit nudges and goal check-ins go
 * out. Task reminders need no schedule (each has its own time). Saving waits
 * for the server, which also works out the next send time on the user's clock.
 * Where they go is the channel switches below; this says when one channel
 * would send nothing because its category is off there.
 */
import { useId, useState } from "react";
import { CalendarClock, LoaderCircle } from "lucide-react";
import { requestJson } from "@/components/michael/task-intelligence";
import { notify } from "@/lib/notifications";
import {
  describeGoalSchedule, GOAL_DIGEST_FREQUENCIES, GOAL_FREQUENCY_LABELS, HABIT_DIGEST_MODES, HABIT_MODE_LABELS, WEEKDAY_NAMES,
  type DigestSchedule,
} from "@/lib/digest-schedule";
import type { NotificationPreferences } from "@/lib/notification-preferences";

function channelsNote(preferences: NotificationPreferences, category: "habits" | "goals") {
  const inApp = preferences.inApp[category];
  const email = preferences.email[category];
  if (inApp && email) return "Sent in the app and by email.";
  if (inApp) return "Sent in the app only (email is off for this below).";
  if (email) return "Sent by email only (in-app is off for this below).";
  return "Both channels are off for this below, so nothing will be sent.";
}

export default function DigestScheduleSettings({ initial, timeZone, preferences }: { initial: DigestSchedule; timeZone: string; preferences: NotificationPreferences }) {
  const id = useId();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch: Partial<DigestSchedule>) => { setDraft((current) => ({ ...current, ...patch })); setError(""); };

  async function save() {
    setBusy(true); setError("");
    const result = await requestJson<{ schedule: DigestSchedule }>("/api/account/notifications/schedule", { method: "PUT", body: JSON.stringify(draft) });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setSaved(result.data.schedule); setDraft(result.data.schedule);
    notify.success("Schedule saved");
  }

  const showMorning = draft.habitsMode === "MORNING" || draft.habitsMode === "BOTH";
  const showEvening = draft.habitsMode === "EVENING" || draft.habitsMode === "BOTH";

  return <section className="settings-section m-digest" aria-labelledby={`${id}-heading`}>
    <div className="settings-section-heading">
      <span className="settings-section-icon"><CalendarClock size={17} aria-hidden="true" /></span>
      <div><h2 id={`${id}-heading`}>Schedule</h2><p>When habit nudges and goal check-ins arrive. Task reminders come at the time you set on each task. Times are in {timeZone}.</p></div>
    </div>

    <div className="m-digest-block">
      <h3>Habit nudges</h3>
      <p className="m-muted">Morning: your habits for the day. Evening: the ones still open. Nothing is sent on a day with nothing to do.</p>
      <div className="m-digest-fields">
        <label>How often
          <select className="m-field" value={draft.habitsMode} disabled={busy} onChange={(event) => set({ habitsMode: event.target.value as DigestSchedule["habitsMode"] })}>
            {HABIT_DIGEST_MODES.map((mode) => <option key={mode} value={mode}>{HABIT_MODE_LABELS[mode]}</option>)}
          </select>
        </label>
        {showMorning && <label>Morning at<input className="m-field" type="time" value={draft.habitsMorningTime} disabled={busy} onChange={(event) => set({ habitsMorningTime: event.target.value })} /></label>}
        {showEvening && <label>Evening at<input className="m-field" type="time" value={draft.habitsEveningTime} disabled={busy} onChange={(event) => set({ habitsEveningTime: event.target.value })} /></label>}
      </div>
      {draft.habitsMode !== "OFF" && <small className="m-muted">{channelsNote(preferences, "habits")}</small>}
    </div>

    <div className="m-digest-block">
      <h3>Goal check-ins</h3>
      <p className="m-muted">Each active goal&apos;s progress, target date, milestones and next step.</p>
      <div className="m-digest-fields">
        <label>How often
          <select className="m-field" value={draft.goalsFrequency} disabled={busy} onChange={(event) => set({ goalsFrequency: event.target.value as DigestSchedule["goalsFrequency"] })}>
            {GOAL_DIGEST_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{GOAL_FREQUENCY_LABELS[frequency]}</option>)}
          </select>
        </label>
        {draft.goalsFrequency === "WEEKLY" && <label>On
          <select className="m-field" value={draft.goalsWeekday} disabled={busy} onChange={(event) => set({ goalsWeekday: Number(event.target.value) })}>
            {WEEKDAY_NAMES.slice(1).map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </select>
        </label>}
        {draft.goalsFrequency !== "OFF" && <label>At<input className="m-field" type="time" value={draft.goalsTime} disabled={busy} onChange={(event) => set({ goalsTime: event.target.value })} /></label>}
      </div>
      {draft.goalsFrequency !== "OFF" && <small className="m-muted">{describeGoalSchedule(draft)}. {channelsNote(preferences, "goals")}</small>}
    </div>

    {error && <p className="settings-error" role="alert">{error}</p>}
    <div className="settings-save-row">
      <button type="button" className="m-btn m-btn-g" disabled={!dirty || busy} onClick={() => { setDraft(saved); setError(""); }}>Cancel</button>
      <button type="button" className="settings-save-button" disabled={!dirty || busy} onClick={() => void save()}>{busy ? <><LoaderCircle className="spin" size={16} aria-hidden="true" />Saving…</> : "Save schedule"}</button>
    </div>
  </section>;
}
