/**
 * Strict email verification against a running dev server.
 *
 * Checks the gate end to end: sign-up returns no session, an unverified
 * sign-in with the right password is refused with 403 EMAIL_NOT_VERIFIED, a
 * wrong password is still 401 (so the gate leaks nothing about the account),
 * an invalid verification link redirects back with ?error=INVALID_TOKEN, and a
 * verified account signs in. Uses a reserved .test address, so no email is sent.
 */
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const email = `verify-${randomUUID()}@example.test`;
const password = `VerifySmoke-${randomUUID()}-Aa9!`;
const headers = { "content-type": "application/json", origin: base };
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function sessionCookie(response: Response) { return response.headers.getSetCookie().some((entry) => entry.startsWith("better-auth.session_token=") && !entry.startsWith("better-auth.session_token=;")); }
const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });

try {
  const signUp = await post("/api/auth/sign-up/email", { name: "Verify Smoke", email, password, callbackURL: "/lifestyle/login" });
  assert(signUp.ok, `Sign-up failed (${signUp.status}).`);
  assert(!sessionCookie(signUp), "Sign-up issued a session before the email was verified.");
  const created = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert(!created.emailVerified, "A new account started verified.");

  const unverified = await post("/api/auth/sign-in/email", { email, password, callbackURL: "/lifestyle/login" });
  assert(unverified.status === 403, `Unverified sign-in returned ${unverified.status}, expected 403.`);
  assert((await unverified.json() as { code?: string }).code === "EMAIL_NOT_VERIFIED", "Unverified sign-in did not report EMAIL_NOT_VERIFIED.");
  assert(!sessionCookie(unverified), "Unverified sign-in issued a session.");

  const wrongPassword = await post("/api/auth/sign-in/email", { email, password: `${password}x` });
  assert(wrongPassword.status === 401, `Wrong password on an unverified account returned ${wrongPassword.status}, expected 401.`);

  const badLink = await fetch(`${base}/api/auth/verify-email?token=not-a-token&callbackURL=${encodeURIComponent("/lifestyle/login")}`, { redirect: "manual" });
  assert(badLink.status >= 300 && badLink.status < 400, `Invalid link returned ${badLink.status}, expected a redirect.`);
  assert(badLink.headers.get("location")?.includes("error=INVALID_TOKEN"), "Invalid link did not redirect with error=INVALID_TOKEN.");

  const resend = await post("/api/auth/send-verification-email", { email, callbackURL: "/lifestyle/login" });
  assert(resend.ok, `Resend failed (${resend.status}).`);

  await prisma.user.update({ where: { id: created.id }, data: { emailVerified: true } });
  const verified = await post("/api/auth/sign-in/email", { email, password });
  assert(verified.ok, `Verified sign-in failed (${verified.status}).`);
  assert(sessionCookie(verified), "Verified sign-in did not issue a session.");

  console.log("Email verification smoke checks passed.");
} finally {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
}
