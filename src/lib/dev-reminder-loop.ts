/**
 * Development only: calls the reminder job every minute, the way the host's
 * cron does in production (same endpoint, same CRON_SECRET check), so a
 * reminder set for 15:00 arrives at 15:00 on a local machine too.
 *
 * Started from src/instrumentation.ts. One loop per server process, even
 * across hot reloads (a global flag); a run never overlaps the previous one;
 * it logs only when something was sent or a run failed. `DEV_REMINDER_LOOP=off`
 * in .env.local turns it off.
 */
const INTERVAL_MS = 60_000;
const FIRST_RUN_DELAY_MS = 10_000;

type Counts = { claimed?: number; inApp?: number; emailed?: number; digests?: { habits?: { claimed?: number }; goals?: { claimed?: number } } };
const globalLoop = globalThis as typeof globalThis & { __michaelDevReminderLoop?: boolean };

export function startDevReminderLoop() {
  if (globalLoop.__michaelDevReminderLoop) return;
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 32) {
    console.warn("[reminders] Dev reminder loop not started: set CRON_SECRET (32+ characters) in .env.local.");
    return;
  }
  globalLoop.__michaelDevReminderLoop = true;
  const origin = (process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const response = await fetch(`${origin}/api/internal/reminders/run`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(120_000) });
      if (!response.ok) { console.warn(`[reminders] Dev reminder loop: the job answered ${response.status}.`); return; }
      const run = await response.json() as Counts;
      const sent = (run.claimed ?? 0) + (run.digests?.habits?.claimed ?? 0) + (run.digests?.goals?.claimed ?? 0);
      if (sent > 0) console.info(`[reminders] Dev reminder loop: ${run.claimed ?? 0} task reminder(s), ${run.digests?.habits?.claimed ?? 0} habit nudge(s), ${run.digests?.goals?.claimed ?? 0} goal check-in(s) due.`);
    } catch {
      console.warn("[reminders] Dev reminder loop: the job could not be reached this minute.");
    } finally {
      running = false;
    }
  }

  setTimeout(() => { void tick(); setInterval(() => void tick(), INTERVAL_MS).unref?.(); }, FIRST_RUN_DELAY_MS).unref?.();
  console.info("[reminders] Dev reminder loop started: due reminders are sent every minute.");
}
