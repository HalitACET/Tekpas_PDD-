import { expect, type Page, test } from "@playwright/test";
import path from "node:path";
import { mockAuthApi } from "./api-mock";
import { mockCatalogApi, NOW } from "./catalog-mock";
import { captureDesignFrames, serveDesign } from "./design-capture";

/*
 * Screenshots for the side-by-side review with Claude Design v0.4 (docs/design/impl-v0.4/), the panel side of
 * M4: frames 46–48 and the fibre origin form (40a's section on the panel, no frame of its own). NN-<theme>.png
 * come from the app, design-NN-<theme>.png from the approved design file.
 * Run: pnpm --filter web e2e screenshots-v04
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v0.4");
const DESIGN_DIR = path.resolve(__dirname, "../../docs/design/v0.4");
const DESKTOP = { width: 1440, height: 900 };

const BATCH_0918 = "30000000-0000-4000-8000-000000000002";
const BATCH_0917 = "30000000-0000-4000-8000-000000000003";
const BATCH_0927 = "30000000-0000-4000-8000-000000000001";

type Scheme = "light" | "dark";

async function prepare(page: Page, scheme: Scheme, tasks?: unknown) {
  await page.setViewportSize(DESKTOP);
  await page.clock.install({ time: NOW });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page, tasks === undefined ? {} : { tasks });
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

const chain = (page: Page) => page.getByRole("group", { name: "Tedarik zinciri" });

async function requestDialog(page: Page) {
  await page.goto(`/batches/${BATCH_0917}`);
  await chain(page).getByRole("button", { name: "Konfeksiyon adımı: Gökçe Konfeksiyon" }).click();
  await page.getByRole("dialog", { name: "Gökçe Konfeksiyon" }).getByRole("button", { name: "Veri talep et" }).click();
  const dialog = page.getByRole("dialog", { name: "Veri talep et" });
  await expect(dialog.getByText(/^localhost:\d+\/r#tok0001/)).toBeVisible();
  return dialog;
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("46a request data, link created", async ({ page }) => {
      await prepare(page, scheme);
      await requestDialog(page);
      await page.mouse.move(0, 0);
      await shoot(page, `46a-${scheme}`);
    });

    test("46b request data, revoke confirmation", async ({ page }) => {
      await prepare(page, scheme);
      const dialog = await requestDialog(page);
      await dialog.getByRole("button", { name: "Bağlantıyı geri al" }).click();
      await expect(dialog.getByRole("alertdialog")).toBeVisible();
      await page.mouse.move(0, 0);
      await shoot(page, `46b-${scheme}`);
    });

    test("46c request data, link revoked", async ({ page }) => {
      await prepare(page, scheme);
      const dialog = await requestDialog(page);
      await dialog.getByRole("button", { name: "Bağlantıyı geri al" }).click();
      await dialog.getByRole("alertdialog").getByRole("button", { name: "Bağlantıyı geri al" }).click();
      await expect(dialog).toContainText("Geri alındı · şimdi");
      await page.mouse.move(0, 0);
      await shoot(page, `46c-${scheme}`);
    });

    test("47a submitted data, review", async ({ page }) => {
      await prepare(page, scheme);
      await page.goto(`/batches/${BATCH_0918}`);
      await chain(page).getByRole("button", { name: "Kumaş adımı: Denizli Örme Tekstil" }).click();
      await expect(page.getByRole("dialog", { name: "Denizli Örme Tekstil" })).toContainText("inceleme bekliyor");
      await page.mouse.move(0, 0);
      await shoot(page, `47a-${scheme}`);
    });

    test("47b request a correction", async ({ page }) => {
      await prepare(page, scheme);
      await page.goto(`/batches/${BATCH_0918}`);
      await chain(page).getByRole("button", { name: "İplik adımı: Maraş Penye İplik" }).click();
      const panel = page.getByRole("dialog", { name: "Maraş Penye İplik" });
      await panel.getByRole("button", { name: "Düzeltme iste" }).click();
      await panel.getByRole("button", { name: "Lif oranı uyuşmuyor" }).click();
      await panel.getByRole("region", { name: "Düzeltme iste" }).scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await shoot(page, `47b-${scheme}`);
    });

    test("48a tasks", async ({ page }) => {
      await prepare(page, scheme);
      await page.goto("/tasks");
      await expect(page.getByRole("heading", { level: 2, name: "Eksik adımlar" })).toBeVisible();
      await page.mouse.move(0, 0);
      await shoot(page, `48a-${scheme}`);
    });

    test("48b tasks, none", async ({ page }) => {
      await prepare(page, scheme, { total: 0, review: [], followUp: [], incomplete: [] });
      await page.goto("/tasks");
      await expect(page.getByRole("heading", { name: "Bekleyen görev yok" })).toBeVisible();
      await page.mouse.move(0, 0);
      await shoot(page, `48b-${scheme}`);
    });

    test("fibre origin form (40a's section on the panel)", async ({ page }) => {
      await prepare(page, scheme);
      await page.goto(`/batches/${BATCH_0927}`);
      await page.getByRole("button", { name: "Varsayılan zinciri oluştur" }).click();
      await chain(page).getByRole("button", { name: /Menşe girilmedi/ }).click();
      const panel = page.getByRole("dialog", { name: "Menşe girilmedi" });
      await panel.getByLabel("Lif türü").selectOption("ORGANIC_COTTON");
      await panel.getByLabel("Menşe ülke").selectOption("TR");
      await panel.getByLabel(/^Bölge/).fill("Harran, Şanlıurfa");
      await panel.getByLabel(/^Hasat yılı/).fill("2025");
      await page.mouse.move(0, 0);
      await shoot(page, `fiber-origin-${scheme}`);
    });
  });
}

test.describe("design references", () => {
  // The design canvas (third-party support.js) sometimes never lays out a frame; a fresh page fixes it.
  test.describe.configure({ retries: 2 });
  const design = serveDesign(DESIGN_DIR);

  test("capture 46–48", async ({ page }) => {
    test.setTimeout(300_000);
    await captureDesignFrames(page, design.url("KozaPass_v0.4.dc.html"), OUT, ["46a", "46b", "46c", "47a", "47b", "48a", "48b"]);
  });
});
