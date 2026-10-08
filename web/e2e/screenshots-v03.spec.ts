import { expect, type Page, test } from "@playwright/test";
import path from "node:path";
import { mockAuthApi } from "./api-mock";
import { designProducts, mockCatalogApi, NOW } from "./catalog-mock";
import { captureDesignFrames, serveDesign } from "./design-capture";

/*
 * Screenshots for the side-by-side review with Claude Design v0.3 (docs/design/impl-v0.3/).
 * NN-<theme>.png come from the app, design-NN-<theme>.png from the approved design file; NN is the design's
 * frame number. States added in v0.3.1 (GTIN lock, loading, errors, …) are in docs/design/impl-v0.3.1/.
 * Run: pnpm --filter web e2e screenshots-v03
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v0.3");
const DESIGN_DIR = path.resolve(__dirname, "../../docs/design/v0.3");
const DESKTOP = { width: 1440, height: 900 };

async function openProducts(page: Page, scheme: "light" | "dark", products = designProducts()) {
  await page.setViewportSize(DESKTOP);
  await page.clock.install({ time: NOW });
  // The design frames show the theme pinned (Açık / Koyu), not "Sistem".
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page, { products });
  await page.goto("/products");
  await expect(page.getByRole("heading", { level: 1, name: "Ürünler" })).toBeVisible();
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400); // open transitions and colour transitions
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function openSuppliers(page: Page, scheme: "light" | "dark") {
  await page.setViewportSize(DESKTOP);
  await page.clock.install({ time: NOW });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  await page.goto("/suppliers");
  await expect(page.getByRole("row", { name: /Bursa İplik San\./ })).toBeVisible();
  await page.mouse.move(0, 0);
}

async function openBatches(page: Page, scheme: "light" | "dark") {
  await page.setViewportSize(DESKTOP);
  await page.clock.install({ time: NOW });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  await page.goto("/batches");
  await expect(page.getByRole("heading", { level: 1, name: "Partiler" })).toBeVisible();
  await expect(page.getByRole("row", { name: /KP-2026-0918-A/ })).toBeVisible();
}

const menu = (page: Page, product: string) => page.getByRole("button", { name: `Satır menüsü: ${product}` });

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("01 list, row menu open", async ({ page }) => {
      await openProducts(page, scheme);
      await menu(page, "Denim pantolon, taşlanmış").click();
      await expect(page.getByRole("menuitem", { name: "Düzenle" })).toBeVisible();
      await shoot(page, `01-${scheme}`);
    });

    test("02 empty", async ({ page }) => {
      await openProducts(page, scheme, []);
      await expect(page.getByRole("heading", { name: "Henüz ürün yok" })).toBeVisible();
      await shoot(page, `02-${scheme}`);
    });

    test("03 edit, wrong check digit, fiber total 95", async ({ page }) => {
      // As in the design, the edited product's GTIN can still change (no batches yet).
      const products = designProducts();
      products[0].batchCount = 0;
      await openProducts(page, scheme, products);
      await menu(page, "Organik pamuk tişört, ekru").click();
      await page.getByRole("menuitem", { name: "Düzenle" }).click();
      const form = page.getByRole("dialog", { name: "Ürünü düzenle" });
      await form.getByLabel("GTIN").fill("2012345000013");
      await form.getByLabel("Lif 1 oranı (%)").fill("90");
      await expect(form.getByText("Kontrol hanesi hatalı")).toBeVisible();
      await form.getByLabel("GTIN").focus();
      await shoot(page, `03-${scheme}`);
    });

    test("04 new, GTIN used by another product, fiber total 100", async ({ page }) => {
      await openProducts(page, scheme);
      await page.getByRole("button", { name: "Yeni ürün" }).click();
      const form = page.getByRole("dialog", { name: "Yeni ürün" });
      await form.getByLabel("Ürün adı").fill("Organik pamuk polo yaka");
      await form.getByLabel("GTIN").fill("2012345000032");
      await form.getByLabel("SKU").fill("KT-PL-0011");
      await form.getByLabel("Lif 1", { exact: true }).selectOption("ORGANIC_COTTON");
      await form.getByLabel("Lif 1 oranı (%)").fill("95");
      await form.getByRole("button", { name: "Lif ekle" }).click();
      await form.getByLabel("Lif 2 oranı (%)").fill("5");
      await expect(form.getByText("Denim pantolon, taşlanmış")).toBeVisible();
      await form.getByLabel("GTIN").focus();
      await shoot(page, `04-${scheme}`);
    });

    test("05 delete blocked", async ({ page }) => {
      await openProducts(page, scheme);
      await menu(page, "Denim pantolon, taşlanmış").click();
      await page.getByRole("menuitem", { name: "Sil" }).click();
      await expect(page.getByRole("alertdialog", { name: "Ürün silinemez" })).toBeVisible();
      await shoot(page, `05-${scheme}`);
    });

    test("07 batches list", async ({ page }) => {
      await openBatches(page, scheme);
      await shoot(page, `07-${scheme}`);
    });

    test("08 create batch, product search open", async ({ page }) => {
      await openBatches(page, scheme);
      await page.getByRole("button", { name: "Yeni parti" }).click();
      const form = page.getByRole("dialog", { name: "Yeni parti" });
      await expect(form.getByLabel(/Parti no/)).toHaveValue("KP-2026-1003-A");
      await form.getByLabel("Üretim emri no").fill("ÜE-2026-0452");
      await form.getByLabel("Miktar").fill("1.800");
      const calendar = page.getByRole("dialog", { name: "Tarih seç" });
      await form.getByRole("button", { name: "Üretim başlangıcı" }).click();
      await calendar.getByRole("button", { name: "Önceki aya git" }).click();
      await calendar.getByRole("button", { name: /(^|, )29 Eylül 2026/ }).click();
      await calendar.getByRole("button", { name: "Sonraki aya git" }).click();
      await calendar.getByRole("button", { name: /(^|, )17 Ekim 2026/ }).click();
      await expect(calendar).toBeHidden();
      await form.getByRole("combobox", { name: "Ürün" }).click();
      await form.getByRole("combobox", { name: "Ürün" }).fill("pamuk");
      await expect(page.getByRole("option")).toHaveCount(2);
      await shoot(page, `08-${scheme}`);
    });

    test("14 suppliers list", async ({ page }) => {
      await openSuppliers(page, scheme);
      await shoot(page, `14-${scheme}`);
    });

    test("15 add supplier", async ({ page }) => {
      await openSuppliers(page, scheme);
      await page.getByRole("button", { name: "Tedarikçi ekle" }).click();
      const form = page.getByRole("dialog", { name: "Tedarikçi ekle" });
      await form.getByLabel("Firma adı").fill("Aras Örme Konfeksiyon");
      await form.getByRole("radio", { name: "Konfeksiyon" }).click();
      await form.getByRole("combobox", { name: "Şehir" }).click();
      await form.getByRole("combobox", { name: "Şehir" }).fill("izm");
      await page.getByRole("option", { name: "İzmir" }).click();
      await form.getByLabel("İletişim telefonu").fill("224 000 00 99");
      await form.getByLabel("Firma adı").focus();
      await shoot(page, `15-${scheme}`);
    });

    test("15b edit supplier, details locked (not in the design yet)", async ({ page }) => {
      await openSuppliers(page, scheme);
      await page.getByRole("button", { name: "Satır menüsü: Ekin Aksesuar" }).click();
      await page.getByRole("menuitem", { name: "Düzenle" }).click();
      await expect(page.getByRole("dialog", { name: "Tedarikçiyi düzenle" }).getByLabel("Firma adı")).toBeDisabled();
      await shoot(page, `15b-edit-locked-${scheme}`);
    });

    test("06 delete confirm", async ({ page }) => {
      await openProducts(page, scheme);
      await menu(page, "Viskon elbise, desenli").click();
      await page.getByRole("menuitem", { name: "Sil" }).click();
      await expect(page.getByRole("alertdialog", { name: "Ürünü sil" })).toBeVisible();
      await shoot(page, `06-${scheme}`);
    });
  });
}

test.describe("design references", () => {
  // The design canvas (third-party support.js) sometimes never lays out a frame; a fresh page fixes it.
  test.describe.configure({ retries: 2 });
  const design = serveDesign(DESIGN_DIR);

  test("capture 01–08, 14–15", async ({ page }) => {
    test.setTimeout(240_000);
    await captureDesignFrames(page, design.url("KozaPass v0.3.dc.html"), OUT, [1, 2, 3, 4, 5, 6, 7, 8, 14, 15]);
  });
});
