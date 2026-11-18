/**
 * Michael end to end: a running dev server, services/intelligence and a
 * reachable model (Ollama in development; Gemini has not been checked live).
 *
 * Hard checks (deterministic, enforced by the server whatever the model does):
 * the engine refuses callers without the service token; chat refuses an
 * anonymous caller, a user without LifestyleOS, and a WorkOS turn without a
 * membership; a WorkOS member's turn runs organization tools; one user's reply
 * can never contain another user's data; the stream and the stored
 * conversation keep their contracts.
 *
 * Model behaviour (that it chose to call the task tool) is reported, not
 * asserted: it depends on the model, and nothing about isolation does.
 */
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { smokeSignUp } from "./smoke-auth";
import toolDeclarationFile from "../shared/ai/tool-declarations.json";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const engineUrl = process.env.INTELLIGENCE_SERVICE_URL ?? "http://127.0.0.1:8100";
const suffix = randomUUID();
const emails = { a: `intel-a-${suffix}@example.test`, b: `intel-b-${suffix}@example.test`, c: `intel-c-${suffix}@example.test` };
const password = `IntelSmoke-${randomUUID()}-Aa9!`;
const markers = { a: `Water the ferns ${suffix.slice(0, 6)}`, b: `Feed the parrot ${suffix.slice(0, 6)}` };

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
const call = (path: string, method: string, cookie: string | null, body?: unknown) => fetch(`${base}${path}`, {
  method, redirect: "manual",
  headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: base },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
async function account(email: string) {
  const response = await smokeSignUp(base, prisma, { name: "Intel Smoke", email, password });
  assert(response.ok, `Sign-up failed (${response.status}).`);
  return { cookie: cookieFrom(response), id: (await prisma.user.findUniqueOrThrow({ where: { email } })).id };
}
const routine = { wakeUpTime: "07:00", bedtime: "22:30", workStartTime: null, workEndTime: null, workDays: ["MONDAY"], priorities: [], focusSessionMinutes: 50, breakDurationMinutes: 10, planningStyle: "BALANCED" };
async function onboard(cookie: string, name: string) {
  assert((await call("/api/profile", "PATCH", cookie, { preferredName: name, timeZone: "Asia/Kolkata", locationLabel: null, ...routine, onboardingStep: 5 })).status === 200, "Profile save failed.");
  assert((await call("/api/profile/complete", "POST", cookie)).ok, "Completing onboarding failed.");
}
type ChatReply = { message?: { content: string }; toolActivity?: Array<{ name: string; status: string }>; code?: string; error?: string };
const chat = (cookie: string | null, body: Record<string, unknown>) => call("/api/ai/chat", "POST", cookie, { product: "lifestyle", dataUseAcknowledged: true, ...body });

try {
  // The engine itself refuses anyone but this server.
  const direct = await fetch(`${engineUrl}/v1/agent/step`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert(direct.status === 401, `The engine accepted an unauthenticated caller (${direct.status}).`);
  const ready = await (await fetch(`${engineUrl}/ready`)).json() as { status: string; provider: string; tools: number };
  assert(ready.status === "ready" && ready.tools === toolDeclarationFile.tools.length, `The engine is not ready: ${JSON.stringify(ready)}`);

  assert((await chat(null, { message: "hi" })).status === 401, "Anonymous chat was allowed.");
  const a = await account(emails.a);
  const b = await account(emails.b);
  const c = await account(emails.c);
  await prisma.userProductPermission.deleteMany({ where: { userId: c.id, permission: "LIFESTYLE_OS_ACCESS" } });
  assert((await chat(c.cookie, { message: "hi" })).status === 403, "Chat without LifestyleOS access was allowed.");
  await onboard(a.cookie, "Asha");
  await onboard(b.cookie, "Bilal");
  assert((await call("/api/tasks", "POST", a.cookie, { title: markers.a })).status === 201, "A's task was not created.");
  assert((await call("/api/tasks", "POST", b.cookie, { title: markers.b })).status === 201, "B's task was not created.");

  // WorkOS: no entitlement or membership means no turn, before any model call.
  const work = await chat(a.cookie, { product: "work", organizationId: "org-that-a-is-not-in", message: "Who is in my organization?" });
  assert(work.status === 403 || work.status === 404, `A WorkOS turn without membership returned ${work.status}.`);

  // A asks about their tasks on the Python engine.
  const started = Date.now();
  const response = await chat(a.cookie, { message: "List the titles of my pending tasks." });
  const reply = await response.json() as ChatReply;
  assert(response.status === 200, `Chat failed (${response.status} ${reply.code ?? ""}).`);
  const text = reply.message!.content;
  assert(!text.includes("parrot"), "A's reply contained B's task.");
  const readTasks = reply.toolActivity?.some((entry) => entry.name === "get_my_tasks" && entry.status === "completed");
  console.log(`  model: read tasks=${readTasks}, mentions A's task=${text.includes("ferns")}, ${Date.now() - started} ms`);

  // B never sees A's task either.
  const bReply = await (await chat(b.cookie, { message: "List the titles of my pending tasks." })).json() as ChatReply;
  assert(bReply.message && !bReply.message.content.includes("ferns"), "B's reply contained A's task.");

  // The stream keeps its contract: accepted first, then a message or an error, nothing unknown.
  const stream = await chat(a.cookie, { message: "What tasks do I have?", stream: true });
  assert(stream.status === 200 && stream.headers.get("content-type")?.startsWith("text/event-stream"), "The stream did not open.");
  assert(stream.headers.get("cache-control")?.includes("no-store") && stream.headers.get("vary")?.includes("Cookie"), "The stream lost its private headers.");
  const events = (await stream.text()).split("\n\n").filter(Boolean).map((frame) => JSON.parse(frame.replace(/^data: /, "")) as { type: string });
  const types = events.map((event) => event.type).filter((type) => type !== "ping");
  assert(types[0] === "accepted" && types.at(-1) === "message", `Unexpected stream: ${types.join(",")}`);
  assert(types.every((type) => ["accepted", "tool-start", "tool-end", "composing", "message"].includes(type)), `Unknown event in ${types.join(",")}`);
  console.log(`  stream: ${types.join(" → ")}`);

  // A stored conversation is loaded server-side and grows by one exchange.
  const created = await call("/api/ai/conversations", "POST", a.cookie, { product: "lifestyle" });
  assert(created.status === 201, `Conversation create failed (${created.status}).`);
  const { conversation } = await created.json() as { conversation: { id: string } };
  assert((await chat(a.cookie, { message: "Hello Michael", conversationId: conversation.id })).status === 200, "Chat in a conversation failed.");
  const stored = await (await call(`/api/ai/conversations/${conversation.id}/messages`, "GET", a.cookie)).json() as { messages: Array<{ role: string }> };
  assert(stored.messages.map((m) => m.role).join(",") === "user,assistant", `Stored messages were ${JSON.stringify(stored.messages.map((m) => m.role))}.`);
  assert((await chat(b.cookie, { message: "hi", conversationId: conversation.id })).status === 404, "B could continue A's conversation.");

  // WorkOS: a member's turn uses the organization tools, scoped to that organization.
  await prisma.userProductPermission.upsert({
    where: { userId_permission: { userId: a.id, permission: "WORK_OS_ACCESS" } },
    create: { userId: a.id, permission: "WORK_OS_ACCESS" }, update: {},
  });
  const orgResponse = await call("/api/organizations", "POST", a.cookie, { name: `Intel Smoke ${suffix.slice(0, 8)}` });
  assert(orgResponse.status === 201, `Organization create failed (${orgResponse.status}).`);
  const org = (await orgResponse.json() as { organization: { id: string } }).organization.id;
  const projectResponse = await call(`/api/organizations/${org}/projects`, "POST", a.cookie, { name: "Launch", targetEndDate: "2026-12-20" });
  assert(projectResponse.status === 201, `Project create failed (${projectResponse.status}).`);
  const project = (await projectResponse.json() as { project: { id: string } }).project.id;
  const workTurn = await chat(a.cookie, { product: "work", organizationId: org, message: `Use get_project_delivery_risk for project ${project} and summarize the delivery risk. Quote only figures from the tool result.` });
  const workReply = await workTurn.json() as ChatReply;
  assert(workTurn.status === 200, `WorkOS chat failed (${workTurn.status} ${workReply.code ?? ""}).`);
  assert(!workReply.message!.content.includes("ferns") && !workReply.message!.content.includes("parrot"), "A WorkOS reply contained personal LifestyleOS data.");
  const usedWorkTool = workReply.toolActivity?.some((entry) => entry.name === "get_project_delivery_risk" && entry.status === "completed");
  assert(workReply.toolActivity?.every((entry) => !entry.name.startsWith("get_my_") && !entry.name.startsWith("draft_")), "A WorkOS turn ran a LifestyleOS tool.");
  console.log(`  workos: read delivery risk=${usedWorkTool}`);
  // B is not a member: the same organization is refused before any model call.
  await prisma.userProductPermission.upsert({
    where: { userId_permission: { userId: b.id, permission: "WORK_OS_ACCESS" } },
    create: { userId: b.id, permission: "WORK_OS_ACCESS" }, update: {},
  });
  const outsider = await chat(b.cookie, { product: "work", organizationId: org, message: "Summarize this organization." });
  assert(outsider.status === 403 || outsider.status === 404, `A non-member's WorkOS turn returned ${outsider.status}.`);

  console.log("Intelligence smoke checks passed: engine auth and readiness, chat authorization, LifestyleOS/WorkOS boundary, WorkOS tool turn, cross-user and cross-organization isolation, stream contract, stored conversations.");
} finally {
  // Projects, then organizations, then users: a project membership restricts
  // deleting its organization membership, and a membership restricts its user.
  const orgWhere = { memberships: { some: { user: { email: { in: Object.values(emails) } } } } };
  await prisma.project.deleteMany({ where: { organization: orgWhere } });
  await prisma.organization.deleteMany({ where: orgWhere });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
}
