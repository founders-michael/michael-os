/**
 * Runs the reminder job once against the local dev server, the way a host's
 * cron would: `npm run reminders:run`. Reads CRON_SECRET from .env.local.
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("Set CRON_SECRET (32+ characters) in .env.local first.");
const response = await fetch(`${base}/api/internal/reminders/run`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
console.log(response.status, await response.text());
if (!response.ok) process.exitCode = 1;
