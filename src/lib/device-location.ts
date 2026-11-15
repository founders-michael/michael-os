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
  const format = (timeZone: string) => new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  try { return format(a) === format(b); } catch { return a === b; }
}
