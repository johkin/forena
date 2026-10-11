import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Förena",
    short_name: "Förena",
    description: "Den öppna plattformen för föreningslivet",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f3",
    theme_color: "#1e3f20",
    lang: "sv",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
