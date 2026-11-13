import { absoluteUrl, siteUrl } from "@/lib/site-url";

/**
 * JSON-LD for the public landing page.
 *
 * One graph with the two nodes a product site needs: the `Organization` that
 * publishes it and the `SoftwareApplication` it is. Keeping both in a single
 * `@graph` lets the application reference the organization by `@id` instead of
 * repeating it, which is what validators expect.
 */
export function landingStructuredData() {
  const organizationId = `${siteUrl()}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: "MichaelOS",
        url: siteUrl(),
        logo: {
          "@type": "ImageObject",
          url: absoluteUrl("/michael-logo.png"),
          width: 917,
          height: 180,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl()}/#website`,
        name: "MichaelOS",
        url: siteUrl(),
        publisher: { "@id": organizationId },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        name: "MichaelOS",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Productivity",
        operatingSystem: "Web",
        url: siteUrl(),
        publisher: { "@id": organizationId },
        description:
          "Daily planning, tasks, goals and habits in one place, with capacity and team project planning for work.",
        featureList: [
          "Daily planning",
          "Task management",
          "Goal tracking",
          "Habit tracking",
          "Calendar availability",
          "Team and project planning",
          "Capacity planning",
        ],
      },
    ],
  };
}
