import { expect, type Page, test } from "@playwright/test";
import path from "node:path";
import { captureDesignFrames, serveDesign } from "./design-capture";
import { correctionView, LINK, mockPublicRequest, publicView, SUPPLIER_NOW, TOKEN } from "./supplier-mock";

/*
 * Screenshots for the side-by-side review with Claude Design v0.4 (docs/design/impl-v0.4/), the supplier's page:
 * frames 39–45. NN-<theme>.png come from the app (a 390 px phone, 40c at 1440 px), design-NN-<theme>.png from
 * the approved design file. Frames with several screens in the design (39 yarn and dyeing, 44's four errors)
 * are one file each here: 39-dyeing, 44-revoked, … 42 is the documents section alone.
 * Run: pnpm --filter web e2e screenshots-supplier
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v0.4");
const DESIGN_DIR = path.resolve(__dirname, "../../docs/design/v0.4");

type Scheme = "light" | "dark";

async function prepare(page: Page, scheme: Scheme, width = 390, height = 844) {
  await page.setViewportSize({ width, height });
  await page.clock.install({ time: SUPPLIER_NOW });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function openForm(page: Page, view: object) {
  await mockPublicRequest(page, { view });
  await page.goto(`/r#${TOKEN}`);
  await page.getByRole("button", { name: "Forma başla" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("verileri");
}

/** 40a: the yarn form filled in, the sender still empty. */
async function fillYarn(page: Page) {
  await page.getByLabel("Yüzde").first().fill("80");
  await page.getByRole("button", { name: "Lif ekle" }).click();
  await page.getByLabel("Lif", { exact: true }).nth(1).selectOption("POLYESTER");
  await page.getByLabel("Yüzde").nth(1).fill("20");
  await page.getByLabel("Menşe ülke").selectOption("TR");
  await page.getByLabel("Yüzde").nth(2).fill("60");
  await page.getByRole("button", { name: "Kaynak ekle" }).click();
  await page.getByLabel("Enerji kaynağı").nth(1).selectOption("SOLAR");
  await page.getByLabel("Yüzde").nth(3).fill("40");
  await page.getByLabel("Enerji tüketimi").fill("3,4");
  await page.getByLabel("Teslim edilen").fill("640");
  await page.getByLabel("İplik numarası").fill("30/1");
  await page.getByRole("radio", { name: "Karde" }).click();
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("39 welcome, yarn", async ({ page }) => {
      await prepare(page, scheme);
      await mockPublicRequest(page, { view: publicView("YARN") });
      await page.goto(`/r#${TOKEN}`);
      await expect(page.getByRole("button", { name: "Forma başla" })).toBeVisible();
      await shoot(page, `39-${scheme}`);
    });

    test("39 welcome, dyeing", async ({ page }) => {
      await prepare(page, scheme);
      await mockPublicRequest(page, { view: publicView("DYEING") });
      await page.goto(`/r#${TOKEN}`);
      await expect(page.getByRole("button", { name: "Forma başla" })).toBeVisible();
      await shoot(page, `39-dyeing-${scheme}`);
    });

    test("40a yarn form, filled in", async ({ page }) => {
      await prepare(page, scheme);
      await openForm(page, publicView("YARN"));
      await fillYarn(page);
      await shoot(page, `40a-${scheme}`);
    });

    test("40b yarn form, errors", async ({ page }) => {
      await prepare(page, scheme);
      await openForm(page, publicView("YARN"));
      await page.getByLabel("Yüzde").first().fill("80");
      await page.getByRole("button", { name: "Lif ekle" }).click();
      await page.getByLabel("Lif", { exact: true }).nth(1).selectOption("POLYESTER");
      await page.getByLabel("Yüzde").nth(1).fill("15");
      await page.getByLabel("Menşe ülke").selectOption("TR");
      await page.getByLabel("Yüzde").nth(2).fill("60");
      await page.getByRole("button", { name: "Kaynak ekle" }).click();
      await page.getByLabel("Enerji kaynağı").nth(1).selectOption("SOLAR");
      await page.getByLabel("Yüzde").nth(3).fill("30");
      await page.getByLabel("Enerji tüketimi").fill("3,4");
      await page.getByLabel("Teslim edilen").fill("640");
      await page.getByLabel("İplik numarası").fill("30");
      await page.getByRole("radio", { name: "Karde" }).click();
      await page.getByRole("button", { name: "Gönder" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "alanda hata var" })).toContainText("4 alanda hata var");
      await shoot(page, `40b-${scheme}`);
    });

    test("40c yarn form, desktop", async ({ page }) => {
      await prepare(page, scheme, 1440, 900);
      await openForm(page, publicView("YARN"));
      await fillYarn(page);
      await shoot(page, `40c-${scheme}`);
    });

    test("41 dyeing form, filled in", async ({ page }) => {
      await prepare(page, scheme);
      await openForm(page, publicView("DYEING"));
      await page.getByLabel("İşlem", { exact: true }).selectOption("REACTIVE");
      await page.getByLabel("Renk / ton").fill("Ekru");
      await page.getByRole("button", { name: "ZDHC MRSL" }).click();
      await page.getByRole("button", { name: "OEKO-TEX ECO PASSPORT" }).click();
      await page.getByLabel("İşlenen miktar").fill("1.150");
      await page.getByLabel("Su tüketimi").fill("62");
      await page.getByLabel("Enerji kaynağı").first().selectOption("NATURAL_GAS");
      await page.getByLabel("Yüzde").first().fill("80");
      await page.getByRole("button", { name: "Kaynak ekle" }).click();
      await page.getByLabel("Enerji kaynağı").nth(1).selectOption("SOLAR");
      await page.getByLabel("Yüzde").nth(1).fill("20");
      await page.getByLabel("Enerji tüketimi").fill("4,1");
      await page.getByLabel("Ad soyad").fill("Kerem Çınar");
      await page.getByLabel("Göreviniz").fill("Boyahane şefi");
      await shoot(page, `41-${scheme}`);
    });

    test("42 the documents section (closed until M5)", async ({ page }) => {
      await prepare(page, scheme);
      await openForm(page, publicView("YARN"));
      const section = page.getByRole("region", { name: "Belgeler" });
      await section.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await section.screenshot({ path: `${OUT}/42-${scheme}.png` });
    });

    test("43 confirmation, yarn", async ({ page }) => {
      await prepare(page, scheme);
      await openForm(page, publicView("YARN"));
      await fillYarn(page);
      await page.getByLabel("Ad soyad").fill("Ahmet Kaya");
      await page.getByLabel("Göreviniz").fill("Kalite sorumlusu");
      await page.getByRole("button", { name: "Gönder" }).click();
      await expect(page.getByText("Gönderim no KP-R-7HQ2")).toBeVisible();
      await shoot(page, `43-${scheme}`);
    });

    for (const [name, closed, title] of [
      ["expired", { status: 410, reason: "LINK_EXPIRED", link: LINK }, "Bu bağlantının süresi doldu"],
      ["revoked", { status: 410, reason: "LINK_REVOKED", link: LINK }, "Bu bağlantı geri alındı"],
      [
        "submitted",
        {
          status: 410,
          reason: "ALREADY_SUBMITTED",
          link: { ...LINK, submitterName: "Ahmet Kaya", submittedAt: new Date(2026, 9, 8, 11, 4).toISOString(), code: "KP-R-7HQ2" },
        },
        "Bu form zaten gönderildi",
      ],
      ["invalid", { status: 404, reason: "LINK_INVALID" }, "Bağlantı geçersiz"],
    ] as const) {
      test(`44 ${name}`, async ({ page }) => {
        await prepare(page, scheme);
        await mockPublicRequest(page, { closed: closed as never });
        await page.goto(`/r#${TOKEN}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
        await shoot(page, `44-${name}-${scheme}`);
      });
    }

    test("45 correction", async ({ page }) => {
      await prepare(page, scheme);
      await mockPublicRequest(page, { view: correctionView() });
      await page.goto(`/r#${TOKEN}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("İplik verilerini düzeltin");
      await shoot(page, `45-${scheme}`);
    });
  });
}

test.describe("design references", () => {
  // The design canvas (third-party support.js) sometimes never lays out a frame; a fresh page fixes it.
  test.describe.configure({ retries: 2 });
  const design = serveDesign(DESIGN_DIR);

  test("capture 39–45", async ({ page }) => {
    test.setTimeout(300_000);
    await captureDesignFrames(page, design.url("KozaPass_v0.4.dc.html"), OUT, ["39", "40a", "40b", "40c", "41", "42", "43", "44", "45"]);
  });
});
