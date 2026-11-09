import assert from "node:assert/strict";
import test from "node:test";
import { createNotifications, type NotificationId } from "./notifications";

test("notification kinds and descriptions map to Sonner's corresponding methods", () => {
  const calls: Array<{ type: string; message?: string; options?: unknown }> = [];
  const adapter = Object.fromEntries(["success", "error", "warning", "info", "loading"].map((type) => [type, (message: string, options?: unknown) => { calls.push({ type, message, options }); return calls.length; }])) as never;
  const notify = createNotifications(adapter);
  notify.success("Saved", "Changes are ready");
  notify.error("Could not save");
  notify.warning("Session ending soon");
  notify.info("Update available");
  assert.deepEqual(calls.map((call) => call.type), ["success", "error", "warning", "info"]);
  assert.deepEqual(calls[0]?.options, { description: "Changes are ready" });
});

test("loading notifications can be updated or dismissed by their id", () => {
  const calls: Array<{ type: string; id?: NotificationId; message?: string }> = [];
  const adapter = {
    success: (message: string, options?: { id?: NotificationId }) => { calls.push({ type: "success", id: options?.id, message }); return "success"; },
    error: (message: string, options?: { id?: NotificationId }) => { calls.push({ type: "error", id: options?.id, message }); return "error"; },
    warning: (message: string, options?: { id?: NotificationId }) => { calls.push({ type: "warning", id: options?.id, message }); return "warning"; },
    info: (message: string, options?: { id?: NotificationId }) => { calls.push({ type: "info", id: options?.id, message }); return "info"; },
    loading: (message: string) => { calls.push({ type: "loading", message }); return "request-1"; },
    dismiss: (id?: NotificationId) => { calls.push({ type: "dismiss", id }); return id ?? "all"; },
  };
  const notify = createNotifications(adapter);
  const id = notify.loading("Saving");
  notify.update(id, "success", "Saved");
  notify.update(id, "error", "Failed");
  notify.dismiss(id);
  assert.deepEqual(calls, [
    { type: "loading", message: "Saving" },
    { type: "success", id: "request-1", message: "Saved" },
    { type: "error", id: "request-1", message: "Failed" },
    { type: "dismiss", id: "request-1" },
  ]);
});
