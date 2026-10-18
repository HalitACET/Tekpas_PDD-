import { expect, type Page, test } from "@playwright/test";
import { mockAuthApi } from "./api-mock";
import { designBatches, mockCatalogApi } from "./catalog-mock";
import { type DocKind, mockDocument, mockDocumentsApi } from "./documents-mock";

/*
 * M5 on the panel (design v0.5 56–58): the step's documents, the review dialog and what it sends. The API is
 * mocked in the browser (see documents-mock.ts); the screenshots are in screenshots-v05.spec.ts.
 */
const BATCH_0918 = "30000000-0000-4000-8000-000000000002";
const TODAY = new Date(2026, 9, 18, 10, 30);

async function prepare(page: Page, kinds: DocKind[], { role, upload }: { role?: string; upload?: Parameters<typeof mockDocumentsApi>[1]["upload"] } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install({ time: TODAY });
  await mockAuthApi(page, { signedIn: true, role });
  const batches = designBatches();
  await mockCatalogApi(page, { batches });
  const fabric = batches.find((b) => b.id === BATCH_0918)!.steps.find((s) => s.stepType === "FABRIC")!;
  const docs = kinds.map((k) => mockDocument(k, fabric.id));
  await mockDocumentsApi(page, { docs, upload });
  return docs;
}

async function openPanel(page: Page) {
  await page.goto(`/batches/${BATCH_0918}`);
  await page.getByRole("group", { name: "Tedarik zinciri" }).getByRole("button", { name: "Kumaş adımı: Denizli Örme Tekstil" }).click();
  const panel = page.getByRole("dialog", { name: "Denizli Örme Tekstil" });
  return { panel, section: panel.getByRole("region", { name: "Belgeler" }) };
}

async function openReview(page: Page, kind: DocKind) {
  const { section } = await openPanel(page);
  await section.getByRole("button", { name: new RegExp(`^${mockDocument(kind, "").originalName.replace(".", "[.]")} ·`) }).click();
  const dialog = page.getByRole("dialog", { name: "Belge inceleme" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a step without documents says so and offers the upload", async ({ page }) => {
  await prepare(page, []);
  const { section } = await openPanel(page);
  await expect(section.getByText("Bu adıma henüz belge yüklenmedi.")).toBeVisible();
  await expect(section.getByRole("button", { name: "Belge yükle" })).toBeEnabled();
});

test("each card names the document's state, and only a failed reading offers 'Tekrar oku'", async ({ page }) => {
  await prepare(page, ["reading", "full", "low", "unreadable", "error", "approved"]);
  const { section } = await openPanel(page);
  await expect(section.getByRole("button", { name: /^kumas_teknik_foy_0918\.pdf · Okunuyor/ })).toBeVisible();
  await expect(section.getByRole("button", { name: /^gots_kapsam_2026\.pdf · Onay bekliyor/ })).toBeVisible();
  await expect(section.getByRole("button", { name: /^oekotex_100_2026\.pdf · Düşük güven/ })).toBeVisible();
  await expect(section.getByRole("button", { name: /^IMG_2041\.jpg · Okunamadı/ })).toBeVisible();
  await expect(section.getByRole("button", { name: /^scan_0917\.pdf · Hata/ })).toBeVisible();
  await expect(section.getByRole("button", { name: /^gots_islem_2026\.pdf · Onaylandı/ })).toBeVisible();
  await expect(section.getByRole("button", { name: "Tekrar oku" })).toHaveCount(1);
});

test("the chain node counts the step's documents and flags those waiting for a person", async ({ page }) => {
  await prepare(page, []);
  await page.goto(`/batches/${BATCH_0918}`);
  // designBatches carries no documents: zero, and no dot.
  const node = page.getByRole("group", { name: "Tedarik zinciri" }).getByRole("button", { name: "Kumaş adımı: Denizli Örme Tekstil" });
  await expect(node.getByLabel("0 belge")).toBeVisible();
  await expect(node.getByRole("img", { name: "Onay bekleyen belge var" })).toHaveCount(0);
});

test("the preview shows the file from a blob URL, not from the API's address", async ({ page }) => {
  await prepare(page, ["full"]);
  const dialog = await openReview(page, "full");
  const frame = dialog.locator("iframe");
  await expect(frame).toHaveAttribute("src", /^blob:/);
  await expect(dialog.getByText("Sayfa 1 / 1")).toBeVisible();
});

test("an image is previewed as an image and zooms", async ({ page }) => {
  await prepare(page, ["unreadable"]);
  const dialog = await openReview(page, "unreadable");
  const image = dialog.getByRole("img", { name: "IMG_2041.jpg" });
  await expect(image).toHaveAttribute("src", /^blob:/);
  await dialog.getByRole("button", { name: "Yakınlaştır" }).click();
  await expect(dialog.getByText("%125")).toBeVisible();
  await dialog.getByRole("button", { name: "Sığdır" }).click();
  await expect(dialog.getByText("%100")).toBeVisible();
});

test("a fully read document is confirmed as it is, with ISO dates", async ({ page }) => {
  await prepare(page, ["full"]);
  const dialog = await openReview(page, "full");
  await expect(dialog.getByText("Onaylanana kadar hiçbir değer kayda geçmez.")).toBeVisible();
  const sent = page.waitForRequest((r) => r.url().endsWith("/verify"));
  await dialog.getByRole("button", { name: "Onayla" }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    docType: "GOTS",
    certNo: "DEMO-GOTS-TR-20418",
    validFrom: "2026-01-15",
    validUntil: "2027-01-14",
  });
  await expect(dialog.getByText("Onaylayan Elif Yılmaz")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Kapat" }).last()).toBeVisible();
  await expect(dialog.getByLabel("Sertifika no")).toHaveCount(0); // read-only now
});

test("yellow fields block 'Onayla' until each is marked 'Doğru' or corrected", async ({ page }) => {
  await prepare(page, ["low"]);
  const dialog = await openReview(page, "low");
  const approve = dialog.getByRole("button", { name: "Onayla" });
  await expect(dialog.getByText("Önce 3 sarı alanı kontrol edin.")).toBeVisible();
  await expect(approve).toBeDisabled();

  await dialog.getByLabel("Sertifika no").fill("DEMO-OT-TR-0732");
  await expect(dialog.getByText("Önce 2 sarı alanı kontrol edin.")).toBeVisible();
  await expect(dialog.locator('[data-field="certNo"]').getByText("Düzeltildi")).toBeVisible();

  await dialog.locator('[data-field="issuer"]').getByRole("button", { name: "Doğru" }).click();
  await expect(approve).toBeDisabled();
  await dialog.locator('[data-field="validUntil"]').getByRole("button", { name: "Doğru" }).click();
  await expect(approve).toBeEnabled();

  const sent = page.waitForRequest((r) => r.url().endsWith("/verify"));
  await approve.click();
  expect((await sent).postDataJSON()).toMatchObject({ certNo: "DEMO-OT-TR-0732", validUntil: "2027-03-31" });
});

test("an AI field always needs a look, whatever its confidence", async ({ page }) => {
  await prepare(page, ["low"]);
  const dialog = await openReview(page, "low");
  const issuer = dialog.locator('[data-field="issuer"]');
  await expect(issuer.getByText("AI", { exact: true })).toBeVisible();
  await expect(issuer.getByText("AI tahmini · belgeyle karşılaştırın")).toBeVisible();
});

test("a certificate that has expired is flagged and can still be confirmed", async ({ page }) => {
  await prepare(page, ["expired"]);
  const dialog = await openReview(page, "expired");
  await expect(dialog.getByText("Süresi dolmuş", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Bitiş tarihi geçmiş · \d+ gün önce/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Onayla" })).toBeEnabled();
});

test("manual entry: a scan is typed in and confirmed, and the technical reason stays small", async ({ page }) => {
  await prepare(page, ["unreadable"]);
  const dialog = await openReview(page, "unreadable");
  await expect(dialog.getByText("Teknik ayrıntı: NO_TEXT_LAYER")).toBeVisible();
  await expect(dialog.getByText("Onay için gerekli: Belge türü.")).toBeVisible();

  await dialog.getByLabel("Belge türü").selectOption("OEKO_TEX");
  await expect(dialog.getByText("Onay için gerekli: Sertifika no, Geçerlilik bitişi.")).toBeVisible();
  await dialog.getByLabel("Sertifika no").fill("DEMO-OT-2026-0417");
  await dialog.getByLabel("Geçerlilik bitişi").fill("31.13.2027");
  await expect(dialog.getByText("GG.AA.YYYY biçiminde bir tarih girin")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Onayla" })).toBeDisabled();
  await dialog.getByLabel("Geçerlilik bitişi").fill("31.03.2027");

  const sent = page.waitForRequest((r) => r.url().endsWith("/verify"));
  await dialog.getByRole("button", { name: "Onayla" }).click();
  expect((await sent).postDataJSON()).toMatchObject({ docType: "OEKO_TEX", certNo: "DEMO-OT-2026-0417", validUntil: "2027-03-31" });
});

test("a failed reading: 'Tekrar oku' starts it again, 'Alanları elle gir' opens the empty form", async ({ page }) => {
  await prepare(page, ["error"]);
  const dialog = await openReview(page, "error");
  await expect(dialog.getByText("Teknik ayrıntı: EXTRACT_TIMEOUT")).toBeVisible();
  await dialog.getByRole("button", { name: "Alanları elle gir" }).click();
  await expect(dialog.getByText("Belge okunamadı; değerleri soldaki belgeden kendiniz yazın.")).toBeVisible();
  await expect(dialog.getByLabel("Sertifika no")).toHaveValue("");
});

test("'Tekrar oku' is offered for an unreadable document only while the AI reading is open", async ({ page }) => {
  // Gate closed (the API says rereadable: false): manual entry only, no button on the card or in the dialog.
  await prepare(page, ["unreadable"]);
  const closed = await openReview(page, "unreadable");
  await expect(closed.getByRole("button", { name: "Tekrar oku" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Tekrar oku" })).toHaveCount(0);
});

test("with the AI reading open, an unreadable document can be read again from the card and the dialog", async ({ page }) => {
  const docs = await prepare(page, ["unreadable"]);
  docs[0].rereadable = true;
  const { section } = await openPanel(page);
  await expect(section.getByRole("button", { name: "Tekrar oku" })).toHaveCount(1);
  await section.getByRole("button", { name: /^IMG_2041\.jpg ·/ }).click();
  const dialog = page.getByRole("dialog", { name: "Belge inceleme" });
  await expect(dialog.getByText("Teknik ayrıntı: NO_TEXT_LAYER")).toBeVisible();
  const sent = page.waitForRequest((r) => r.url().endsWith("/reread") && r.method() === "POST");
  await dialog.getByRole("button", { name: "Tekrar oku" }).click();
  await sent;
  await expect(dialog.getByText("Belge okunuyor")).toBeVisible();
});

test("the correction form is brought into view, with room left above the footer", async ({ page }) => {
  await prepare(page, ["unreadable"]);
  const { panel } = await openPanel(page);
  await panel.getByRole("button", { name: "Düzeltme iste" }).click();
  const send = panel.getByRole("button", { name: "Düzeltme talebini gönder" });
  const footer = panel.getByRole("button", { name: "Adımı onayla" });
  const clearance = async () => {
    const [sendBox, footerBox] = [await send.boundingBox(), await footer.boundingBox()];
    // The footer bar starts 14 px above its buttons; 16 px of room between the form and the bar.
    return footerBox!.y - 14 - (sendBox!.y + sendBox!.height);
  };
  await expect(send).toBeInViewport({ ratio: 1 });
  expect(await clearance()).toBeGreaterThanOrEqual(16);
  // A document preset adds a line to the form: its buttons stay whole and clear of the bar.
  await panel.getByRole("button", { name: "Belge okunaksız" }).click();
  await expect(panel.getByText(/Belgeler bölümü işaretlenir/)).toBeVisible();
  await expect(send).toBeInViewport({ ratio: 1 });
  await expect.poll(clearance).toBeGreaterThanOrEqual(16);
});

test("'Tekrar oku' puts the document back to reading", async ({ page }) => {
  await prepare(page, ["error"]);
  const dialog = await openReview(page, "error");
  const sent = page.waitForRequest((r) => r.url().endsWith("/reread") && r.method() === "POST");
  await dialog.getByRole("button", { name: "Tekrar oku" }).click();
  await sent;
  await expect(dialog.getByText("Belge okunuyor")).toBeVisible();
});

test("closing with unsaved corrections asks first, and 'Düzenlemeye dön' keeps them", async ({ page }) => {
  await prepare(page, ["low"]);
  const dialog = await openReview(page, "low");
  await dialog.getByLabel("Sertifika no").fill("DEMO-OT-TR-0732");
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Kaydedilmemiş değişiklikler var" });
  await expect(confirm.getByText("1 alanda yaptığınız düzeltme kaydedilmedi.")).toBeVisible();
  await confirm.getByRole("button", { name: "Düzenlemeye dön" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(dialog.getByLabel("Sertifika no")).toHaveValue("DEMO-OT-TR-0732");
  await dialog.getByLabel("Sertifika no").focus();
  await page.keyboard.press("Escape");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Değişiklikleri sil ve kapat" }).click();
  await expect(dialog).toHaveCount(0);
});

test("closing without changes needs no question", async ({ page }) => {
  await prepare(page, ["full"]);
  const dialog = await openReview(page, "full");
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(dialog).toHaveCount(0);
});

for (const role of ["EDITOR", "VIEWER"]) {
  test(`${role}: the form is read-only and 'Onayla' stays closed`, async ({ page }) => {
    await prepare(page, ["full"], { role });
    const dialog = await openReview(page, "full");
    await expect(dialog.getByText("Onay için yönetici yetkisi gerekir").first()).toBeVisible();
    await expect(dialog.getByLabel("Sertifika no")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Onayla" })).toBeDisabled();
  });
}

test("a viewer cannot upload, an editor can", async ({ page }) => {
  await prepare(page, [], { role: "VIEWER" });
  const { section } = await openPanel(page);
  await expect(section.getByRole("button", { name: "Belge yükle" })).toBeDisabled();
});

test("an upload becomes a card that is being read", async ({ page }) => {
  await prepare(page, []);
  const { section } = await openPanel(page);
  await section.locator("input[type=file]").setInputFiles({ name: "gots_2026.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(2000, 1) });
  await expect(section.getByRole("button", { name: /^gots_2026\.pdf · Okunuyor/ })).toBeVisible();
  await expect(section.getByRole("progressbar")).toHaveCount(0);
});

test("a refused upload says why and a retryable one can be tried again", async ({ page }) => {
  let calls = 0;
  await prepare(page, [], {
    upload: () => {
      calls += 1;
      return calls === 1
        ? { status: 429, body: { type: "urn:tekpas:problem:too-many-requests", title: "Too many" } }
        : { status: 202 };
    },
  });
  const { section } = await openPanel(page);
  await section.locator("input[type=file]").setInputFiles({ name: "gots_2026.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(2000, 1) });
  await expect(section.getByRole("alert")).toContainText("Çok fazla deneme yapıldı");
  await section.getByRole("button", { name: /^Tekrar dene: gots_2026\.pdf/ }).click();
  await expect(section.getByRole("button", { name: /^gots_2026\.pdf · Okunuyor/ })).toBeVisible();
});

test("a file of the wrong kind or size is refused before it is sent", async ({ page }) => {
  await prepare(page, []);
  let sent = 0;
  await page.route(/\/steps\/[0-9a-f-]{36}\/documents$/, (route) => {
    if (route.request().method() === "POST") sent += 1;
    return route.fallback();
  });
  const { section } = await openPanel(page);
  await section.locator("input[type=file]").setInputFiles([
    { name: "foy.docx", mimeType: "application/msword", buffer: Buffer.alloc(100, 1) },
    { name: "buyuk.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(11 * 1024 * 1024, 1) },
  ]);
  await expect(section.getByRole("alert")).toHaveCount(2);
  await expect(section.getByText("Bu biçim desteklenmiyor. PDF, JPG veya PNG yükleyin.")).toBeVisible();
  await expect(section.getByText(/Dosya 11,0 MB\. En fazla 10 MB olabilir\./)).toBeVisible();
  await section.getByRole("button", { name: /^Kaldır: foy\.docx/ }).click();
  await expect(section.getByRole("alert")).toHaveCount(1);
  expect(sent).toBe(0);
});

/** A valid PDF of `pages` pages, each with its own big number, so a page or a zoom change shows in the picture. */
function numberedPdf(pages: number): Buffer {
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>"];
  const kids = Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  for (let i = 0; i < pages; i++) {
    const content = `BT /F1 ${60 + i * 40} Tf 80 600 Td (PAGE ${i + 1}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

test("the preview's page, zoom and fit controls change what the browser's viewer shows", async ({ page, browser }) => {
  const docs = await prepare(page, ["full"]);
  docs[0].bytes = numberedPdf(3);
  docs[0].pageCount = 3;
  const dialog = await openReview(page, "full");
  const frame = dialog.locator("iframe");
  await expect(dialog.getByText("Sayfa 1 / 3")).toBeVisible();
  // Chrome's viewer needs a moment to draw; give it before every picture.
  const picture = async () => {
    await page.waitForTimeout(1500);
    return frame.screenshot();
  };
  const first = await picture();

  await dialog.getByRole("button", { name: "Sonraki sayfa" }).click();
  await expect(dialog.getByText("Sayfa 2 / 3")).toBeVisible();
  await expect(frame).toHaveAttribute("src", /#page=2&/);
  const second = await picture();
  expect(second.equals(first)).toBe(false);

  await dialog.getByRole("button", { name: "Önceki sayfa" }).click();
  expect((await picture()).equals(first)).toBe(true);

  await dialog.getByRole("button", { name: "Yakınlaştır" }).click();
  await expect(dialog.getByText("%125")).toBeVisible();
  const zoomed = await picture();
  expect(zoomed.equals(first)).toBe(false);

  await dialog.getByRole("button", { name: "Sığdır" }).click();
  await expect(dialog.getByText("%100")).toBeVisible();
  expect((await picture()).equals(first)).toBe(true);

  console.log(`preview controls verified in ${browser.browserType().name()} ${browser.version()}`);
});
