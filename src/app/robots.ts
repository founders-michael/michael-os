import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";

/**
 * Only `/` is a public page. Every other route either requires a session or
 * redirects without one, so crawling them spends budget on redirects and
 * exposes nothing. API routes return private, per-user and per-organization
 * data and must never be crawled.
 *
 * A path listed here covers its whole subtree, so `/work` also covers every
 * organization-scoped route beneath it.
 */
const PRIVATE_PATHS = [
  "/api/",
  "/accept-invitation",
  "/assistant",
  "/calendar",
  "/goals",
  "/habits",
  "/insights",
  "/lifestyle",
  "/login",
  "/onboarding",
  "/plugins",
  "/products",
  "/register",
  "/review",
  "/settings",
  "/tasks",
  "/work",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
