import { expect, type Page, test } from "@playwright/test";
import path from "node:path";
import { mockAuthApi } from "./api-mock";
import { mockCatalogApi } from "./catalog-mock";

/*
 * Frame 61 of design v0.5 (docs/design/impl-v0.5/): Tedarikçiler with the "Sertifikalar" column.
 * Run: pnpm --filter web e2e screenshots-v05-suppliers
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v0.5");
const TODAY = new Date(2026, 9, 18, 10, 30);

async function open(page: Page, scheme: "light" | "dark") {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install({ time: TODAY });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { level: 1, name: "Tedarikçiler" })).toBeVisible();
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("61 suppliers, certificates column", async ({ page }) => {
      await open(page, scheme);
      await expect(page.getByRole("img", { name: /OEKO-TEX · süresi doldu/ }).first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/61-${scheme}.png` });
    });
  });
}
