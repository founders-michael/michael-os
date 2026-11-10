import test from "node:test";
import assert from "node:assert/strict";
import { createQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { normalizeQueryInput } from "@/lib/query-keys";
import { clearQueriesForContextChange } from "@/lib/query-context";

test("query client deduplicates identical in-flight requests", async () => {
  const client = createQueryClient();
  let calls = 0;
  const key = queryKeys.work.tasks("org-a", "user-a", { status: "TODO" });
  const queryFn = async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 5)); return [1, 2]; };
  const [first, second] = await Promise.all([
    client.fetchQuery({ queryKey: key, queryFn }),
    client.fetchQuery({ queryKey: key, queryFn }),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  client.clear();
});

test("personal query namespaces isolate users and work query namespaces isolate tenants", () => {
  assert.notDeepEqual(queryKeys.lifestyle.taskSummary("user-a"), queryKeys.lifestyle.taskSummary("user-b"));
  assert.notDeepEqual(queryKeys.work.capacity("org-a", "user-a"), queryKeys.work.capacity("org-b", "user-a"));
  assert.notDeepEqual(queryKeys.work.tasks("org-a", "user-a"), queryKeys.work.tasks("org-a", "user-b"));
});

test("query inputs normalize object key order and omit undefined values", () => {
  assert.deepEqual(normalizeQueryInput({ b: 2, a: 1, omitted: undefined }), normalizeQueryInput({ a: 1, b: 2 }));
  assert.notDeepEqual(queryKeys.work.tasks("org-a", "user-a", { status: "TODO" }), queryKeys.work.tasks("org-a", "user-a", { status: "DONE" }));
});

test("fresh query data is reused without another request", async () => {
  const client = createQueryClient();
  let calls = 0;
  const key = queryKeys.lifestyle.goals("user-a", { sort: "recent" });
  const queryFn = async () => ({ goals: ++calls });
  await client.fetchQuery({ queryKey: key, queryFn, staleTime: 60_000 });
  const second = await client.fetchQuery({ queryKey: key, queryFn, staleTime: 60_000 });
  assert.equal(calls, 1);
  assert.deepEqual(second, { goals: 1 });
  client.clear();
});

test("stale query data is recomputed and invalidation forces a refresh", async () => {
  const client = createQueryClient();
  let calls = 0;
  const key = queryKeys.work.capacity("org-a", "user-a", { from: "2026-11-10" });
  const queryFn = async () => ++calls;
  assert.equal(await client.fetchQuery({ queryKey: key, queryFn, staleTime: 1 }), 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await client.fetchQuery({ queryKey: key, queryFn, staleTime: 1 }), 2);
  await client.invalidateQueries({ queryKey: queryKeys.work.capacityRoot("org-a", "user-a") });
  assert.equal(await client.fetchQuery({ queryKey: key, queryFn, staleTime: 60_000 }), 3);
  client.clear();
});

test("organization switching clears WorkOS data but preserves LifestyleOS data", () => {
  const client = createQueryClient();
  const personalKey = queryKeys.lifestyle.taskSummary("user-a");
  const workKey = queryKeys.work.tasks("org-a", "user-a");
  client.setQueryData(personalKey, { outstanding: 2 });
  client.setQueryData(workKey, { tasks: ["private-work"] });

  clearQueriesForContextChange(client, { userId: "user-a", product: "work", organizationId: "org-a" }, { userId: "user-a", product: "work", organizationId: "org-b" });

  assert.deepEqual(client.getQueryData(personalKey), { outstanding: 2 });
  assert.equal(client.getQueryData(workKey), undefined);
  client.clear();
});

test("account switching clears all previous account data", () => {
  const client = createQueryClient();
  const key = queryKeys.lifestyle.taskSummary("user-a");
  client.setQueryData(key, { outstanding: 2 });
  clearQueriesForContextChange(client, { userId: "user-a", product: "lifestyle" }, { userId: "user-b", product: "lifestyle" });
  assert.equal(client.getQueryData(key), undefined);
});

test("authorization query errors evict the unsafe cached entry", async () => {
  const client = createQueryClient();
  const key = queryKeys.work.capacity("org-a", "user-a");
  client.setQueryData(key, { summary: "previously-authorized" });
  await assert.rejects(client.fetchQuery({ queryKey: key, staleTime: 0, queryFn: async () => { throw Object.assign(new Error("Denied"), { status: 403 }); } }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(client.getQueryData(key), undefined);
  client.clear();
});
