import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventOverlapsLocalDate } from "@/lib/calendar-event-date";

describe("calendar event local-day rendering boundaries", () => {
  const zone = "Asia/Kolkata";
  it("includes early-morning and late-night intervals without a visible-hour cutoff", () => {
    assert.equal(eventOverlapsLocalDate("2026-10-22T23:00:00Z", "2026-10-22T23:30:00Z", "2026-10-23", zone), true);
    assert.equal(eventOverlapsLocalDate("2026-10-23T17:00:00Z", "2026-10-23T18:00:00Z", "2026-10-23", zone), true);
  });
  it("renders an overnight event on both local dates and excludes its midnight end date", () => {
    const start = "2026-10-23T17:30:00Z"; // 23:00 IST
    const end = "2026-10-23T18:30:00Z"; // 00:00 IST next day
    assert.equal(eventOverlapsLocalDate(start, end, "2026-10-23", zone), true);
    assert.equal(eventOverlapsLocalDate(start, end, "2026-10-24", zone), false);
  });
  it("shows multi-day events on every overlapping date and respects week boundaries", () => {
    const start = "2026-10-24T17:30:00Z";
    const end = "2026-10-26T03:30:00Z";
    assert.equal(eventOverlapsLocalDate(start, end, "2026-10-24", zone), true);
    assert.equal(eventOverlapsLocalDate(start, end, "2026-10-25", zone), true);
    assert.equal(eventOverlapsLocalDate(start, end, "2026-10-26", zone), true);
    assert.equal(eventOverlapsLocalDate(start, end, "2026-10-27", zone), false);
  });
  it("uses the actual local-day length across daylight-saving transitions", () => {
    assert.equal(eventOverlapsLocalDate("2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z", "2026-03-08", "America/New_York"), true);
    assert.equal(eventOverlapsLocalDate("2026-03-09T04:00:00Z", "2026-03-09T04:30:00Z", "2026-03-08", "America/New_York"), false);
    assert.equal(eventOverlapsLocalDate("2018-11-04T02:30:00Z", "2018-11-04T03:30:00Z", "2018-11-04", "America/Sao_Paulo"), true);
  });
});
