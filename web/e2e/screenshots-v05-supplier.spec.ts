import { expect, type Page, test } from "@playwright/test";
import path from "node:path";
import { captureDesignFrames, serveDesign } from "./design-capture";
import {
  documentsCorrectionView,
  fileProblem,
  mockPublicDocuments,
  mockPublicRequest,
  publicDocument,
  publicView,
  SUPPLIER_NOW,
  TOKEN,
  tooManyRequests,
  type UploadBehaviour,
} from "./supplier-mock";

/*
 * Screenshots for the side-by-side review with Claude Design v0.5 (docs/design/impl-v0.5/), the supplier's side
 * of M5: frames 49–55b, a 390 px phone. <frame>-<theme>.png come from the app, design-<frame>-<theme>.png from
 * the approved design file (when its canvas can load React from the network). The design draws the Documents
 * section alone (49–53b), so these crop to it (and the demo note above it); 54 and 55 are the page.
 * Run: pnpm --filter web e2e screenshots-v05-supplier
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v0.5");

type Scheme = "light" | "dark";

const bytes = (mb: number) => Math.round(mb * 1024 * 1024);
const file = (name: string, mb: number) => ({
  name,
  mimeType: name.endsWith(".jpg") ? "image/jpeg" : name.endsWith(".png") ? "image/png" : "application/pdf",
  buffer: Buffer.alloc(bytes(mb), "x"),
});

const section = (page: Page) => page.getByRole("region", { name: "Belgeler" });
const picker = (page: Page) => page.getByTestId("supplier-document-input");

/** The design's three good documents (52a). */
const GOTS = () => file("gots_sertifika_2026.pdf", 1.4);
const TECH = () => file("teknik_foy_ME-2291.pdf", 0.6);
const LABEL = () => file("oekotex_100_etiket.jpg", 2.3);

async function prepare(
  page: Page,
  scheme: Scheme,
  view: object = publicView("YARN"),
  behave?: (name: string, attempt: number) => UploadBehaviour,
) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: SUPPLIER_NOW });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
  // A transfer to a test server has no progress to speak of: the page is told it stands at `__fakeProgress` %.
  await page.addInitScript(() => {
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body) {
      send.call(this, body);
      const percent = (window as unknown as { __fakeProgress?: number }).__fakeProgress;
      const upload = this.upload as unknown as { onprogress?: (e: object) => void };
      if (percent !== undefined && upload.onprogress) {
        setTimeout(() => upload.onprogress?.({ lengthComputable: true, loaded: percent, total: 100 }), 150);
      }
    };
  });
  await mockPublicRequest(page, { view });
  const docs = await mockPublicDocuments(page, { behave });
  await page.goto(`/r#${TOKEN}`);
  if (!("rejection" in view)) await page.getByRole("button", { name: "Forma başla" }).click();
  await expect(section(page)).toBeVisible();
  return docs;
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
}

/** The Documents section, with the demo note above it when there is one, the way the design frames show it. */
async function shootDocs(page: Page, name: string) {
  await settle(page);
  const box = await page.evaluate(() => {
    const section = document.getElementById("section-documents")!;
    const note = section.previousElementSibling?.getAttribute("role") === "note" ? section.previousElementSibling : null;
    const top = (note ?? section).getBoundingClientRect().top + window.scrollY;
    const bottom = section.getBoundingClientRect().bottom + window.scrollY;
    return { x: 0, y: Math.max(0, top - 16), width: window.innerWidth, height: bottom - top + 32 };
  });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, clip: box });
}

/** The page from the top down to the end of the Documents section (the correction's banner, title and section). */
async function shootUpToDocs(page: Page, name: string) {
  await settle(page);
  const height = await page.evaluate(() => document.getElementById("section-documents")!.getBoundingClientRect().bottom + window.scrollY + 16);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, clip: { x: 0, y: 0, width: 390, height } });
}

const fakeProgress = (page: Page, percent: number) =>
  page.evaluate((p) => ((window as unknown as { __fakeProgress?: number }).__fakeProgress = p), percent);

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("49 the Documents section, empty", async ({ page }) => {
      await prepare(page, scheme);
      await shootDocs(page, `49-${scheme}`);
    });

    test("50 the demo note, AI reading on", async ({ page }) => {
      await prepare(page, scheme, publicView("YARN", { aiReading: true }));
      await expect(page.getByRole("note")).toBeVisible();
      await shootDocs(page, `50-${scheme}`);
    });

    test("51 a file on its way", async ({ page }) => {
      const hold = new Promise<void>(() => {});
      await prepare(page, scheme, publicView("YARN"), (name) => (name === "oekotex_100_etiket.jpg" ? { hold } : { accept: true }));
      await picker(page).setInputFiles(GOTS());
      await expect(section(page)).toContainText("1 / 5");
      await fakeProgress(page, 64);
      await picker(page).setInputFiles(LABEL());
      await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "64");
      await shootDocs(page, `51-${scheme}`);
    });

    test("52a three documents uploaded", async ({ page }) => {
      await prepare(page, scheme);
      await picker(page).setInputFiles([GOTS(), TECH(), LABEL()]);
      await expect(section(page)).toContainText("3 / 5");
      await expect(page.getByRole("progressbar")).toHaveCount(0);
      await shootDocs(page, `52a-${scheme}`);
    });

    test("52b the limit of five", async ({ page }) => {
      await prepare(page, scheme);
      await picker(page).setInputFiles([
        GOTS(),
        TECH(),
        LABEL(),
        file("iplik_test_raporu.pdf", 3.2),
        file("gots_islem_sertifikasi.pdf", 0.9),
        file("oekotex_ek_sayfa.pdf", 0.4),
      ]);
      await expect(section(page)).toContainText("5 / 5");
      await expect(page.getByRole("button", { name: "Belge yükle" })).toBeDisabled();
      await expect(section(page).getByRole("alert")).toHaveCount(1);
      await shootDocs(page, `52b-${scheme}`);
    });

    test("53a the file checks", async ({ page }) => {
      await prepare(page, scheme, publicView("YARN"), (name) =>
        name === "fatura_korumali.pdf"
          ? { problem: fileProblem(400, "FileEncrypted") }
          : name === "urun_katalogu_2026.pdf"
            ? { problem: fileProblem(400, "FilePages") }
            : { accept: true },
      );
      await picker(page).setInputFiles([
        GOTS(),
        file("teknik_foy.docx", 0.3),
        file("GOTS_tarama.pdf", 14.2),
        GOTS(),
        file("fatura_korumali.pdf", 0.8),
        file("urun_katalogu_2026.pdf", 6.1),
      ]);
      await expect(section(page).getByRole("alert")).toHaveCount(5);
      await shootDocs(page, `53a-${scheme}`);
    });

    test("53b too many attempts and a dropped connection", async ({ page }) => {
      await prepare(page, scheme, publicView("YARN"), (name) =>
        name === "oekotex_100_etiket.jpg"
          ? { problem: tooManyRequests }
          : name === "iplik_test_raporu.pdf"
            ? { abort: true, delayMs: 600 }
            : { accept: true },
      );
      await picker(page).setInputFiles([GOTS(), TECH()]);
      await expect(section(page)).toContainText("2 / 5");
      await picker(page).setInputFiles(LABEL());
      await expect(section(page).getByRole("alert")).toHaveCount(1);
      await fakeProgress(page, 42);
      await picker(page).setInputFiles(file("iplik_test_raporu.pdf", 3.2));
      await expect(section(page).getByRole("alert")).toHaveCount(2);
      await expect(section(page)).toContainText("yükleme %42");
      await shootDocs(page, `53b-${scheme}`);
    });

    test("54 the confirmation names the documents", async ({ page }) => {
      await prepare(page, scheme);
      await page.getByLabel("Yüzde").first().fill("80");
      await page.getByRole("button", { name: "Lif ekle" }).click();
      await page.getByLabel("Lif", { exact: true }).nth(1).selectOption("POLYESTER");
      await page.getByLabel("Yüzde").nth(1).fill("20");
      await page.getByLabel("Menşe ülke").selectOption("TR");
      await page.getByLabel("Teslim edilen").fill("640");
      await page.getByLabel("İplik numarası").fill("30/1");
      await page.getByRole("radio", { name: "Karde" }).click();
      await page.getByLabel("Ad soyad").fill("Ahmet Kaya");
      await picker(page).setInputFiles([GOTS(), TECH(), LABEL()]);
      await expect(section(page)).toContainText("3 / 5");
      await page.getByRole("button", { name: "Gönder" }).click();
      await expect(page.locator("dl")).toContainText("Belgeler · 3");
      await settle(page);
      await page.screenshot({ path: `${OUT}/54-${scheme}.png`, fullPage: true });
    });

    test("55a correction: unreadable document", async ({ page }) => {
      const earlier = publicDocument("teknik_foy_foto.jpg", bytes(2.8), { previous: true, at: new Date(2026, 9, 16, 11, 0) });
      await prepare(page, scheme, documentsCorrectionView("unreadable", [earlier]));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Belgelerinizi güncelleyin");
      await shootUpToDocs(page, `55a-${scheme}`);
    });

    test("55b correction: expired certificate, a new one added", async ({ page }) => {
      const earlier = publicDocument("oekotex_100_2025.pdf", bytes(1), { previous: true, at: new Date(2026, 9, 16, 11, 0) });
      await prepare(page, scheme, documentsCorrectionView("expired", [earlier]));
      await picker(page).setInputFiles(file("oekotex_100_2026.pdf", 1.1));
      await expect(section(page)).toContainText("1 / 5");
      await shootUpToDocs(page, `55b-${scheme}`);
    });
  });
}

test.describe("the approved design, for the side-by-side", () => {
  const design = serveDesign(path.resolve(__dirname, "../../docs/design/impl-v0.5"));

  test("frames 49–55b", async ({ page }) => {
    test.setTimeout(240_000);
    await captureDesignFrames(page, design.url("KozaPass_v0.5.dc.html"), OUT, ["49", "50", "51", "52a", "52b", "53a", "53b", "54", "55a", "55b"]);
  });
});
