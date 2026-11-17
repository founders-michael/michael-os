import assert from "node:assert/strict";
import test from "node:test";
import { canonicalTimeZone, isValidTimeZone, normalizePlaceQuery, placeFromReverseGeocode, placeLabel, placesFromOpenMeteo, PLACE_RESULT_LIMIT } from "./place-search";

test("labels skip repeated parts", () => {
  assert.equal(placeLabel("Bengaluru", "Karnataka", "India"), "Bengaluru, Karnataka, India");
  assert.equal(placeLabel("Singapore", "Singapore", "Singapore"), "Singapore");
  assert.equal(placeLabel("London", null, "United Kingdom"), "London, United Kingdom");
});

test("queries are trimmed and bounded", () => {
  assert.equal(normalizePlaceQuery("  new   york "), "new york");
  assert.equal(normalizePlaceQuery("a"), null);
  assert.equal(normalizePlaceQuery(""), null);
  assert.equal(normalizePlaceQuery(null), null);
  assert.equal(normalizePlaceQuery("x".repeat(81)), null);
});

test("Open-Meteo results become places with valid zones, deduplicated and capped", () => {
  const places = placesFromOpenMeteo({ results: [
    { id: 1277333, name: "Bengaluru", admin1: "Karnataka", country: "India", timezone: "Asia/Kolkata" },
    { id: 2, name: "Bengaluru", admin1: "Karnataka", country: "India", timezone: "Asia/Kolkata" },
    { id: 3, name: "Nowhere", country: "Atlantis", timezone: "Ocean/Atlantis" },
    { id: 4, name: "Missing zone", country: "X" },
    { id: 5, timezone: "Europe/London" },
  ] });
  assert.deepEqual(places, [{ id: "1277333", city: "Bengaluru", region: "Karnataka", country: "India", timeZone: "Asia/Kolkata", label: "Bengaluru, Karnataka, India" }]);
  assert.deepEqual(placesFromOpenMeteo({}), []);
  assert.deepEqual(placesFromOpenMeteo(null), []);
  const many = { results: Array.from({ length: 20 }, (_, index) => ({ id: index, name: `City ${index}`, country: "India", timezone: "Asia/Kolkata" })) };
  assert.equal(placesFromOpenMeteo(many).length, PLACE_RESULT_LIMIT);
});

test("reverse geocode uses the reported zone, else the device zone", () => {
  const body = { city: "Bengaluru", principalSubdivision: "Karnataka", countryName: "India", localityInfo: { informative: [{ name: "Asia/Kolkata", description: "time zone" }] } };
  assert.equal(placeFromReverseGeocode(body, "Europe/London")?.timeZone, "Asia/Kolkata");
  assert.equal(placeFromReverseGeocode(body, null)?.label, "Bengaluru, Karnataka, India");
  const noZone = { locality: "Pune", principalSubdivision: "Maharashtra", countryName: "India" };
  assert.equal(placeFromReverseGeocode(noZone, "Asia/Kolkata")?.timeZone, "Asia/Kolkata");
  assert.equal(placeFromReverseGeocode(noZone, null), null);
  assert.equal(placeFromReverseGeocode({ countryName: "India" }, "Asia/Kolkata"), null);
  const badZone = { city: "X", localityInfo: { informative: [{ name: "Not/AZone", description: "time zone" }] } };
  assert.equal(placeFromReverseGeocode(badZone, "UTC")?.timeZone, "UTC");
});

test("time zones are checked against the runtime", () => {
  assert.equal(isValidTimeZone("Asia/Kolkata"), true);
  assert.equal(isValidTimeZone("Mars/Olympus"), false);
  assert.equal(isValidTimeZone(""), false);
});

test("retired zone names map to their current names", () => {
  assert.equal(canonicalTimeZone("Asia/Calcutta"), "Asia/Kolkata");
  assert.equal(canonicalTimeZone("Europe/Kiev"), "Europe/Kyiv");
  assert.equal(canonicalTimeZone("Asia/Kolkata"), "Asia/Kolkata");
  assert.equal(placeFromReverseGeocode({ city: "Kolkata" }, "Asia/Calcutta")?.timeZone, "Asia/Kolkata");
  assert.equal(placesFromOpenMeteo({ results: [{ id: 1, name: "Kolkata", country: "India", timezone: "Asia/Calcutta" }] })[0]?.timeZone, "Asia/Kolkata");
});
