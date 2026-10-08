import { expect, type Page, test } from "@playwright/test";
import { mockAuthApi } from "./api-mock";
import { FAILED_REQUEST_ID, mockCatalogApi, NOW } from "./catalog-mock";

/** Products (design v0.3 01–06) against the mocked API. */

test.use({ viewport: { width: 1440, height: 900 } });

async function openProducts(page: Page, role?: string) {
  await page.clock.install({ time: NOW });
  await mockAuthApi(page, { signedIn: true, role });
  const store = await mockCatalogApi(page);
  await page.goto("/products");
  await expect(page.getByRole("heading", { level: 1, name: "Ürünler" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Organik pamuk tişört, ekru/ })).toBeVisible();
  return store;
}

const sheet = (page: Page) => page.getByRole("dialog", { name: /Yeni ürün|Ürünü düzenle/ });

test("lists the products with GTIN-13, fiber composition and counts", async ({ page }) => {
  await openProducts(page);

  const row = page.getByRole("row", { name: /Organik pamuk tişört, ekru/ });
  await expect(row).toContainText("2012345000018");
  await expect(row).not.toContainText("02012345000018");
  await expect(row).toContainText("%95 organik pamuk · %5 elastan");
  await expect(row).toContainText("14:32");
  await expect(page.getByRole("row", { name: /Keten gömlek/ })).toContainText("Dün");
  await expect(page.getByText("7 / 7 ürün")).toBeVisible();

  await page.getByRole("searchbox", { name: "Ürün adı, GTIN veya SKU ara" }).fill("keten");
  await expect(page.getByText("1 / 7 ürün")).toBeVisible();
  await page.getByRole("searchbox", { name: "Ürün adı, GTIN veya SKU ara" }).fill("yok-boyle-urun");
  await expect(page.getByRole("heading", { name: "Eşleşen ürün yok" })).toBeVisible();
  await page.getByRole("button", { name: "Filtreleri temizle" }).click();
  await expect(page.getByText("7 / 7 ürün")).toBeVisible();
});

test("creates a product", async ({ page }) => {
  const store = await openProducts(page);

  await page.getByRole("button", { name: "Yeni ürün" }).click();
  const form = sheet(page);
  await form.getByLabel("Ürün adı").fill("Organik pamuk polo yaka");
  await form.getByLabel("GTIN").fill("4006381333931");
  await expect(form.getByText("Geçerli GTIN-13")).toBeVisible();
  await form.getByLabel("SKU").fill("KT-PL-0011");
  await form.getByLabel("Lif 1", { exact: true }).selectOption("ORGANIC_COTTON");
  await form.getByLabel("Lif 1 oranı (%)").fill("95");
  await form.getByRole("button", { name: "Lif ekle" }).click();
  await form.getByLabel("Lif 2 oranı (%)").fill("5");
  await expect(form.getByText("Toplam %100")).toBeVisible();
  await form.getByRole("button", { name: "Kaydet" }).click();

  await expect(form).toBeHidden();
  await expect(page.getByRole("row", { name: /Organik pamuk polo yaka/ })).toContainText("4006381333931");
  expect(store[0]).toMatchObject({
    gtin: "04006381333931",
    sku: "KT-PL-0011",
    declaredFiberComposition: [
      { fiber: "ORGANIC_COTTON", percent: 95 },
      { fiber: "ELASTANE", percent: 5 },
    ],
  });
});

test("a wrong check digit is shown on the GTIN field and blocks saving", async ({ page }) => {
  await openProducts(page);

  await page.getByRole("button", { name: "Yeni ürün" }).click();
  const form = sheet(page);
  const gtin = form.getByLabel("GTIN");
  await gtin.fill("4006381333932");

  await expect(gtin).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByText("Kontrol hanesi hatalı")).toBeVisible();
  await expect(form.getByText("Geçerli bir GTIN girin")).toBeVisible();
  await expect(form.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  // Design 03: red border and ring, also while focused.
  await gtin.focus();
  const rejected = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--status-rejected)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  // Polled: the border colour has a short transition.
  await expect.poll(() => gtin.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(rejected);
  expect(await gtin.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
});

test("the fiber total must be 100 and whole numbers only", async ({ page }) => {
  await openProducts(page);

  await page.getByRole("button", { name: "Yeni ürün" }).click();
  const form = sheet(page);
  await form.getByLabel("Ürün adı").fill("Test");
  await form.getByLabel("GTIN").fill("4006381333931");
  await form.getByLabel("Lif 1 oranı (%)").fill("90");
  await form.getByRole("button", { name: "Lif ekle" }).click();
  await form.getByLabel("Lif 2 oranı (%)").fill("5");

  await expect(form.getByText("Toplam %95 · 5 eksik, %100 olmalı")).toBeVisible();
  await expect(form.getByText("Lif toplamı %100 olmalı")).toBeVisible();
  await expect(form.getByRole("button", { name: "Kaydet" })).toBeDisabled();

  await form.getByLabel("Lif 2 oranı (%)").fill("15");
  await expect(form.getByText("Toplam %105 · %100'ü aşıyor")).toBeVisible();

  // "90,5": a clear field error, never rounded.
  await form.getByLabel("Lif 1 oranı (%)").fill("85,5");
  await form.getByLabel("Lif 2 oranı (%)").fill("14,5");
  await expect(form.getByLabel("Lif 1 oranı (%)")).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByText("Tam sayı girin (ör. 90).").first()).toBeVisible();
  await expect(form.getByRole("button", { name: "Kaydet" })).toBeDisabled();
});

test("a GTIN of another own product is named; another company's is not", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page, { foreignGtins: ["04006381333931"] });
  await page.goto("/products");

  await page.getByRole("button", { name: "Yeni ürün" }).click();
  const form = sheet(page);
  await form.getByLabel("Ürün adı").fill("Kopya");
  await form.getByLabel("GTIN").fill("2012345000032");
  await expect(form.getByText("Başka bir ürün bu GTIN'i kullanıyor")).toBeVisible();
  await expect(form.getByText("Denim pantolon, taşlanmış")).toBeVisible();
  await expect(form.getByRole("button", { name: "Kaydet" })).toBeDisabled();

  // Only an exact match counts: a GTIN that merely contains the digits is fine.
  await form.getByLabel("GTIN").fill("96385074");
  await expect(form.getByText("Geçerli GTIN-8")).toBeVisible();

  await form.getByLabel("GTIN").fill("4006381333931");
  await form.getByLabel("Lif 1 oranı (%)").fill("100");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(form.getByText("Başka bir ürün bu GTIN'i kullanıyor")).toBeVisible();
  await expect(form.getByLabel("GTIN")).toHaveAttribute("aria-invalid", "true");
  await expect(form).not.toContainText("Denim");
});

test("editing a product with batches keeps the GTIN locked and says why", async ({ page }) => {
  await openProducts(page);

  await page.getByRole("button", { name: "Satır menüsü: Organik pamuk tişört, ekru" }).click();
  await page.getByRole("menuitem", { name: "Düzenle" }).click();
  const form = page.getByRole("dialog", { name: "Ürünü düzenle" });
  await expect(form.getByLabel("GTIN")).toBeDisabled();
  await expect(form.getByLabel("GTIN")).toHaveValue("2012345000018");
  await expect(form.getByText(/GTIN değiştirilemez/)).toBeVisible();
  await expect(form.getByLabel("Açıklama")).toHaveValue("Yuvarlak yaka, 180 g/m² süprem.");

  await form.getByLabel("Ürün adı").fill("Organik pamuk tişört, natürel");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("row", { name: /natürel/ })).toBeVisible();
});

test("delete: blocked with batches, confirmed without", async ({ page }) => {
  await openProducts(page);

  await page.getByRole("button", { name: "Satır menüsü: Denim pantolon, taşlanmış" }).click();
  await page.getByRole("menuitem", { name: "Sil" }).click();
  const blocked = page.getByRole("alertdialog", { name: "Ürün silinemez" });
  await expect(blocked).toContainText("Bu ürünün 3 partisi var, silinemez.");
  await blocked.getByRole("button", { name: "Kapat" }).click();
  await expect(blocked).toBeHidden();

  await page.getByRole("button", { name: "Satır menüsü: Viskon elbise, desenli" }).click();
  await page.getByRole("menuitem", { name: "Sil" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Ürünü sil" });
  await confirm.getByRole("button", { name: "Ürünü sil" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("row", { name: /Viskon elbise/ })).toHaveCount(0);
  await expect(page.getByText("6 / 6 ürün")).toBeVisible();
});

test("viewers see the write actions disabled, with the reason", async ({ page }) => {
  await openProducts(page, "VIEWER");

  for (const name of ["Yeni ürün", "Excel'den içe aktar"]) {
    const button = page.getByRole("button", { name }).first();
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-disabled", "true");
  }
  const menu = page.getByRole("button", { name: "Satır menüsü: Organik pamuk tişört, ekru" });
  await expect(menu).toHaveAttribute("aria-disabled", "true");

  // The reason shows on hover and on keyboard focus (the previous tooltip may still be fading out).
  const reason = page.locator("[data-slot=tooltip-content][data-open]", { hasText: "Bu işlem için yetkiniz yok" });
  await page.getByRole("button", { name: "Yeni ürün" }).hover();
  await expect(reason).toBeVisible();
  await page.mouse.move(0, 0);
  await menu.focus();
  await expect(reason).toBeVisible();

  await page.getByRole("button", { name: "Yeni ürün" }).click({ force: true });
  await expect(sheet(page)).toHaveCount(0);
});

test("supplier users are sent to their tasks", async ({ page }) => {
  await mockAuthApi(page, { signedIn: true, role: "SUPPLIER" });
  await mockCatalogApi(page);
  await page.goto("/products");
  await expect(page).toHaveURL(/\/tasks$/);
});

/** The error card of the product list (design v0.3.1 20); its text follows the kind of failure. */
const listError = (page: Page) => page.getByRole("alert").filter({ hasText: "Ürünler yüklenemedi" });

test("a server error (5xx) says the server is not responding and names status and request id", async ({ page }) => {
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page, { failLists: true });
  await page.goto("/products");
  const alert = listError(page);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Sunucu şu an yanıt vermiyor. Birazdan tekrar deneyin. Filtreleriniz korunur.");
  await expect(alert).not.toContainText("Sunucuya ulaşılamadı");
  await expect(alert).toContainText(`HTTP 503 · istek ${FAILED_REQUEST_ID}`);
  await expect(alert.getByRole("button", { name: "Tekrar dene" })).toBeVisible();
});

test("without an answer from the server the card says so and has no HTTP line", async ({ page }) => {
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  await page.route(/\/api\/v1\/products(\?.*)?$/, (route) => route.abort("connectionrefused"));
  await page.goto("/products");
  const alert = listError(page);
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText(
    "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin. Filtreleriniz korunur.",
  );
  await expect(alert).not.toContainText("HTTP");
});

test("any other error is unexpected and names its status and request id", async ({ page }) => {
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  await page.route(/\/api\/v1\/products(\?.*)?$/, (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/problem+json",
      headers: { "X-Request-Id": "0a1b-2c3d" },
      body: JSON.stringify({ type: "urn:tekpas:problem:bad-request", title: "Bad request", status: 400, requestId: "0a1b-2c3d" }),
    }),
  );
  await page.goto("/products");
  const alert = listError(page);
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText("Beklenmeyen bir hata oluştu. Filtreleriniz korunur.");
  await expect(alert).toContainText("HTTP 400 · istek 0a1b-2c3d");
});

test("the top bar search placeholder fits uncut next to the shortcut label", async ({ page }) => {
  await openProducts(page);
  const search = page.getByRole("searchbox", { name: "Parti, GTIN veya tedarikçi ara" });
  const { text, room } = await search.evaluate((el) => {
    const input = el as HTMLInputElement;
    const style = getComputedStyle(input);
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return {
      text: context.measureText(input.placeholder).width,
      room: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    };
  });
  expect(text).toBeLessThanOrEqual(room);
});
