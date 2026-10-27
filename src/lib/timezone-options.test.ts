import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTimeZoneOptions, resolveTimeZoneChoice } from "@/lib/timezone-options";

describe("searchable onboarding timezone options", () => {
  it("shows a readable city and UTC offset while resolving the canonical IANA identifier", () => {
    const options = createTimeZoneOptions(new Date("2026-01-01T00:00:00Z"));
    const kolkata = options.find((option) => option.timeZone === "Asia/Kolkata");
    assert.ok(kolkata);
    assert.match(kolkata.label, /Kolkata.*UTC\+05:30/);
    assert.equal(resolveTimeZoneChoice(kolkata.label, options), "Asia/Kolkata");
  });
  it("keeps an unknown typed value available for server-side validation", () => {
    assert.equal(resolveTimeZoneChoice("Mars/Olympus", createTimeZoneOptions()), "Mars/Olympus");
  });
});
