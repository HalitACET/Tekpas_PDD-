import { defineConfig } from "@playwright/test";

/**
 * Visual and keyboard checks against a production build. The API is mocked in the browser (page.route), so no
 * backend is needed. Locally the installed Chrome is used (no download); CI installs Playwright's Chromium and
 * leaves out the screenshot runs, which only write design comparison images (docs/design/impl-*).
 */
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ci ? ["**/screenshots-*.spec.ts"] : [],
  fullyParallel: false,
  workers: 1,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    channel: ci ? undefined : "chrome",
    locale: "tr-TR",
    // The expected dates and times are Türkiye's; CI runs in UTC.
    timezoneId: "Europe/Istanbul",
    screenshot: "only-on-failure",
    trace: ci ? "retain-on-first-failure" : "off",
  },
  // Production build: what users get, and no dev overlay in the screenshots.
  webServer: {
    command: "pnpm build && pnpm start --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: !ci,
    timeout: 300_000,
  },
});
