import assert from "node:assert/strict";
import test from "node:test";
import { reminderChange, reminderDraftFrom, reminderLabel } from "@/lib/reminder-form";
import { localDateTimeToIso } from "@/lib/calendar-date";

test("a stored reminder shows on the owner's clock, and round-trips through the server's conversion", () => {
  const iso = localDateTimeToIso("2026-11-26", "09:30", "Asia/Kolkata");
  assert.deepEqual(reminderDraftFrom(iso, "Asia/Kolkata"), { date: "2026-11-26", time: "09:30" });
  assert.deepEqual(reminderDraftFrom(iso, "UTC"), { date: "2026-11-26", time: "04:00" });
  assert.deepEqual(reminderDraftFrom(null, "UTC"), { date: "", time: "" });
});

test("only a changed, complete reminder is sent; clearing removes it; half-filled is an error", () => {
  const saved = { date: "2026-11-26", time: "09:30" };
  assert.deepEqual(reminderChange(saved, saved), {});
  assert.deepEqual(reminderChange({ date: "2026-11-27", time: "09:30" }, saved), { reminder: { date: "2026-11-27", time: "09:30" } });
  assert.deepEqual(reminderChange({ date: "", time: "" }, saved), { reminder: null });
  assert.deepEqual(reminderChange({ date: "", time: "" }, { date: "", time: "" }), {});
  assert.ok("error" in reminderChange({ date: "2026-11-27", time: "" }, saved));
});

test("the label reads on the owner's clock", () => {
  assert.equal(reminderLabel(localDateTimeToIso("2026-11-26", "21:05", "Asia/Kolkata"), "Asia/Kolkata"), "Remind 21:05 · 26 Nov");
});
