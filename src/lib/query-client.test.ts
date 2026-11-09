import test from "node:test";
import assert from "node:assert/strict";
import { createQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

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
