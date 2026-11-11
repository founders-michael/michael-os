/**
 * Orchestrates the authorization integration suite against a DISPOSABLE
 * database: drops and recreates a local Postgres database, applies migrations,
 * boots a Next server wired to it through the local Neon bridge, runs
 * scripts/authorization-smoke.ts, then tears the server down.
 *
 * It never reads DATABASE_URL from .env.local, so it cannot target the shared
 * Neon dev branch.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const DB_NAME = process.env.AUTHZ_TEST_DB ?? "michaelos_authz_test";
const PG_HOST = process.env.AUTHZ_PG_HOST ?? "127.0.0.1";
const PG_PORT = process.env.AUTHZ_PG_PORT ?? "5432";
const PG_USER = process.env.AUTHZ_PG_USER ?? process.env.USER ?? "postgres";
const adminUrl = `postgresql://${encodeURIComponent(PG_USER)}@${PG_HOST}:${PG_PORT}/postgres`;
const testUrl = `postgresql://${encodeURIComponent(PG_USER)}@${PG_HOST}:${PG_PORT}/${DB_NAME}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url, child, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}`);
    try {
      // Any HTTP answer means the server is accepting connections.
      await fetch(url, { method: "GET" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

console.log(`[authz] provisioning disposable database ${DB_NAME} on ${PG_HOST}:${PG_PORT}`);
run("psql", ["-d", adminUrl, "-v", "ON_ERROR_STOP=1", "-q",
  "-c", `DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`,
  "-c", `CREATE DATABASE ${DB_NAME}`]);

console.log("[authz] applying migrations");
run("npx", ["prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: testUrl, DATABASE_URL_UNPOOLED: testUrl },
});

/**
 * Next refuses a second dev server in the same directory, and a developer's own
 * dev server is usually already running against the shared branch. Run the test
 * server from an isolated copy instead, deliberately WITHOUT .env.local so it
 * cannot resolve the shared Neon URL.
 */
function prepareIsolatedApp() {
  const root = process.cwd();
  const runDir = process.env.AUTHZ_RUN_DIR ?? path.join(os.tmpdir(), "michaelos-authz-run");
  const modules = path.join(runDir, "node_modules");

  // Turbopack refuses to compile packages whose real path sits outside its
  // workspace root, so node_modules must really live here. On APFS this is a
  // copy-on-write clone, so it costs seconds and almost no disk.
  const modulesReady = fs.existsSync(path.join(modules, "next", "package.json"));
  if (!modulesReady) {
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.mkdirSync(runDir, { recursive: true });
    console.log("[authz] cloning node_modules into the isolated copy (first run only)");
    const clone = spawnSync("cp", ["-Rc", path.join(root, "node_modules"), modules], { stdio: "inherit" });
    if (clone.status !== 0) {
      const fallback = spawnSync("cp", ["-R", path.join(root, "node_modules"), modules], { stdio: "inherit" });
      if (fallback.status !== 0) throw new Error("Could not copy node_modules into the isolated app directory.");
    }
  }
  fs.mkdirSync(runDir, { recursive: true });

  const entries = [
    "package.json", "tsconfig.json", "next.config.ts", "next-env.d.ts",
    "prisma7.config.ts", "eslint.config.mjs", "components.json",
    "src", "prisma", "scripts", "public", "shared",
  ];
  for (const entry of entries) {
    const from = path.join(root, entry);
    const to = path.join(runDir, entry);
    if (!fs.existsSync(from)) continue;
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
  }
  // No .env.local in the copy: the test server must not be able to resolve the
  // shared Neon connection string even by accident.
  fs.rmSync(path.join(runDir, ".env.local"), { force: true });

  // The bridge configures the driver's module-level neonConfig. Next would
  // otherwise bundle its own copy of the driver into the server build, whose
  // config object is a different instance and would still dial Neon. Marking it
  // external keeps one shared instance. Patched in the throwaway copy only.
  const configPath = path.join(runDir, "next.config.ts");
  const original = fs.readFileSync(configPath, "utf8");
  const marker = "const nextConfig: NextConfig = {";
  if (!original.includes(marker)) throw new Error("Could not patch next.config.ts for the isolated test app.");
  fs.writeFileSync(
    configPath,
    original.replace(marker, `${marker}\n  serverExternalPackages: ["@neondatabase/serverless", "@prisma/adapter-neon"],`),
  );
  return runDir;
}

const runDir = prepareIsolatedApp();
console.log(`[authz] isolated app copy at ${runDir}`);

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const serverEnv = {
  ...process.env,
  DATABASE_URL: testUrl,
  DATABASE_URL_UNPOOLED: testUrl,
  BETTER_AUTH_URL: baseUrl,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex"),
  // Keep the shared Upstash cache out of the test run entirely.
  REDIS_ENABLED: "false",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  // The AI route must reach its authorization checks; no provider call is made
  // because every assertion is refused before the provider is contacted.
  //
  // AUTHZ_LIVE_MODEL=true instead passes a locally hosted provider through, so
  // a live-model suite can run against the disposable database. Never used for
  // the authorization suites, which must not depend on a model being present.
  AI_ENABLED: "true",
  ...(process.env.AUTHZ_LIVE_MODEL === "true"
    ? {
        AI_PROVIDER: process.env.AI_PROVIDER ?? "ollama",
        OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
        OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? "qwen2.5",
        AI_REQUEST_TIMEOUT_MS: process.env.AI_REQUEST_TIMEOUT_MS ?? "120000",
      }
    : {
        AI_PROVIDER: "gemini",
        GEMINI_API_KEY: "test-key-not-used",
        GEMINI_DATA_TIER: "unpaid",
      }),
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ./scripts/test-support/neon-local-bridge.mjs`.trim(),
};

console.log(`[authz] starting Next dev server on ${baseUrl}`);
const server = spawn("npx", ["next", "dev", "--port", String(port), "--hostname", "127.0.0.1"], {
  cwd: runDir,
  env: serverEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
const serverLog = [];
for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    serverLog.push(chunk);
    if (process.env.AUTHZ_VERBOSE === "true") process.stdout.write(`[next] ${chunk}`);
  });
}

let exitCode = 1;
try {
  await waitForServer(baseUrl, server);
  const suites = (process.env.AUTHZ_SUITES ?? "scripts/authorization-smoke.ts,scripts/milestone-smoke.ts,scripts/dependency-smoke.ts,scripts/delivery-risk-smoke.ts,scripts/conversation-smoke.ts").split(",").filter(Boolean);
  exitCode = 0;
  for (const suite of suites) {
    console.log(`\n[authz] server ready; running ${suite}\n`);
    const result = spawnSync("npx", ["tsx", "--import", "./scripts/test-support/neon-local-bridge.mjs", suite], {
      stdio: "inherit",
      env: { ...serverEnv, DATABASE_URL: testUrl },
    });
    if ((result.status ?? 1) !== 0) exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(`[authz] ${error instanceof Error ? error.message : String(error)}`);
  console.error(serverLog.join("").slice(-4000));
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (server.exitCode === null) server.kill("SIGKILL");
  console.log(`\n[authz] server stopped; disposable database ${DB_NAME} left in place for inspection`);
}

process.exit(exitCode);
