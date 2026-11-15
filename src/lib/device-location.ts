/**
 * Where the user is, as far as the browser says without asking: the device's
 * IANA time zone names a city ("Asia/Kolkata" → "Kolkata"). This needs no
 * permission prompt and sends nothing anywhere — unlike geolocation, which
 * would need consent and a reverse-geocoding service to name a place.
 */
export type DeviceLocation = { timeZone: string; city: string | null; region: string | null };

const NON_PLACE_ZONES = /^(UTC|GMT|Etc\/|Factory$)/;

/**
 * Browsers still report some zones by their old IANA names (Chrome gives
 * "Asia/Calcutta"); show the city's current name instead.
 */
const RENAMED_CITIES: Record<string, string> = {
  Calcutta: "Kolkata", Saigon: "Ho Chi Minh City", Kiev: "Kyiv", Rangoon: "Yangon", Katmandu: "Kathmandu",
  Dacca: "Dhaka", Thimbu: "Thimphu", "Ulan Bator": "Ulaanbaatar", Godthab: "Nuuk", Ashkhabad: "Ashgabat",
  Chungking: "Chongqing", Macao: "Macau", Uzhgorod: "Uzhhorod", Zaporozhye: "Zaporizhzhia",
};

export function locationFromTimeZone(timeZone: string): DeviceLocation {
  if (NON_PLACE_ZONES.test(timeZone)) return { timeZone, city: null, region: null };
  const parts = timeZone.split("/");
  const rawCity = parts.length > 1 ? parts.at(-1)!.replace(/_/g, " ") : null;
  const city = rawCity ? RENAMED_CITIES[rawCity] ?? rawCity : null;
  const region = parts.length > 1 ? parts[0]!.replace(/_/g, " ") : null;
  return { timeZone, city, region };
}

/** The browser's own time zone; null where Intl cannot say. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Whether two zones show the same wall-clock time right now (Asia/Calcutta and Asia/Kolkata do). */
export function sameLocalTime(a: string, b: string, at: Date) {
  const format = (timeZone: string) => new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(at);
  try { return format(a) === format(b); } catch { return a === b; }
}

/* -------------------------------------------------------------------------
 * Opt-in precise city. Only after the user presses "Show my city" and the
 * browser's own permission prompt is accepted: the position is rounded to
 * ~1 km and sent to BigDataCloud's keyless client-side reverse geocoder to
 * name the city. Only the city name is kept, in this browser only.
 * ---------------------------------------------------------------------- */

export const REVERSE_GEOCODER_NAME = "BigDataCloud";
export const REVERSE_GEOCODER_URL = "https://api-bdc.io/data/reverse-geocode-client";

/** Two decimal places is roughly 1.1 km: enough to name a city, not a street. */
export function roundCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

export function reverseGeocodeUrl(latitude: number, longitude: number) {
  const params = new URLSearchParams({ latitude: String(roundCoordinate(latitude)), longitude: String(roundCoordinate(longitude)), localityLanguage: "en" });
  return `${REVERSE_GEOCODER_URL}?${params}`;
}

export type PreciseCity = { city: string; region: string | null; savedAt: number };

/** Reads the city from BigDataCloud's response; null when it names no place. */
export function cityFromReverseGeocode(body: unknown, now = Date.now()): PreciseCity | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" && (record[key] as string).trim() ? (record[key] as string).trim() : null);
  const city = text("city") ?? text("locality");
  if (!city) return null;
  return { city, region: text("principalSubdivision") ?? text("countryName"), savedAt: now };
}

export const PRECISE_CITY_STORAGE_KEY = "michael-precise-city";
/** A remembered city is reused for this long, then looked up again (people travel). */
export const PRECISE_CITY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function readPreciseCity(raw: string | null, now = Date.now()): PreciseCity | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PreciseCity>;
    if (typeof value.city !== "string" || typeof value.savedAt !== "number") return null;
    if (now - value.savedAt > PRECISE_CITY_MAX_AGE_MS) return null;
    return { city: value.city, region: typeof value.region === "string" ? value.region : null, savedAt: value.savedAt };
  } catch { return null; }
}
