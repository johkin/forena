import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Förena",
    short_name: "Förena",
    description: "Den öppna plattformen för föreningslivet",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5ed",
    theme_color: "#173f35",
    lang: "sv",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
