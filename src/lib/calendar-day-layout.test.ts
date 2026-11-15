import assert from "node:assert/strict";
import test from "node:test";
import { initialScrollMinute, layoutDayEvents, localMinuteOfDay, MINUTES_PER_DAY } from "@/lib/calendar-day-layout";

// 2026-11-15 in Asia/Kolkata (UTC+5:30) runs from 2026-11-14T18:30Z to 2026-11-15T18:30Z.
const day = { startMs: Date.parse("2026-11-14T18:30:00Z"), endMs: Date.parse("2026-11-15T18:30:00Z"), timeZone: "Asia/Kolkata" };
const event = (id: string, start: string, end: string) => ({ id, startAt: start, endAt: end });

test("minutes are on the user's clock", () => {
  assert.equal(localMinuteOfDay("2026-11-15T03:30:00Z", "Asia/Kolkata"), 9 * 60);
  assert.equal(localMinuteOfDay("2026-11-14T18:30:00Z", "Asia/Kolkata"), 0);
});

test("an event is placed at its start and sized by its duration", () => {
  const [placed] = layoutDayEvents([event("a", "2026-11-15T03:30:00Z", "2026-11-15T05:00:00Z")], day);
  assert.deepEqual({ start: placed!.startMinute, end: placed!.endMinute, column: placed!.column, columns: placed!.columns }, { start: 540, end: 630, column: 0, columns: 1 });
});

test("events crossing midnight are clipped and marked", () => {
  const [before, after] = layoutDayEvents([
    event("b", "2026-11-14T17:30:00Z", "2026-11-14T19:30:00Z"),
    event("c", "2026-11-15T17:30:00Z", "2026-11-15T20:00:00Z"),
  ], day);
  assert.equal(before!.startMinute, 0); assert.equal(before!.continuesBefore, true); assert.equal(before!.endMinute, 60);
  assert.equal(after!.endMinute, MINUTES_PER_DAY); assert.equal(after!.continuesAfter, true);
});

test("overlapping events share the width; later separate events get full width", () => {
  const placed = layoutDayEvents([
    event("x", "2026-11-15T03:30:00Z", "2026-11-15T05:30:00Z"), // 9:00–11:00
    event("y", "2026-11-15T04:30:00Z", "2026-11-15T05:00:00Z"), // 10:00–10:30
    event("z", "2026-11-15T04:45:00Z", "2026-11-15T06:00:00Z"), // 10:15–11:30
    event("w", "2026-11-15T08:30:00Z", "2026-11-15T09:00:00Z"), // 14:00–14:30
  ], day);
  const byId = Object.fromEntries(placed.map((entry) => [entry.item.id, entry]));
  assert.deepEqual([byId.x!.column, byId.y!.column, byId.z!.column], [0, 1, 2]);
  assert.equal(byId.x!.columns, 3);
  assert.deepEqual([byId.w!.column, byId.w!.columns], [0, 1]);
});

test("very short events are drawn at a clickable minimum", () => {
  const [placed] = layoutDayEvents([event("s", "2026-11-15T03:30:00Z", "2026-11-15T03:35:00Z")], day);
  assert.equal(placed!.endMinute - placed!.startMinute, 30);
});

test("the grid opens an hour before the first event, but not after 8 AM", () => {
  assert.equal(initialScrollMinute([{ startMinute: 6 * 60 }]), 5 * 60);
  assert.equal(initialScrollMinute([{ startMinute: 15 * 60 }]), 7 * 60);
  assert.equal(initialScrollMinute([]), 7 * 60);
});
