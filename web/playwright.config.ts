import { defineConfig } from "@playwright/test";

/**
 * Visual and keyboard checks against the dev server. The API is mocked in the browser (page.route),
 * so no backend is needed. Local only for now (not in CI): uses the installed Chrome, no download.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    channel: "chrome",
    locale: "tr-TR",
  },
  // Production build: what users get, and no dev overlay in the screenshots.
  webServer: {
    command: "pnpm build && pnpm start --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
