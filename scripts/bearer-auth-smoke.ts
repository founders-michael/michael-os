/**
 * Bearer-token sessions for the native apps, against a running dev server.
 *
 * A native client has no cookie jar and sends no Origin header, so every
 * request here is made that way. Behaviour: a sign-in returns the session
 * token in `set-auth-token`; that token alone authorizes the same routes a
 * cookie does, and resolves to the same session. Authorization: a missing,
 * malformed, unsigned or foreign token is refused; the three-layer rule is
 * unchanged, so a token for a user without LifestyleOS access is still
 * refused; sign-out revokes the token. Isolation: user B's token never reads
 * user A's task.
 */
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { request, type IncomingHttpHeaders } from "node:http";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

dotenv.config({ path: ".env.local" });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured locally.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const suffix = randomUUID();
const emails = { a: `bearer-a-${suffix}@example.test`, b: `bearer-b-${suffix}@example.test`, c: `bearer-c-${suffix}@example.test` };
const password = `BearerSmoke-${randomUUID()}-Aa9!`;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

type Reply = { status: number; ok: boolean; headers: IncomingHttpHeaders; text: string; json: <T>() => T };

/**
 * What URLSession and OkHttp send: no cookie, no Origin and no Fetch Metadata.
 * Node's own fetch adds `Sec-Fetch-Mode`, which makes Better Auth treat the
 * request as a browser's and demand an Origin, so this uses node:http instead.
 */
function call(path: string, method: string, token: string | null, body?: unknown): Promise<Reply> {
  const payload = body === undefined ? null : JSON.stringify(body);
  const headers: Record<string, string> = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(payload !== null ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) } : {}),
  };
  return new Promise((resolve, reject) => {
    const outgoing = request(new URL(path, base), { method, headers }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const status = incoming.statusCode ?? 0;
        resolve({ status, ok: status >= 200 && status < 300, headers: incoming.headers, text, json: <T>() => JSON.parse(text) as T });
      });
    });
    outgoing.on("error", reject);
    if (payload !== null) outgoing.write(payload);
    outgoing.end();
  });
}

function tokenFrom(reply: Reply) {
  const value = reply.headers["set-auth-token"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function register(email: string, name: string) {
  const signUp = await call("/api/auth/sign-up/email", "POST", null, { name, email, password });
  assert(signUp.ok, `Sign-up without an Origin header failed for ${email} (${signUp.status}): ${signUp.text}`);
  assert(!tokenFrom(signUp), "Sign-up must not issue a token before the email is verified.");

  const unverified = await call("/api/auth/sign-in/email", "POST", null, { email, password });
  assert(unverified.status === 403, `An unverified sign-in should be 403, got ${unverified.status}.`);
  assert(!tokenFrom(unverified), "An unverified sign-in must not issue a token.");

  // A smoke script cannot click the emailed link; mark the throwaway user verified.
  const user = await prisma.user.update({ where: { email }, data: { emailVerified: true } });
  const signIn = await call("/api/auth/sign-in/email", "POST", null, { email, password });
  assert(signIn.ok, `Sign-in failed for ${email} (${signIn.status}).`);
  const token = tokenFrom(signIn);
  assert(token, "Sign-in did not return set-auth-token.");
  return { id: user.id, token };
}

async function main() {
  const a = await register(emails.a, "Bearer A");
  const b = await register(emails.b, "Bearer B");
  const c = await register(emails.c, "Bearer C");
  await prisma.userProductPermission.deleteMany({ where: { userId: c.id, permission: "LIFESTYLE_OS_ACCESS" } });

  const session = await call("/api/auth/get-session", "GET", a.token);
  const sessionBody = session.json<{ user?: { id: string } } | null>();
  assert(session.ok && sessionBody?.user?.id === a.id, "The token did not resolve to its own session.");

  const created = await call("/api/tasks", "POST", a.token, { title: "Bearer smoke task" });
  assert(created.status === 201, `Creating a task with a token should be 201, got ${created.status}.`);
  const { task } = created.json<{ task: { id: string } }>();
  const listed = await call("/api/tasks", "GET", a.token);
  const list = listed.json<{ tasks: Array<{ id: string }> }>();
  assert(listed.ok && list.tasks.some((entry) => entry.id === task.id), "The token did not list its own task.");

  const refusals: [string, string | null][] = [
    ["no token", null],
    ["a random token", randomUUID()],
    ["the token without its signature", a.token.split(".")[0]],
    ["a token with a forged signature", `${a.token.split(".")[0]}.${Buffer.from(randomUUID()).toString("base64")}`],
    ["an empty bearer value", " "],
  ];
  for (const [label, token] of refusals) {
    const response = await call("/api/tasks", "GET", token);
    assert(response.status === 401, `${label} should be 401 on /api/tasks, got ${response.status}.`);
    const who = await call("/api/auth/get-session", "GET", token);
    assert(who.ok && who.json<unknown>() === null, `${label} should resolve to no session.`);
  }

  const noAccess = await call("/api/tasks", "GET", c.token);
  assert(noAccess.status === 401, `A token without LifestyleOS access should be 401, got ${noAccess.status}.`);

  const foreignRead = await call(`/api/tasks/${task.id}`, "GET", b.token);
  assert(foreignRead.status === 404, `User B reading user A's task should be 404, got ${foreignRead.status}.`);
  const foreignWrite = await call(`/api/tasks/${task.id}`, "PATCH", b.token, { title: "Taken over" });
  assert(foreignWrite.status === 404, `User B changing user A's task should be 404, got ${foreignWrite.status}.`);
  const foreignDelete = await call(`/api/tasks/${task.id}`, "DELETE", b.token);
  assert(foreignDelete.status === 404, `User B deleting user A's task should be 404, got ${foreignDelete.status}.`);

  const signOut = await call("/api/auth/sign-out", "POST", a.token, {});
  assert(signOut.ok, `Sign-out with a token failed (${signOut.status}).`);
  const afterSignOut = await call("/api/tasks", "GET", a.token);
  assert(afterSignOut.status === 401, `A signed-out token should be 401, got ${afterSignOut.status}.`);
  const stillB = await call("/api/tasks", "GET", b.token);
  assert(stillB.ok, "Signing out user A must not affect user B's token.");

  console.log("Bearer auth smoke passed: token issue, session resolution, refusals, entitlement, isolation and sign-out.");
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => {
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await prisma.$disconnect();
  });
