/** Default local calendar timezone for profiles without a saved timezone. */
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/** Preserve a saved timezone (including an explicit UTC choice); default only when none exists. */
export function effectiveTimeZone(timeZone: string | null | undefined) {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  // JavaScript Intl accepts the ambiguous abbreviation "IST" as an alias for
  // India time, while Python ZoneInfo rejects it. Persist/use the canonical IANA
  // identifier at service boundaries so planner validation agrees across runtimes.
  return timeZone === "IST" ? DEFAULT_TIME_ZONE : timeZone;
}
