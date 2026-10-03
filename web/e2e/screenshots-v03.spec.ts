import { expect, type Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { mockAuthApi } from "./api-mock";
import { designProducts, mockCatalogApi, NOW } from "./catalog-mock";

/*
 * Screenshots for the side-by-side review with Claude Design v0.3 (docs/design/impl-v0.3/).
 * NN-<theme>.png come from the app, design-NN-<theme>.png from the approved design file; NN is the design's
 * frame number. Extra states the design does not have yet carry a suffix (03b-locked).
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

    test("03b edit, GTIN locked (not in the design yet)", async ({ page }) => {
      await openProducts(page, scheme);
      await menu(page, "Organik pamuk tişört, ekru").click();
      await page.getByRole("menuitem", { name: "Düzenle" }).click();
      await expect(page.getByRole("dialog", { name: "Ürünü düzenle" }).getByLabel("GTIN")).toBeDisabled();
      await shoot(page, `03b-locked-${scheme}`);
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
      await form.getByLabel("Üretim başlangıcı").fill("2026-09-29");
      await form.getByLabel("Üretim bitişi").fill("2026-10-17");
      await form.getByRole("combobox", { name: "Ürün" }).click();
      await form.getByRole("combobox", { name: "Ürün" }).fill("pamuk");
      await expect(page.getByRole("option")).toHaveCount(2);
      await shoot(page, `08-${scheme}`);
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
    designUrl = `http://127.0.0.1:${port}/KozaPass%20v0.3.dc.html`;
  });

  test.afterAll(() => server.close());

  test("capture 01–08", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    // The canvas loads React from unpkg.com; without it nothing renders, so skip rather than fail.
    let offline = false;
    page.on("pageerror", (error) => {
      if (error.message.includes("unpkg.com")) offline = true;
    });
    await page.goto(designUrl);
    await page.locator("[data-screen-label]").first().waitFor({ state: "attached", timeout: 60_000 });
    await page.waitForTimeout(5_000); // the canvas lays itself out after load
    test.skip(offline, "design canvas needs unpkg.com (React), which is not reachable");
    // Top-level frames only ("01 …" to "16 …"); the panels inside carry labels of their own.
    const count = await page.$$eval("[data-screen-label]", (els) =>
      els.filter((e) => /^\d\d /.test(e.getAttribute("data-screen-label") ?? "")).map((e, i) => e.setAttribute("data-cap", String(i))).length,
    );
    expect(count).toBeGreaterThanOrEqual(8);

    for (let i = 0; i < 8; i++) {
      const n = String(i + 1).padStart(2, "0");
      const label = page.locator(`[data-cap="${i}"]`);
      for (const [j, scheme] of (["light", "dark"] as const).entries()) {
        // The canvas renders a frame once its label is scrolled into view.
        await label.evaluate((el) => el.scrollIntoView({ block: "start" }));
        const frame = label.locator(":scope > div").nth(1).locator(":scope > div").nth(j);
        await expect.poll(() => frame.evaluate((el) => el.getBoundingClientRect().width), { timeout: 30_000 }).toBeGreaterThan(100);
        await page.waitForTimeout(500);
        const box = await frame.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
        });
        await page.screenshot({ path: `${OUT}/design-${n}-${scheme}.png`, fullPage: true, clip: box });
      }
    }
  });
});
