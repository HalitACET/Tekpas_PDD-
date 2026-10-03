import { expect, type Page, test } from "@playwright/test";
import { mockAuthApi } from "./api-mock";
import { designBatches, mockCatalogApi, NEXT_BATCH_NO, NOW } from "./catalog-mock";

/** Batches (design v0.3 07–08) against the mocked API. */

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

test("lists the batches with product, quantity, chain and status", async ({ page }) => {
  await openBatches(page);

  const row = page.getByRole("row", { name: /KP-2026-0918-A/ });
  await expect(row).toContainText("Organik pamuk tişört, ekru");
  await expect(row).toContainText("2.400 adet · ÜE-2026-0441");
  await expect(row).toContainText("1/5");
  await expect(row.getByRole("img", { name: "1 / 5 adım onaylı" })).toBeVisible();
  await expect(row).toContainText("Veri toplanıyor");
  await expect(page.getByRole("row", { name: /KP-2026-0927-A/ })).toContainText("Taslak");
  await expect(page.getByRole("row", { name: /KP-2026-0828-A/ })).toContainText("Yayında");
  await expect(page.getByText("7 parti")).toBeVisible();

  await page.getByLabel("Durum:").selectOption("COLLECTING");
  await expect(page.getByText("4 parti")).toBeVisible();
  await page.getByLabel("Durum:").selectOption("");
  await page.getByRole("searchbox", { name: "Parti no veya üretim emri ara" }).fill("0441");
  await expect(page.getByText("1 parti")).toBeVisible();
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
  await form.getByLabel("Üretim başlangıcı").fill("2026-10-05");
  await form.getByLabel("Üretim bitişi").fill("2026-10-20");
  await expect(form.getByText("Ürün ve miktar gerekli")).toBeHidden();
  await create.click();

  await expect(form).toBeHidden();
  const row = page.getByRole("row", { name: new RegExp(NEXT_BATCH_NO) });
  await expect(row).toContainText("Keten gömlek, lacivert");
  await expect(row).toContainText("1.800 adet · ÜE-2026-0460");
  await expect(row).toContainText("Taslak");
  await expect(page.getByText(`${designBatches().length + 1} parti`)).toBeVisible();
});

test("quantity and dates are validated like the API", async ({ page }) => {
  await openBatches(page);
  await page.getByRole("button", { name: "Yeni parti" }).click();
  const form = dialog(page);

  await form.getByLabel("Miktar").fill("2,5");
  await expect(form.getByText("Tam sayı girin (ör. 90).")).toBeVisible();
  await expect(form.getByLabel("Miktar")).toHaveAttribute("aria-invalid", "true");
  await form.getByLabel("Miktar").fill("10");
  // The date order is checked once the rest of the batch is valid (as the API does).
  await form.getByRole("combobox", { name: "Ürün" }).click();
  await page.getByRole("option", { name: /Keten gömlek, lacivert/ }).click();
  await form.getByLabel("Üretim başlangıcı").fill("2026-10-20");
  await form.getByLabel("Üretim bitişi").fill("2026-10-05");
  await expect(form.getByText("Bitiş tarihi başlangıç tarihinden önce olamaz.")).toBeVisible();
  await expect(form.getByRole("button", { name: "Partiyi oluştur" })).toBeDisabled();
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
