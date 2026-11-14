import type { Metadata } from "next";

/**
 * Metadata for a route that must never appear in search results.
 *
 * These routes redirect without a session, so a crawler normally sees only a
 * redirect — but a signed-in crawl, a shared link or a changed redirect rule
 * would expose them. The directive is the defence in depth; `robots.ts` keeps
 * them out of the crawl in the first place.
 */
export const noindexMetadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/** `noindexMetadata` with a title, so the tab is not the site default. */
export function privatePageMetadata(title: string): Metadata {
  return { ...noindexMetadata, title };
}
