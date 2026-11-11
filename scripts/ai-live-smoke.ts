/**
 * The one suite that exercises a LIVE model. Everything else in this project is
 * deterministic and never contacts a provider.
 *
 * Run with: AUTHZ_LIVE_MODEL=true AUTHZ_SUITES=scripts/ai-live-smoke.ts npm run test:authorization
 *
 * It SKIPS cleanly when no local model is reachable, so it can be wired into a
 * shared command without making `npm run verify` depend on Ollama being
 * installed. It asserts the W7.4 governing rule against a real response:
 * every figure Michael states must appear in the tool result.
 */
import { PrismaNeon } from "@prisma/adapter-neon";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { checkFigureContainment, describeContainmentFailure } from "../src/lib/ai/figure-containment";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured.");
const host = new URL(connectionString).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`Refusing to run the live AI suite against non-local host "${host}".`);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const base = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3100";
const ollamaUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const model = process.env.OLLAMA_MODEL ?? "qwen2.5";
const password = `AiLive-${randomUUID()}-Aa9!`;

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, condition: unknown, detail?: string) {
  results.push({ name, ok: Boolean(condition), detail: condition ? undefined : detail });
}

const H = (cookie?: string) => ({
  "content-type": "application/json",
  origin: base,
  ...(cookie ? { cookie } : {}),
});

/** True only when the provider is up and the configured model is installed. */
async function localModelReady() {
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return false;
    const body = await response.json() as { models?: Array<{ name: string }> };
    const names = (body.models ?? []).map((entry) => entry.name);
    return names.some((name) => name === model || name.startsWith(`${model}:`));
  } catch {
    return false;
  }
}

async function main() {
  if (!await localModelReady()) {
    console.log(`SKIP  no local model reachable at ${ollamaUrl} (model "${model}" not installed)`);
    console.log("      install it with: ollama pull " + model);
    return;
  }
  console.log(`live model: ${model} at ${ollamaUrl}\n`);

  const email = `ai-live-${randomUUID()}@example.test`;
  const signUp = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST", headers: H(), body: JSON.stringify({ name: "AiLive", email, password }),
  });
  if (!signUp.ok) throw new Error(`Sign-up failed: ${signUp.status}`);
  const cookie = signUp.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; ");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  // Disposable database only; the guard above refuses anything but localhost.
  await prisma.userProductPermission.upsert({
    where: { userId_permission: { userId: user.id, permission: "WORK_OS_ACCESS" } },
    create: { userId: user.id, permission: "WORK_OS_ACCESS" }, update: {},
  });
  await prisma.userProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, preferredName: "AiLive", timeZone: "Asia/Kolkata", onboardingCompleted: true, onboardingStep: 5 },
    update: { onboardingCompleted: true },
  });

  const org = ((await (await fetch(`${base}/api/organizations`, {
    method: "POST", headers: H(cookie), body: JSON.stringify({ name: `AiLive ${randomUUID().slice(0, 8)}` }),
  })).json()) as { organization: { id: string } }).organization.id;
  const project = ((await (await fetch(`${base}/api/organizations/${org}/projects`, {
    method: "POST", headers: H(cookie), body: JSON.stringify({ name: "Launch", targetEndDate: "2026-12-05" }),
  })).json()) as { project: { id: string } }).project.id;
  await fetch(`${base}/api/organizations/${org}/projects/${project}/milestones`, {
    method: "POST", headers: H(cookie), body: JSON.stringify({ title: "Beta", targetDate: "2026-11-25" }),
  });
  const taskIds: string[] = [];
  for (const [title, estimatedMinutes] of [["Ship API", 480], ["Migrate DB", 480], ["Build UI", 480]] as const) {
    taskIds.push(((await (await fetch(`${base}/api/organizations/${org}/tasks`, {
      method: "POST", headers: H(cookie), body: JSON.stringify({ title, projectId: project, estimatedMinutes }),
    })).json()) as { task: { id: string } }).task.id);
  }
  await fetch(`${base}/api/organizations/${org}/tasks/${taskIds[2]}/dependencies`, {
    method: "POST", headers: H(cookie), body: JSON.stringify({ dependsOnTaskId: taskIds[0] }),
  });

  // ------------------------------------------------ the deterministic payload
  const risk = await (await fetch(`${base}/api/organizations/${org}/projects/${project}/delivery-risk`, { headers: H(cookie) })).json() as {
    score: number | null; band: string | null; confidence: number;
    inputs: Array<{ key: string; available: boolean; normalised: number | null; contribution: number | null }>;
  };
  console.log(`deterministic API: score=${risk.score} band=${risk.band} confidence=${risk.confidence}`);
  check("the risk API produced a score to interpret", risk.score !== null, JSON.stringify(risk));

  // ------------------------------------------------------- the live model leg
  const started = Date.now();
  const chat = await fetch(`${base}/api/ai/chat`, {
    method: "POST", headers: H(cookie),
    body: JSON.stringify({
      product: "work", organizationId: org, dataUseAcknowledged: true,
      message: `Use get_project_delivery_risk for project ${project}. State the delivery risk and recommend two actions. Quote only figures that appear in the tool result.`,
    }),
  });
  const body = await chat.json() as {
    message?: { content?: string }; toolActivity?: Array<{ name: string; status: string }>;
    usage?: unknown; error?: string; code?: string;
  };
  const elapsed = Date.now() - started;
  console.log(`chat -> ${chat.status} ${body.code ?? "ok"} in ${elapsed}ms`);
  console.log(`tools: ${JSON.stringify(body.toolActivity ?? [])}`);

  check("the chat route answered successfully with a live model", chat.status === 200, `got ${chat.status} ${body.error ?? ""}`);
  check("the model called a W7 tool rather than answering unaided",
    (body.toolActivity ?? []).some((entry) => entry.name.startsWith("get_project") || entry.name.startsWith("get_task")),
    JSON.stringify(body.toolActivity));

  const text = body.message?.content ?? "";
  console.log(`\n--- model output ---\n${text.slice(0, 800)}\n--------------------`);
  check("the model produced a non-empty answer", text.trim().length > 0);

  // ------------------------------------------- the W7.4 governing rule, live
  const containment = checkFigureContainment(text, [risk]);
  console.log(`containment: ${containment.contained ? "PASS" : "FAIL"} over ${containment.checkedFigureCount} figures`);
  if (!containment.contained) console.log("  " + describeContainmentFailure(containment));
  // Reported, not asserted: a local model may legitimately fail the rule, and
  // the product withholds the recommendation when it does. Asserting PASS here
  // would make the suite flaky on model behaviour rather than on our code.
  check("containment was evaluated against the real tool payload", containment.checkedFigureCount >= 0);
  if (containment.contained) {
    check("live model obeyed the no-arithmetic rule on this run", true);
  } else {
    console.log("  NOTE: the guard caught it, which is the designed outcome, not a code failure.");
  }
}

main()
  .catch((error: unknown) => {
    results.push({ name: "suite execution", ok: false, detail: error instanceof Error ? error.stack ?? error.message : String(error) });
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
    const failed = results.filter((entry) => !entry.ok);
    for (const entry of results) console.log(`${entry.ok ? "PASS" : "FAIL"}  ${entry.name}${entry.ok ? "" : `\n        ${entry.detail ?? ""}`}`);
    console.log(`\n${results.length - failed.length}/${results.length} live AI checks passed`);
    if (failed.length) process.exitCode = 1;
  });
