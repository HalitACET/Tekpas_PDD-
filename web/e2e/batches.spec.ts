import { expect, type Page, test } from "@playwright/test";
import { mockAuthApi } from "./api-mock";
import { designBatches, mockCatalogApi, NEXT_BATCH_NO, NOW } from "./catalog-mock";

/** Batches (design v0.3 07–08, v0.3.1 22 and 24) against the mocked API. */

test.use({ viewport: { width: 1440, height: 900 } });

async function openBatches(page: Page, { role, path = "/batches" }: { role?: string; path?: string } = {}) {
  await page.clock.install({ time: NOW });
  await mockAuthApi(page, { signedIn: true, role });
  const store = await mockCatalogApi(page);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: "Partiler" })).toBeVisible();
  return store;
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "Yeni parti" });
const calendar = (page: Page) => page.getByRole("dialog", { name: "Tarih seç" });
/** A day of October 2026 in the open calendar (labels like "5 Ekim 2026 Pazartesi", "Bugün, 3 Ekim …"). */
const day = (page: Page, n: number) =>
  calendar(page).getByRole("button", { name: new RegExp(`(^|, )${n} Ekim 2026`) });

test("lists the batches with product, quantity, chain and status", async ({ page }) => {
  await openBatches(page);

  const row = page.getByRole("row", { name: /KP-2026-0918-A/ });
  await expect(row).toContainText("Organik pamuk tişört, ekru");
  await expect(row).toContainText("2.400 adet · ÜE-2026-0441");
  await expect(row).toContainText("2/6");
  await expect(row.getByRole("img", { name: "2 / 6 adım onaylı" })).toBeVisible();
  await expect(row).toContainText("Veri toplanıyor");
  await expect(page.getByRole("row", { name: /KP-2026-0927-A/ })).toContainText("Taslak");
  await expect(page.getByRole("row", { name: /KP-2026-0828-A/ })).toContainText("Yayında");
  await expect(page.getByText("7 parti")).toBeVisible();

  // Stage tabs with the company's counts (v0.3.1 22).
  const tabs = page.getByRole("group", { name: "Durum" });
  await expect(tabs.getByRole("button")).toHaveText(["Tümü7", "Taslak1", "Veri toplanıyor3", "Yayına hazır1", "Yayında2"]);
  await expect(tabs.getByRole("button", { name: /Tümü/ })).toHaveAttribute("aria-pressed", "true");
  await tabs.getByRole("button", { name: /Veri toplanıyor/ }).click();
  await expect(tabs.getByRole("button", { name: /Veri toplanıyor/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("3 parti")).toBeVisible();
  await tabs.getByRole("button", { name: /Tümü/ }).click();
  await page.getByRole("searchbox", { name: "Parti no veya üretim emri ara" }).fill("0441");
  await expect(page.getByText("1 parti")).toBeVisible();
  // The counts are the company's, not the search result's.
  await expect(tabs.getByRole("button", { name: /Tümü/ })).toHaveText("Tümü7");
});

test("stage chips are square with an icon; only Yayında is filled", async ({ page }) => {
  await openBatches(page);

  const chip = (batchNo: string) =>
    page.getByRole("row", { name: new RegExp(batchNo) }).getByText(/^(Taslak|Veri toplanıyor|Yayına hazır|Yayında)$/);
  await expect(chip("KP-2026-0927-A")).toHaveCSS("border-top-style", "dashed");
  await expect(chip("KP-2026-0927-A")).toHaveCSS("border-top-left-radius", "4px");
  await expect(chip("KP-2026-0904-B")).toHaveText("Yayına hazır");
  const filled = await chip("KP-2026-0828-A").evaluate((el) => getComputedStyle(el).backgroundColor);
  const ready = await chip("KP-2026-0904-B").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(filled).not.toBe(ready);
});

test("the product filter comes from the link on a product (?productId=)", async ({ page }) => {
  await openBatches(page, { path: "/batches?productId=20000000-0000-4000-8000-000000000003" });

  await expect(page.getByLabel("Ürün:")).toHaveValue("20000000-0000-4000-8000-000000000003");
  await expect(page.getByText("2 parti")).toBeVisible();
  await expect(page.getByRole("row", { name: /KP-2026-0912-B/ })).toBeVisible();
});

test("the suggested batch number is prefilled, editable and restorable", async ({ page }) => {
  await openBatches(page);
  await page.getByRole("button", { name: "Yeni parti" }).click();
  const form = dialog(page);
  const batchNo = form.getByLabel(/Parti no/);

  await expect(batchNo).toHaveValue(NEXT_BATCH_NO);
  // AI(10) is A–Z only: a Turkish "i" is upper-cased with English rules (I, not İ).
  await batchNo.fill("kp-2026-ozel-i");
  await expect(batchNo).toHaveValue("KP-2026-OZEL-I");
  await form.getByRole("button", { name: "Öneriyi geri yükle" }).click();
  await expect(batchNo).toHaveValue(NEXT_BATCH_NO);
});

test("creates a batch", async ({ page }) => {
  await openBatches(page);
  await page.getByRole("button", { name: "Yeni parti" }).click();
  const form = dialog(page);
  const create = form.getByRole("button", { name: "Partiyi oluştur" });

  await expect(form.getByText("Ürün ve miktar gerekli")).toBeVisible();
  await expect(create).toBeDisabled();

  await form.getByRole("combobox", { name: "Ürün" }).click();
  await form.getByRole("combobox", { name: "Ürün" }).fill("keten");
  await expect(page.getByText("1 ürün")).toBeVisible();
  await page.getByRole("option", { name: /Keten gömlek, lacivert/ }).click();
  await form.getByLabel("Üretim emri no").fill("ÜE-2026-0460");
  await form.getByLabel("Miktar").fill("1.800");
  await form.getByRole("button", { name: "Üretim başlangıcı" }).click();
  await day(page, 5).click();
  await day(page, 20).click();
  await expect(calendar(page)).toBeHidden();
  await expect(form.getByRole("button", { name: "Üretim başlangıcı" })).toHaveText("05.10.2026");
  await expect(form.getByRole("button", { name: "Üretim bitişi" })).toHaveText("20.10.2026");
  await expect(form.getByText("Ürün ve miktar gerekli")).toBeHidden();
  // v0.3 08: the steps come from the product's last batch (KP-2026-0917-C).
  await expect(form.getByText("Tedarik zinciri adımları ürünün son partisinden kopyalanır.")).toBeVisible();
  await expect(form.getByText("Tedarik zinciri: 5 adım kopyalanacak")).toBeVisible();
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/v1/batches") && r.method() === "POST");
  await create.click();
  expect((await sent).postDataJSON()).toMatchObject({ producedFrom: "2026-10-05", producedTo: "2026-10-20" });

  await expect(form).toBeHidden();
  const row = page.getByRole("row", { name: new RegExp(NEXT_BATCH_NO) });
  await expect(row).toContainText("Keten gömlek, lacivert");
  await expect(row).toContainText("1.800 adet · ÜE-2026-0460");
  await expect(row).toContainText("Taslak");
  await expect(page.getByText(`${designBatches().length + 1} parti`)).toBeVisible();
});

test("the production dates are optional (the range rule: packages/shared batch.test.ts)", async ({ page }) => {
  await openBatches(page);
  await page.getByRole("button", { name: "Yeni parti" }).click();
  const form = dialog(page);
  await form.getByRole("combobox", { name: "Ürün" }).click();
  await page.getByRole("option", { name: /Merino triko kazak/ }).click();
  await form.getByLabel("Miktar").fill("600");

  // Without dates the batch can be created.
  const create = form.getByRole("button", { name: "Partiyi oluştur" });
  await expect(create).toBeEnabled();
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/v1/batches") && r.method() === "POST");
  await create.click();
  expect((await sent).postDataJSON()).toMatchObject({ producedFrom: null, producedTo: null });
  await expect(form).toBeHidden();
  await expect(page.getByRole("row", { name: new RegExp(NEXT_BATCH_NO) })).toContainText("Merino triko kazak");
});

test("the quantity is validated like the API", async ({ page }) => {
  await openBatches(page);
  await page.getByRole("button", { name: "Yeni parti" }).click();
  const form = dialog(page);

  await form.getByLabel("Miktar").fill("2,5");
  await expect(form.getByText("Tam sayı girin (ör. 90).")).toBeVisible();
  await expect(form.getByLabel("Miktar")).toHaveAttribute("aria-invalid", "true");
  await form.getByLabel("Miktar").fill("10");
  await expect(form.getByText("Tam sayı girin (ör. 90).")).toBeHidden();
});

test("the date range is picked, never typed: start, then end; an earlier end becomes the start", async ({ page }) => {
  await openBatches(page);
  await page.getByRole("button", { name: "Yeni parti" }).click();
  const form = dialog(page);
  const from = form.getByRole("button", { name: "Üretim başlangıcı" });
  const to = form.getByRole("button", { name: "Üretim bitişi" });

  await expect(from).toHaveText("gg.aa.yyyy");
  await from.click();
  await expect(calendar(page)).toContainText("Ekim 2026");
  // Weeks start on Monday (tr).
  await expect(calendar(page).locator("thead th").first()).toHaveText("Pzt");
  await expect(calendar(page)).toContainText("Başlangıç tarihini seçin");
  await day(page, 20).click();
  await expect(calendar(page)).toContainText("Bitiş tarihini seçin");
  await day(page, 5).click(); // before the start: becomes the new start
  await expect(from).toHaveText("05.10.2026");
  await expect(to).toHaveText("gg.aa.yyyy");
  await day(page, 20).click();
  await expect(to).toHaveText("20.10.2026");

  await to.click();
  await expect(calendar(page)).toContainText("16 gün · 05.10.2026 – 20.10.2026");
  await calendar(page).getByRole("button", { name: "Sonraki aya git" }).click();
  await expect(calendar(page)).toContainText("Kasım 2026");
  await page.keyboard.press("Escape");
  await expect(calendar(page)).toBeHidden();
  await expect(form).toBeVisible();
});

test("viewers cannot create batches", async ({ page }) => {
  await openBatches(page, { role: "VIEWER" });

  const create = page.getByRole("button", { name: "Yeni parti" });
  await expect(create).toHaveAttribute("aria-disabled", "true");
  await create.hover();
  await expect(page.getByText("Bu işlem için yetkiniz yok")).toBeVisible();
  await create.click({ force: true });
  await expect(dialog(page)).toHaveCount(0);
});

test("without any batch the design G empty state with its guide shows", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page, { batches: [] });
  await page.goto("/batches");

  await expect(page.getByRole("heading", { name: "Henüz parti yok" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Nasıl başlanır" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`the published chip is filled and readable (AA) in the ${scheme} theme`, async ({ page }) => {
    await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
    await openBatches(page);
    const chip = page.getByRole("row", { name: /KP-2026-0828-A/ }).getByText("Yayında");

    const ratio = await chip.evaluate((el) => {
      const rgb = (color: string) => color.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
      const luminance = (color: string) => {
        const [r, g, b] = rgb(color).map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const style = getComputedStyle(el);
      const [a, b] = [luminance(style.color), luminance(style.backgroundColor)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    // Filled: the chip itself carries the brand colour, not a muted tint.
    const brand = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--brand)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect(await chip.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(brand);
  });
}

test("34–35: the supplier chip sits after the search; no result names the search and filters", async ({ page }) => {
  await openBatches(page, { path: "/batches?supplierId=00000000-0000-4000-8000-000000000101" });

  const chip = page.getByText("Tedarikçi:").locator("..");
  await expect(chip).toContainText("Bursa İplik San.");
  await expect(page.getByText("3 parti")).toBeVisible();
  // Design 35: right after the search, before the product filter.
  const order = await page.evaluate(() => {
    const search = document.querySelector('input[type="search"][aria-label="Parti no veya üretim emri ara"]');
    const chipEl = [...document.querySelectorAll("span")].find((el) => el.textContent === "Tedarikçi:");
    const product = document.querySelector('select[aria-label="Ürün:"]');
    const pos = (a: Element | null | undefined, b: Element | null | undefined) =>
      !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { searchBeforeChip: pos(search, chipEl), chipBeforeProduct: pos(chipEl, product) };
  });
  expect(order).toEqual({ searchBeforeChip: true, chipBeforeProduct: true });

  await page.getByRole("searchbox", { name: "Parti no veya üretim emri ara" }).fill("KP-2025");
  await expect(page.getByRole("heading", { name: "Eşleşen parti yok" })).toBeVisible();
  await expect(page.getByText("Arama ve filtrelerle eşleşen parti bulunamadı.")).toBeVisible();
  await expect(page.getByText('"KP-2025" araması · Tedarikçi: Bursa İplik San.')).toBeVisible();
  await page.getByRole("button", { name: "Filtreleri temizle" }).click();
  await expect(page).toHaveURL(/\/batches$/);
  await expect(page.getByText("7 parti")).toBeVisible();
});
