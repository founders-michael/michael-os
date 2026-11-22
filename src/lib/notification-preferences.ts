import { z } from "zod";

/**
 * Which reminders reach a user, per channel and per category. One definition
 * for the settings screen, the API and the reminder job.
 *
 * A channel's main switch is not stored: it is on when any of its categories
 * is on (`channelOn`). Turning it off turns every category off; turning it on
 * turns every category on (`withChannel`). Categories are independent across
 * channels: habits can be off by email and on in the app.
 */
export const NOTIFICATION_CHANNELS = ["inApp", "email"] as const;
export const NOTIFICATION_CATEGORIES = ["tasks", "goals", "habits"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationPreferences = Record<NotificationChannel, Record<NotificationCategory, boolean>>;

export const CHANNEL_LABELS: Record<NotificationChannel, { label: string; detail: string }> = {
  inApp: { label: "In-app notifications", detail: "Reminders appear under the bell at the top of the screen." },
  email: { label: "Email notifications", detail: "Reminders are also sent to your email address." },
};

export const CATEGORY_LABELS: Record<NotificationCategory, { label: string; detail: string; available: boolean }> = {
  tasks: { label: "Tasks", detail: "Reminders you set on tasks.", available: true },
  goals: { label: "Goals", detail: "Goal check-ins, on the schedule above.", available: true },
  habits: { label: "Habits", detail: "Habit nudges, on the schedule above.", available: true },
};

/** No saved row means everything on: a reminder the user set is expected to arrive. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  inApp: { tasks: true, goals: true, habits: true },
  email: { tasks: true, goals: true, habits: true },
};

const categories = z.object({ tasks: z.boolean(), goals: z.boolean(), habits: z.boolean() }).strict();
export const notificationPreferenceSchema = z.object({ inApp: categories, email: categories }).strict();

export function channelOn(preferences: NotificationPreferences, channel: NotificationChannel) {
  return NOTIFICATION_CATEGORIES.some((category) => preferences[channel][category]);
}

/** The main switch: every category of the channel on, or every one off. */
export function withChannel(preferences: NotificationPreferences, channel: NotificationChannel, on: boolean): NotificationPreferences {
  return { ...preferences, [channel]: Object.fromEntries(NOTIFICATION_CATEGORIES.map((category) => [category, on])) as Record<NotificationCategory, boolean> };
}

export function withCategory(preferences: NotificationPreferences, channel: NotificationChannel, category: NotificationCategory, on: boolean): NotificationPreferences {
  return { ...preferences, [channel]: { ...preferences[channel], [category]: on } };
}

/** The stored row's columns, and back. */
type Columns = { inAppTasks: boolean; inAppGoals: boolean; inAppHabits: boolean; emailTasks: boolean; emailGoals: boolean; emailHabits: boolean };

export function toColumns(preferences: NotificationPreferences): Columns {
  return {
    inAppTasks: preferences.inApp.tasks, inAppGoals: preferences.inApp.goals, inAppHabits: preferences.inApp.habits,
    emailTasks: preferences.email.tasks, emailGoals: preferences.email.goals, emailHabits: preferences.email.habits,
  };
}

export function fromColumns(row: Columns | null | undefined): NotificationPreferences {
  if (!row) return DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    inApp: { tasks: row.inAppTasks, goals: row.inAppGoals, habits: row.inAppHabits },
    email: { tasks: row.emailTasks, goals: row.emailGoals, habits: row.emailHabits },
  };
}
