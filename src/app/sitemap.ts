import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";

/**
 * The public surface is the unauthenticated landing page. Everything else
 * redirects without a session, so listing it would advertise URLs that return
 * a redirect rather than content. Add marketing routes here as they ship.
 *
 * `lastModified` is resolved once at module load so the sitemap prerenders
 * statically and reports the build time — a per-request `new Date()` would
 * claim the page changed on every crawl, which is a false freshness signal.
 */
const LAST_MODIFIED = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/"),
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
