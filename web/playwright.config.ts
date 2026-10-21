import { defineConfig } from "@playwright/test";

/**
 * Visual and keyboard checks against a production build. The API is mocked in the browser (page.route), so no
 * backend is needed. Google Chrome everywhere (installed locally and on GitHub's runners): its PDF viewer is what
 * the document preview drives. CI leaves out the screenshot runs, which only write design comparison images
 * (docs/design/impl-*), and builds in its own step: the server is started without pnpm in between, so stopping
 * it after the run stops Next itself.
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
    channel: "chrome",
    locale: "tr-TR",
    // The expected dates and times are Türkiye's; CI runs in UTC.
    timezoneId: "Europe/Istanbul",
    screenshot: "only-on-failure",
    trace: ci ? "retain-on-first-failure" : "off",
  },
  // Production build: what users get, and no dev overlay in the screenshots.
  webServer: {
    command: ci ? "node node_modules/next/dist/bin/next start --port 3100" : "pnpm build && pnpm start --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: !ci,
    timeout: 300_000,
  },
});
