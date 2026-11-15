import test from "node:test";
import assert from "node:assert/strict";
import { locationFromTimeZone, sameLocalTime } from "@/lib/device-location";

test("a time zone names its city and region", () => {
  assert.deepEqual(locationFromTimeZone("Asia/Kolkata"), { timeZone: "Asia/Kolkata", city: "Kolkata", region: "Asia" });
  assert.equal(locationFromTimeZone("America/New_York").city, "New York");
  assert.equal(locationFromTimeZone("America/Argentina/Buenos_Aires").city, "Buenos Aires");
  // Chrome reports India as the legacy "Asia/Calcutta".
  assert.equal(locationFromTimeZone("Asia/Calcutta").city, "Kolkata");
  assert.equal(locationFromTimeZone("Europe/Kiev").city, "Kyiv");
});

test("zones that are not places name no city", () => {
  assert.equal(locationFromTimeZone("UTC").city, null);
  assert.equal(locationFromTimeZone("Etc/GMT+5").city, null);
});

test("aliases with the same clock count as the same local time", () => {
  const at = new Date("2026-11-15T10:00:00Z");
  assert.equal(sameLocalTime("Asia/Kolkata", "Asia/Calcutta", at), true);
  assert.equal(sameLocalTime("Asia/Kolkata", "Europe/London", at), false);
});
