/**
 * Database-backed tests for the AI record drafts.
 *
 * The point of these drafts is that Michael proposes and the user saves, so the
 * two properties worth proving against a real database are:
 *
 *   1. the body `draftRequestBody` produces is accepted by the endpoint the
 *      Save button posts to — if a draft field drifts from a create schema, the
 *      Save button breaks silently in the UI and nowhere else;
 *   2. that endpoint is still the ordinary user-authenticated route, so a draft
 *      grants nothing: unauthenticated and unentitled callers are refused and
 *      the row lands under the saving user, not anyone else.
 *
 * Runs via `npm run test:authorization`. Refuses a non-local database.
 */
import { PrismaNeon } from "@prisma/adapter-neon";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildDraft, draftRequestBody, type DraftKind } from "../src/lib/ai/draft-model";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured.");
const host = new URL(connectionString).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`Refusing to run draft tests against non-local host "${host}".`);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3100";
const password = `DraftSmoke-${randomUUID()}-Aa9!`;
const TZ = "Asia/Kolkata";

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, condition: unknown, detail?: string) {
  results.push({ name, ok: Boolean(condition), detail: condition ? undefined : detail });
}

type Res = { status: number; body: string; json: Record<string, unknown> };
async function call(path: string, options: { method?: string; cookie?: string; body?: unknown } = {}): Promise<Res> {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      origin: base,
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const body = await response.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(body) as Record<string, unknown>; } catch { /* text */ }
  return { status: response.status, body, json };
}

async function signUp(label: string) {
  const email = `${label}-${randomUUID()}@example.test`;
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ name: label, email, password }),
  });
  if (!response.ok) throw new Error(`Sign-up failed for ${label}: ${response.status}`);
  const cookie = response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; ");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.userProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, preferredName: label, onboardingCompleted: true, onboardingStep: 5, timeZone: TZ },
    update: { onboardingCompleted: true, timeZone: TZ },
  });
  return { id: user.id, email, cookie };
}

/** The four drafts a complete chat exchange would produce. */
const COMPLETE_DRAFTS: Array<{ kind: DraftKind; proposed: Record<string, unknown> }> = [
  { kind: "task", proposed: { title: "Draft smoke task", priority: "HIGH", dueDate: "2027-03-04", estimatedDurationMinutes: 45, description: "From chat" } },
  { kind: "goal", proposed: { title: "Draft smoke goal", category: "Health", targetDate: "2027-06-30", progress: 15 } },
  { kind: "habit", proposed: { title: "Draft smoke habit", frequency: "SELECTED_DAYS", weekdays: [1, 3, 5] } },
  { kind: "calendarEvent", proposed: { title: "Draft smoke event", eventType: "COMMITMENT", date: "2027-03-04", startTime: "09:30", endTime: "10:15" } },
];

async function main() {
  const owner = await signUp("draft-owner");
  const other = await signUp("draft-other");
  const noLifestyle = await signUp("draft-no-entitlement");
  await prisma.userProductPermission.deleteMany({
    where: { userId: noLifestyle.id, permission: "LIFESTYLE_OS_ACCESS" },
  });

  // ============================================ 1. THE SAVE BODY IS ACCEPTED
  // This is the check that catches a draft field drifting from its create
  // schema. A 400 here means the chat's Save button is broken.
  const savedIds: Partial<Record<DraftKind, string>> = {};
  for (const { kind, proposed } of COMPLETE_DRAFTS) {
    const draft = buildDraft(kind, proposed, TZ);
    check(`${kind}: a complete draft is ready to save`, draft.ready, `missing ${draft.missing.join(", ")}`);
    const body = draftRequestBody(draft);
    check(`${kind}: a ready draft produces a request body`, body !== null);
    const response = await call(draft.endpoint, { method: "POST", cookie: owner.cookie, body });
    check(`${kind}: the endpoint the Save button posts to accepts the draft body`,
      response.status === 200 || response.status === 201, `got ${response.status}: ${response.body.slice(0, 300)}`);
    const created = response.json[kind === "calendarEvent" ? "event" : kind] as { id?: string } | undefined;
    if (created?.id) savedIds[kind] = created.id;
  }

  // ======================================= 2. THE SAVED RECORD IS THE USER'S
  const task = await prisma.task.findFirst({ where: { userId: owner.id, title: "Draft smoke task" } });
  check("task: the saved row belongs to the saving user", task?.userId === owner.id);
  check("task: every drafted field was persisted as drafted",
    task?.priority === "HIGH" && task?.estimatedDurationMinutes === 45 && task?.description === "From chat",
    `got ${JSON.stringify({ priority: task?.priority, minutes: task?.estimatedDurationMinutes, description: task?.description })}`);

  const habit = await prisma.habit.findFirst({ where: { userId: owner.id, title: "Draft smoke habit" } });
  check("habit: selected weekdays were persisted", JSON.stringify(habit?.weekdays) === JSON.stringify([1, 3, 5]),
    `got ${JSON.stringify(habit?.weekdays)}`);

  const event = await prisma.calendarEvent.findFirst({ where: { userId: owner.id, title: "Draft smoke event" } });
  // 09:30 in Asia/Kolkata (UTC+5:30) is 04:00Z. The timezone conversion the
  // chat form performs must survive the round trip to the database.
  check("event: the local time was stored as the right instant",
    event?.startAt.toISOString() === "2027-03-04T04:00:00.000Z", `got ${event?.startAt.toISOString()}`);
  check("event: a chat-created event is FIXED", event?.schedulingMode === "FIXED");

  // ================================================== 3. AUTHORIZATION HOLDS
  // A draft is a suggestion, not a capability: saving is the same guarded
  // action it always was.
  for (const { kind, proposed } of COMPLETE_DRAFTS) {
    const draft = buildDraft(kind, proposed, TZ);
    const body = draftRequestBody(draft);
    const anonymous = await call(draft.endpoint, { method: "POST", body });
    check(`${kind}: an unauthenticated save is refused`, anonymous.status === 401, `got ${anonymous.status}`);
    const unentitled = await call(draft.endpoint, { method: "POST", cookie: noLifestyle.cookie, body });
    // 401, not 403: authenticatedLifestyleUserId collapses "not signed in" and
    // "no entitlement" into null, so LifestyleOS routes cannot tell them apart.
    // This is the pre-existing behaviour already documented in
    // authorization-smoke.ts; the save is refused either way. Asserted as it is
    // rather than as it should be, so this suite does not fail on known debt.
    check(`${kind}: a save without the LifestyleOS entitlement is refused`,
      unentitled.status === 401, `got ${unentitled.status}`);
  }

  // ======================================================= 4. USER ISOLATION
  check("isolation: another user cannot see the saved task",
    (await prisma.task.count({ where: { userId: other.id, title: "Draft smoke task" } })) === 0);
  if (savedIds.task) {
    const stolen = await call(`/api/tasks/${savedIds.task}`, { cookie: other.cookie });
    check("isolation: another user cannot read the saved task by id",
      stolen.status === 404 || stolen.status === 403, `got ${stolen.status}`);
    const mutated = await call(`/api/tasks/${savedIds.task}`, {
      method: "PATCH", cookie: other.cookie, body: { title: "Taken over" },
    });
    check("isolation: another user cannot mutate the saved task",
      mutated.status === 404 || mutated.status === 403, `got ${mutated.status}`);
  }

  // ============================================ 5. AN INCOMPLETE DRAFT CANNOT SAVE
  // The Save button is disabled without a body, so this proves the server is
  // not relying on that: the same half-filled draft is refused outright.
  const incomplete = buildDraft("task", { priority: "HIGH" }, TZ);
  check("incomplete: a draft missing its title is not ready", incomplete.ready === false);
  check("incomplete: it produces no request body", draftRequestBody(incomplete) === null);
  const forced = await call("/api/tasks", { method: "POST", cookie: owner.cookie, body: { priority: "HIGH" } });
  check("incomplete: posting it anyway is rejected by the endpoint's own schema",
    forced.status === 400, `got ${forced.status}`);

  const backwards = buildDraft("calendarEvent", {
    title: "Backwards", eventType: "COMMITMENT", date: "2027-03-04", startTime: "14:00", endTime: "09:00",
  }, TZ);
  check("incomplete: an event ending before it starts produces no body", draftRequestBody(backwards) === null);
}

main()
  .catch((error: unknown) => {
    results.push({ name: "suite execution", ok: false, detail: error instanceof Error ? error.stack ?? error.message : String(error) });
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
    const failed = results.filter((entry) => !entry.ok);
    for (const entry of results) console.log(`${entry.ok ? "PASS" : "FAIL"}  ${entry.name}${entry.ok ? "" : `\n        ${entry.detail ?? ""}`}`);
    console.log(`\n${results.length - failed.length}/${results.length} draft checks passed`);
    if (failed.length) {
      console.log(`\n${failed.length} FAILING:`);
      for (const entry of failed) console.log(`  - ${entry.name}: ${entry.detail ?? ""}`);
      process.exitCode = 1;
    }
  });
