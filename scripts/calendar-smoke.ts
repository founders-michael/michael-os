import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { detectIntervalConflicts, intervalsOverlap } from "../src/lib/calendar-conflicts";
import { calendarRange, localDateTimeToIso, localDateAt, isoWeekday, shiftLocalDate } from "../src/lib/calendar-date";
import { availabilityUpdateSchema, calendarEventCreateSchema, validTimeZone } from "../src/lib/calendar-validation";
import { effectiveTimeZone } from "../src/lib/time-zone";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = [`calendar-a-${suffix}@example.test`, `calendar-b-${suffix}@example.test`];
const password = `CalendarSmoke-${randomUUID()}-Aa9!`;
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
async function payload(response: Response) { return await response.json() as Record<string, unknown>; }
async function req(path: string, method: string, cookie: string | null, body?: unknown) {
  return fetch(`${base}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "manual" });
}
async function register(email: string, name: string) {
  const response = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ name, email, password, callbackURL: "/onboarding" }) });
  assert(response.ok, `Test account registration failed (${response.status}).`);
  const cookie = cookieFrom(response); assert(cookie, "Registration did not create a session."); return cookie;
}
const timeZone = "Asia/Kolkata";
const fixtureDate = shiftLocalDate(localDateAt(timeZone), 3);
const at = (date: string, time: string) => localDateTimeToIso(date, time, timeZone);
const eventInput = (extra: Record<string, unknown> = {}) => ({ eventType: "TASK_SESSION", schedulingMode: "FLEXIBLE", title: "Calendar smoke session", startAt: at(fixtureDate, "09:00"), endAt: at(fixtureDate, "10:00"), timeZone, ...extra });
let userIds: string[] = [];

try {
  const left = { startAt: "2026-10-23T03:00:00.000Z", endAt: "2026-10-23T04:00:00.000Z" };
  const adjacent = { startAt: "2026-10-23T04:00:00.000Z", endAt: "2026-10-23T05:00:00.000Z" };
  const overlap = { startAt: "2026-10-23T03:59:59.000Z", endAt: "2026-10-23T05:00:00.000Z" };
  assert(!intervalsOverlap(left, adjacent), "Adjacent half-open intervals must not conflict.");
  assert(intervalsOverlap(left, overlap), "Overlapping half-open intervals must conflict.");
  assert(detectIntervalConflicts([{ id: "e1", eventType: "COMMITMENT", title: "Meeting", ...left }], overlap).length === 1, "Conflict service did not return structured event conflicts.");
  assert(localDateTimeToIso("2026-10-23", "09:00", "Asia/Kolkata") === "2026-10-23T03:30:00.000Z", "Timezone conversion for Asia/Kolkata is incorrect.");
  assert(localDateAt("Pacific/Kiritimati", new Date("2026-06-01T23:30:00.000Z")) === "2026-06-02", "Local date conversion did not respect timezone boundary.");
  assert(!validTimeZone("Mars/Olympus"), "Invalid IANA timezone was accepted.");
  assert(effectiveTimeZone("UTC") === "UTC" && effectiveTimeZone(null) === "Asia/Kolkata" && effectiveTimeZone("IST") === "Asia/Kolkata", "Timezone defaults or the legacy IST alias were not normalized correctly.");
  let dstRejected = false; try { localDateTimeToIso("2026-03-08", "02:30", "America/New_York"); } catch { dstRejected = true; }
  assert(dstRejected, "A nonexistent DST local time was silently accepted.");
  assert(localDateTimeToIso("2026-11-01", "01:30", "America/New_York") === "2026-11-01T05:30:00.000Z", "Ambiguous fall-back time did not resolve to its documented earlier instant.");
  assert(!calendarEventCreateSchema.safeParse({ ...eventInput(), startAt: "2026-10-23T05:00:00.000Z", endAt: "2026-10-23T04:00:00.000Z" }).success, "Reversed event interval was accepted.");
  assert(!calendarEventCreateSchema.safeParse({ ...eventInput(), timeZone: "Mars/Olympus" }).success, "Invalid event timezone was accepted.");
  assert(!availabilityUpdateSchema.safeParse({ windows: [{ weekday: 1, startTime: "17:00", endTime: "09:00", active: true }] }).success, "Overnight availability window was accepted.");
  assert(!availabilityUpdateSchema.safeParse({ windows: [{ weekday: 8, startTime: "09:00", endTime: "10:00", active: true }] }).success, "Invalid ISO weekday was accepted.");

  assert((await req("/api/calendar/events?from=2026-10-23T00:00:00.000Z&to=2026-10-24T00:00:00.000Z", "GET", null)).status === 401, "Unauthenticated calendar access was allowed.");
  // Neon uses a serverless websocket transport; serialize test sign-ups to avoid
  // concurrent auth transactions making this database smoke test flaky.
  const cookieA = await register(emails[0]!, "Calendar Smoke A");
  const cookieB = await register(emails[1]!, "Calendar Smoke B");
  const [userA, userB] = await Promise.all(emails.map((email) => prisma.user.findUniqueOrThrow({ where: { email } })));
  userIds = [userA.id, userB.id];
  for (const user of [userA, userB]) await prisma.userProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, preferredName: user.name, timeZone: "Asia/Kolkata", onboardingCompleted: true, onboardingStep: 5 }, update: { timeZone: "Asia/Kolkata", onboardingCompleted: true, onboardingStep: 5 } });
  const unauthWrite = await req("/api/calendar/events", "POST", null, eventInput()); assert(unauthWrite.status === 401, "Unauthenticated event creation was allowed.");
  const ownerField = await req("/api/calendar/events", "POST", cookieA, { ...eventInput(), userId: userB.id }); assert(ownerField.status === 400, "Client-supplied owner ID was accepted.");
  const taskResponse = await req("/api/tasks", "POST", cookieA, { title: "Calendar linked task", priority: "MEDIUM", estimatedDurationMinutes: 60 });
  assert(taskResponse.ok, `Could not create the scheduling fixture task (${taskResponse.status}).`);
  const task = (await payload(taskResponse)).task as { id: string };
  const otherTaskResponse = await req("/api/tasks", "POST", cookieB, { title: "Another user's task", priority: "MEDIUM" });
  assert(otherTaskResponse.ok, "Could not create cross-user task fixture.");
  const otherTask = (await payload(otherTaskResponse)).task as { id: string };
  const badReference = await req("/api/calendar/events", "POST", cookieA, eventInput({ taskId: otherTask.id })); assert(badReference.status === 404, "Scheduling another user's task was allowed.");
  const unscheduledBefore = await payload(await req("/api/calendar/unscheduled-tasks", "GET", cookieA));
  assert((unscheduledBefore.tasks as Array<{ id: string }>).some((entry) => entry.id === task.id), "An active task without future sessions was omitted from the unscheduled panel.");

  const eventResponse = await req("/api/calendar/events", "POST", cookieA, eventInput({ taskId: task.id }));
  assert(eventResponse.status === 201, `Could not create a task session (${eventResponse.status}).`);
  const event = (await payload(eventResponse)).event as { id: string; taskId: string };
  assert(event.taskId === task.id, "Task session link was not persisted.");
  const secondSession = await req("/api/calendar/events", "POST", cookieA, eventInput({ startAt: at(fixtureDate, "11:30"), endAt: at(fixtureDate, "12:00"), taskId: task.id, title: "Second task session" }));
  assert(secondSession.status === 201, "A task could not have multiple scheduled sessions.");
  const unscheduledAfter = await payload(await req("/api/calendar/unscheduled-tasks", "GET", cookieA));
  assert(!(unscheduledAfter.tasks as Array<{ id: string }>).some((entry) => entry.id === task.id), "A task with a future session remained in the unscheduled panel.");
  const persisted = await req(`/api/calendar/events/${event.id}`, "GET", cookieA); assert(persisted.ok, "Created event could not be retrieved.");
  const updated = await req(`/api/calendar/events/${event.id}`, "PATCH", cookieA, { title: "Updated task session" }); assert(updated.ok, "Owned event could not be updated.");
  const conflict = await req("/api/calendar/events", "POST", cookieA, eventInput({ eventType: "COMMITMENT", schedulingMode: "FIXED", title: "Overlapping commitment" }));
  assert(conflict.status === 409, "An overlapping event was not rejected with a conflict response.");
  const adjacentCreate = await req("/api/calendar/events", "POST", cookieA, eventInput({ eventType: "COMMITMENT", schedulingMode: "FIXED", title: "Adjacent commitment", startAt: at(fixtureDate, "10:00"), endAt: at(fixtureDate, "11:00") }));
  assert(adjacentCreate.status === 201, "Adjacent event was incorrectly rejected as conflicting.");
  const fixed = (await payload(adjacentCreate)).event as { id: string; startAt: string };
  const fixedConflict = await req(`/api/calendar/events/${fixed.id}`, "PATCH", cookieA, { startAt: at(fixtureDate, "09:45"), endAt: at(fixtureDate, "10:15") });
  assert(fixedConflict.status === 409, "Manual movement into a conflicting interval was not blocked.");
  assert((await req(`/api/calendar/events/${event.id}`, "GET", cookieB)).status === 404, "Another user could retrieve a calendar event.");
  assert((await req(`/api/calendar/events/${event.id}`, "PATCH", cookieB, { title: "Intrusion" })).status === 404, "Another user could edit a calendar event.");
  assert((await req(`/api/calendar/events/${event.id}`, "DELETE", cookieB)).status === 404, "Another user could delete a calendar event.");

  const rangeFrom = at(fixtureDate, "10:00"); const rangeTo = at(shiftLocalDate(fixtureDate, 1), "00:00");
  const range = await req(`/api/calendar/events?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`, "GET", cookieA);
  const rangeBody = await payload(range); assert(range.ok && (rangeBody.events as Array<{ id: string }>).some((row) => row.id === fixed.id), "Calendar event range query omitted an event starting at the lower bound.");
  const upperBoundary = await req("/api/calendar/events", "POST", cookieA, eventInput({ eventType: "COMMITMENT", schedulingMode: "FIXED", title: "Upper boundary event", startAt: rangeTo, endAt: at(shiftLocalDate(fixtureDate, 1), "01:00") }));
  assert(upperBoundary.status === 201, "Could not create the upper-boundary fixture.");
  const afterUpperBoundary = await payload(await req(`/api/calendar/events?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`, "GET", cookieA));
  assert(!(afterUpperBoundary.events as Array<{ title: string }>).some((row) => row.title === "Upper boundary event"), "The exclusive upper date-range boundary included a new event.");
  const conflictReport = await req(`/api/calendar/conflicts?from=${encodeURIComponent(at(fixtureDate, "00:00"))}&to=${encodeURIComponent(rangeTo)}`, "GET", cookieA);
  assert(conflictReport.ok && (await payload(conflictReport)).availabilityState === "UNCONFIGURED", "Unconfigured availability state was not reported.");
  const overlapOnWrite = await req("/api/calendar/events", "POST", cookieA, eventInput({ startAt: at(fixtureDate, "09:30"), endAt: at(fixtureDate, "10:30"), title: "Cross type overlap" }));
  assert(overlapOnWrite.status === 409, "Conflicts across event types were not detected.");
  const concurrentBody = (title: string) => eventInput({ eventType: "COMMITMENT", schedulingMode: "FIXED", title, startAt: at(fixtureDate, "14:00"), endAt: at(fixtureDate, "15:00") });
  const concurrentResults = await Promise.all([
    req("/api/calendar/events", "POST", cookieA, concurrentBody("Concurrent event A")),
    req("/api/calendar/events", "POST", cookieA, concurrentBody("Concurrent event B")),
  ]);
  const concurrentStatuses = concurrentResults.map((response) => response.status).sort().join(",");
  assert(concurrentStatuses === "201,409", `Concurrent overlapping creates were not serialized into one success and one conflict (${concurrentStatuses}).`);

  const fixtureWeekday = isoWeekday(fixtureDate);
  const availabilityResponse = await req("/api/calendar/availability", "PUT", cookieA, { windows: [{ weekday: fixtureWeekday, startTime: "09:00", endTime: "12:00", active: true }, { weekday: fixtureWeekday, startTime: "13:00", endTime: "17:00", active: true }] });
  assert(availabilityResponse.ok, "Availability could not be saved.");
  const availability = await payload(await req("/api/calendar/availability", "GET", cookieA));
  assert(availability.configured && availability.timeZone === "Asia/Kolkata" && (availability.windows as unknown[]).length === 2, "Availability was not persisted or timezone was wrong.");
  const availabilityUpdate = await req("/api/calendar/availability", "PUT", cookieA, { windows: [{ weekday: fixtureWeekday, startTime: "10:00", endTime: "12:00", active: true }] });
  assert(availabilityUpdate.ok, "Availability could not be updated.");
  const updatedAvailability = await payload(await req("/api/calendar/availability", "GET", cookieA));
  assert(((updatedAvailability.windows as Array<{ startTime: string }>)[0])?.startTime === "10:00", "Availability update was not persisted.");
  const overlappingWindows = await req("/api/calendar/availability", "PUT", cookieA, { windows: [{ weekday: fixtureWeekday, startTime: "09:00", endTime: "12:00", active: true }, { weekday: fixtureWeekday, startTime: "11:00", endTime: "13:00", active: true }] });
  assert(overlappingWindows.status === 400, "Overlapping availability windows were accepted.");

  const beforeDelete = await prisma.calendarEvent.count({ where: { taskId: task.id } });
  assert(beforeDelete === 2, "Expected two linked task sessions in the database.");
  const dbPersisted = await prisma.calendarEvent.findUnique({ where: { id: event.id } }); assert(dbPersisted?.title === "Updated task session", "Updated event did not persist in PostgreSQL.");
  await prisma.task.delete({ where: { id: task.id } });
  const afterDelete = await prisma.calendarEvent.count({ where: { taskId: task.id } });
  assert(afterDelete === 0, "Task deletion left orphaned sessions.");
  assert(await prisma.calendarEvent.findUnique({ where: { id: fixed.id } }) !== null, "Deleting a task deleted an unrelated fixed commitment.");
  const eventDelete = await req(`/api/calendar/events/${fixed.id}`, "DELETE", cookieA); assert(eventDelete.ok, "Owned event could not be deleted.");
  const dashboard = await fetch(`${base}/`, { headers: { cookie: cookieA }, redirect: "manual" }); assert(dashboard.ok, "Authenticated dashboard could not be accessed with calendar data.");
  const dashboardTitle = "Calendar smoke dashboard commitment";
  const today = localDateAt("Asia/Kolkata");
  const dashboardEvent = await req("/api/calendar/events", "POST", cookieA, eventInput({ eventType: "COMMITMENT", schedulingMode: "FIXED", title: dashboardTitle, startAt: localDateTimeToIso(today, "22:00", "Asia/Kolkata"), endAt: localDateTimeToIso(today, "23:00", "Asia/Kolkata") }));
  assert(dashboardEvent.status === 201, "Could not create dashboard calendar fixture.");
  const refreshedDashboard = await fetch(`${base}/`, { headers: { cookie: cookieA }, redirect: "manual" });
  assert(refreshedDashboard.ok && (await refreshedDashboard.text()).includes(dashboardTitle), "Dashboard did not render the authenticated user's real calendar event.");
  assert(calendarRange("2026-10-23", "day", "Asia/Kolkata").from === "2026-10-22T18:30:00.000Z", "Calendar date range did not use the profile timezone.");
  console.log("Calendar smoke test passed.");
} finally {
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  else await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
}
