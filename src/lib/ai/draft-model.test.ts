import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDraft, draftRequestBody, fieldsFor, isRecordDraft, missingRequiredFields,
} from "@/lib/ai/draft-model";

const TZ = "Asia/Kolkata";

test("a task draft keeps what the user gave and reports nothing missing", () => {
  const draft = buildDraft("task", { title: "Call the dentist", priority: "HIGH", dueDate: "2026-11-20" }, TZ);
  assert.equal(draft.values.title, "Call the dentist");
  assert.equal(draft.values.priority, "HIGH");
  assert.equal(draft.values.dueDate, "2026-11-20");
  assert.deepEqual(draft.missing, []);
  assert.equal(draft.ready, true);
  assert.equal(draft.endpoint, "/api/tasks");
});

test("a task with no title is not ready and names the missing field", () => {
  const draft = buildDraft("task", { priority: "LOW" }, TZ);
  assert.deepEqual(draft.missing, ["title"]);
  assert.equal(draft.ready, false);
  // A draft that is not ready cannot produce a request body.
  assert.equal(draftRequestBody(draft), null);
});

test("the schema's own default is applied rather than left blank", () => {
  // taskCreateSchema defaults priority to MEDIUM, so the form opens on MEDIUM.
  assert.equal(buildDraft("task", { title: "Something" }, TZ).values.priority, "MEDIUM");
  assert.equal(buildDraft("goal", { title: "Run a 10k" }, TZ).values.progress, 0);
});

test("an invented enum value is dropped, never coerced to a valid one", () => {
  // A model writing URGENT must leave priority for the user to choose rather
  // than silently becoming LOW because it sorts first.
  const draft = buildDraft("task", { title: "Ship it", priority: "URGENT" }, TZ);
  assert.equal(draft.values.priority, "MEDIUM", "falls back to the schema default, not to the invented value");
  assert.notEqual(draft.values.priority, "URGENT");
});

test("an out-of-range number is dropped rather than clamped", () => {
  // Clamping an invented "8 hours" to 1440 would show a number nobody chose.
  const draft = buildDraft("task", { title: "Deep work", estimatedDurationMinutes: 5000 }, TZ);
  assert.equal(draft.values.estimatedDurationMinutes, undefined);
  const low = buildDraft("task", { title: "Deep work", estimatedDurationMinutes: 2 }, TZ);
  assert.equal(low.values.estimatedDurationMinutes, undefined);
  const fine = buildDraft("task", { title: "Deep work", estimatedDurationMinutes: 45 }, TZ);
  assert.equal(fine.values.estimatedDurationMinutes, 45);
});

test("a malformed date is dropped so the user picks one", () => {
  assert.equal(buildDraft("task", { title: "x", dueDate: "next Tuesday" }, TZ).values.dueDate, undefined);
  assert.equal(buildDraft("task", { title: "x", dueDate: "20-11-2026" }, TZ).values.dueDate, undefined);
});

test("unknown keys the model invents are discarded", () => {
  const draft = buildDraft("task", { title: "x", assignee: "bob", status: "COMPLETED" } as Record<string, unknown>, TZ);
  assert.equal("assignee" in draft.values, false);
  assert.equal("status" in draft.values, false);
});

test("a daily habit hides weekdays and sends none", () => {
  const draft = buildDraft("habit", { title: "Stretch", frequency: "DAILY", weekdays: [1, 2] }, TZ);
  // habitCreateSchema rejects weekdays on a DAILY habit, so they are cleared.
  assert.deepEqual(draft.values.weekdays, []);
  assert.equal(fieldsFor("habit", draft.values).some((field) => field.name === "weekdays"), false);
  assert.deepEqual(draftRequestBody(draft), { title: "Stretch", frequency: "DAILY", weekdays: [] });
});

test("a selected-days habit with no days chosen is not ready", () => {
  const draft = buildDraft("habit", { title: "Gym", frequency: "SELECTED_DAYS" }, TZ);
  assert.deepEqual(draft.missing, ["weekdays"]);
  assert.equal(draft.ready, false);
  assert.equal(fieldsFor("habit", draft.values).some((field) => field.name === "weekdays"), true);
});

test("weekdays are de-duplicated and sorted", () => {
  const draft = buildDraft("habit", { title: "Gym", frequency: "SELECTED_DAYS", weekdays: [5, 1, 1, 3] }, TZ);
  assert.deepEqual(draft.values.weekdays, [1, 3, 5]);
});

test("an out-of-range weekday is discarded", () => {
  const draft = buildDraft("habit", { title: "Gym", frequency: "SELECTED_DAYS", weekdays: [0, 8, 2] }, TZ);
  assert.deepEqual(draft.values.weekdays, [2]);
});

test("a calendar event needs a date and both times before it is ready", () => {
  const partial = buildDraft("calendarEvent", { title: "Dentist", date: "2026-11-20" }, TZ);
  assert.deepEqual(partial.missing, ["startTime", "endTime"]);
  assert.equal(partial.ready, false);
});

test("a calendar event converts local date and times to instants in the user's zone", () => {
  const draft = buildDraft("calendarEvent", {
    title: "Dentist", eventType: "COMMITMENT", date: "2026-11-20", startTime: "09:30", endTime: "10:15",
  }, TZ);
  const body = draftRequestBody(draft);
  assert.ok(body, "a complete event produces a body");
  // Asia/Kolkata is UTC+5:30, so 09:30 local is 04:00Z.
  assert.equal(String(body!.startAt).slice(0, 19), "2026-11-20T04:00:00");
  assert.equal(String(body!.endAt).slice(0, 19), "2026-11-20T04:45:00");
  assert.equal(body!.timeZone, TZ);
  // calendarEventCreateSchema only allows FLEXIBLE for a TASK_SESSION.
  assert.equal(body!.schedulingMode, "FIXED");
});

test("an event ending before it starts produces no body", () => {
  const draft = buildDraft("calendarEvent", {
    title: "Backwards", eventType: "COMMITMENT", date: "2026-11-20", startTime: "14:00", endTime: "09:00",
  }, TZ);
  // The form is complete, so `ready` is true, but the semantic check still refuses.
  assert.equal(draft.ready, true);
  assert.equal(draftRequestBody(draft), null);
});

test("a 24-hour time is accepted and padded; an impossible one is dropped", () => {
  assert.equal(buildDraft("calendarEvent", { title: "x", date: "2026-11-20", startTime: "9:05", endTime: "10:00" }, TZ).values.startTime, "09:05");
  assert.equal(buildDraft("calendarEvent", { title: "x", date: "2026-11-20", startTime: "25:00", endTime: "10:00" }, TZ).values.startTime, undefined);
});

test("an empty optional field is omitted from the body rather than sent as empty", () => {
  const draft = buildDraft("task", { title: "Tidy", description: "   " }, TZ);
  const body = draftRequestBody(draft);
  assert.equal("description" in body!, false);
});

test("the body only ever contains fields the create schema accepts", () => {
  const body = draftRequestBody(buildDraft("goal", { title: "Read more", category: "Learning", targetDate: "2026-12-31", progress: 10 }, TZ));
  assert.deepEqual(Object.keys(body!).sort(), ["category", "progress", "targetDate", "title"]);
});

test("missingRequiredFields agrees with the draft it was built from", () => {
  const draft = buildDraft("calendarEvent", { title: "Call" }, TZ);
  assert.deepEqual(missingRequiredFields(draft.kind, draft.values), draft.missing);
});

test("a draft is recognizable as a client payload", () => {
  assert.equal(isRecordDraft(buildDraft("task", { title: "x" }, TZ)), true);
  assert.equal(isRecordDraft({ approvalToken: "abc" }), false);
  assert.equal(isRecordDraft(null), false);
});
