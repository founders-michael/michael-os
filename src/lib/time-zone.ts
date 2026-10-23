/** Default local calendar timezone for profiles without another saved choice. */
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/** Treat the previous application default as the new IST default. */
export function effectiveTimeZone(timeZone: string | null | undefined) {
  return !timeZone || timeZone === "UTC" ? DEFAULT_TIME_ZONE : timeZone;
}
