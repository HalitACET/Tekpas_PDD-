import { expect, type Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { mockAuthApi } from "./api-mock";

/*
 * Screenshots for the side-by-side review with Claude Design v0.2 (docs/design/impl-v0.2/).
 * design-*.png come from the approved design file, impl-*.png from the app, same size and state.
 * Run: pnpm --filter web e2e screenshots
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v0.2");
const DESIGN_DIR = path.resolve(__dirname, "../../docs/design/v0.2");

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const FORM = { email: "elif@karacatekstil.com.tr", password: "yanlissifre" };

type LoginState = "default" | "error" | "loading";

async function openLogin(page: Page, state: LoginState) {
  await mockAuthApi(page, { signedIn: false, login: state === "error" ? "invalid" : "hang" });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Giriş yap" })).toBeVisible();
  if (state === "default") return;
  await page.getByLabel("E-posta").fill(FORM.email);
  await page.getByLabel("Şifre", { exact: true }).fill(FORM.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  if (state === "error") await expect(page.getByRole("alert").filter({ hasText: "E-posta veya şifre hatalı." })).toBeVisible();
  else await expect(page.getByRole("button", { name: "Giriş yapılıyor…" })).toBeVisible();
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const state of ["default", "error", "loading"] as const) {
      test(`login desktop ${state}`, async ({ page }) => {
        await page.setViewportSize(DESKTOP);
        await openLogin(page, state);
        await settle(page);
        await page.screenshot({ path: `${OUT}/impl-login-desktop-${state}-${scheme}.png` });
      });

      test(`login mobile ${state}`, async ({ page }) => {
        await page.setViewportSize(MOBILE);
        await openLogin(page, state);
        await settle(page);
        await page.screenshot({ path: `${OUT}/impl-login-mobile-${state}-${scheme}.png` });
      });
    }

    test("panel batches desktop", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await mockAuthApi(page, { signedIn: true });
      await page.goto("/batches");
      await expect(page.getByRole("heading", { level: 1, name: "Partiler" })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${OUT}/impl-panel-batches-desktop-${scheme}.png` });
    });
  });
}

test.describe("design references", () => {
  // The design canvas (support.js) needs http, not file://: serve the committed copy locally.
  let server: Server;
  let designUrl: string;

  test.beforeAll(async () => {
    server = createServer(async (req, res) => {
      try {
        const file = path.join(DESIGN_DIR, decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
        if (!file.startsWith(DESIGN_DIR)) throw new Error("outside design dir");
        const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
        const body = await readFile(file);
        res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` }).end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    designUrl = `http://127.0.0.1:${port}/KozaPass_Ekranlar.dc.html`;
  });

  test.afterAll(() => server.close());

  test("capture", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(designUrl);
    await page.locator('[data-screen-label="Login masaüstü"]').first().waitFor({ state: "attached", timeout: 60_000 });
    await settle(page);
    await page.waitForTimeout(2_000);

    // Crop from a full-page capture by each screen's box (the design canvas can report its frames as
    // not "visible" to Playwright's element screenshot).
    const crop = async (selector: string, index: number, file: string) => {
      const box = await page.locator(selector).nth(index).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
      });
      await page.screenshot({ path: `${OUT}/${file}`, fullPage: true, clip: box });
    };

    const states: LoginState[] = ["default", "error", "loading"];
    for (const [i, state] of states.entries()) {
      await crop('[data-screen-label="Login masaüstü"]', i, `design-login-desktop-${state}.png`);
      await crop('[data-screen-label="Login mobil"]', i, `design-login-mobile-${state}.png`);
    }
    // The label sits on a full-width wrapper; the 1440 × 900 screen is its first child.
    await crop('[data-screen-label="Panel"] > div', 0, "design-panel-batches-desktop-light.png");
    await crop('[data-screen-label="Panel"] > div', 1, "design-panel-batches-desktop-dark.png");
  });
});
