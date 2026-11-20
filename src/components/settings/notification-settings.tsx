"use client";

/**
 * Settings → Notifications: which channels task reminders use. Each switch
 * saves on change and waits for the server; a failure puts it back and says so.
 */
import { useId, useState } from "react";
import { Bell, LoaderCircle } from "lucide-react";
import { requestJson } from "@/components/michael/task-intelligence";
import { notify } from "@/lib/notifications";

type Preferences = { inApp: boolean; email: boolean };

const CHANNELS: Array<{ key: keyof Preferences; label: string; detail: string }> = [
  { key: "inApp", label: "In-app notifications", detail: "Reminders appear under the bell at the top of the screen." },
  { key: "email", label: "Email notifications", detail: "Reminders are also sent to your email address." },
];

export default function NotificationSettings({ initial }: { initial: Preferences }) {
  const id = useId();
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState<keyof Preferences | null>(null);
  const [error, setError] = useState("");

  async function toggle(key: keyof Preferences) {
    const next = { ...saved, [key]: !saved[key] };
    setBusy(key); setError("");
    const result = await requestJson<{ preferences: Preferences }>("/api/account/notifications", { method: "PUT", body: JSON.stringify(next) });
    setBusy(null);
    if (!result.ok) { setError(result.error); return; }
    setSaved(result.data.preferences);
    notify.success("Notification settings saved");
  }

  return <section className="settings-section" aria-labelledby={`${id}-heading`}>
    <div className="settings-section-heading">
      <span className="settings-section-icon"><Bell size={17} aria-hidden="true" /></span>
      <div><h2 id={`${id}-heading`}>Notifications</h2><p>How you get the reminders you set on tasks. Nothing is sent unless you set a reminder.</p></div>
    </div>
    <ul className="m-notify-list">
      {CHANNELS.map(({ key, label, detail }) => <li key={key}>
        <div><strong id={`${id}-${key}`}>{label}</strong><small>{detail}</small></div>
        <button type="button" role="switch" aria-checked={saved[key]} aria-labelledby={`${id}-${key}`} className={`m-switch${saved[key] ? " m-on" : ""}`} disabled={busy !== null} onClick={() => void toggle(key)}>
          {busy === key ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <span className="m-switch-knob" aria-hidden="true" />}
        </button>
      </li>)}
    </ul>
    {!saved.inApp && !saved.email && <p className="m-muted" role="status">Both are off, so reminders you set won&apos;t reach you.</p>}
    {error && <p className="settings-error" role="alert">{error}</p>}
  </section>;
}
