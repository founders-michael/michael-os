import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AutosaveController } from "@/lib/autosave-controller";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("autosave coalesces rapid edits and saves the latest value", async () => {
  const saved: string[] = [];
  const controller = new AutosaveController<string>(async (value) => { saved.push(value); }, 10);
  controller.schedule("first"); controller.schedule("latest");
  await wait(25);
  assert.deepEqual(saved, ["latest"]);
  assert.equal(controller.getStatus(), "saved");
  controller.dispose();
});

test("autosave preserves a failed draft and supports retry", async () => {
  let attempts = 0;
  const controller = new AutosaveController<string>(async (value) => { attempts++; if (attempts === 1) throw new Error("offline"); assert.equal(value, "draft"); }, 1000);
  controller.schedule("draft");
  await controller.flush();
  assert.equal(controller.getStatus(), "error");
  await controller.retry();
  assert.equal(controller.getStatus(), "saved");
  assert.equal(attempts, 2);
  controller.dispose();
});

test("autosave does not retry a server conflict as if it were a network error", async () => {
  const controller = new AutosaveController<string>(async () => { throw Object.assign(new Error("conflict"), { status: 409 }); }, 1000);
  controller.schedule("draft");
  await controller.flush();
  assert.equal(controller.getStatus(), "conflict");
  await controller.retry();
  assert.equal(controller.getStatus(), "conflict");
  controller.dispose();
});

test("edits made during an in-flight save are serialized and the latest draft wins", async () => {
  const saved: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstSave = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const controller = new AutosaveController<string>(async (value) => {
    saved.push(value);
    if (value === "first") await firstSave;
  }, 1000);
  controller.schedule("first");
  const flushing = controller.flush();
  await Promise.resolve();
  controller.schedule("latest");
  releaseFirst?.();
  await flushing;
  assert.deepEqual(saved, ["first", "latest"]);
  assert.equal(controller.getStatus(), "saved");
  controller.dispose();
});

test("disposing cancels a scheduled autosave", async () => {
  let calls = 0;
  const controller = new AutosaveController<string>(async () => { calls++; }, 10);
  controller.schedule("draft"); controller.dispose();
  await wait(20);
  assert.equal(calls, 0);
});
