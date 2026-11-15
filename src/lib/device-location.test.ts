import test from "node:test";
import assert from "node:assert/strict";
import { cityFromReverseGeocode, locationFromTimeZone, PRECISE_CITY_MAX_AGE_MS, readPreciseCity, reverseGeocodeUrl, sameLocalTime } from "@/lib/device-location";

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

test("precise city: coordinates are rounded to about 1 km before leaving the browser", () => {
  const url = new URL(reverseGeocodeUrl(12.971598, 77.594566));
  assert.equal(url.searchParams.get("latitude"), "12.97");
  assert.equal(url.searchParams.get("longitude"), "77.59");
  assert.equal(url.origin, "https://api-bdc.io");
});

test("precise city: reads the city, falls back to locality, rejects empty answers", () => {
  assert.deepEqual(cityFromReverseGeocode({ city: "Bengaluru", principalSubdivision: "Karnataka", countryName: "India" }, 5), { city: "Bengaluru", region: "Karnataka", savedAt: 5 });
  assert.equal(cityFromReverseGeocode({ city: "", locality: "Whitefield", countryName: "India" }, 5)?.city, "Whitefield");
  assert.equal(cityFromReverseGeocode({ city: "", locality: "" }), null);
  assert.equal(cityFromReverseGeocode(null), null);
});

test("precise city: a remembered city expires after 12 hours", () => {
  const saved = JSON.stringify({ city: "Bengaluru", region: "Karnataka", savedAt: 0 });
  assert.equal(readPreciseCity(saved, 60_000)?.city, "Bengaluru");
  assert.equal(readPreciseCity(saved, PRECISE_CITY_MAX_AGE_MS + 1), null);
  assert.equal(readPreciseCity("not json"), null);
});
