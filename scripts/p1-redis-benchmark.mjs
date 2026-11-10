import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

config({ path: ".env.local", override: true, quiet: true });

if (process.env.P1_CACHE_BENCHMARK_ALLOW_TEMP_KEYS !== "1") {
  console.error("Set P1_CACHE_BENCHMARK_ALLOW_TEMP_KEYS=1 only after confirming this is a disposable development/test Redis database.");
  process.exit(2);
}

const configuredUrl = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!configuredUrl || !token || !configuredUrl.startsWith("https://")) {
  console.error("Upstash REST configuration is missing or does not use HTTPS.");
  process.exit(2);
}

const baseUrl = configuredUrl.replace(/\/+$/, "");
const prefix = `michaelos:p1.4:benchmark:${randomUUID()}`;
const temporaryKeys = new Set();
const startedAt = performance.now();

async function pipeline(commands) {
  const response = await fetch(`${baseUrl}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(4_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Upstash REST returned HTTP ${response.status}.`);
  const result = await response.json();
  if (!Array.isArray(result) || result.some((item) => item?.error)) {
    throw new Error("Upstash returned an invalid or failed pipeline response.");
  }
  return result.map((item) => item?.result ?? null);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

const results = {};
try {
  results.ping = (await pipeline([["PING"]]))[0] === "PONG" ? "PASS" : "FAIL";

  const valueKey = `${prefix}:value`;
  temporaryKeys.add(valueKey);
  const writeRead = await pipeline([
    ["SET", valueKey, "temporary-benchmark-value", "EX", "90"],
    ["GET", valueKey],
  ]);
  results.setGet = writeRead[1] === "temporary-benchmark-value" ? "PASS" : "FAIL";

  const ttlKey = `${prefix}:ttl`;
  temporaryKeys.add(ttlKey);
  const ttl = await pipeline([
    ["SET", ttlKey, "expires", "EX", "2"],
    ["TTL", ttlKey],
  ]);
  results.ttlInitiallyPresent = Number(ttl[1]) > 0 ? "PASS" : "FAIL";
  await delay(2_200);
  results.ttlExpires = (await pipeline([["GET", ttlKey]]))[0] === null ? "PASS" : "FAIL";

  const tagKey = `${prefix}:tag-version`;
  const initialVersion = Number((await pipeline([["GET", tagKey]]))[0] ?? 0);
  const oldEntry = `${prefix}:entry:${initialVersion}`;
  temporaryKeys.add(tagKey);
  temporaryKeys.add(oldEntry);
  await pipeline([["SET", oldEntry, "tagged", "EX", "90"]]);
  const nextVersion = Number((await pipeline([["INCR", tagKey]]))[0]);
  const nextEntry = `${prefix}:entry:${nextVersion}`;
  temporaryKeys.add(nextEntry);
  results.tagVersionInvalidation = nextVersion === initialVersion + 1 && (await pipeline([["GET", nextEntry]]))[0] === null ? "PASS" : "FAIL";

  const sampleCount = Math.max(5, Math.min(100, Number(process.env.P1_CACHE_BENCHMARK_SAMPLES) || 24));
  const coldMs = [];
  const warmMs = [];
  for (let index = 0; index < sampleCount; index++) {
    const key = `${prefix}:sample:${index}`;
    temporaryKeys.add(key);
    const coldStart = performance.now();
    await pipeline([["GET", key]]);
    await pipeline([["SET", key, "small-benchmark-payload", "EX", "90"]]);
    coldMs.push(performance.now() - coldStart);

    const warmStart = performance.now();
    const warmValue = (await pipeline([["GET", key]]))[0];
    warmMs.push(performance.now() - warmStart);
    if (warmValue !== "small-benchmark-payload") throw new Error("Warm benchmark read did not return the stored value.");
  }

  results.redisPrimitiveLatency = {
    samples: sampleCount,
    coldMissMedianMs: Number(percentile(coldMs, 0.5).toFixed(2)),
    coldMissP95Ms: Number(percentile(coldMs, 0.95).toFixed(2)),
    warmHitMedianMs: Number(percentile(warmMs, 0.5).toFixed(2)),
    warmHitP95Ms: Number(percentile(warmMs, 0.95).toFixed(2)),
    definition: "cold miss is GET+SET; warm hit is GET; excludes application/database computation",
  };
} catch (error) {
  results.error = error instanceof Error ? error.message : "Unknown benchmark failure.";
} finally {
  if (temporaryKeys.size) {
    try {
      await pipeline([["DEL", ...temporaryKeys]]);
      results.temporaryKeyCleanup = "PASS";
    } catch {
      results.temporaryKeyCleanup = "FAIL";
    }
  } else {
    results.temporaryKeyCleanup = "NOT_NEEDED";
  }
}

results.elapsedMs = Number((performance.now() - startedAt).toFixed(2));
console.log(JSON.stringify({ results }, null, 2));
if (Object.values(results).some((value) => value === "FAIL") || results.error) process.exitCode = 1;
