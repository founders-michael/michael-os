import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = [`onboarding-a-${suffix}@example.test`, `onboarding-b-${suffix}@example.test`];
const password = `Smoke-${randomUUID()}-Aa9!`;
const failures: string[] = [];
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function cookieFrom(response: Response) {
  return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; ");
}
async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}
async function createAccount(email: string, name: string) {
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ name, email, password, callbackURL: "/onboarding" }),
  });
  assert(response.ok, `Sign-up failed (${response.status}).`);
  const cookie = cookieFrom(response);
  assert(cookie.length > 0, "Sign-up did not return a session cookie.");
  return cookie;
}
async function profile(cookie: string) {
  const response = await fetch(`${base}/api/profile`, { headers: { cookie } });
  assert(response.ok, `Profile read failed (${response.status}).`);
  return await json(response);
}
async function patchProfile(cookie: string, body: unknown) {
  return fetch(`${base}/api/profile`, {
    method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
const makeProfile = (preferredName: string, onboardingStep = 2) => ({
  preferredName, timeZone: "Asia/Kolkata", wakeUpTime: "06:45", bedtime: "22:15",
  workStartTime: "09:00", workEndTime: "17:30",
  workDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  priorities: ["Read more", "Build MichaelOS"], focusSessionMinutes: 50,
  breakDurationMinutes: 10, planningStyle: "BALANCED", onboardingStep,
});

try {
  const anonymousHome = await fetch(`${base}/`, { redirect: "manual" });
  assert(anonymousHome.status >= 300 && anonymousHome.status < 400 && anonymousHome.headers.get("location")?.includes("/login"), "An unauthenticated visitor could access the dashboard route.");
  const anonymousOnboarding = await fetch(`${base}/onboarding`, { redirect: "manual" });
  assert(anonymousOnboarding.status >= 300 && anonymousOnboarding.status < 400 && anonymousOnboarding.headers.get("location")?.includes("/login"), "An unauthenticated visitor could access onboarding.");

  const cookieA = await createAccount(emails[0]!, "Smoke A");
  const cookieB = await createAccount(emails[1]!, "Smoke B");

  const protectedResponse = await fetch(`${base}/`, { headers: { cookie: cookieA }, redirect: "manual" });
  if (!(protectedResponse.status >= 300 && protectedResponse.status < 400 && protectedResponse.headers.get("location")?.includes("/onboarding"))) {
    const html = await protectedResponse.text();
    const match = html.match(/Error:([^"\\]{1,240})/);
    assert(false, `Incomplete user redirect was ${protectedResponse.status} to ${protectedResponse.headers.get("location") ?? "no location"}${match ? ` (${match[1]})` : ""}.`);
  }

  const emptyA = await profile(cookieA);
  assert(emptyA.profile === null, "A new account should begin without a saved profile.");
  const firstSave = await patchProfile(cookieA, makeProfile("Profile A"));
  assert(firstSave.ok, `Profile progress was rejected (${firstSave.status}).`);
  const savedA = await profile(cookieA);
  const savedData = savedA.profile as Record<string, unknown>;
  assert(savedData.preferredName === "Profile A" && savedData.onboardingStep === 2, "Saved profile values did not persist.");

  const invalid = await patchProfile(cookieA, { ...makeProfile("Bad", 2), timeZone: "Not/AZone" });
  assert(invalid.status === 400, "Invalid IANA time zone was not rejected server-side.");
  const invalidHours = await patchProfile(cookieA, { ...makeProfile("Bad", 2), workStartTime: "18:00", workEndTime: "09:00" });
  assert(invalidHours.status === 400, "Invalid work hour range was not rejected server-side.");
  const forged = await patchProfile(cookieA, { ...makeProfile("Forged", 2), userId: "some-other-user" });
  assert(forged.status === 400, "Client-supplied user ID was not rejected.");

  const secondSave = await patchProfile(cookieB, makeProfile("Profile B", 3));
  assert(secondSave.ok, `Second profile save failed (${secondSave.status}).`);
  const resumePage = await fetch(`${base}/onboarding`, { headers: { cookie: cookieB } });
  const resumeHtml = await resumePage.text();
  assert(resumePage.ok && resumeHtml.includes("Profile B"), "Revisiting onboarding did not restore the saved profile data.");
  const isolationAttempt = await patchProfile(cookieA, makeProfile("Changed A", 3));
  assert(isolationAttempt.ok, `Own-profile update failed (${isolationAttempt.status}).`);
  const savedB = (await profile(cookieB)).profile as Record<string, unknown>;
  assert(savedB.preferredName === "Profile B", "One account changed another account's profile.");

  const countsBefore = await prisma.userProfile.count({ where: { userId: { in: await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } }).then((users) => users.map((u) => u.id)) } } });
  assert(countsBefore === 2, "Repeated profile writes created duplicate profile records.");

  await patchProfile(cookieA, makeProfile("Changed A", 5)).then(async (response) => assert(response.ok, `Final profile save failed (${response.status}).`));
  const completion = await fetch(`${base}/api/profile/complete`, { method: "POST", headers: { cookie: cookieA } });
  assert(completion.ok, `Onboarding completion failed (${completion.status}).`);
  const completedProfile = (await profile(cookieA)).profile as Record<string, unknown>;
  assert(completedProfile.onboardingCompleted === true, "Completion status was not persisted.");
  const completedHome = await fetch(`${base}/`, { headers: { cookie: cookieA }, redirect: "manual" });
  assert(completedHome.status === 200, `Completed user could not access the dashboard (${completedHome.status}).`);

  const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: emails[0], password }),
  });
  assert(signIn.ok, `Login failed (${signIn.status}).`);
  const loginCookie = cookieFrom(signIn);
  assert(loginCookie.length > 0, "Login did not return a session cookie.");
  const signOut = await fetch(`${base}/api/auth/sign-out`, { method: "POST", headers: { cookie: loginCookie, origin: base, "content-type": "application/json" }, body: "{}" });
  assert(signOut.ok, `Logout failed (${signOut.status}).`);
  const afterLogout = await fetch(`${base}/api/profile`, { headers: { cookie: loginCookie } });
  assert(afterLogout.status === 401, "Logout did not invalidate the session.");

  console.log("Onboarding smoke checks passed: registration, incomplete redirect, profile persistence/resume, validation, user isolation, upsert uniqueness, completion/dashboard access, login, and logout.");
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown smoke check failure.";
  failures.push(message);
  console.error(`Onboarding smoke check failed: ${message}`);
} finally {
  try {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  } catch {
    console.error("Test account cleanup failed; remove the onboarding-a/onboarding-b smoke accounts locally if they remain.");
    failures.push("Test cleanup failed.");
  }
  await prisma.$disconnect();
}
if (failures.length) process.exitCode = 1;
