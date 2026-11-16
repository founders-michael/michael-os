/**
 * Settings → Account and My Context, against a running dev server.
 *
 * Authorization: every new endpoint refuses an anonymous caller and a signed-in
 * user without LifestyleOS access. Isolation: user B never sees or changes
 * user A's photo or context — there is no id in any URL, so B's requests can
 * only ever reach B's own rows. Behaviour: account details save together and
 * show up in the server-rendered greeting; the photo is validated by its
 * bytes, overrides the provider picture without touching it, and falls back to
 * it when removed; the context is versioned (a stale save is a 409) and
 * bounded; saving the routine cannot change the preferred name.
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
const emails = { a: `account-a-${suffix}@example.test`, b: `account-b-${suffix}@example.test`, c: `account-c-${suffix}@example.test` };
const password = `AccountSmoke-${randomUUID()}-Aa9!`;
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const PROVIDER_IMAGE = "https://avatars.githubusercontent.com/u/9919?v=4";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; "); }
type Identity = { displayName: string; greetingName: string; avatarUrl: string | null; avatarSource: string };
type Body = { code?: string; account: { fullName: string; preferredName: string; providers: string[]; hasCustomImage: boolean; identity: Identity }; context: { summary: string; updatedAt: string | null } };
async function json(response: Response) { return await response.json() as Body; }
function call(path: string, method: string, cookie: string | null, body?: unknown, contentType = "application/json") {
  const raw = body instanceof Uint8Array || typeof body === "string";
  return fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": contentType } : {}), origin: base },
    ...(body !== undefined ? { body: raw ? body as BodyInit : JSON.stringify(body) } : {}),
    redirect: "manual",
  });
}

async function setUp(email: string, name: string, preferredName: string) {
  const response = await smokeSignUp(base, prisma, { name, email, password });
  assert(response.ok, `Sign-up failed for ${email} (${response.status}).`);
  const cookie = cookieFrom(response);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.userProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, preferredName, onboardingCompleted: true, onboardingStep: 5, timeZone: "Asia/Kolkata" }, update: { preferredName, onboardingCompleted: true, onboardingStep: 5 } });
  return { id: user.id, cookie };
}

const ENDPOINTS: [string, string, unknown?, string?][] = [
  ["/api/account", "GET"], ["/api/account", "PATCH", { fullName: "X", preferredName: "Y" }],
  ["/api/account/image", "GET"], ["/api/account/image", "PUT", PNG, "image/png"], ["/api/account/image", "DELETE"],
  ["/api/account/context", "GET"], ["/api/account/context", "PUT", { summary: "x", expectedUpdatedAt: null }],
  ["/api/profile/routine", "PATCH", {}],
];

try {
  // --- Authorization -------------------------------------------------------
  for (const [path, method, body, type] of ENDPOINTS) {
    const response = await call(path, method, null, body, type);
    assert(response.status === 401, `Anonymous ${method} ${path} returned ${response.status}, expected 401.`);
  }
  const a = await setUp(emails.a, "Ada Account", "Ada");
  const b = await setUp(emails.b, "Ben Boundary", "Ben");
  const c = await setUp(emails.c, "Cy Noaccess", "Cy");
  await prisma.userProductPermission.deleteMany({ where: { userId: c.id, permission: "LIFESTYLE_OS_ACCESS" } });
  for (const [path, method, body, type] of ENDPOINTS) {
    const response = await call(path, method, c.cookie, body, type);
    assert(response.status === 401, `${method} ${path} without LifestyleOS access returned ${response.status}, expected 401.`);
  }
  assert((await prisma.userContext.count({ where: { userId: c.id } })) === 0 && (await prisma.userProfileImage.count({ where: { userId: c.id } })) === 0, "A refused request still wrote data.");

  // --- Account details -----------------------------------------------------
  const initial = await json(await call("/api/account", "GET", a.cookie));
  assert(initial.account.fullName === "Ada Account" && initial.account.preferredName === "Ada", "Account did not return the saved names.");
  assert(JSON.stringify(initial.account.providers) === JSON.stringify(["credential"]), `Providers were ${JSON.stringify(initial.account.providers)}.`);
  assert(initial.account.identity.displayName === "Ada" && initial.account.identity.avatarSource === "none", "Initial identity was wrong.");
  const accountGet = await call("/api/account", "GET", a.cookie);
  assert(accountGet.headers.get("cache-control")?.includes("no-store") && accountGet.headers.get("vary")?.includes("Cookie"), "Account response is missing the private envelope.");

  for (const bad of [{ fullName: "Ada", preferredName: "  " }, { fullName: "Ada", preferredName: "A", userId: b.id }, { fullName: "Ada", preferredName: "A", email: "new@example.test" }]) {
    const response = await call("/api/account", "PATCH", a.cookie, bad);
    assert(response.status === 400, `Invalid account update ${JSON.stringify(bad)} returned ${response.status}.`);
  }
  const updated = await call("/api/account", "PATCH", a.cookie, { fullName: "  Ada   Lovelace ", preferredName: "Countess Ada" });
  assert(updated.status === 200, `Account update failed (${updated.status}).`);
  const updatedBody = await json(updated);
  assert(updatedBody.account.fullName === "Ada Lovelace" && updatedBody.account.identity.displayName === "Countess Ada" && updatedBody.account.identity.greetingName === "Countess Ada", "Account update did not return the new identity.");
  const userA = await prisma.user.findUniqueOrThrow({ where: { id: a.id }, include: { profile: true } });
  assert(userA.name === "Ada Lovelace" && userA.profile?.preferredName === "Countess Ada" && userA.email === emails.a, "Account update did not persist both names, or changed the email.");
  const bAfter = await prisma.user.findUniqueOrThrow({ where: { id: b.id }, include: { profile: true } });
  assert(bAfter.name === "Ben Boundary" && bAfter.profile?.preferredName === "Ben", "Updating A changed B.");

  const home = await (await call("/", "GET", a.cookie)).text();
  assert(home.includes("Countess Ada"), "The home page did not render the new preferred name.");

  // --- Profile photo -------------------------------------------------------
  await prisma.user.update({ where: { id: a.id }, data: { image: PROVIDER_IMAGE } });
  const withProvider = await json(await call("/api/account", "GET", a.cookie));
  assert(withProvider.account.identity.avatarUrl === PROVIDER_IMAGE && withProvider.account.identity.avatarSource === "provider", "Provider image was not used as the default.");
  assert((await call("/api/account/image", "GET", a.cookie)).status === 404, "A user with no upload got an image.");

  const svg = await call("/api/account/image", "PUT", a.cookie, new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "image/png");
  assert(svg.status === 400 && (await json(svg)).code === "IMAGE_TYPE_UNSUPPORTED", "An SVG disguised as PNG was accepted.");
  const big = new Uint8Array(2 * 1024 * 1024 + 1); big.set(PNG);
  const tooBig = await call("/api/account/image", "PUT", a.cookie, big, "image/png");
  assert(tooBig.status === 413, `An oversized image returned ${tooBig.status}, expected 413.`);
  const empty = await call("/api/account/image", "PUT", a.cookie, new Uint8Array(), "image/png");
  assert(empty.status === 400, `An empty upload returned ${empty.status}.`);

  const uploaded = await call("/api/account/image", "PUT", a.cookie, PNG, "image/jpeg");
  assert(uploaded.status === 200, `Uploading a PNG failed (${uploaded.status}).`);
  const uploadedBody = await json(uploaded);
  assert(uploadedBody.account.hasCustomImage && uploadedBody.account.identity.avatarSource === "custom" && String(uploadedBody.account.identity.avatarUrl).startsWith("/api/account/image?v="), "Upload did not become the avatar.");
  assert((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).image === PROVIDER_IMAGE, "Uploading overwrote the provider image.");
  const served = await call("/api/account/image", "GET", a.cookie);
  assert(served.status === 200 && served.headers.get("content-type") === "image/png", `Served image had type ${served.headers.get("content-type")} (declared JPEG must be stored as its real type, PNG).`);
  assert(served.headers.get("x-content-type-options") === "nosniff" && served.headers.get("vary")?.includes("Cookie") && served.headers.get("cache-control")?.startsWith("private"), "Served image is missing its safety headers.");
  assert(Buffer.compare(Buffer.from(await served.arrayBuffer()), Buffer.from(PNG)) === 0, "Served image bytes differ from the upload.");
  assert((await call("/api/account/image", "GET", b.cookie)).status === 404, "User B could read user A's photo.");
  assert((await call("/api/account/image", "DELETE", b.cookie)).status === 200 && await prisma.userProfileImage.count({ where: { userId: a.id } }) === 1, "User B's delete removed user A's photo.");

  const removed = await json(await call("/api/account/image", "DELETE", a.cookie));
  assert(!removed.account.hasCustomImage && removed.account.identity.avatarUrl === PROVIDER_IMAGE, "Removing the upload did not fall back to the provider image.");
  assert((await call("/api/account/image", "DELETE", a.cookie)).status === 200, "Removing twice was not idempotent.");

  // --- My Context ----------------------------------------------------------
  const emptyContext = await json(await call("/api/account/context", "GET", a.cookie));
  assert(emptyContext.context.summary === "" && emptyContext.context.updatedAt === null, "A new user's context was not empty.");
  const text = "I work as a frontend developer.\r\n\r\nI prefer short, practical suggestions.   ";
  const firstSave = await call("/api/account/context", "PUT", a.cookie, { summary: text, expectedUpdatedAt: null });
  assert(firstSave.status === 200, `First context save failed (${firstSave.status}).`);
  const first = (await json(firstSave)).context;
  assert(first.summary === "I work as a frontend developer.\n\nI prefer short, practical suggestions." && first.updatedAt, "Context was not normalized and saved.");
  const stale = await call("/api/account/context", "PUT", a.cookie, { summary: "Overwrite from an old tab", expectedUpdatedAt: null });
  assert(stale.status === 409 && (await json(stale)).code === "CONTEXT_CHANGED", `A stale context save returned ${stale.status}, expected 409.`);
  const second = await call("/api/account/context", "PUT", a.cookie, { summary: "Updated context.", expectedUpdatedAt: first.updatedAt });
  assert(second.status === 200 && (await json(second)).context.summary === "Updated context.", "A save from the current version failed.");
  const tooLong = await call("/api/account/context", "PUT", a.cookie, { summary: "x".repeat(5001), expectedUpdatedAt: null });
  assert(tooLong.status === 400, `An over-long context returned ${tooLong.status}.`);
  const injected = await call("/api/account/context", "PUT", a.cookie, { summary: "x", expectedUpdatedAt: null, userId: b.id });
  assert(injected.status === 400, "A context body naming another user was accepted.");

  const bContext = await json(await call("/api/account/context", "GET", b.cookie));
  assert(bContext.context.summary === "" && bContext.context.updatedAt === null, "User B could read user A's context.");
  assert((await call("/api/account/context", "PUT", b.cookie, { summary: "Ben's own words.", expectedUpdatedAt: null })).status === 200, "User B could not save their own context.");
  assert((await prisma.userContext.findUniqueOrThrow({ where: { userId: a.id } })).summary === "Updated context.", "User B's save changed user A's context.");

  // --- Routine cannot change the name ------------------------------------
  const routine = { timeZone: "Asia/Kolkata", wakeUpTime: "06:30", bedtime: "23:00", workStartTime: "09:00", workEndTime: "17:00", workDays: ["MONDAY", "TUESDAY"], priorities: ["Health"], focusSessionMinutes: 50, breakDurationMinutes: 10, planningStyle: "STRUCTURED" };
  assert((await call("/api/profile/routine", "PATCH", a.cookie, { ...routine, preferredName: "Hijack" })).status === 400, "The routine endpoint accepted a preferred name.");
  const savedRoutine = await call("/api/profile/routine", "PATCH", a.cookie, routine);
  assert(savedRoutine.status === 200, `Routine save failed (${savedRoutine.status}).`);
  const profileA = await prisma.userProfile.findUniqueOrThrow({ where: { userId: a.id } });
  assert(profileA.wakeUpTime === "06:30" && profileA.planningStyle === "STRUCTURED" && profileA.preferredName === "Countess Ada", "Routine save did not persist, or changed the preferred name.");

  console.log("Account smoke checks passed: authorization (anonymous and no entitlement), tenant isolation, account details and greeting, photo validation/override/fallback, context versioning and bounds, routine separation.");
} finally {
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
}
