import { expect, type Page, test } from "@playwright/test";
import path from "node:path";
import { mockAuthApi } from "./api-mock";
import { mockCatalogApi, NOW } from "./catalog-mock";
import { captureDesignFrames, serveDesign } from "./design-capture";

/*
 * Screenshots for the side-by-side review with Claude Design v0.3.2 (docs/design/impl-v0.3.2/), frames 31–38.
 * NN-<theme>.png come from the app, design-NN-<theme>.png from the approved design file.
 * Run: pnpm --filter web e2e screenshots-v032
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v0.3.2");
const DESIGN_DIR = path.resolve(__dirname, "../../docs/design/v0.3.2");
const DESKTOP = { width: 1440, height: 900 };

type Scheme = "light" | "dark";

async function prepare(page: Page, scheme: Scheme, { clock = true } = {}) {
  await page.setViewportSize(DESKTOP);
  if (clock) await page.clock.install({ time: NOW });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

/** The server sleeps: the liveness check never answers 200 and the first `url` request never answers. */
async function sleepingServer(page: Page, url: RegExp, method = "GET") {
  await page.route("**/api/health", (route) => route.fulfill({ status: 503, body: "" }));
  let first = true;
  await page.route(url, (route) => {
    if (route.request().method() !== method) return route.fallback();
    if (first) {
      first = false;
      return undefined;
    }
    return route.fallback();
  });
}

async function openSuppliers(page: Page) {
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  await page.goto("/suppliers");
  await expect(page.getByRole("row", { name: /Bursa İplik San\./ })).toBeVisible();
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("31a login, the server is starting", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: false });
      await sleepingServer(page, /\/api\/v1\/auth\/login$/, "POST");
      await page.goto("/login");
      await page.getByLabel("E-posta").fill("elif@karacatekstil.com.tr");
      await page.getByLabel("Şifre", { exact: true }).fill("demo-sifre");
      await page.getByRole("button", { name: "Giriş yap" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Sunucu hazırlanıyor" })).toBeVisible({ timeout: 6_000 });
      // As in the design: about half a minute in.
      await page.clock.fastForward(31_000);
      await expect(page.getByRole("status").filter({ hasText: "0:3" })).toBeVisible();
      await page.mouse.move(0, 0);
      await shoot(page, `31a-${scheme}`);
    });

    test("31b login, not ready after 90 s", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: false });
      await sleepingServer(page, /\/api\/v1\/auth\/login$/, "POST");
      await page.goto("/login");
      await page.getByLabel("E-posta").fill("elif@karacatekstil.com.tr");
      await page.getByLabel("Şifre", { exact: true }).fill("demo-sifre");
      await page.getByRole("button", { name: "Giriş yap" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Sunucu hazırlanıyor" })).toBeVisible({ timeout: 6_000 });
      await page.clock.fastForward(91_000);
      await expect(page.getByRole("button", { name: "Tekrar dene" })).toBeEnabled();
      await page.mouse.move(0, 0);
      await shoot(page, `31b-${scheme}`);
    });

    test("32 batches, the server is starting", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: true });
      await mockCatalogApi(page);
      await sleepingServer(page, /\/api\/v1\/batches(\?.*)?$/);
      await page.goto("/batches");
      await expect(page.getByRole("status").filter({ hasText: "Hazır olunca liste" })).toBeVisible({ timeout: 6_000 });
      await page.clock.fastForward(20_000);
      await page.mouse.move(0, 0);
      await shoot(page, `32-${scheme}`);
    });

    test("33 product save, server error toast", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: true });
      await mockCatalogApi(page);
      await page.route(/\/api\/v1\/products\/[0-9a-f-]+$/, (route) =>
        route.request().method() !== "PATCH"
          ? route.fallback()
          : route.fulfill({
              status: 503,
              contentType: "application/problem+json",
              headers: { "X-Request-Id": "ab12-cd34" },
              body: JSON.stringify({ type: "urn:tekpas:problem:internal", title: "Service unavailable", status: 503, requestId: "ab12-cd34" }),
            }),
      );
      await page.goto("/products");
      await page.getByRole("button", { name: "Satır menüsü: Organik pamuk tişört, ekru" }).click();
      await page.getByRole("menuitem", { name: "Düzenle" }).click();
      const form = page.getByRole("dialog", { name: "Ürünü düzenle" });
      await form.getByLabel("SKU").fill("KT-TS-0142-B");
      await form.getByRole("button", { name: "Kaydet" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Ürün kaydedilemedi" })).toBeVisible();
      await page.mouse.move(0, 0);
      await shoot(page, `33-${scheme}`);
    });

    test("34 batches, no result for the search and filters", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: true });
      await mockCatalogApi(page);
      await page.goto("/batches?supplierId=00000000-0000-4000-8000-000000000101");
      await page.getByRole("searchbox", { name: "Parti no veya üretim emri ara" }).fill("KP-2025");
      await expect(page.getByRole("heading", { name: "Eşleşen parti yok" })).toBeVisible();
      await page.getByRole("searchbox", { name: "Parti no veya üretim emri ara" }).blur();
      await page.mouse.move(0, 0);
      await shoot(page, `34-${scheme}`);
    });

    test("35 batches, supplier filter chip", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: true });
      await mockCatalogApi(page);
      await page.goto("/batches?supplierId=00000000-0000-4000-8000-000000000101");
      await expect(page.getByText("3 parti")).toBeVisible();
      await page.mouse.move(0, 0);
      await shoot(page, `35-${scheme}`);
    });

    test("36a edit supplier, the company has its own account", async ({ page }) => {
      await prepare(page, scheme);
      await openSuppliers(page);
      await page.getByRole("button", { name: "Satır menüsü: Ekin Aksesuar" }).click();
      await page.getByRole("menuitem", { name: "Düzenle" }).click();
      await expect(page.getByRole("dialog", { name: "Tedarikçiyi düzenle" })).toBeVisible();
      await page.mouse.move(0, 0);
      await shoot(page, `36a-${scheme}`);
    });

    test("36b edit supplier, type locked", async ({ page }) => {
      await prepare(page, scheme);
      await openSuppliers(page);
      await page.getByRole("button", { name: "Satır menüsü: Bursa İplik San." }).click();
      await page.getByRole("menuitem", { name: "Düzenle" }).click();
      const form = page.getByRole("dialog", { name: "Tedarikçiyi düzenle" });
      await form.getByLabel("Firma adı").focus();
      await page.mouse.move(0, 0);
      await shoot(page, `36b-${scheme}`);
    });

    test("37 searchable city, 'bur'", async ({ page }) => {
      await prepare(page, scheme);
      await openSuppliers(page);
      await page.getByRole("button", { name: "Tedarikçi ekle" }).click();
      const form = page.getByRole("dialog", { name: "Tedarikçi ekle" });
      await form.getByLabel("Firma adı").fill("Aras Örme Konfeksiyon");
      await form.getByRole("radio", { name: "Konfeksiyon" }).click();
      await form.getByLabel("İletişim telefonu").fill("224 000 00 99");
      await form.getByRole("combobox", { name: "Şehir" }).click();
      await form.getByRole("combobox", { name: "Şehir" }).fill("bur");
      await expect(page.getByText("3 il eşleşti")).toBeVisible();
      await page.mouse.move(0, 0);
      await shoot(page, `37-${scheme}`);
    });

    test("38 product form, field errors and focus", async ({ page }) => {
      await prepare(page, scheme);
      await mockAuthApi(page, { signedIn: true });
      await mockCatalogApi(page);
      await page.goto("/products");
      await page.getByRole("button", { name: "Yeni ürün" }).click();
      const form = page.getByRole("dialog", { name: "Yeni ürün" });
      await form.getByLabel("GTIN").fill("4006381333932");
      await form.getByLabel("SKU").fill("kt ts 01!");
      await form.getByLabel("Lif 1 oranı (%)").fill("95");
      await form.getByRole("button", { name: "Lif ekle" }).click();
      await form.getByLabel("Lif 2 oranı (%)").fill("5");
      await form.getByRole("button", { name: "Kaydet" }).click();
      await expect(form.getByLabel("Ürün adı")).toBeFocused();
      await page.mouse.move(0, 0);
      await shoot(page, `38-${scheme}`);
    });
  });
}

test.describe("design references", () => {
  // The design canvas (third-party support.js) sometimes never lays out a frame; a fresh page fixes it.
  test.describe.configure({ retries: 2 });
  const design = serveDesign(DESIGN_DIR);

  test("capture 31–38", async ({ page }) => {
    test.setTimeout(300_000);
    const frames = ["31a", "31b", "32", "33", "34", "35", "36a", "36b", "37", "38"];
    await captureDesignFrames(page, design.url("KozaPass_v0.3.2.dc.html"), OUT, frames);
  });
});
