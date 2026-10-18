import { expect, type Page, test } from "@playwright/test";
import path from "node:path";
import { mockAuthApi } from "./api-mock";
import { designBatches, mockCatalogApi, type MockBatch } from "./catalog-mock";
import { type DocKind, type MockDocument, mockDocument, mockDocumentsApi } from "./documents-mock";

/*
 * Screenshots for the side-by-side review with Claude Design v0.5 (docs/design/impl-v0.5/), the panel side of
 * M5: frames 56a–60 (61, the suppliers' certificates column, is shot by screenshots-v05-suppliers). The file
 * name carries the frame: <frame>-<theme>.png.
 * Run: pnpm --filter web e2e screenshots-v05
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v0.5");
const DESKTOP = { width: 1440, height: 900 };
/** The design's "today": 18 Oct 2026 (a certificate that ended on 15 Oct is "3 gün önce"). */
const TODAY = new Date(2026, 9, 18, 10, 30);
const BATCH_0918 = "30000000-0000-4000-8000-000000000002";

type Scheme = "light" | "dark";

interface Setup {
  kinds?: DocKind[];
  role?: string;
  /** The page's "now" (default: the design's 18 Oct 2026). */
  today?: Date;
  upload?: Parameters<typeof mockDocumentsApi>[1]["upload"];
  /** Changes to the documents before the page loads. */
  tweak?: (docs: MockDocument[]) => void;
}

/** The chain of design 09 with the document counts of frame 59. */
function batchesWithDocuments(): MockBatch[] {
  const batches = designBatches();
  const steps = batches.find((b) => b.id === BATCH_0918)!.steps;
  const counts: [number, number, number][] = [
    [0, 1, 0], // lif
    [1, 2, 0], // iplik, Bursa
    [2, 2, 1], // iplik, Maras: a document waits
    [3, 6, 1], // kumas
    [4, 2, 0], // boya
  ];
  for (const [i, total, unreviewed] of counts) {
    steps[i].documentCount = total;
    steps[i].unreviewedDocumentCount = unreviewed;
  }
  return batches;
}

async function prepare(page: Page, scheme: Scheme, { kinds = [], role, upload, tweak, today = TODAY }: Setup = {}) {
  await page.setViewportSize(DESKTOP);
  await page.clock.install({ time: today });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
  await mockAuthApi(page, { signedIn: true, role });
  const batches = batchesWithDocuments();
  await mockCatalogApi(page, { batches });
  const fabric = batches.find((b) => b.id === BATCH_0918)!.steps.find((s) => s.stepType === "FABRIC")!;
  const docs = kinds.map((k) => mockDocument(k, fabric.id));
  tweak?.(docs);
  await mockDocumentsApi(page, { docs, upload });
  return docs;
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

const chain = (page: Page) => page.getByRole("group", { name: "Tedarik zinciri" });

/** Opens the fabric step's panel and scrolls to its documents (design: scroll-docs). */
async function openPanel(page: Page) {
  await page.goto(`/batches/${BATCH_0918}`);
  await chain(page).getByRole("button", { name: "Kumaş adımı: Denizli Örme Tekstil" }).click();
  const panel = page.getByRole("dialog", { name: "Denizli Örme Tekstil" });
  await expect(panel).toBeVisible();
  const section = panel.getByRole("region", { name: "Belgeler" });
  await section.scrollIntoViewIfNeeded();
  return { panel, section };
}

const ALL: DocKind[] = ["reading", "full", "low", "unreadable", "error", "approved"];

async function openReview(page: Page, kind: DocKind) {
  const { section } = await openPanel(page);
  const file = mockDocument(kind, "").originalName;
  await section.getByRole("button", { name: new RegExp(`^${file.replace(".", "\\.")} ·`) }).click();
  const dialog = page.getByRole("dialog", { name: "Belge inceleme" });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("56a node panel, six document chips", async ({ page }) => {
      await prepare(page, scheme, { kinds: ALL });
      const { section } = await openPanel(page);
      await expect(section.getByText("6 belge")).toBeVisible();
      for (const chip of ["Okunuyor", "Onay bekliyor", "Düşük güven", "Okunamadı", "Hata", "Onaylandı"]) {
        await expect(section.getByText(chip, { exact: true })).toBeVisible();
      }
      await shoot(page, `56a-${scheme}`);
    });

    test("56b node panel, no documents", async ({ page }) => {
      await prepare(page, scheme);
      const { section } = await openPanel(page);
      await expect(section.getByText("Bu adıma henüz belge yüklenmedi.")).toBeVisible();
      await shoot(page, `56b-${scheme}`);
    });

    test("57a review, reading", async ({ page }) => {
      await prepare(page, scheme, {
        kinds: ["reading"],
        tweak: ([d]) => (d.createdAt = new Date(TODAY.getTime() - 6_000).toISOString()),
      });
      const dialog = await openReview(page, "reading");
      await expect(dialog.getByText("Belge okunuyor")).toBeVisible();
      await shoot(page, `57a-${scheme}`);
    });

    test("57a2 review, reading for more than 30 seconds", async ({ page }) => {
      await prepare(page, scheme, {
        kinds: ["reading"],
        tweak: ([d]) => (d.createdAt = new Date(TODAY.getTime() - 33_000).toISOString()),
      });
      const dialog = await openReview(page, "reading");
      await expect(dialog.getByText("Sayfadan ayrılabilirsiniz.")).toBeVisible({ timeout: 10_000 });
      await shoot(page, `57a2-${scheme}`);
    });

    test("57b review, fully read", async ({ page }) => {
      await prepare(page, scheme, { kinds: ["full"] });
      const dialog = await openReview(page, "full");
      await expect(dialog.getByLabel("Sertifika no")).toHaveValue("DEMO-GOTS-TR-20418");
      await expect(dialog.getByRole("button", { name: "Onayla" })).toBeEnabled();
      await shoot(page, `57b-${scheme}`);
    });

    test("57c review, low confidence", async ({ page }) => {
      await prepare(page, scheme, { kinds: ["low"] });
      const dialog = await openReview(page, "low");
      await expect(dialog.getByText("3 alan kontrol istiyor")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Onayla" })).toBeDisabled();
      await shoot(page, `57c-${scheme}`);
    });

    test("57d review, unreadable", async ({ page }) => {
      await prepare(page, scheme, { kinds: ["unreadable"] });
      const dialog = await openReview(page, "unreadable");
      await expect(dialog.getByText("Bu belgede okunabilir metin yok, alanları elle girin")).toBeVisible();
      await expect(dialog.getByText("Teknik ayrıntı: NO_TEXT_LAYER")).toBeVisible();
      await shoot(page, `57d-${scheme}`);
    });

    test("57d2 review, unreadable with the AI reading open", async ({ page }) => {
      const docs = await prepare(page, scheme, { kinds: ["unreadable"] });
      docs[0].rereadable = true;
      const dialog = await openReview(page, "unreadable");
      await expect(dialog.getByRole("button", { name: "Tekrar oku" })).toBeVisible();
      await shoot(page, `57d2-${scheme}`);
    });

    test("57e review, error", async ({ page }) => {
      await prepare(page, scheme, { kinds: ["error"] });
      const dialog = await openReview(page, "error");
      await expect(dialog.getByText("Belge okunurken hata oluştu")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Tekrar oku" })).toBeVisible();
      await shoot(page, `57e-${scheme}`);
    });

    test("57f review, approved", async ({ page }) => {
      await prepare(page, scheme, { kinds: ["approved"] });
      const dialog = await openReview(page, "approved");
      await expect(dialog.getByText("Onaylayan Elif Yılmaz")).toBeVisible();
      await expect(dialog.getByText("Düzeltildi", { exact: true })).toBeVisible();
      await shoot(page, `57f-${scheme}`);
    });

    test("57g review, certificate expired", async ({ page }) => {
      // The synthetic certificate ended on 31 Dec 2025: three days earlier is "3 gün önce", as in the design.
      await prepare(page, scheme, { kinds: ["expired"], today: new Date(2026, 0, 3, 10, 30) });
      const dialog = await openReview(page, "expired");
      await expect(dialog.getByText("Bitiş tarihi geçmiş · 3 gün önce")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Onayla" })).toBeEnabled();
      await shoot(page, `57g-${scheme}`);
    });

    test("57h review, a role that cannot approve", async ({ page }) => {
      await prepare(page, scheme, { kinds: ["full"], role: "EDITOR" });
      const dialog = await openReview(page, "full");
      await expect(dialog.getByText("Onay için yönetici yetkisi gerekir").first()).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Onayla" })).toBeDisabled();
      await shoot(page, `57h-${scheme}`);
    });

    test("57i review, closing with unsaved changes", async ({ page }) => {
      await prepare(page, scheme, { kinds: ["low"] });
      const dialog = await openReview(page, "low");
      await dialog.getByLabel("Sertifika no").fill("23.HTR.71245");
      await dialog.getByRole("button", { name: "Vazgeç" }).click();
      await expect(page.getByRole("alertdialog", { name: "Kaydedilmemiş değişiklikler var" })).toBeVisible();
      await shoot(page, `57i-${scheme}`);
    });

    // The longest language at the narrowest width: nothing may be cut off (docs/m5-plan.md §9).
    if (scheme === "light") {
      for (const [frame, kind, text] of [
        ["57c", "low", /Felder brauchen eine Prüfung/],
        ["57d", "unreadable", /enthält keinen lesbaren Text/],
        ["57e", "error", /Beim Lesen des Dokuments/],
      ] as const) {
        test(`${frame} review in German at 1024 px`, async ({ page }) => {
          await prepare(page, scheme, { kinds: [kind] });
          await page.setViewportSize({ width: 1024, height: 768 });
          await page.context().addCookies([{ name: "NEXT_LOCALE", value: "de", url: "http://localhost:3100" }]);
          await page.goto(`/batches/${BATCH_0918}`);
          await page.getByRole("group").getByRole("button", { name: /Denizli Örme Tekstil/ }).click();
          await page.getByRole("button", { name: new RegExp(`^${mockDocument(kind, "").originalName.replace(".", "[.]")} ·`) }).click();
          const dialog = page.getByRole("dialog", { name: "Dokumentprüfung" });
          await expect(dialog.getByText(text).first()).toBeVisible();
          // No clipped text anywhere in the dialog: every text element shows all of its content.
          const clipped = await dialog.evaluate((root) =>
            [...root.querySelectorAll<HTMLElement>("span, p, h2, h3, button, label")]
              .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible" && el.children.length === 0)
              .map((el) => el.textContent),
          );
          expect(clipped).toEqual([]);
          await shoot(page, `${frame}-de-1024-${scheme}`);
        });
      }
    }

    test("58a upload, dragging and uploading", async ({ page }) => {
      // The mocked route never reads the body, so the browser reports no progress: say 64 % by hand, as in the design.
      await page.addInitScript(() => {
        const send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body) {
          send.call(this, body);
          this.upload.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: 64, total: 100 }));
        };
      });
      await prepare(page, scheme, { kinds: ["reading", "full"], upload: () => "hang" });
      const { section } = await openPanel(page);
      await section.locator("input[type=file]").setInputFiles({
        name: "oekotex_100_2026_ek.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.alloc(1_100_000, 1),
      });
      await expect(section.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "64");
      const zone = section.getByText("Dosyaları buraya sürükleyin");
      await zone.dispatchEvent("dragover", { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
      await expect(section.getByText("Bırakın, yükleme başlasın")).toBeVisible();
      await shoot(page, `58a-${scheme}`);
    });

    test("58b upload, inline errors", async ({ page }) => {
      let n = 0;
      await prepare(page, scheme, {
        kinds: ["full"],
        upload: () => {
          n += 1;
          return n === 1
            ? { status: 400, body: { type: "urn:tekpas:problem:validation", title: "Validation failed", errors: [{ field: "file", code: "FileEncrypted" }] } }
            : n === 2
              ? { status: 409, body: { type: "urn:tekpas:problem:conflict", title: "Conflict", reason: "DUPLICATE_DOCUMENT" } }
              : n === 3
                ? { status: 400, body: { type: "urn:tekpas:problem:validation", title: "Validation failed", errors: [{ field: "file", code: "FilePages" }] } }
                : { status: 429, body: { type: "urn:tekpas:problem:too-many-requests", title: "Too many requests" } };
        },
      });
      const { section } = await openPanel(page);
      const input = section.locator("input[type=file]");
      const pdf = (name: string, size = 800_000) => ({ name, mimeType: "application/pdf", buffer: Buffer.alloc(size, 1) });
      await input.setInputFiles([
        { name: "teknik_foy.docx", mimeType: "application/msword", buffer: Buffer.alloc(300_000, 1) },
        pdf("GOTS_tarama.pdf", 14_200_000),
        pdf("fatura_korumali.pdf"),
        pdf("gots_kapsam_2026.pdf", 1_400_000),
        pdf("urun_katalogu_2026.pdf", 6_100_000),
        pdf("oekotex_100_2026.pdf", 1_100_000),
      ]);
      await expect(section.getByRole("alert")).toHaveCount(6);
      await expect(section.getByText("Çok fazla deneme yapıldı. 1 dakika sonra tekrar deneyin.")).toBeVisible();
      await section.getByRole("button", { name: /^Belge yükle$/ }).scrollIntoViewIfNeeded();
      await shoot(page, `58b-${scheme}`);
    });

    test("59 chain node, document count and waiting dot", async ({ page }) => {
      await prepare(page, scheme);
      await page.goto(`/batches/${BATCH_0918}`);
      const node = chain(page).getByRole("button", { name: "Kumaş adımı: Denizli Örme Tekstil" });
      await expect(node.getByLabel("6 belge")).toBeVisible();
      await expect(node.getByRole("img", { name: "Onay bekleyen belge var" })).toBeVisible();
      await shoot(page, `59-${scheme}`);
    });

    test("60 47b correction presets for documents", async ({ page }) => {
      await prepare(page, scheme, { kinds: ["unreadable"] });
      const { panel } = await openPanel(page);
      await panel.getByRole("button", { name: "Düzeltme iste" }).click();
      await panel.getByRole("button", { name: "Belge okunaksız" }).click();
      await expect(panel.getByRole("button", { name: "Sertifika süresi dolmuş" })).toBeVisible();
      // The form has been scrolled into view on its own: the send button is whole, above the footer bar.
      await expect(panel.getByRole("button", { name: "Düzeltme talebini gönder" })).toBeInViewport({ ratio: 1 });
      await shoot(page, `60-${scheme}`);
    });
  });
}
