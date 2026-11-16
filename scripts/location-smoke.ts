/**
 * City → time zone, against a running dev server (which calls Open-Meteo).
 *
 * Authorization: city search refuses an anonymous caller and a signed-in user
 * without LifestyleOS access. It returns public place data only, so there is
 * no per-user data to isolate; the profile writes below are each scoped to the
 * session and checked not to touch another user. Behaviour: a city resolves to
 * its IANA zone; the chosen city label saves with the zone through onboarding
 * and the routine page; a label without a valid zone is refused; My Day shows
 * the city.
 */
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { smokeSignUp } from "./smoke-auth";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = { a: `location-a-${suffix}@example.test`, b: `location-b-${suffix}@example.test`, c: `location-c-${suffix}@example.test` };
const password = `LocationSmoke-${randomUUID()}-Aa9!`;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
type Place = { city: string; region: string | null; country: string | null; timeZone: string; label: string };
const call = (path: string, method: string, cookie: string | null, body?: unknown) => fetch(`${base}${path}`, {
  method, redirect: "manual",
  headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
async function account(email: string) {
  const response = await smokeSignUp(base, prisma, { name: "Location Smoke", email, password });
  assert(response.ok, `Sign-up failed (${response.status}).`);
  return { cookie: cookieFrom(response), id: (await prisma.user.findUniqueOrThrow({ where: { email } })).id };
}
const routine = { wakeUpTime: "07:00", bedtime: "22:30", workStartTime: null, workEndTime: null, workDays: ["MONDAY"], priorities: [], focusSessionMinutes: 50, breakDurationMinutes: 10, planningStyle: "BALANCED" };

try {
  const anonymous = await call("/api/places/search?q=Bengaluru", "GET", null);
  assert(anonymous.status === 401, `Anonymous city search returned ${anonymous.status}, expected 401.`);
  const a = await account(emails.a);
  const b = await account(emails.b);
  const c = await account(emails.c);
  await prisma.userProductPermission.deleteMany({ where: { userId: c.id, permission: "LIFESTYLE_OS_ACCESS" } });
  assert((await call("/api/places/search?q=Bengaluru", "GET", c.cookie)).status === 401, "City search without LifestyleOS access was allowed.");

  assert((await call("/api/places/search?q=B", "GET", a.cookie)).status === 400, "A one-letter search was sent to the geocoder.");
  const search = await call("/api/places/search?q=Bengaluru", "GET", a.cookie);
  assert(search.status === 200 && search.headers.get("cache-control")?.includes("no-store"), `City search failed (${search.status}).`);
  const { places } = await search.json() as { places: Place[] };
  const bengaluru = places.find((place) => place.city === "Bengaluru");
  assert(bengaluru && bengaluru.timeZone === "Asia/Kolkata" && bengaluru.label === "Bengaluru, Karnataka, India", `Bengaluru resolved to ${JSON.stringify(places[0])}.`);
  const london = (await (await call("/api/places/search?q=London", "GET", a.cookie)).json() as { places: Place[] }).places.find((place) => place.country === "United Kingdom");
  assert(london?.timeZone === "Europe/London", "London did not resolve to Europe/London.");
  const none = (await (await call("/api/places/search?q=Zzqqxxvv", "GET", a.cookie)).json() as { places: Place[] }).places;
  assert(none.length === 0, "A nonsense query returned places.");

  // Onboarding saves the city with its zone.
  const onboarding = await call("/api/profile", "PATCH", a.cookie, { preferredName: "Loc", timeZone: bengaluru.timeZone, locationLabel: bengaluru.label, ...routine, onboardingStep: 5 });
  assert(onboarding.status === 200, `Onboarding save failed (${onboarding.status}).`);
  let profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: a.id } });
  assert(profile.timeZone === "Asia/Kolkata" && profile.locationLabel === "Bengaluru, Karnataka, India", "Onboarding did not save the city and zone.");
  assert((await call("/api/profile", "PATCH", a.cookie, { preferredName: "Loc", timeZone: "Mars/Olympus", locationLabel: "Olympus Mons", ...routine, onboardingStep: 5 })).status === 400, "An invalid zone was accepted with a city label.");
  assert((await call("/api/profile", "PATCH", a.cookie, { preferredName: "Loc", timeZone: "Asia/Kolkata", locationLabel: "x".repeat(161), ...routine, onboardingStep: 5 })).status === 400, "An over-long city label was accepted.");
  assert((await call("/api/profile/complete", "POST", a.cookie)).ok, "Completing onboarding failed.");

  const home = await (await call("/", "GET", a.cookie)).text();
  assert(home.includes("Bengaluru"), "My Day did not show the saved city.");

  // The routine page can change it, and choosing a zone directly clears the label.
  assert((await call("/api/profile/routine", "PATCH", a.cookie, { timeZone: london.timeZone, locationLabel: london.label, ...routine })).status === 200, "Routine save with a city failed.");
  profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: a.id } });
  assert(profile.timeZone === "Europe/London" && profile.locationLabel === london.label, "Routine did not save the new city.");
  assert((await call("/api/profile/routine", "PATCH", a.cookie, { timeZone: "UTC", locationLabel: null, ...routine })).status === 200, "Routine save with a zone only failed.");
  profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: a.id } });
  assert(profile.timeZone === "UTC" && profile.locationLabel === null, "Choosing a zone directly did not clear the city.");
  assert((await prisma.userProfile.findUnique({ where: { userId: b.id } })) === null, "Saving A's location created or changed B's profile.");

  console.log("Location smoke checks passed: search authorization, city → IANA zone (Bengaluru, London), no-match handling, onboarding and routine saves, validation, My Day display, per-user scoping.");
} finally {
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
}
