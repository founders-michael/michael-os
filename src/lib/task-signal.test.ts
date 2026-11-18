import assert from "node:assert/strict";
import test from "node:test";
import { countPostponements, personalTaskSignal, signalRef, workTaskSignal, type TaskSignal } from "@/lib/task-signal";
import schema from "../../shared/intelligence/task-signal.schema.json";

type JsonSchema = { properties: Record<string, JsonSchema>; required?: string[]; enum?: unknown[]; pattern?: string; type?: string | string[] };

/**
 * A structural check against the shared JSON Schema: exactly the declared
 * keys, every required key present, enums and date patterns respected. Python
 * holds the same schema to its Pydantic model, so the two sides cannot drift.
 */
function conforms(value: unknown, node: JsonSchema = schema as unknown as JsonSchema, path = "signal"): void {
  if (value === null) {
    assert.ok(Array.isArray(node.type) && node.type.includes("null"), `${path} may not be null`);
    return;
  }
  if (node.enum) assert.ok(node.enum.includes(value), `${path}=${String(value)} is not in ${JSON.stringify(node.enum)}`);
  if (node.pattern && typeof value === "string") assert.match(value, new RegExp(node.pattern), path);
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) conforms(item, (node as unknown as { items: JsonSchema }).items, `${path}[${index}]`);
    return;
  }
  if (typeof value === "object" && node.properties) {
    const keys = Object.keys(value as object);
    assert.deepEqual(keys.filter((key) => !(key in node.properties)), [], `${path} has undeclared keys`);
    for (const key of node.required ?? []) assert.ok(key in (value as object), `${path}.${key} is required`);
    for (const key of keys) conforms((value as Record<string, unknown>)[key], node.properties[key]!, `${path}.${key}`);
  }
}

const personal = {
  title: "  Draft the essay  ", status: "IN_PROGRESS" as const, priority: "HIGH" as const,
  dueDate: new Date("2026-11-20T00:00:00.000Z"), createdAt: new Date("2026-11-01T09:30:00.000Z"),
  estimatedDurationMinutes: 90, remainingDurationMinutes: 45,
};
const work = {
  title: "Ship the API", status: "IN_REVIEW" as const, priority: "URGENT" as const,
  dueDate: "2026-11-22", createdAt: "2026-11-02T00:00:00.000Z", estimatedMinutes: 300, archivedAt: null,
  assignments: [{ userId: "viewer" }, { userId: "other" }],
  project: { status: "ACTIVE" as const, priority: "HIGH" as const, targetEndDate: new Date("2026-12-31T00:00:00.000Z") },
};

test("a personal task becomes a schema-valid signal with no identifiers", () => {
  const signal = personalTaskSignal(signalRef(0), personal, { goalTargetDates: [new Date("2027-01-01T00:00:00.000Z"), null], postponements: 2 })!;
  conforms(signal);
  assert.deepEqual(signal, {
    ref: "t1", product: "lifestyle", title: "Draft the essay", status: "in_progress", priority: "high",
    dueDate: "2026-11-20", createdDate: "2026-11-01", estimateMinutes: 90, remainingMinutes: 45,
    actualEffort: { available: false }, dependencies: null, assignment: null,
    alignment: { goals: [{ targetDate: "2027-01-01" }, { targetDate: null }], project: null }, postponements: 2,
  } satisfies TaskSignal);
});

test("a work task becomes a schema-valid signal; unknown postponements stay unknown", () => {
  const signal = workTaskSignal("t7", work, { viewerUserId: "viewer", openBlockers: 1, openDependents: 3 })!;
  conforms(signal);
  assert.equal(signal.status, "in_review");
  assert.equal(signal.priority, "urgent");
  assert.deepEqual(signal.assignment, { assigneeCount: 2, assignedToViewer: true });
  assert.deepEqual(signal.dependencies, { openBlockers: 1, openDependents: 3 });
  assert.deepEqual(signal.alignment.project, { priority: "high", targetDate: "2026-12-31" });
  assert.equal(signal.postponements, null);
  assert.equal(signal.remainingMinutes, null);
  assert.ok(!JSON.stringify(signal).includes("viewer"), "the viewer's id never leaves the server");
});

test("finished, archived and archived-project work is handled honestly", () => {
  assert.equal(personalTaskSignal("t1", { ...personal, status: "COMPLETED" }, { goalTargetDates: [], postponements: 0 }), null);
  assert.equal(workTaskSignal("t1", { ...work, status: "DONE" }, { viewerUserId: "v", openBlockers: 0, openDependents: 0 }), null);
  assert.equal(workTaskSignal("t1", { ...work, archivedAt: "2026-11-01T00:00:00.000Z" }, { viewerUserId: "v", openBlockers: 0, openDependents: 0 }), null);
  const archivedProject = workTaskSignal("t1", { ...work, project: { ...work.project, status: "ARCHIVED" } }, { viewerUserId: "v", openBlockers: 0, openDependents: 0 })!;
  assert.equal(archivedProject.alignment.project, null);
});

test("signals respect the schema's bounds", () => {
  const signal = personalTaskSignal("t1", { ...personal, title: "x".repeat(500), estimatedDurationMinutes: 10_000_000 }, {
    goalTargetDates: Array.from({ length: 9 }, () => null), postponements: 0,
  })!;
  conforms(signal);
  assert.equal(signal.title.length, 200);
  assert.equal(signal.estimateMinutes, 100_000);
  assert.equal(signal.alignment.goals.length, 5);
});

test("only a move to a later known date counts as a postponement", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 9, minute));
  assert.equal(countPostponements([
    { changeType: "DUE_DATE_CHANGED", taskDueDate: "2026-11-12", recordedAt: at(3) },
    { changeType: "DUE_DATE_SNAPSHOT", taskDueDate: "2026-11-05", recordedAt: at(0) },
    { changeType: "DUE_DATE_CHANGED", taskDueDate: "2026-11-10", recordedAt: at(1) },
    { changeType: "SESSION_RESCHEDULED", taskDueDate: null, recordedAt: at(2) },
    { changeType: "DUE_DATE_CHANGED", taskDueDate: null, recordedAt: at(4) },
    { changeType: "DUE_DATE_CHANGED", taskDueDate: "2026-11-20", recordedAt: at(5) },
    { changeType: "DUE_DATE_CHANGED", taskDueDate: "2026-11-15", recordedAt: at(6) },
  ]), 2, "05→10 and 10→12 count; clearing, re-setting and moving earlier do not");
  assert.equal(countPostponements([]), 0);
});
