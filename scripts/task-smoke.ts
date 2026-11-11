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
const emails = [`tasks-a-${suffix}@example.test`, `tasks-b-${suffix}@example.test`];
const password = `TaskSmoke-${randomUUID()}-Aa9!`;
const failures: string[] = [];
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function cookieFrom(response: Response) {
  return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; ");
}
function localDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function shiftDate(value: string, offset: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + offset)).toISOString().slice(0, 10);
}
async function register(email: string, name: string) {
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ name, email, password, callbackURL: "/onboarding" }),
  });
  assert(response.ok, `Registration failed (${response.status}).`);
  const cookie = cookieFrom(response);
  assert(cookie.length > 0, "Registration did not create an authenticated session.");
  return cookie;
}
async function requestJson(path: string, method: string, cookie: string | null, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
}
async function payload(response: Response) { return await response.json() as Record<string, unknown>; }

try {
  const unauthenticated = await requestJson("/api/tasks", "GET", null);
  assert(unauthenticated.status === 401, "Unauthenticated task listing was not rejected.");
  const anonymousTasksPage = await fetch(`${base}/tasks`, { redirect: "manual" });
  const anonymousTasksHtml = await anonymousTasksPage.text();
  const tasksRedirected = (anonymousTasksPage.status >= 300 && anonymousTasksPage.status < 400 && anonymousTasksPage.headers.get("location")?.includes("/login")) || (anonymousTasksPage.status === 200 && anonymousTasksHtml.includes("NEXT_REDIRECT") && anonymousTasksHtml.includes("/login"));
  assert(tasksRedirected, "Unauthenticated visitors were not redirected away from task management.");
  const unauthCreate = await requestJson("/api/tasks", "POST", null, { title: "not allowed" });
  assert(unauthCreate.status === 401, "Unauthenticated task creation was not rejected.");

  const cookieA = await register(emails[0]!, "Task Account A");
  const cookieB = await register(emails[1]!, "Task Account B");
  const userA = await prisma.user.findUniqueOrThrow({ where: { email: emails[0]! } });
  await prisma.userProfile.upsert({
    where: { userId: userA.id },
    create: { userId: userA.id, preferredName: "Task Account A", timeZone: "Pacific/Kiritimati", onboardingCompleted: true, onboardingStep: 5 },
    update: { timeZone: "Pacific/Kiritimati", onboardingCompleted: true, onboardingStep: 5 },
  });
  const timeZone = "Pacific/Kiritimati";
  const today = localDate(timeZone);
  const yesterday = shiftDate(today, -1);
  const tomorrow = shiftDate(today, 1);

  const overdueResponse = await requestJson("/api/tasks", "POST", cookieA, { title: "Overdue task for timezone check", description: "Due before local today", priority: "MEDIUM", estimatedDurationMinutes: 35, dueDate: yesterday });
  assert(overdueResponse.status === 201, `Task creation failed (${overdueResponse.status}).`);
  const overdueData = await payload(overdueResponse);
  const overdueTask = overdueData.task as Record<string, unknown>;
  const overdueId = String(overdueTask.id);
  assert(overdueTask.dueDate === yesterday && overdueTask.status === "TODO", "Task date or default status was not persisted.");

  const todayResponse = await requestJson("/api/tasks", "POST", cookieA, { title: "Due today task", priority: "HIGH", dueDate: today });
  assert(todayResponse.status === 201, `Second task creation failed (${todayResponse.status}).`);
  const todayId = String(((await payload(todayResponse)).task as Record<string, unknown>).id);
  const futureResponse = await requestJson("/api/tasks", "POST", cookieA, { title: "Future task", priority: "LOW", dueDate: tomorrow });
  assert(futureResponse.status === 201, `Third task creation failed (${futureResponse.status}).`);
  const futureId = String(((await payload(futureResponse)).task as Record<string, unknown>).id);
  const otherResponse = await requestJson("/api/tasks", "POST", cookieB, { title: "Other account task", priority: "HIGH" });
  assert(otherResponse.status === 201, `Other-user task creation failed (${otherResponse.status}).`);
  const otherId = String(((await payload(otherResponse)).task as Record<string, unknown>).id);
  const otherList = (await payload(await requestJson("/api/tasks", "GET", cookieB))).tasks as Array<Record<string, unknown>>;
  assert(otherList.length === 1 && otherList[0]?.id === otherId, "Task listing did not stay scoped to the authenticated owner.");

  const selectedDateDashboard = await fetch(`${base}/?date=${encodeURIComponent(tomorrow)}`, { headers: { cookie: cookieA } });
  const selectedDateHtml = await selectedDateDashboard.text();
  assert(selectedDateDashboard.ok && selectedDateHtml.includes("Future task") && !selectedDateHtml.includes("Other account task"), "Selected-day dashboard did not include the owner's due task or leaked another user's task.");

  const invalidTitle = await requestJson("/api/tasks", "POST", cookieA, { title: "  " });
  assert(invalidTitle.status === 400, "Empty title was not rejected by server validation.");
  const invalidDate = await requestJson("/api/tasks", "POST", cookieA, { title: "Bad date", dueDate: "2025-02-30" });
  assert(invalidDate.status === 400, "Impossible calendar date was not rejected by server validation.");
  const forgedOwner = await requestJson("/api/tasks", "POST", cookieA, { title: "Forged owner", userId: "another-user" });
  assert(forgedOwner.status === 400, "A client-supplied owner ID was not rejected.");
  const invalidFilter = await requestJson("/api/tasks?status=INVALID", "GET", cookieA);
  assert(invalidFilter.status === 400, "Invalid list query was not rejected.");

  const overdueListResponse = await requestJson("/api/tasks?view=overdue", "GET", cookieA);
  const overdueList = (await payload(overdueListResponse)).tasks as Array<Record<string, unknown>>;
  assert(overdueListResponse.ok && overdueList.length === 1 && overdueList[0]?.id === overdueId, "Overdue filter included tasks outside the owner's local day boundary.");
  const priorityListResponse = await requestJson("/api/tasks?sort=priority", "GET", cookieA);
  const priorityList = (await payload(priorityListResponse)).tasks as Array<Record<string, unknown>>;
  assert(priorityListResponse.ok && priorityList[0]?.id === todayId, "Priority sorting did not put the high-priority task first.");
  const pagedResponse = await requestJson("/api/tasks?page=2&limit=1", "GET", cookieA);
  const pageData = await payload(pagedResponse);
  assert(pagedResponse.ok && pageData.page === 2 && pageData.total === 3 && (pageData.tasks as unknown[]).length === 1, "Task pagination returned an unexpected page.");

  const otherGet = await requestJson(`/api/tasks/${overdueId}`, "GET", cookieB);
  const otherPatch = await requestJson(`/api/tasks/${overdueId}`, "PATCH", cookieB, { title: "Cross-account edit" });
  const otherDelete = await requestJson(`/api/tasks/${overdueId}`, "DELETE", cookieB);
  assert(otherGet.status === 404 && otherPatch.status === 404 && otherDelete.status === 404, "Another user could access or modify this task.");
  const ownerGet = await requestJson(`/api/tasks/${overdueId}`, "GET", cookieA);
  assert(ownerGet.ok && ((await payload(ownerGet)).task as Record<string, unknown>).title === "Overdue task for timezone check", "The owner could not retrieve their task after a denied cross-user request.");

  const editResponse = await requestJson(`/api/tasks/${futureId}`, "PATCH", cookieA, { title: "Edited future task", description: "Updated from the task editor", estimatedDurationMinutes: 45 });
  assert(editResponse.ok, `Task edit failed (${editResponse.status}).`);
  const progressResponse = await requestJson(`/api/tasks/${futureId}`, "PATCH", cookieA, { status: "IN_PROGRESS" });
  assert(progressResponse.ok && ((await payload(progressResponse)).task as Record<string, unknown>).status === "IN_PROGRESS", "Task could not be moved into progress.");
  const completeResponse = await requestJson(`/api/tasks/${futureId}`, "PATCH", cookieA, { status: "COMPLETED" });
  const completedTask = (await payload(completeResponse)).task as Record<string, unknown>;
  assert(completeResponse.ok && completedTask.status === "COMPLETED" && typeof completedTask.completedAt === "string", "Task completion did not set its completion timestamp.");
  const reopenResponse = await requestJson(`/api/tasks/${futureId}`, "PATCH", cookieA, { status: "TODO" });
  const reopenedTask = (await payload(reopenResponse)).task as Record<string, unknown>;
  assert(reopenResponse.ok && reopenedTask.status === "TODO" && reopenedTask.completedAt === null, "Reopening a task did not clear its completion timestamp.");
  const lifecycle = await prisma.taskStatusHistory.findMany({ where: { taskId: futureId, userId: userA.id }, orderBy: { changedAt: "asc" } });
  assert(lifecycle.length === 3 && lifecycle[0]?.previousStatus === "TODO" && lifecycle[0]?.status === "IN_PROGRESS" && lifecycle[1]?.status === "COMPLETED" && lifecycle[2]?.status === "TODO", "Task status history did not preserve completion and reopening transitions.");

  const timelineTaskResponse = await requestJson("/api/tasks", "POST", cookieA, { title: "Completed scheduled timeline task", priority: "HIGH", estimatedDurationMinutes: 30 });
  assert(timelineTaskResponse.status === 201, "Could not create the completed timeline fixture.");
  const timelineTaskId = String(((await payload(timelineTaskResponse)).task as Record<string, unknown>).id);
  const sessionStart = new Date(Date.now() - 15 * 60_000);
  const sessionEnd = new Date(Date.now() + 15 * 60_000);
  const sessionResponse = await requestJson("/api/calendar/events", "POST", cookieA, {
    title: "Completed scheduled timeline task", taskId: timelineTaskId, eventType: "TASK_SESSION", schedulingMode: "FIXED",
    startAt: sessionStart.toISOString(), endAt: sessionEnd.toISOString(), timeZone,
  });
  assert(sessionResponse.status === 201, `Could not create the timeline schedule fixture (${sessionResponse.status}).`);
  const timelineCompletion = await requestJson(`/api/tasks/${timelineTaskId}`, "PATCH", cookieA, { status: "COMPLETED" });
  assert(timelineCompletion.ok, "Could not complete the scheduled timeline fixture.");
  const todayDashboard = await fetch(`${base}/?date=${encodeURIComponent(today)}`, { headers: { cookie: cookieA } });
  const todayDashboardHtml = await todayDashboard.text();
  assert(todayDashboard.ok && todayDashboardHtml.includes("Completed scheduled timeline task") && todayDashboardHtml.includes("Done") && todayDashboardHtml.includes("Completed "), "A completed task or its completion time disappeared from its scheduled daily timeline.");
  const savedSchedule = await prisma.calendarEvent.findFirst({ where: { userId: userA.id, taskId: timelineTaskId, eventType: "TASK_SESSION" }, select: { startAt: true, endAt: true, cancelledAt: true } });
  assert(savedSchedule?.startAt.toISOString() === sessionStart.toISOString() && savedSchedule.endAt.toISOString() === sessionEnd.toISOString() && savedSchedule.cancelledAt !== null, "Task completion rewrote or removed the original planned session.");

  await requestJson(`/api/tasks/${todayId}`, "PATCH", cookieA, { status: "COMPLETED" });
  await requestJson(`/api/tasks/${todayId}`, "PATCH", cookieA, { status: "TODO" });
  await requestJson(`/api/tasks/${todayId}`, "PATCH", cookieA, { status: "COMPLETED" });
  const reviewResponse = await requestJson(`/api/lifestyle/daily-review?date=${encodeURIComponent(today)}`, "GET", cookieA);
  const reviewData = await payload(reviewResponse);
  assert(reviewResponse.ok && reviewData.date === today, "The authenticated user could not load their date-specific review.");
  const completedReviewTasks = reviewData.completedTasks as Array<Record<string, unknown>>;
  assert(completedReviewTasks.filter((entry) => (entry.task as Record<string, unknown>).id === todayId).length === 2, "Daily Review did not retain both completion cycles for a reopened task.");
  const reviewSave = await requestJson("/api/lifestyle/daily-review", "PUT", cookieA, {
    date: today, wentWell: "A smoke-test reflection", challenges: "Fixture only", blockers: "", lessonsLearned: "", improvements: "", intentionallySkippedTaskIds: [overdueId],
  });
  assert(reviewSave.ok, "Private Daily Review reflection did not save.");
  const reviewReload = await payload(await requestJson(`/api/lifestyle/daily-review?date=${encodeURIComponent(today)}`, "GET", cookieA));
  assert((reviewReload.reflection as Record<string, unknown>).wentWell === "A smoke-test reflection" && ((reviewReload.reflection as Record<string, unknown>).intentionallySkippedTaskIds as string[]).includes(overdueId), "Daily Review reflection or skip decision did not persist.");
  const crossUserReview = await payload(await requestJson(`/api/lifestyle/daily-review?date=${encodeURIComponent(today)}`, "GET", cookieB));
  assert(crossUserReview.reflection === null && !(crossUserReview.plannedTasks as Array<{ task: { id: string } }>).some(({ task }) => task.id === todayId), "Daily Review leaked one user's reflection or task to another account.");
  const crossUserReflectionWrite = await requestJson("/api/lifestyle/daily-review", "PUT", cookieB, {
    date: today, wentWell: "", challenges: "", blockers: "", lessonsLearned: "", improvements: "", intentionallySkippedTaskIds: [todayId],
  });
  assert(crossUserReflectionWrite.status === 404, "A user could attach another user's task to their private review.");
  const moved = await requestJson("/api/lifestyle/daily-review/carry-forward", "POST", cookieA, {
    reviewDate: today, taskId: overdueId, targetDate: tomorrow, startTime: "11:00", endTime: "11:30",
  });
  assert(moved.ok, `Could not carry an incomplete task forward (${moved.status}).`);
  const movedTask = await prisma.task.findFirst({ where: { id: overdueId, userId: userA.id }, select: { dueDate: true } });
  const movedSession = await prisma.calendarEvent.findFirst({ where: { userId: userA.id, taskId: overdueId, cancelledAt: null }, select: { startAt: true, endAt: true, timeZone: true } });
  assert(movedTask?.dueDate?.toISOString().slice(0, 10) === tomorrow && movedSession?.timeZone === timeZone && localDate(timeZone) < tomorrow, "Carry-forward did not update the same task and schedule it using the owner's timezone.");
  const history = await prisma.personalTaskPlanHistory.findMany({ where: { userId: userA.id, taskId: overdueId }, orderBy: { recordedAt: "asc" } });
  assert(history.some((entry) => entry.taskDueDate?.toISOString().slice(0, 10) === yesterday) && history.some((entry) => entry.taskDueDate?.toISOString().slice(0, 10) === tomorrow), "Carry-forward did not preserve the original due-date snapshot.");

  const deleteResponse = await requestJson(`/api/tasks/${futureId}`, "DELETE", cookieA);
  const deletedLookup = await requestJson(`/api/tasks/${futureId}`, "GET", cookieA);
  assert(deleteResponse.ok && deletedLookup.status === 404, "Task deletion failed or left the task accessible.");

  const summaryResponse = await requestJson("/api/tasks/summary", "GET", cookieA);
  const summaryData = (await payload(summaryResponse)).summary as Record<string, unknown>;
  assert(summaryResponse.ok && summaryData.today === today && summaryData.dueToday === 0 && summaryData.outstanding === 1 && summaryData.overdue === 0, "Dashboard task summary did not reflect live tasks in the saved time zone.");
  const dashboardResponse = await fetch(`${base}/`, { headers: { cookie: cookieA } });
  assert(dashboardResponse.ok && (await dashboardResponse.text()).includes("Overdue task for timezone check"), "Dashboard did not render an authenticated user's real task.");
  const tasksPage = await fetch(`${base}/tasks`, { headers: { cookie: cookieA } });
  assert(tasksPage.ok, `Protected task page could not be opened (${tasksPage.status}).`);

  console.log("Task smoke checks passed: auth protection, create/persistence, edit, in-progress/completion/reopen history, completed scheduled timeline visibility, planned-session preservation, delete, validation, ownership isolation, sorting/filtering/pagination, local-date overdue logic, live dashboard summary and rendering.");
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown task smoke check failure.";
  failures.push(message);
  console.error(`Task smoke check failed: ${message}`);
} finally {
  try {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  } catch {
    console.error("Task smoke-test cleanup failed; remove the generated tasks-a/tasks-b test accounts locally if they remain.");
    failures.push("Test cleanup failed.");
  }
  await prisma.$disconnect();
}
if (failures.length) process.exitCode = 1;
