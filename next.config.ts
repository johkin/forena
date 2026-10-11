import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/design/:path*",
      headers: [
        // Sketches may execute demo/CDN scripts, but never gain application-origin authority.
        { key: "Content-Security-Policy", value: "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: https:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    }];
  },
};

export default nextConfig;
