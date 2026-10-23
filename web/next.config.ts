import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { backendUrl } from "./lib/env";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// On Vercel a missing BACKEND_URL would silently proxy to localhost; fail the build instead.
if (process.env.VERCEL && !process.env.BACKEND_URL) {
  throw new Error("BACKEND_URL is not set (see docs/DEPLOY.md)");
}

const nextConfig: NextConfig = {
  // The supplier's link page (/r#<token>) and the invitation page (/davet#<token>) are private: nothing cached,
  // indexed or passed on as a referrer.
  async headers() {
    return [
      {
        // The passport page is public but not indexed while the addresses are demo ones (docs/m6-plan.md §9 decision 12).
        source: "/01/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/r",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        // The invitation link (/davet#<token>, M12) carries a secret the same way.
        source: "/davet",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  // K18: the browser talks to the API through this origin, so the refresh cookie is first-party
  // (SameSite=Strict works) and no CORS is needed.
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${backendUrl}/api/v1/:path*` },
      // Liveness only (no DB): the "server is starting" polling of lib/server-wake.ts.
      { source: "/api/health", destination: `${backendUrl}/actuator/health/liveness` },
    ];
  },
};

export default withNextIntl(nextConfig);
