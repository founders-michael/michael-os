import { timingSafeEqual } from "node:crypto";
import { runDueReminders } from "@/lib/reminder-service";

export const instant = false;

/**
 * Sends due task reminders. Called by a scheduler, never by a browser: in
 * production the host's cron (Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET` with a GET), locally `npm run reminders:run`.
 *
 * Fails closed: without a CRON_SECRET of at least 32 characters it refuses
 * every caller. The secret is compared in constant time. The response holds
 * counts only — no user, task or content.
 */
const MIN_SECRET_LENGTH = 32;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) return "unconfigured" as const;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected) ? "ok" as const : "refused" as const;
}

async function run(request: Request) {
  const access = authorized(request);
  if (access === "unconfigured") {
    console.error("[reminders] CRON_SECRET is not set (or shorter than 32 characters); the reminder job refuses every call.");
    return Response.json({ error: "The reminder job is not configured." }, { status: 503 });
  }
  if (access === "refused") return Response.json({ error: "Not allowed." }, { status: 401 });
  try {
    return Response.json(await runDueReminders(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[reminders] The reminder run failed.");
    return Response.json({ error: "The reminder run failed." }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
