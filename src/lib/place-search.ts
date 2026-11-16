/**
 * Choosing a time zone by city, because most people know where they live but
 * not that it is "Asia/Kolkata".
 *
 * Two sources, both reduced here to the same `Place`:
 *  - typing a city: the server route asks Open-Meteo's geocoder, which gives
 *    every place its IANA time zone (`placesFromOpenMeteo`);
 *  - "Use my location": after the user agrees, the browser's position (rounded
 *    to ~1 km) goes to BigDataCloud, which names the city and its time zone
 *    (`placeFromReverseGeocode`).
 *
 * Only the time zone drives anything; the label is what the user sees. Every
 * zone is checked against the runtime's own list before it is offered.
 * Pure, so it is unit-tested.
 */

export type Place = {
  /** Stable within one search, for list keys. */
  id: string;
  city: string;
  region: string | null;
  country: string | null;
  timeZone: string;
  /** "Bengaluru, Karnataka, India" — saved as the profile's location label. */
  label: string;
};

export const PLACE_QUERY_MIN_LENGTH = 2;
export const PLACE_QUERY_MAX_LENGTH = 80;
export const PLACE_RESULT_LIMIT = 8;
export const LOCATION_LABEL_MAX_LENGTH = 160;

export function isValidTimeZone(value: string) {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function text(value: unknown, max = 80) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/** "Bengaluru, Karnataka, India", without repeating a part ("Singapore, Singapore"). */
export function placeLabel(city: string, region: string | null, country: string | null) {
  const parts: string[] = [];
  for (const part of [city, region, country]) {
    if (part && !parts.some((existing) => existing.toLowerCase() === part.toLowerCase())) parts.push(part);
  }
  return parts.join(", ").slice(0, LOCATION_LABEL_MAX_LENGTH);
}

/** Normalizes what the user typed before it is sent anywhere. */
export function normalizePlaceQuery(raw: string | null | undefined) {
  const query = (raw ?? "").replace(/\s+/g, " ").trim();
  if (query.length < PLACE_QUERY_MIN_LENGTH || query.length > PLACE_QUERY_MAX_LENGTH) return null;
  return query;
}

export function placesFromOpenMeteo(body: unknown): Place[] {
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const places: Place[] = [];
  const seen = new Set<string>();
  for (const entry of results) {
    const record = entry as Record<string, unknown>;
    const city = text(record.name);
    const reported = text(record.timezone, 64);
    if (!city || !reported || !isValidTimeZone(reported)) continue;
    const timeZone = canonicalTimeZone(reported);
    const region = text(record.admin1);
    const country = text(record.country);
    const label = placeLabel(city, region, country);
    if (seen.has(label)) continue;
    seen.add(label);
    places.push({ id: typeof record.id === "number" ? String(record.id) : label, city, region, country, timeZone, label });
    if (places.length === PLACE_RESULT_LIMIT) break;
  }
  return places;
}

/**
 * BigDataCloud names the zone among its "informative" entries. When it does
 * not (or names an invalid one), the caller passes the device's own zone,
 * which is right for someone standing where the browser is.
 */
export function placeFromReverseGeocode(body: unknown, fallbackTimeZone: string | null): Place | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const city = text(record.city) ?? text(record.locality);
  if (!city) return null;
  const informative = (record.localityInfo as { informative?: unknown } | undefined)?.informative;
  const zoneEntry = Array.isArray(informative)
    ? informative.find((item) => /time ?zone/i.test(String((item as Record<string, unknown>)?.description ?? "")))
    : undefined;
  const reported = text((zoneEntry as Record<string, unknown> | undefined)?.name, 64);
  const chosen = reported && isValidTimeZone(reported) ? reported : fallbackTimeZone && isValidTimeZone(fallbackTimeZone) ? fallbackTimeZone : null;
  const timeZone = chosen ? canonicalTimeZone(chosen) : null;
  if (!timeZone) return null;
  const region = text(record.principalSubdivision);
  const country = text(record.countryName);
  const label = placeLabel(city, region, country);
  return { id: `here:${label}`, city, region, country, timeZone, label };
}

/**
 * Browsers still report some zones by their retired names (Chrome says
 * "Asia/Calcutta" for India). They work, but the profile should store and
 * show the current name, and must not treat the two as different places.
 */
const LEGACY_TIME_ZONES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Dacca": "Asia/Dhaka",
  "Asia/Thimbu": "Asia/Thimphu",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
  "Europe/Kiev": "Europe/Kyiv",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "America/Godthab": "America/Nuuk",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Louisville": "America/Kentucky/Louisville",
};

export function canonicalTimeZone(timeZone: string) {
  return LEGACY_TIME_ZONES[timeZone] ?? timeZone;
}

/** "4:15 PM" in a zone, for showing what time it is there. */
export function localTimeIn(timeZone: string, at = new Date()) {
  return new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
}
