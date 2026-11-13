import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MichaelOS",
    short_name: "MichaelOS",
    description: "A calmer, more intentional way to plan your day.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f4",
    theme_color: "#254b3a",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { src: "/michael-mark.png", sizes: "300x180", type: "image/png", purpose: "any" },
    ],
  };
}
