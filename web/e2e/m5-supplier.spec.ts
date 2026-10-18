import { expect, type Page, test } from "@playwright/test";
import {
  closedProblem,
  documentsCorrectionView,
  conflictProblem,
  correctionView,
  fileProblem,
  mockPublicDocuments,
  mockPublicRequest,
  publicDocument,
  publicView,
  SUPPLIER_NOW,
  TOKEN,
  tooManyRequests,
} from "./supplier-mock";

/** M5, the supplier's side (design v0.5 49–55): the Documents section of /r#<token> on a phone. */

test.use({ viewport: { width: 390, height: 844 } });

const section = (page: Page) => page.getByRole("region", { name: "Belgeler" });
const picker = (page: Page) => page.getByTestId("supplier-document-input");

const pdf = (name: string, bytes = 1500) => ({ name, mimeType: "application/pdf", buffer: Buffer.alloc(bytes, "x") });

async function openForm(page: Page, view: object = publicView("YARN")) {
  await page.clock.install({ time: SUPPLIER_NOW });
  const api = await mockPublicRequest(page, { view });
  await page.goto(`/r#${TOKEN}`);
  if (!("rejection" in view)) await page.getByRole("button", { name: "Forma başla" }).click();
  await expect(section(page)).toBeVisible();
  return api;
}

/** The rest of the yarn form, so that a send can go through. */
async function fillYarn(page: Page) {
  await page.getByLabel("Yüzde").first().fill("80");
  await page.getByRole("button", { name: "Lif ekle" }).click();
  await page.getByLabel("Lif", { exact: true }).nth(1).selectOption("POLYESTER");
  await page.getByLabel("Yüzde").nth(1).fill("20");
  await page.getByLabel("Menşe ülke").selectOption("TR");
  await page.getByLabel("Teslim edilen").fill("640");
  await page.getByLabel("İplik numarası").fill("30/1");
  await page.getByRole("radio", { name: "Karde" }).click();
  await page.getByLabel("Ad soyad").fill("Ahmet Kaya");
}

test("49 → 52a: an empty section, then files are chosen with the browser's picker and listed as uploaded", async ({ page }) => {
  await openForm(page);
  const docs = await mockPublicDocuments(page);

  // 49: optional, empty, the three kinds of document, the rules.
  await expect(section(page)).toContainText("0 / 5");
  await expect(section(page)).toContainText("İsteğe bağlı");
  await expect(section(page)).toContainText("GOTS, OEKO-TEX, teknik föy");
  await expect(section(page)).toContainText("Fotoğraf çekebilir ya da dosyalarınızdan seçebilirsiniz.");
  await expect(section(page)).toContainText("PDF, JPG, PNG · en fazla 10 MB · PDF en fazla 20 sayfa");
  await expect(page.getByRole("note")).toHaveCount(0);

  // A real file picker: the button opens it (on a phone: camera or files), several files at once.
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Belge yükle" }).click();
  const fileChooser = await chooser;
  expect(fileChooser.isMultiple()).toBe(true);
  await fileChooser.setFiles([pdf("gots_sertifika_2026.pdf", 1_468_006), pdf("teknik_foy_ME-2291.pdf", 614_400)]);

  // 52a: each is listed with its size and type, with "Kaldır"; the counter follows.
  const list = page.getByRole("list", { name: "Yüklenen belgeler" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("listitem").nth(0)).toContainText("gots_sertifika_2026.pdf");
  await expect(list.getByRole("listitem").nth(0)).toContainText("1,4 MB · PDF");
  await expect(list.getByRole("listitem").nth(1)).toContainText("0,6 MB · PDF");
  await expect(list.getByRole("button", { name: "Kaldır: gots_sertifika_2026.pdf" })).toBeVisible();
  await expect(section(page)).toContainText("2 / 5");
  expect(docs.uploads.map((u) => u.name)).toEqual(["gots_sertifika_2026.pdf", "teknik_foy_ME-2291.pdf"]);
});

test("the token travels in a header only: not in the address of any upload or removal, not on the page", async ({ page }) => {
  await openForm(page);
  const docs = await mockPublicDocuments(page);
  const seen: string[] = [];
  page.on("request", (r) => seen.push(r.url()));
  page.on("console", (m) => seen.push(m.text()));

  await picker(page).setInputFiles(pdf("oekotex.pdf"));
  await expect(section(page)).toContainText("1 / 5");
  await page.getByRole("button", { name: "Kaldır: oekotex.pdf" }).click();
  await expect(section(page)).toContainText("0 / 5");

  expect(docs.uploads).toHaveLength(1);
  expect(docs.uploads[0].token).toBe(TOKEN);
  expect(docs.deletes).toHaveLength(1);
  expect(docs.deletes[0].token).toBe(TOKEN);
  // The XHR goes to the same origin, to a fixed path: nothing of the fragment is in any address or log line.
  for (const entry of [...seen, docs.uploads[0].url, docs.deletes[0].url]) expect(entry).not.toContain(TOKEN);
  expect(await page.evaluate(() => document.body.innerText)).not.toContain(TOKEN);
});

test("a demo with the AI reading on says so above the section; without it there is no note (50)", async ({ page }) => {
  await openForm(page, publicView("YARN", { aiReading: true }));
  await expect(page.getByRole("note")).toHaveText("Demo ortamı: gerçek belge yüklemeyin.");
  // The note comes before the section, not inside it.
  await expect(section(page).getByRole("note")).toHaveCount(0);
});

test("the supplier never sees anything about the reading: only the file's name, size and that it is uploaded", async ({ page }) => {
  await openForm(page, publicView("YARN", { aiReading: true }));
  // Even if the server said more, the page has no place for it; and what it does say has no such words.
  await mockPublicDocuments(page);
  await picker(page).setInputFiles(pdf("gots.pdf"));
  await expect(section(page)).toContainText("1 / 5");
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/güven|okunuyor|okundu|okunamad|sertifika no|\bAI\b|onay/i);
});

test("51: a file on its way shows its progress and can be cancelled; the form waits for it", async ({ page }) => {
  await openForm(page);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve));
  const docs = await mockPublicDocuments(page, { behave: () => ({ hold }) });
  await fillYarn(page);

  await picker(page).setInputFiles(pdf("oekotex_100_etiket.pdf"));
  const row = page.getByRole("listitem").filter({ hasText: "oekotex_100_etiket.pdf" });
  await expect(row.getByRole("progressbar", { name: /Yükleniyor/ })).toBeVisible();
  await expect(row.getByRole("button", { name: "İptal: oekotex_100_etiket.pdf" })).toBeVisible();
  await expect.poll(() => docs.uploads.length).toBe(1);

  // Sending waits for the transfer (a document that arrives after the send would be refused).
  await expect(page.getByRole("button", { name: "Gönder" })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Belge yükleniyor" })).toBeVisible();

  release();
  await expect(row).toContainText("PDF");
  await expect(row.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Gönder" })).toBeEnabled();
});

test("cancelling a transfer removes the row and nothing is left to remove on the server", async ({ page }) => {
  await openForm(page);
  const hold = new Promise<void>(() => {});
  const docs = await mockPublicDocuments(page, { behave: () => ({ hold }) });
  await picker(page).setInputFiles(pdf("yavas.pdf"));
  await page.getByRole("button", { name: "İptal: yavas.pdf" }).click();
  await expect(section(page)).toContainText("0 / 5");
  await expect(page.getByRole("button", { name: "Gönder" })).toBeEnabled();
  expect(docs.deletes).toHaveLength(0);
});

test("52b: the fifth document closes the button with its reason; removing one opens it again", async ({ page }) => {
  await openForm(page);
  await mockPublicDocuments(page);
  await picker(page).setInputFiles(["a", "b", "c", "d", "e"].map((n) => pdf(`belge_${n}.pdf`, 1000 + n.charCodeAt(0))));
  await expect(section(page)).toContainText("5 / 5");
  const button = page.getByRole("button", { name: "Belge yükle" });
  await expect(button).toBeDisabled();
  await expect(section(page)).toContainText("5 belge sınırına ulaştınız. Yeni belge eklemek için birini kaldırın.");

  await page.getByRole("button", { name: "Kaldır: belge_c.pdf" }).click();
  await expect(section(page)).toContainText("4 / 5");
  await expect(button).toBeEnabled();
  await expect(section(page)).not.toContainText("sınırına ulaştınız");
});

test("a sixth file chosen together with the others is turned away with the limit message", async ({ page }) => {
  await openForm(page);
  const docs = await mockPublicDocuments(page);
  await picker(page).setInputFiles(["a", "b", "c", "d", "e", "f"].map((n) => pdf(`belge_${n}.pdf`, 1000 + n.charCodeAt(0))));
  const rejected = page.getByRole("listitem").filter({ hasText: "belge_f.pdf" });
  await expect(rejected.getByRole("alert")).toHaveText("Belge sınırı doldu. Bu bağlantıyla en fazla 5 belge gönderilebilir.");
  await expect(section(page)).toContainText("5 / 5");
  // The server was not asked for it.
  await expect.poll(() => docs.uploads.length).toBe(5);
});

test("53a: what the page can tell before the transfer is said on the file's own row, and a refused file only offers 'Kaldır'", async ({
  page,
}) => {
  await openForm(page);
  const docs = await mockPublicDocuments(page);
  await picker(page).setInputFiles([
    pdf("gots_sertifika_2026.pdf", 1000),
    { name: "teknik_foy.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.alloc(300_000) },
    pdf("GOTS_tarama.pdf", 14.2 * 1024 * 1024),
    pdf("gots_sertifika_2026.pdf", 1000),
  ]);
  const row = (name: string) => page.getByRole("listitem").filter({ hasText: name });

  await expect(row("teknik_foy.docx").getByRole("alert")).toHaveText("Bu biçim desteklenmiyor. PDF, JPG veya PNG yükleyin.");
  await expect(row("GOTS_tarama.pdf").getByRole("alert")).toHaveText("Dosya 14,2 MB. En fazla 10 MB olabilir.");
  await expect(row("gots_sertifika_2026.pdf").nth(1).getByRole("alert")).toHaveText("Bu belge zaten yüklendi.");
  for (const name of ["teknik_foy.docx", "GOTS_tarama.pdf"]) {
    await expect(row(name).getByRole("button")).toHaveText("Kaldır");
  }
  // Only the good one reached the server and counts.
  await expect(section(page)).toContainText("1 / 5");
  expect(docs.uploads.map((u) => u.name)).toEqual(["gots_sertifika_2026.pdf"]);

  await row("teknik_foy.docx").getByRole("button", { name: "Kaldır: teknik_foy.docx" }).click();
  await expect(row("teknik_foy.docx")).toHaveCount(0);
});

test("53a: what only the server can tell comes back on the file's row (encrypted, pages, type, duplicate, limit)", async ({ page }) => {
  await openForm(page);
  const problems: Record<string, ReturnType<typeof fileProblem> | ReturnType<typeof conflictProblem>> = {
    "fatura_korumali.pdf": fileProblem(400, "FileEncrypted"),
    "urun_katalogu_2026.pdf": fileProblem(400, "FilePages"),
    "sahte.pdf": fileProblem(415, "FileType"),
    "tarama_buyuk.png": fileProblem(400, "FileDimensions"),
    "bos.pdf": fileProblem(400, "FileEmpty"),
    "ayni_baska_adla.pdf": conflictProblem("DUPLICATE_DOCUMENT"),
    "fazla.pdf": conflictProblem("DOCUMENT_LIMIT"),
  };
  const docs = await mockPublicDocuments(page, { behave: (name) => (problems[name] ? { problem: problems[name] } : { accept: true }) });
  const names = Object.keys(problems);
  // Five at once is what the client lets through together; the rest follow once these are answered.
  await picker(page).setInputFiles(names.slice(0, 5).map((n, i) => pdf(n, 1000 + i)));
  await expect(section(page).getByRole("alert")).toHaveCount(5);
  await picker(page).setInputFiles(names.slice(5).map((n, i) => pdf(n, 2000 + i)));

  const message = (name: string) => page.getByRole("listitem").filter({ hasText: name }).getByRole("alert");
  await expect(message("fatura_korumali.pdf")).toHaveText("PDF şifreli ya da bozuk, açılamadı. Şifresiz bir kopya yükleyin.");
  await expect(message("urun_katalogu_2026.pdf")).toHaveText(
    "PDF 20 sayfadan uzun. En fazla 20 sayfa olabilir; yalnızca sertifika sayfalarını yükleyin.",
  );
  await expect(message("sahte.pdf")).toHaveText("Bu biçim desteklenmiyor. PDF, JPG veya PNG yükleyin.");
  await expect(message("tarama_buyuk.png")).toHaveText("Görüntü çok büyük. En fazla 40 megapiksel olabilir.");
  await expect(message("bos.pdf")).toHaveText("Dosya boş. Başka bir dosya seçin.");
  await expect(message("ayni_baska_adla.pdf")).toHaveText("Bu belge zaten yüklendi.");
  await expect(message("fazla.pdf")).toHaveText("Belge sınırı doldu. Bu bağlantıyla en fazla 5 belge gönderilebilir.");
  // Nothing was stored for a refused file, so nothing counts.
  await expect(section(page)).toContainText("0 / 5");
  // The ones that cannot work later offer only "Kaldır".
  await expect(page.getByRole("button", { name: /^Tekrar dene/ })).toHaveCount(0);
  expect(docs.uploads).toHaveLength(Object.keys(problems).length);
});

test("53b: too many attempts (429) and a dropped connection offer 'Tekrar dene' and then go through", async ({ page }) => {
  await openForm(page);
  const docs = await mockPublicDocuments(page, {
    behave: (name, attempt) =>
      name === "oekotex_100_etiket.pdf" && attempt === 1
        ? { problem: tooManyRequests }
        : name === "iplik_test_raporu.pdf" && attempt === 1
          ? { abort: true }
          : { accept: true },
  });
  await picker(page).setInputFiles([pdf("oekotex_100_etiket.pdf", 2000), pdf("iplik_test_raporu.pdf", 3000)]);

  const rate = page.getByRole("listitem").filter({ hasText: "oekotex_100_etiket.pdf" });
  const net = page.getByRole("listitem").filter({ hasText: "iplik_test_raporu.pdf" });
  await expect(rate.getByRole("alert")).toHaveText("Çok fazla deneme yapıldı. 1 dakika sonra tekrar deneyin.");
  await expect(net.getByRole("alert")).toContainText("Bağlantı koptu, yükleme %");
  await expect(section(page)).toContainText("0 / 5");

  await rate.getByRole("button", { name: "Tekrar dene: oekotex_100_etiket.pdf" }).click();
  await net.getByRole("button", { name: "Tekrar dene: iplik_test_raporu.pdf" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /deneme|koptu/ })).toHaveCount(0);
  await expect(rate).toContainText("PDF");
  await expect(net).toContainText("PDF");
  await expect(section(page)).toContainText("2 / 5");
  expect(docs.uploads.map((u) => u.name)).toEqual([
    "oekotex_100_etiket.pdf",
    "iplik_test_raporu.pdf",
    "oekotex_100_etiket.pdf",
    "iplik_test_raporu.pdf",
  ]);
});

test("a link that closed while the file was on its way shows the closed-link page", async ({ page }) => {
  await openForm(page);
  await mockPublicDocuments(page, { behave: () => ({ problem: closedProblem("LINK_REVOKED") }) });
  await picker(page).setInputFiles(pdf("gots.pdf"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bu bağlantı geri alındı");
});

test("a removal that fails says so on the row and can be tried again", async ({ page }) => {
  await openForm(page);
  let refuse = true;
  await mockPublicDocuments(page, { onDelete: () => (refuse ? { status: 500 } : undefined) });
  await picker(page).setInputFiles(pdf("gots.pdf"));
  await expect(section(page)).toContainText("1 / 5");
  await page.getByRole("button", { name: "Kaldır: gots.pdf" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Belge kaldırılamadı" })).toBeVisible();
  await expect(section(page)).toContainText("1 / 5");

  refuse = false;
  await page.getByRole("button", { name: "Kaldır: gots.pdf" }).click();
  await expect(section(page)).toContainText("0 / 5");
});

test("54: the confirmation names the uploaded documents; the form is sent with the documents already on the server", async ({ page }) => {
  const api = await openForm(page);
  await mockPublicDocuments(page);
  await fillYarn(page);
  await picker(page).setInputFiles([pdf("gots_sertifika_2026.pdf"), pdf("teknik_foy_ME-2291.pdf", 2000), pdf("silinecek.pdf", 3000)]);
  await expect(section(page)).toContainText("3 / 5");
  await page.getByRole("button", { name: "Kaldır: silinecek.pdf" }).click();
  await expect(section(page)).toContainText("2 / 5");
  await page.getByRole("button", { name: "Gönder" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Verileriniz Karaca Tekstil A.Ş. firmasına iletildi");
  const summary = page.locator("dl");
  await expect(summary).toContainText("Belgeler · 2");
  await expect(summary).toContainText("gots_sertifika_2026.pdf");
  await expect(summary).toContainText("teknik_foy_ME-2291.pdf");
  await expect(summary).not.toContainText("silinecek.pdf");
  // The documents are not part of the form's data: they are already stored under the link.
  expect(api.submits).toHaveLength(1);
  expect(JSON.stringify(api.submits[0].body)).not.toContain("gots_sertifika");
});

test("a form sent without documents has no documents row", async ({ page }) => {
  await openForm(page);
  await mockPublicDocuments(page);
  await fillYarn(page);
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Verileriniz Karaca Tekstil A.Ş. firmasına iletildi");
  await expect(page.locator("dl")).not.toContainText("Belgeler");
});

test("documents the link already holds (a reload before sending) are listed and can be removed", async ({ page }) => {
  const stored = publicDocument("gots_sertifika_2026.pdf", 1_468_006);
  const docs = await (async () => {
    await page.clock.install({ time: SUPPLIER_NOW });
    await mockPublicRequest(page, { view: publicView("YARN", { documents: [stored] }) });
    return mockPublicDocuments(page);
  })();
  await page.goto(`/r#${TOKEN}`);
  await page.getByRole("button", { name: "Forma başla" }).click();
  await expect(section(page)).toContainText("1 / 5");
  await expect(section(page)).toContainText("gots_sertifika_2026.pdf");
  await page.getByRole("button", { name: "Kaldır: gots_sertifika_2026.pdf" }).click();
  await expect(section(page)).toContainText("0 / 5");
  expect(docs.deletes.map((d) => d.id)).toEqual([stored.id]);
});

for (const reason of ["docs", "expired"] as const) {
  test(`55${reason === "docs" ? "a" : "b"}: a correction about the documents marks the section, locks the earlier ones and takes new ones`, async ({
    page,
  }) => {
    const earlier = publicDocument(reason === "docs" ? "teknik_foy_foto.jpg" : "oekotex_100_2025.pdf", reason === "docs" ? 2_936_012 : 1_048_576, {
      previous: true,
      at: new Date(2026, 9, 16, 11, 0),
    });
    const fixed = documentsCorrectionView(reason === "docs" ? "unreadable" : "expired", [earlier]);
    const api = await openForm(page, fixed);
    await mockPublicDocuments(page);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Belgelerinizi güncelleyin");
    await expect(page.getByText("İşaretli bölüme yeni belge ekleyip yeniden gönderin.")).toBeVisible();
    await expect(section(page)).toContainText("Düzeltme istenen alan");
    await expect(section(page)).toHaveCSS("border-top-color", "rgb(217, 45, 32)");
    // The section is where the person lands.
    await expect(section(page)).toBeInViewport();

    // The earlier submission's file is locked: read-only, no "Kaldır", not counted.
    const locked = page.getByRole("list", { name: "Önceki gönderimin belgeleri" });
    await expect(locked).toContainText(earlier.fileName);
    await expect(locked).toContainText("salt okunur");
    await expect(locked.getByRole("button")).toHaveCount(0);
    await expect(section(page)).toContainText("Önceki gönderim · 16 Eki 2026");
    await expect(section(page)).toContainText("Önceki belgeler değiştirilemez. Yeni belgeyi aşağıdan ekleyin.");
    await expect(section(page)).toContainText("0 / 5");

    await picker(page).setInputFiles(pdf("yeni_sertifika.pdf"));
    await expect(section(page)).toContainText("1 / 5");
    await page.getByLabel("Ad soyad").fill("Ahmet Kaya");
    await page.getByRole("button", { name: "Düzeltilmiş verileri gönder" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Verileriniz Karaca Tekstil A.Ş. firmasına iletildi");
    // Only this submission's document is named.
    await expect(page.locator("dl")).toContainText("Belgeler · 1");
    await expect(page.locator("dl")).toContainText("yeni_sertifika.pdf");
    await expect(page.locator("dl")).not.toContainText(earlier.fileName);
    expect(api.submits).toHaveLength(1);
  });
}

test("a correction about other fields keeps the earlier documents locked but does not mark the section", async ({ page }) => {
  const view = { ...correctionView(), documents: [publicDocument("teknik_foy.pdf", 1000, { previous: true })] };
  await openForm(page, view);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("İplik verilerini düzeltin");
  await expect(section(page)).not.toContainText("Düzeltme istenen alan");
  await expect(page.getByRole("list", { name: "Önceki gönderimin belgeleri" })).toContainText("teknik_foy.pdf");
});

test("keyboard: the picker button is reached with Tab and opens the file chooser with Enter; the row's action follows", async ({ page }) => {
  await openForm(page);
  await mockPublicDocuments(page);
  const button = page.getByRole("button", { name: "Belge yükle" });
  await button.focus();
  await expect(button).toBeFocused();
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles(pdf("gots.pdf"));
  const remove = page.getByRole("button", { name: "Kaldır: gots.pdf" });
  await expect(remove).toBeVisible();
  // Tab from the row's button goes on to the picker button; both have a visible focus ring and a 44 px target.
  const box = await remove.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  await remove.focus();
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
});

test("a phone at 360 px: the rows do not push the page sideways, long names are cut", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openForm(page);
  await mockPublicDocuments(page);
  await picker(page).setInputFiles([
    pdf("cok_uzun_bir_dosya_adi_gots_sertifikasi_karaca_tekstil_2026_ekim_son_hali_v3_imzali.pdf", 1200),
    pdf("kisa.pdf", 1300),
  ]);
  await expect(section(page)).toContainText("2 / 5");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
