/**
 * Canonical public origin for the marketing surface.
 *
 * Metadata needs an absolute origin: without one Next cannot resolve canonical
 * links or Open Graph image URLs, and every relative metadata URL silently
 * resolves against localhost. This is deliberately separate from
 * `BETTER_AUTH_URL`, which is the auth callback origin and may differ from the
 * public site origin in a deployment.
 */
const FALLBACK_SITE_URL = "http://localhost:3000";

/** The configured public origin, with no trailing slash. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return FALLBACK_SITE_URL;
  try {
    return new URL(configured).origin;
  } catch {
    console.error("[site-url] NEXT_PUBLIC_SITE_URL is not a valid URL; falling back to the default origin.");
    return FALLBACK_SITE_URL;
  }
}

/** The public origin as a `URL`, for `metadataBase`. */
export function siteUrlObject(): URL {
  return new URL(siteUrl());
}

/** An absolute URL for a site-relative path. */
export function absoluteUrl(path: string): string {
  return new URL(path, `${siteUrl()}/`).toString();
}
