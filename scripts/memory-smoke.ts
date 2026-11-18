/**
 * Phase 5 memory against a running dev server, the intelligence service and
 * the dev database (CLAUDE.md §10.7, §6).
 *
 * Authorization: every route refuses an anonymous caller and a user without the
 * product; organization routes refuse non-members, and a member without
 * `organizationMemory.manage` may read but not change. Isolation: user B cannot
 * read, edit or delete A's memories; another organization cannot reach A's;
 * personal and organization memories never mix; the database refuses a row
 * with two owners or none. Behaviour: edits keep history, delete forgets every
 * version, the per-owner cap holds, and the filter Michael reads through
 * (`assistantMemoryWhere`) drops expired, superseded, private and — on an
 * unpaid provider — personal memories.
 *
 * The chat step needs a model. Without one the smoke still checks every
 * authorization, isolation and filter path, and says the chat step did not run.
 */
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { assistantMemoryWhere } from "../src/lib/memory-query";
import { smokeSignUp } from "./smoke-auth";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = { a: `memory-a-${suffix}@example.test`, b: `memory-b-${suffix}@example.test`, c: `memory-c-${suffix}@example.test` };
const password = `MemorySmoke-${randomUUID()}-Aa9!`;
// Unique words, so a reply or a list can be searched for one memory without matching another.
const PRIVATE_WORD = `zebrafinch${suffix.slice(0, 6)}`;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
const call = (path: string, method: string, cookie: string | null, body?: unknown) => fetch(`${base}${path}`, {
  method, redirect: "manual",
  headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
async function json<T>(response: Response) { return await response.json() as T; }
async function account(email: string) {
  const response = await smokeSignUp(base, prisma, { name: "Memory Smoke", email, password });
  assert(response.ok, `Sign-up failed (${response.status}).`);
  return { cookie: cookieFrom(response), id: (await prisma.user.findUniqueOrThrow({ where: { email } })).id };
}
const routine = { wakeUpTime: "07:00", bedtime: "22:30", workStartTime: null, workEndTime: null, workDays: ["MONDAY"], priorities: [], focusSessionMinutes: 50, breakDurationMinutes: 10, planningStyle: "BALANCED" };
async function onboard(cookie: string) {
  assert((await call("/api/profile", "PATCH", cookie, { preferredName: "M", timeZone: "UTC", locationLabel: null, ...routine, onboardingStep: 5 })).status === 200, "Profile save failed.");
  assert((await call("/api/profile/complete", "POST", cookie)).ok, "Completing onboarding failed.");
}
async function rejectedByDatabase(operation: () => Promise<unknown>) {
  try { await operation(); return false; } catch { return true; }
}
type Memory = { id: string; content: string; sensitivity: string; keepUntil: string | null; expired: boolean; edited: boolean; savedBy: string | null };
type MemoryList = { memories: Memory[]; total: number; page: number; limit: number; maxMemories: number };
async function save(path: string, cookie: string, body: Record<string, unknown>) {
  const response = await call(path, "POST", cookie, body);
  if (response.status !== 201) throw new Error(`Saving a memory failed (${response.status}): ${await response.text()}`);
  return (await json<{ memory: Memory }>(response)).memory;
}
const list = async (path: string, cookie: string) => json<MemoryList>(await call(`${path}?limit=100`, "GET", cookie));
type ChatReply = { message?: { content: string }; toolActivity?: Array<{ name: string; status: string }>; drafts?: Array<{ kind: string; endpoint: string; values: Record<string, unknown> }>; code?: string };

let chatExercised = false;
try {
  // ---------------------------------------------------------------- authorization
  for (const [path, method, body] of [
    ["/api/memories", "GET", undefined],
    ["/api/memories", "POST", { content: "x" }],
    ["/api/memories/x", "PUT", { content: "x" }],
    ["/api/memories/x", "DELETE", undefined],
    ["/api/organizations/x/memories", "GET", undefined],
    ["/api/organizations/x/memories", "POST", { content: "x" }],
    ["/api/organizations/x/memories/y", "PUT", { content: "x" }],
    ["/api/organizations/x/memories/y", "DELETE", undefined],
  ] as const) assert((await call(path, method, null, body)).status === 401, `Anonymous ${method} ${path} was allowed.`);
  const a = await account(emails.a);
  const b = await account(emails.b);
  const c = await account(emails.c);
  await prisma.userProductPermission.deleteMany({ where: { userId: c.id, permission: "LIFESTYLE_OS_ACCESS" } });
  assert((await call("/api/memories", "GET", c.cookie)).status === 401, "Memories without LifestyleOS were readable.");
  assert((await call("/api/memories", "POST", c.cookie, { content: "x" })).status === 401, "A memory was saved without LifestyleOS.");
  await onboard(a.cookie);
  await onboard(b.cookie);

  // ---------------------------------------------------------------- personal memories
  const everyday = await save("/api/memories", a.cookie, { content: "I take my coffee black" });
  const personal = await save("/api/memories", a.cookie, { content: "I am training for a marathon in March", sensitivity: "PERSONAL" });
  const secret = await save("/api/memories", a.cookie, { content: `My ${PRIVATE_WORD} medication is at 9pm`, sensitivity: "SENSITIVE" });
  const expiring = await save("/api/memories", a.cookie, { content: "Travelling this week", keepUntil: new Date().toISOString().slice(0, 10) });
  assert(everyday.sensitivity === "STANDARD" && everyday.keepUntil === null && everyday.savedBy === null, "A memory's defaults were wrong.");
  assert(expiring.keepUntil !== null && !expiring.expired, "Keep-until today was not kept through today.");
  const listResponse = await call("/api/memories", "GET", a.cookie);
  assert(listResponse.headers.get("cache-control")?.includes("no-store") && listResponse.headers.get("vary")?.includes("Cookie"), "The private envelope is missing.");
  const listed = await json<MemoryList>(listResponse);
  assert(listed.total === 4 && listed.memories[0]!.id === expiring.id, "The list was not the user's four memories, newest first.");
  assert(!JSON.stringify(listed).includes(a.id), "The list exposed the user's id.");
  const paged = await json<MemoryList>(await call("/api/memories?limit=1&page=2", "GET", a.cookie));
  assert(paged.memories.length === 1 && paged.memories[0]!.id === listed.memories[1]!.id, "Paging did not follow the list.");
  assert((await call("/api/memories?limit=101", "GET", a.cookie)).status === 400, "An unbounded page was accepted.");
  for (const bad of [{ content: "" }, { content: "x".repeat(281) }, { content: "x", source: "AI_INFERENCE" }, { content: "x", userId: b.id }, { content: "x", keepUntil: "2020-01-01" }]) {
    assert((await call("/api/memories", "POST", a.cookie, bad)).status === 400, `An invalid memory was accepted: ${JSON.stringify(bad).slice(0, 80)}`);
  }

  // Edits keep history; the list shows only the current version. The expiry is backdated first, directly in
  // the database (the API refuses a past date): the edit's cache invalidation then makes the list re-read it.
  await prisma.memoryItem.update({ where: { id: expiring.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  const editResponse = await call(`/api/memories/${everyday.id}`, "PUT", a.cookie, { content: "I take my coffee black, no sugar", sensitivity: "STANDARD", keepUntil: null });
  assert(editResponse.status === 200, `Editing failed (${editResponse.status}).`);
  const edited = (await json<{ memory: Memory }>(editResponse)).memory;
  assert(edited.id !== everyday.id && edited.edited, "An edit did not save a new version.");
  const old = await prisma.memoryItem.findUniqueOrThrow({ where: { id: everyday.id } });
  const fresh = await prisma.memoryItem.findUniqueOrThrow({ where: { id: edited.id } });
  assert(old.supersededAt !== null && fresh.supersedesId === old.id && fresh.lineageId === old.id && fresh.source === "USER_INPUT", "The version history was not recorded.");
  const afterEdit = await list("/api/memories", a.cookie);
  assert(afterEdit.total === 4 && !afterEdit.memories.some(({ id }) => id === everyday.id), "The superseded version is still listed (cache not invalidated?).");
  assert((await call(`/api/memories/${everyday.id}`, "PUT", a.cookie, { content: "again" })).status === 404, "A superseded version could be edited.");

  // ---------------------------------------------------------------- what Michael may read
  const readable = async (allowed: Array<"STANDARD" | "PERSONAL" | "SENSITIVE">, scope: { userId: string } | { organizationId: string } = { userId: a.id }) =>
    (await prisma.memoryItem.findMany({ where: assistantMemoryWhere(scope, allowed, new Date()), select: { id: true } })).map(({ id }) => id).sort();
  assert(JSON.stringify(await readable(["STANDARD", "PERSONAL", "SENSITIVE"])) === JSON.stringify([edited.id, personal.id].sort()),
    "Michael's filter returned a private, expired or superseded memory.");
  assert(!(await readable(["STANDARD", "PERSONAL", "SENSITIVE"])).includes(secret.id), "Michael's filter returned a private memory.");
  assert(JSON.stringify(await readable(["STANDARD"])) === JSON.stringify([edited.id]), "An unpaid provider's filter returned a personal memory.");
  assert(!(await readable(["STANDARD", "PERSONAL"], { userId: b.id })).some((id) => [edited.id, personal.id].includes(id)), "B's filter returned A's memories.");
  assert(afterEdit.memories.find(({ id }) => id === expiring.id)?.expired, "An expired memory was not shown as expired.");

  // ---------------------------------------------------------------- isolation (HTTP)
  const bList = await list("/api/memories", b.cookie);
  assert(bList.total === 0, "B's list included A's memories.");
  assert((await call(`/api/memories/${edited.id}`, "PUT", b.cookie, { content: "hijacked" })).status === 404, "B edited A's memory.");
  assert((await call(`/api/memories/${edited.id}`, "DELETE", b.cookie)).status === 404, "B deleted A's memory.");
  assert((await prisma.memoryItem.findUniqueOrThrow({ where: { id: edited.id } })).content.startsWith("I take my coffee"), "A's memory changed after B's attempts.");

  // ---------------------------------------------------------------- isolation (database)
  const orgless = { content: "x", source: "USER_INPUT" as const };
  assert(await rejectedByDatabase(() => prisma.memoryItem.create({ data: orgless })), "The database accepted a memory with no owner.");
  assert(await rejectedByDatabase(() => prisma.memoryItem.create({ data: { ...orgless, userId: a.id, createdById: b.id } })), "The database accepted a personal memory naming a writer.");
  assert(await rejectedByDatabase(() => prisma.memoryItem.create({ data: { ...orgless, userId: a.id, confidence: 0.5 } })), "The database accepted a confidence on a fact a person saved.");
  assert(await rejectedByDatabase(() => prisma.memoryItem.create({ data: { ...orgless, userId: a.id, source: "AI_INFERENCE" } })), "The database accepted an inference without confidence.");
  assert(await rejectedByDatabase(() => prisma.memoryItem.create({ data: { ...orgless, userId: a.id, lineageId: personal.id } })), "The database accepted a lineage without the version it replaced.");
  assert(await rejectedByDatabase(() => prisma.memoryItem.create({ data: { ...orgless, userId: a.id, content: "   " } })), "The database accepted a blank memory.");

  // ---------------------------------------------------------------- delete forgets every version
  const deleted = await call(`/api/memories/${edited.id}`, "DELETE", a.cookie);
  assert(deleted.status === 200 && (await json<{ versionsRemoved: number }>(deleted)).versionsRemoved === 2, "Deleting did not remove both versions.");
  assert(await prisma.memoryItem.count({ where: { id: { in: [everyday.id, edited.id] } } }) === 0, "A forgotten memory's earlier version remained.");
  assert((await call(`/api/memories/${edited.id}`, "DELETE", a.cookie)).status === 404, "A deleted memory could be deleted again.");

  // ---------------------------------------------------------------- the per-owner cap
  const current = await prisma.memoryItem.count({ where: { userId: a.id, supersededAt: null } });
  await prisma.memoryItem.createMany({ data: Array.from({ length: 100 - current }, (_, index) => ({ userId: a.id, content: `Filler ${index}`, source: "USER_INPUT" as const })) });
  const overCap = await call("/api/memories", "POST", a.cookie, { content: "One too many" });
  assert(overCap.status === 409 && (await json<{ code: string }>(overCap)).code === "MEMORY_LIMIT", `The 101st memory was not refused (${overCap.status}).`);
  await prisma.memoryItem.deleteMany({ where: { userId: a.id, content: { startsWith: "Filler " } } });

  // ---------------------------------------------------------------- WorkOS
  for (const user of [a, b]) {
    await prisma.userProductPermission.upsert({ where: { userId_permission: { userId: user.id, permission: "WORK_OS_ACCESS" } }, create: { userId: user.id, permission: "WORK_OS_ACCESS" }, update: {} });
  }
  const orgId = (await json<{ organization: { id: string } }>(await call("/api/organizations", "POST", a.cookie, { name: `Memory ${suffix.slice(0, 8)}` }))).organization.id;
  const orgPath = `/api/organizations/${orgId}/memories`;
  const convention = await save(orgPath, a.cookie, { content: "Standups are at 10:00 IST" });
  assert(convention.savedBy === "Memory Smoke", "An organization memory did not name its writer.");
  const orgRow = await prisma.memoryItem.findUniqueOrThrow({ where: { id: convention.id } });
  assert(orgRow.organizationId === orgId && orgRow.userId === null && orgRow.createdById === a.id, "An organization memory was not owned by the organization alone.");
  assert(!(await list("/api/memories", a.cookie)).memories.some(({ id }) => id === convention.id), "An organization memory appeared among personal memories.");
  assert(!(await readable(["STANDARD", "PERSONAL"])).includes(convention.id), "A personal read reached an organization memory.");
  assert(JSON.stringify(await readable(["STANDARD"], { organizationId: orgId })) === JSON.stringify([convention.id]), "The organization filter did not return its memory.");

  // Not a member; then a member without the permission; then another organization.
  assert([403, 404].includes((await call(orgPath, "GET", b.cookie)).status), "A non-member read the organization's memories.");
  assert([403, 404].includes((await call(orgPath, "POST", b.cookie, { content: "x" })).status), "A non-member saved an organization memory.");
  assert([403, 404].includes((await call(orgPath, "GET", c.cookie)).status), "A user without WorkOS read organization memories.");
  await prisma.organizationMembership.create({ data: { organizationId: orgId, userId: b.id, role: "MEMBER", status: "ACTIVE" } });
  const memberView = await list(orgPath, b.cookie);
  assert(memberView.total === 1 && memberView.memories[0]!.id === convention.id, "A member could not read the organization's memories.");
  assert((await call(orgPath, "POST", b.cookie, { content: "x" })).status === 403, "A member without permission saved an organization memory.");
  assert((await call(`${orgPath}/${convention.id}`, "PUT", b.cookie, { content: "x" })).status === 403, "A member without permission edited an organization memory.");
  assert((await call(`${orgPath}/${convention.id}`, "DELETE", b.cookie)).status === 403, "A member without permission deleted an organization memory.");
  const otherOrg = (await json<{ organization: { id: string } }>(await call("/api/organizations", "POST", b.cookie, { name: `Memory Other ${suffix.slice(0, 8)}` }))).organization.id;
  const otherPath = `/api/organizations/${otherOrg}/memories`;
  assert((await list(otherPath, b.cookie)).total === 0, "Another organization's list included A's organization memory.");
  assert((await call(`${otherPath}/${convention.id}`, "PUT", b.cookie, { content: "x" })).status === 404, "Another organization edited A's organization memory.");
  assert((await call(`${otherPath}/${convention.id}`, "DELETE", b.cookie)).status === 404, "Another organization deleted A's organization memory.");
  assert((await call(`/api/memories/${convention.id}`, "DELETE", a.cookie)).status === 404, "The personal route reached an organization memory.");
  assert((await call(`${orgPath}/${personal.id}`, "DELETE", a.cookie)).status === 404, "The organization route reached a personal memory.");
  const orgEdit = await call(`${orgPath}/${convention.id}`, "PUT", a.cookie, { content: "Standups are at 10:30 IST" });
  assert(orgEdit.status === 200, `An owner could not edit an organization memory (${orgEdit.status}).`);
  const orgDelete = await call(`${orgPath}/${(await json<{ memory: Memory }>(orgEdit)).memory.id}`, "DELETE", a.cookie);
  assert(orgDelete.status === 200 && await prisma.memoryItem.count({ where: { organizationId: orgId } }) === 0, "Deleting an organization memory left a version behind.");

  // ---------------------------------------------------------------- chat (model)
  const chat = (message: string) => call("/api/ai/chat", "POST", a.cookie, { product: "lifestyle", dataUseAcknowledged: true, message });
  const asked = await chat("What have I asked you to remember about my training? Check my memories.");
  if (asked.status === 200) {
    chatExercised = true;
    const reply = await json<ChatReply>(asked);
    assert(reply.toolActivity?.some(({ name, status }) => name === "get_my_memories" && status === "completed"), `Michael did not read memories: ${JSON.stringify(reply.toolActivity)}`);
    assert(!reply.message!.content.includes(PRIVATE_WORD), "A private memory reached the reply.");
    const before = await prisma.memoryItem.count({ where: { userId: a.id } });
    const remember = await json<ChatReply>(await chat("Please remember that I prefer workouts in the morning."));
    const draft = remember.drafts?.find(({ kind }) => kind === "memory");
    assert(draft && draft.endpoint === "/api/memories" && typeof draft.values.content === "string", `Michael did not propose a memory draft: ${JSON.stringify(remember.toolActivity)}`);
    assert(await prisma.memoryItem.count({ where: { userId: a.id } }) === before, "A memory was saved without the user pressing Save.");
    assert(!/\bI(?:'ll| will) remember\b/i.test(remember.message!.content), "Michael claimed he would remember without a save.");
  } else {
    const code = (await json<{ code?: string }>(asked)).code;
    assert([503, 429].includes(asked.status), `An unavailable model was reported as ${asked.status} ${code}.`);
  }

  console.log(`Memory smoke checks passed: authorization on every route (anonymous, no entitlement, non-member, member without permission), cross-user and cross-organization isolation (HTTP and database), personal and organization memories kept apart, version history on edit, delete removing every version, the per-owner cap, and Michael's filter dropping private, expired, superseded and (on an unpaid provider) personal memories. Chat step: ${chatExercised ? "exercised (memory read, private memory withheld, memory draft proposed and not saved)" : "NOT exercised (no model available)"}.`);
} finally {
  const ids = (await prisma.organization.findMany({ where: { memberships: { some: { user: { email: { in: Object.values(emails) } } } } }, select: { id: true } })).map(({ id }) => id);
  await prisma.memoryItem.deleteMany({ where: { organizationId: { in: ids } } });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
}
