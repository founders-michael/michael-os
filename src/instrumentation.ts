/**
 * Runs once when a Next.js server starts (Next's instrumentation hook).
 *
 * In development only, it starts the local reminder loop, so task reminders,
 * habit nudges and goal check-ins go out on time without a separate scheduler.
 * In production the host's cron calls /api/internal/reminders/run instead
 * (docs/reminders.md), and this does nothing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development") return;
  if (process.env.DEV_REMINDER_LOOP === "off") return;
  const { startDevReminderLoop } = await import("./lib/dev-reminder-loop");
  startDevReminderLoop();
}
