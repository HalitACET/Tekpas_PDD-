import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { backendUrl } from "./lib/env";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// On Vercel a missing BACKEND_URL would silently proxy to localhost; fail the build instead.
if (process.env.VERCEL && !process.env.BACKEND_URL) {
  throw new Error("BACKEND_URL is not set (see docs/DEPLOY.md)");
}

const nextConfig: NextConfig = {
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
