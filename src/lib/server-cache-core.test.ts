import test from "node:test";
import assert from "node:assert/strict";
import { CacheCoordinator, resolveRedisConfiguration, stableStringify, type CacheBackend } from "@/lib/server-cache-core";

class MemoryBackend implements CacheBackend {
  values = new Map<string, string>();
  versions = new Map<string, number>();
  fail = false;
  async get(key: string) { if (this.fail) throw new Error("offline"); return this.values.get(key) ?? null; }
  async set(key: string, value: string) { if (this.fail) throw new Error("offline"); this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
  async getVersions(tags: string[]) { if (this.fail) throw new Error("offline"); return tags.map((tag) => this.versions.get(tag) ?? 0); }
  async bumpTags(tags: string[]) { if (this.fail) throw new Error("offline"); for (const tag of tags) this.versions.set(tag, (this.versions.get(tag) ?? 0) + 1); }
  async healthCheck() { return !this.fail; }
}

const request = (compute: () => Promise<{ value: number }>, overrides: Partial<Parameters<CacheCoordinator["getOrCompute"]>[0]> = {}) => ({
  namespace: "task" as const, scope: { userId: "u1", organizationId: "o1" }, query: { page: 1, filters: { status: "TODO" } }, tags: ["work:org:o1:tasks"], ttlSeconds: 20, compute, ...overrides,
});

test("auto-enables with both Upstash variables and honors explicit disable", () => {
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "secret" };
  assert.equal(resolveRedisConfiguration(env).enabled, true);
  assert.equal(resolveRedisConfiguration({ ...env, REDIS_ENABLED: "false" }).enabled, false);
  assert.equal(resolveRedisConfiguration({ UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL, REDIS_ENABLED: "true" }).missing, true);
  assert.equal(resolveRedisConfiguration({ ...env, UPSTASH_REDIS_REST_URL: "http://insecure.example" }).invalidUrl, true);
});

test("normalizes object key order and scopes cache key by user and organization", async () => {
  assert.equal(stableStringify({ z: 1, a: 2 }), stableStringify({ a: 2, z: 1 }));
  const backend = new MemoryBackend(); const cache = new CacheCoordinator(backend, (value) => value);
  let calls = 0;
  const first = await cache.getOrCompute(request(async () => ({ value: ++calls })));
  const second = await cache.getOrCompute(request(async () => ({ value: ++calls })));
  const otherUser = await cache.getOrCompute(request(async () => ({ value: ++calls }), { scope: { userId: "u2", organizationId: "o1" } }));
  assert.deepEqual([first, second, otherUser], [{ value: 1 }, { value: 1 }, { value: 2 }]);
  assert.equal(cache.metrics.hits, 1);
});

test("coalesces concurrent identical misses and stores the result", async () => {
  const backend = new MemoryBackend(); const cache = new CacheCoordinator(backend, (value) => value);
  let calls = 0;
  const compute = async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 10)); return { value: 7 }; };
  const [left, right] = await Promise.all([cache.getOrCompute(request(compute)), cache.getOrCompute(request(compute))]);
  assert.deepEqual(left, right);
  assert.equal(calls, 1);
  assert.equal(cache.metrics.coalesced, 1);
});

test("bypass and unavailable cache still compute successfully", async () => {
  const backend = new MemoryBackend(); const cache = new CacheCoordinator(backend, (value) => value);
  let calls = 0;
  const forced = await cache.getOrCompute(request(async () => ({ value: ++calls }), { bypassCache: true }));
  backend.fail = true;
  const fallback = await cache.getOrCompute(request(async () => ({ value: ++calls })));
  assert.deepEqual([forced, fallback], [{ value: 1 }, { value: 2 }]);
  assert.ok(cache.metrics.errors >= 1);
});

test("tag invalidation advances the version so old entries cannot be reused", async () => {
  const backend = new MemoryBackend(); const cache = new CacheCoordinator(backend, (value) => value);
  let calls = 0;
  const run = () => cache.getOrCompute(request(async () => ({ value: ++calls })));
  await run(); await run();
  await cache.invalidate(["work:org:o1:tasks"]);
  await run();
  assert.equal(calls, 2);
  assert.equal(cache.metrics.invalidations, 1);
});
