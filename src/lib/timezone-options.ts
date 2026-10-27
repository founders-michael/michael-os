export type TimeZoneOption = { timeZone: string; label: string };

function offsetLabel(timeZone: string, instant = new Date()) {
  const label = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "shortOffset" }).formatToParts(instant).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const offset = label.replace(/^GMT/, "UTC");
  return offset.replace(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/, (_match, sign: string, hour: string, minute?: string) => `UTC${sign}${hour.padStart(2, "0")}:${minute ?? "00"}`);
}

function locationLabel(timeZone: string) {
  const parts = timeZone.split("/");
  const city = (parts.pop() ?? timeZone).replaceAll("_", " ");
  const region = parts.at(-1)?.replaceAll("_", " ");
  return region ? `${city} · ${region}` : city;
}

export function createTimeZoneOptions(instant = new Date()): TimeZoneOption[] {
  const identifiers = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["Asia/Kolkata", "America/New_York", "Europe/London", "UTC"];
  return [...new Set(["UTC", "Asia/Kolkata", ...identifiers])].map((timeZone) => ({
    timeZone,
    label: `${locationLabel(timeZone)} (${offsetLabel(timeZone, instant)})`,
  }));
}

export function resolveTimeZoneChoice(value: string, options: TimeZoneOption[]) {
  return options.find((option) => option.label === value || option.timeZone === value)?.timeZone ?? value;
}
