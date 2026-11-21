"use client";

/**
 * Settings → Notifications: which reminders reach you, per channel (in-app,
 * email) and per category (tasks, goals, habits).
 *
 * Each channel's main switch follows its categories (on while any is on) and
 * sets them all at once (notification-preferences.ts). Every change saves the
 * whole set and waits for the server; a failure leaves the switches as they
 * were and says so.
 */
import { useId, useState } from "react";
import { Bell, LoaderCircle, Mail } from "lucide-react";
import { requestJson } from "@/components/michael/task-intelligence";
import { notify } from "@/lib/notifications";
import {
  CATEGORY_LABELS, CHANNEL_LABELS, channelOn, NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS, withCategory, withChannel,
  type NotificationChannel, type NotificationPreferences,
} from "@/lib/notification-preferences";

function Switch({ on, busy, disabled, labelledBy, onToggle }: { on: boolean; busy: boolean; disabled: boolean; labelledBy: string; onToggle: () => void }) {
  return <button type="button" role="switch" aria-checked={on} aria-labelledby={labelledBy} className={`m-switch${on ? " m-on" : ""}`} disabled={disabled} onClick={onToggle}>
    {busy ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <span className="m-switch-knob" aria-hidden="true" />}
  </button>;
}

const CHANNEL_ICONS: Record<NotificationChannel, typeof Bell> = { inApp: Bell, email: Mail };

export default function NotificationSettings({ initial }: { initial: NotificationPreferences }) {
  const id = useId();
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function save(next: NotificationPreferences, key: string) {
    setBusy(key); setError("");
    const result = await requestJson<{ preferences: NotificationPreferences }>("/api/account/notifications", { method: "PUT", body: JSON.stringify(next) });
    setBusy(null);
    if (!result.ok) { setError(result.error); return; }
    setSaved(result.data.preferences);
    notify.success("Notification settings saved");
  }

  const nothingOn = NOTIFICATION_CHANNELS.every((channel) => !channelOn(saved, channel));

  return <section className="settings-section" aria-labelledby={`${id}-heading`}>
    <div className="settings-section-heading">
      <span className="settings-section-icon"><Bell size={17} aria-hidden="true" /></span>
      <div><h2 id={`${id}-heading`}>Notifications</h2><p>Choose how you hear about the reminders you set, and for what. Nothing is sent unless you set a reminder.</p></div>
    </div>

    {NOTIFICATION_CHANNELS.map((channel) => {
      const Icon = CHANNEL_ICONS[channel];
      const on = channelOn(saved, channel);
      const channelKey = `${channel}:all`;
      return <div key={channel} className="m-notify-channel">
        <div className="m-notify-row m-notify-main">
          <span className="m-notify-icon"><Icon size={16} aria-hidden="true" /></span>
          <div><strong id={`${id}-${channel}`}>{CHANNEL_LABELS[channel].label}</strong><small>{CHANNEL_LABELS[channel].detail}</small></div>
          <Switch on={on} busy={busy === channelKey} disabled={busy !== null} labelledBy={`${id}-${channel}`} onToggle={() => void save(withChannel(saved, channel, !on), channelKey)} />
        </div>
        <ul className="m-notify-list" aria-label={`${CHANNEL_LABELS[channel].label} by category`}>
          {NOTIFICATION_CATEGORIES.map((category) => {
            const key = `${channel}:${category}`;
            const categoryOn = saved[channel][category];
            return <li key={category} className="m-notify-row">
              <div><strong id={`${id}-${key}`}>{CATEGORY_LABELS[category].label}</strong><small>{CATEGORY_LABELS[category].detail}</small></div>
              <Switch on={categoryOn} busy={busy === key} disabled={busy !== null} labelledBy={`${id}-${key}`} onToggle={() => void save(withCategory(saved, channel, category, !categoryOn), key)} />
            </li>;
          })}
        </ul>
      </div>;
    })}

    {nothingOn && <p className="m-muted" role="status">Everything is off, so reminders you set won&apos;t reach you.</p>}
    {error && <p className="settings-error" role="alert">{error}</p>}
  </section>;
}
