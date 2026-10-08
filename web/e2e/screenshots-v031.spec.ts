import { expect, type Page, test } from "@playwright/test";
import path from "node:path";
import { mockAuthApi } from "./api-mock";
import { mockCatalogApi, NOW } from "./catalog-mock";
import { captureDesignFrames, serveDesign } from "./design-capture";

/*
 * Screenshots for the side-by-side review with Claude Design v0.3.1 (docs/design/impl-v0.3.1/), frames 17–30.
 * NN-<theme>.png come from the app, design-NN-<theme>.png from the approved design file. Frame 23 is the
 * token sheet (no screen); 25–30 belong to the supplier and chain screens.
 * Run: pnpm --filter web e2e screenshots-v031
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v0.3.1");
const DESIGN_DIR = path.resolve(__dirname, "../../docs/design/v0.3.1");
const DESKTOP = { width: 1440, height: 900 };

type Scheme = "light" | "dark";

async function prepare(page: Page, scheme: Scheme) {
  await page.setViewportSize(DESKTOP);
  await page.clock.install({ time: NOW });
  // The design frames show the theme pinned (Açık / Koyu), not "Sistem".
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400); // open transitions and colour transitions
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("17 login, wrong credentials", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: false, login: "invalid" });
      await page.goto("/login");
      await page.getByLabel("E-posta").fill("elif@karacatekstil.com.tr");
      await page.getByLabel("Şifre", { exact: true }).fill("yanlis-sifre");
      await page.getByRole("button", { name: "Giriş yap" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "E-posta veya şifre hatalı" })).toBeVisible();
      await page.mouse.move(0, 0);
      await page.locator("body").click({ position: { x: 1000, y: 120 } });
      await shoot(page, `17-${scheme}`);
    });

    test("18 edit product, GTIN locked", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: true });
      await mockCatalogApi(page);
      await page.goto("/products");
      await expect(heading(page, "Ürünler")).toBeVisible();
      await page.getByRole("button", { name: "Satır menüsü: Organik pamuk tişört, ekru" }).click();
      await page.getByRole("menuitem", { name: "Düzenle" }).click();
      await expect(page.getByRole("dialog", { name: "Ürünü düzenle" }).getByLabel("GTIN")).toBeDisabled();
      await page.mouse.move(0, 0);
      await shoot(page, `18-${scheme}`);
    });

    test("19 batches, loading", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: true });
      await mockCatalogApi(page);
      // The list never answers; the stage counts do.
      await page.route(/\/api\/v1\/batches(\?.*)?$/, () => undefined);
      await page.goto("/batches");
      await expect(page.getByRole("status", { name: "Yükleniyor…" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Durum" })).toContainText("Tümü7");
      await page.mouse.move(0, 0);
      await shoot(page, `19-${scheme}`);
    });

    test("20 products, list error", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: true });
      await mockCatalogApi(page, { failLists: true });
      await page.goto("/products");
      await expect(page.getByRole("alert").filter({ hasText: "HTTP 503" })).toBeVisible();
      await page.mouse.move(0, 0);
      await shoot(page, `20-${scheme}`);
    });

    test("21 viewer, write actions disabled", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: true, role: "VIEWER" });
      await mockCatalogApi(page);
      await page.goto("/batches");
      await expect(page.getByRole("row", { name: /KP-2026-0918-A/ })).toBeVisible();
      await page.getByRole("button", { name: "Yeni parti" }).hover();
      await expect(page.locator("[data-slot=tooltip-content][data-open]")).toBeVisible();
      await shoot(page, `21-${scheme}`);
    });

    test("22 batches, stage chips and tabs", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: true });
      await mockCatalogApi(page);
      await page.goto("/batches");
      await expect(page.getByRole("row", { name: /KP-2026-0918-A/ })).toBeVisible();
      await expect(page.getByRole("group", { name: "Durum" })).toContainText("Tümü7");
      await page.mouse.move(0, 0);
      await shoot(page, `22-${scheme}`);
    });

    test("24 create batch, calendar picking the end", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: true });
      await mockCatalogApi(page);
      await page.goto("/batches");
      await expect(page.getByRole("row", { name: /KP-2026-0918-A/ })).toBeVisible();
      await page.getByRole("button", { name: "Yeni parti" }).click();
      const form = page.getByRole("dialog", { name: "Yeni parti" });
      await form.getByRole("combobox", { name: "Ürün" }).click();
      await page.getByRole("option", { name: /Organik pamuk tişört, ekru/ }).click();
      await form.getByLabel("Üretim emri no").fill("ÜE-2026-0452");
      await form.getByLabel("Miktar").fill("1.800");
      const calendar = page.getByRole("dialog", { name: "Tarih seç" });
      await form.getByRole("button", { name: "Üretim başlangıcı" }).click();
      await calendar.getByRole("button", { name: "Önceki aya git" }).click();
      await calendar.getByRole("button", { name: /(^|, )29 Eylül 2026/ }).click();
      await calendar.getByRole("button", { name: "Sonraki aya git" }).click();
      await calendar.getByRole("button", { name: /(^|, )17 Ekim 2026/ }).click();
      await form.getByRole("button", { name: "Üretim bitişi" }).click();
      await expect(calendar).toContainText("19 gün · 29.09.2026 – 17.10.2026");
      await page.mouse.move(0, 0);
      await shoot(page, `24-${scheme}`);
    });
  });
}

test.describe("design references", () => {
  // The design canvas (third-party support.js) sometimes never lays out a frame; a fresh page fixes it.
  test.describe.configure({ retries: 2 });
  const design = serveDesign(DESIGN_DIR);

  test("capture 17–30", async ({ page }) => {
    test.setTimeout(300_000);
    const frames = Array.from({ length: 14 }, (_, i) => 17 + i);
    await captureDesignFrames(page, design.url("KozaPass_v0.3.1.dc.html"), OUT, frames);
  });
});
