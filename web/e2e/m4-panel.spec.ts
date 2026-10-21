import { expect, type Page, test } from "@playwright/test";
import { mockAuthApi } from "./api-mock";
import { designSuppliers, designTasks, type MockSupplier, mockCatalogApi, NOW } from "./catalog-mock";

/** M4 on the panel side (design v0.4 46–48): links, review, the fibre origin and the tasks page. */

test.use({ viewport: { width: 1440, height: 900 } });

const BATCH_0918 = "30000000-0000-4000-8000-000000000002";
const BATCH_0917 = "30000000-0000-4000-8000-000000000003";
const BATCH_0927 = "30000000-0000-4000-8000-000000000001";

async function open(
  page: Page,
  path: string,
  { role, tasks, suppliers }: { role?: string; tasks?: unknown; suppliers?: MockSupplier[] } = {},
) {
  await page.clock.install({ time: NOW });
  // window.open (WhatsApp) is recorded instead of opening a tab.
  await page.addInitScript(() => {
    (window as unknown as { opened: string[] }).opened = [];
    window.open = (url?: string | URL) => {
      (window as unknown as { opened: string[] }).opened.push(String(url));
      return null;
    };
  });
  await mockAuthApi(page, { signedIn: true, role });
  await mockCatalogApi(page, { ...(tasks === undefined ? {} : { tasks }), ...(suppliers ? { suppliers } : {}) });
  await page.goto(path);
}

const opened = (page: Page) => page.evaluate(() => (window as unknown as { opened: string[] }).opened);
const chain = (page: Page) => page.getByRole("group", { name: "Tedarik zinciri" });
const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });

test("46a: 'Veri talep et' creates the link at once, with its deadline and the WhatsApp message", async ({ page }) => {
  await open(page, `/batches/${BATCH_0917}`);
  await chain(page).getByRole("button", { name: "Konfeksiyon adımı: Gökçe Konfeksiyon" }).click();
  const created = page.waitForRequest((r) => r.url().endsWith("/requests") && r.method() === "POST");
  await sheet(page, "Gökçe Konfeksiyon").getByRole("button", { name: "Veri talep et" }).click();
  expect((await created).postDataJSON()).toEqual({ validDays: 7 });

  const dialog = sheet(page, "Veri talep et");
  await expect(dialog).toContainText("Gökçe Konfeksiyon · Konfeksiyon adımı · KP-2026-0917-C");
  await expect(dialog).toContainText("İzmir");
  await expect(dialog).toContainText("+90 224 000 00 05");
  await expect(dialog.getByRole("radio", { name: "7 gün" })).toHaveAttribute("aria-checked", "true");
  await expect(dialog).toContainText("10.10.2026 Cumartesi");
  await expect(dialog).toContainText("henüz açılmadı");
  // The link carries the token after "#" (K21), on this site's address.
  await expect(dialog.getByText(/^localhost:\d+\/r#tok0001x+$/)).toBeVisible();
  await expect(dialog).toContainText(
    "Merhaba, Karaca Tekstil A.Ş. olarak KP-2026-0917-C partisi (Keten gömlek, lacivert) için konfeksiyon verilerinizi rica ediyoruz.",
  );
  await expect(dialog).toContainText("Teşekkürler, Elif Yılmaz");

  const changed = page.waitForRequest((r) => /\/requests\/[0-9a-f-]{36}$/.test(r.url()) && r.method() === "PATCH");
  await dialog.getByRole("radio", { name: "14 gün" }).click();
  expect((await changed).postDataJSON()).toEqual({ validDays: 14 });
  await expect(dialog).toContainText("17.10.2026 Cumartesi");

  await dialog.getByRole("button", { name: "WhatsApp'ta paylaş" }).click();
  const [url] = await opened(page);
  expect(url).toMatch(/^https:\/\/wa\.me\/902240000005\?text=/);
  expect(decodeURIComponent(url.split("text=")[1])).toContain("/r#tok0001");
});

test("46a: a named contact person is shown above the company and greeted in the message (M10 T3)", async ({ page }) => {
  const suppliers = designSuppliers().map((s) => (s.name === "Gökçe Konfeksiyon" ? { ...s, contactName: "Kerem Çınar" } : s));
  await open(page, `/batches/${BATCH_0917}`, { suppliers });
  await chain(page).getByRole("button", { name: "Konfeksiyon adımı: Gökçe Konfeksiyon" }).click();
  await sheet(page, "Gökçe Konfeksiyon").getByRole("button", { name: "Veri talep et" }).click();

  const dialog = sheet(page, "Veri talep et");
  await expect(dialog).toContainText("KÇKerem ÇınarGökçe Konfeksiyon · İzmir");
  await expect(dialog).toContainText(
    "Merhaba Kerem Çınar, Karaca Tekstil A.Ş. olarak KP-2026-0917-C partisi (Keten gömlek, lacivert) için konfeksiyon verilerinizi rica ediyoruz.",
  );
});

test("46b/c: revoking needs a confirmation, then the link is struck out and a new one can be made", async ({ page }) => {
  await open(page, `/batches/${BATCH_0917}`);
  await chain(page).getByRole("button", { name: "Konfeksiyon adımı: Gökçe Konfeksiyon" }).click();
  await sheet(page, "Gökçe Konfeksiyon").getByRole("button", { name: "Veri talep et" }).click();
  const dialog = sheet(page, "Veri talep et");
  await expect(dialog.getByText(/^localhost:\d+\/r#tok0001/)).toBeVisible();

  await dialog.getByRole("button", { name: "Bağlantıyı geri al" }).click();
  const confirm = dialog.getByRole("alertdialog", { name: "Bağlantı geri alınsın mı?" });
  await expect(confirm).toContainText("Gökçe Konfeksiyon bağlantıyı açtığında “Bu bağlantı geri alındı” mesajını görür");
  const revoked = page.waitForRequest((r) => r.url().endsWith("/revoke"));
  await confirm.getByRole("button", { name: "Bağlantıyı geri al" }).click();
  await revoked;

  await expect(dialog).toContainText("Geri alındı · şimdi · tedarikçi formu açamaz");
  // Struck out on the field (the text inside inherits the line, not the property).
  await expect(dialog.getByText(/^localhost:\d+\/r#tok0001/).locator("..")).toHaveCSS("text-decoration-line", "line-through");
  await expect(dialog.getByRole("button", { name: "WhatsApp'ta paylaş" })).toBeDisabled();
  await expect(dialog.getByRole("radio", { name: "3 gün" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Yeni bağlantı oluştur" }).click();
  await expect(dialog.getByText(/^localhost:\d+\/r#tok0002/)).toBeVisible();
});

test("an open link is not shown again: only a new one can be shared", async ({ page }) => {
  await open(page, `/batches/${BATCH_0917}`);
  await chain(page).getByRole("button", { name: "Konfeksiyon adımı: Gökçe Konfeksiyon" }).click();
  const panel = sheet(page, "Gökçe Konfeksiyon");
  await panel.getByRole("button", { name: "Veri talep et" }).click();
  const dialog = sheet(page, "Veri talep et");
  await expect(dialog.getByText(/^localhost:\d+\/r#tok0001/)).toBeVisible();
  await dialog.getByRole("button", { name: "Kapat" }).first().click();

  await panel.getByRole("button", { name: "Veri talep et" }).click();

  await expect(dialog).toContainText("Bağlantı yalnızca oluşturulduğu anda gösterilir.");
  await expect(dialog.getByText(/r#tok/)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "WhatsApp'ta paylaş" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Yeni bağlantı oluştur" }).click();
  await expect(dialog.getByText(/^localhost:\d+\/r#tok0002/)).toBeVisible();
});

test("47a: submitted data waits for review; approving makes the step green", async ({ page }) => {
  await open(page, `/batches/${BATCH_0918}`);
  await chain(page).getByRole("button", { name: "Kumaş adımı: Denizli Örme Tekstil" }).click();
  const panel = sheet(page, "Denizli Örme Tekstil");

  await expect(panel).toContainText("Tedarikçi verilerini gönderdi · inceleme bekliyor");
  await expect(panel).toContainText("Selin A. · 17 Eyl 2026 15:40 · KozaPass bağlantısıyla.");
  await expect(panel.locator("dl > div").first()).toHaveText("Lif bileşimi%95 pamuk · %5 elastan");
  // M5 and M7 parts of the design stay out.
  await expect(panel).not.toContainText("Belgelerden okunan alanlar");
  await expect(panel).not.toContainText("Etiket beyanıyla uyumlu");
  await expect(panel).not.toContainText("Önceki partilerin ortalaması");

  const approved = page.waitForRequest((r) => r.url().endsWith("/approve"));
  await panel.getByRole("button", { name: "Adımı onayla" }).click();
  await approved;
  await expect(panel).toContainText("Onaylandı");
  await expect(panel.getByRole("button", { name: "Adımı onayla" })).toBeDisabled();
});

test("47b: a correction with a preset marks its field and sends the reason", async ({ page }) => {
  await open(page, `/batches/${BATCH_0918}`);
  await chain(page).getByRole("button", { name: "İplik adımı: Maraş Penye İplik" }).click();
  const panel = sheet(page, "Maraş Penye İplik");
  await panel.getByRole("button", { name: "Düzeltme iste" }).click();

  const fix = panel.getByRole("region", { name: "Düzeltme iste" });
  await expect(fix.getByRole("button", { name: "Düzeltme talebini gönder" })).toBeDisabled();
  // The documents' presets (M5, design v0.5 60) mark the supplier form's Documents section and say so.
  await expect(fix.getByRole("button", { name: "Sertifika süresi dolmuş" })).toHaveAttribute("aria-pressed", "false");
  const unreadable = fix.getByRole("button", { name: "Belge okunaksız" });
  await expect(fix.getByText(/Belgeler bölümü işaretlenir/)).toHaveCount(0);
  await unreadable.click();
  await expect(fix.getByText(/Belgeler bölümü işaretlenir/)).toBeVisible();
  await unreadable.click();
  await expect(fix.getByText(/Belgeler bölümü işaretlenir/)).toHaveCount(0);
  await fix.getByLabel("Gerekçe").fill("");
  const preset = fix.getByRole("button", { name: "Lif oranı uyuşmuyor" });
  await expect(preset).toHaveAttribute("aria-pressed", "false");
  await preset.click();
  // The chosen preset shows as chosen; tapping it again takes the mark back and adds no second sentence.
  await expect(preset).toHaveAttribute("aria-pressed", "true");
  await preset.click();
  await expect(preset).toHaveAttribute("aria-pressed", "false");
  await preset.click();
  await expect(preset).toHaveAttribute("aria-pressed", "true");
  await expect(fix.getByLabel("Gerekçe")).toHaveValue("Lif oranı uyuşmuyor.");
  await expect(fix).toContainText("Gerekçe tedarikçiye iletilir ve parti geçmişine kaydedilir.");
  const rejected = page.waitForRequest((r) => r.url().endsWith("/reject"));
  await fix.getByRole("button", { name: "Düzeltme talebini gönder" }).click();
  expect((await rejected).postDataJSON()).toEqual({ reason: "Lif oranı uyuşmuyor.", fields: ["fiberComposition"] });

  await expect(panel.getByRole("status")).toContainText("adım \"Reddedildi\" olarak işaretlendi");
  await expect(panel).toContainText("Reddedildi");
  // A new link can be sent now, right from the note.
  await expect(panel.getByRole("button", { name: "Veri talep et" })).toBeEnabled();
  const created = page.waitForRequest((r) => r.url().endsWith("/requests") && r.method() === "POST");
  await panel.getByRole("button", { name: "Yeni bağlantı oluştur" }).click();
  await created;
  const dialog = page.getByRole("dialog", { name: "Veri talep et" });
  await expect(dialog).toContainText("Maraş Penye İplik");
  await expect(dialog.getByText(/^localhost:\d+\/r#tok/)).toBeVisible();
});

test("editors send links but do not review; viewers do neither", async ({ page }) => {
  await open(page, `/batches/${BATCH_0918}`, { role: "EDITOR" });
  await chain(page).getByRole("button", { name: "Kumaş adımı: Denizli Örme Tekstil" }).click();
  const panel = sheet(page, "Denizli Örme Tekstil");
  await expect(panel.getByRole("button", { name: "Adımı onayla" })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Düzeltme iste" })).toBeDisabled();
});

test("the fibre origin is entered on the panel and approved as the manufacturer's declaration", async ({ page }) => {
  await open(page, `/batches/${BATCH_0927}`);
  await page.getByRole("button", { name: "Varsayılan zinciri oluştur" }).click();
  await chain(page).getByRole("button", { name: /Menşe girilmedi/ }).click();
  const panel = sheet(page, "Menşe girilmedi");

  await panel.getByLabel("Lif türü").selectOption("ORGANIC_COTTON");
  await panel.getByRole("button", { name: "Kaydet" }).click();
  await expect(panel.getByText("Bu alan zorunlu.")).toBeVisible();
  await expect(panel.getByLabel("Menşe ülke")).toHaveAttribute("aria-invalid", "true");

  await panel.getByLabel("Menşe ülke").selectOption("TR");
  await panel.getByLabel(/^Bölge/).fill("Harran, Şanlıurfa");
  await panel.getByLabel(/^Hasat yılı/).fill("2025");
  const saved = page.waitForRequest((r) => /\/steps\/[0-9a-f-]{36}$/.test(r.url()) && r.method() === "PATCH");
  await panel.getByRole("button", { name: "Kaydet" }).click();
  expect((await saved).postDataJSON()).toEqual({
    data: { fiberType: "ORGANIC_COTTON", originCountry: "TR", originRegion: "Harran, Şanlıurfa", harvestYear: 2025 },
  });

  const declared = sheet(page, "Organik pamuk");
  await expect(declared).toContainText("Onaylandı");
  await expect(declared).toContainText("Üretici beyanı");
  await expect(declared.locator("dl > div").first()).toHaveText("Lif türüOrganik pamuk");
  await expect(declared.getByRole("button", { name: "Düzenle" })).toBeEnabled();
});

test("48a: the tasks page lists the three groups and the menu shows the count", async ({ page }) => {
  await open(page, "/tasks");

  await expect(page.getByRole("heading", { level: 1, name: "Görevler" })).toBeVisible();
  await expect(page.getByText("7 görev · 3 Eki 2026")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Onay bekleyen veriler", "Takip bekleyen talepler", "Eksik adımlar"]);
  const nav = page.getByRole("navigation", { name: "Ana menü" });
  await expect(nav.getByRole("link", { name: /Görevler/ })).toContainText("7");

  const review = page.getByRole("region", { name: "Onay bekleyen veriler" });
  await expect(review.getByRole("listitem").nth(1)).toContainText("Denizli Örme Tekstil · Kumaş verileri");
  await expect(review.getByRole("listitem").nth(1)).toContainText("Selin Arslan gönderdi · 5 alan");
  await expect(review.getByRole("listitem").nth(1)).toContainText("17 Eyl, 15:40");
  await expect(review.getByRole("link", { name: "İncele" }).nth(1)).toHaveAttribute(
    "href",
    `/batches/${BATCH_0918}?step=40000000-0000-4000-8000-000000002003`,
  );

  const followUp = page.getByRole("region", { name: "Takip bekleyen talepler" });
  await expect(followUp.getByRole("listitem").first()).toContainText("Düzeltme istendi · yeni bağlantı gönderilmedi");
  await expect(followUp.getByRole("link", { name: "Yeni bağlantı" })).toHaveAttribute("href", /open=request$/);
  await expect(followUp.getByRole("listitem").nth(1)).toContainText("Bağlantı 3 kez açıldı, form gönderilmedi");
  await expect(followUp.getByRole("listitem").nth(1)).toContainText("05.10.2026 · 2 gün");

  // "Hatırlat": a ready WhatsApp text without the link, straight to the supplier's number.
  await followUp.getByRole("button", { name: "Hatırlat" }).click();
  const [url] = await opened(page);
  expect(url).toMatch(/^https:\/\/wa\.me\/902241112233\?text=/);
  const text = decodeURIComponent(url.split("text=")[1]);
  expect(text).toContain("KP-2026-0917-C partisi için konfeksiyon verilerinizi bekliyoruz");
  expect(text).not.toContain("/r#");

  const incomplete = page.getByRole("region", { name: "Eksik adımlar" });
  await expect(incomplete.getByRole("link", { name: "Tedarikçi ata" })).toHaveAttribute("href", /open=assign$/);
  await expect(incomplete.getByRole("link", { name: "Zinciri oluştur" })).toHaveAttribute("href", `/batches/${BATCH_0927}`);
});

test("48a: 'Hatırlat' opens WhatsApp without a number when the supplier's phone is unknown", async ({ page }) => {
  const tasks = designTasks();
  tasks.followUp[1] = { ...tasks.followUp[1], supplierPhone: null };
  await open(page, "/tasks", { tasks });

  await page.getByRole("region", { name: "Takip bekleyen talepler" }).getByRole("button", { name: "Hatırlat" }).click();
  const [url] = await opened(page);
  expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(decodeURIComponent(url)).not.toContain("/r#");
});

test("48a → 25: a task's button opens the batch with the right panel", async ({ page }) => {
  await open(page, "/tasks");
  await page.getByRole("link", { name: "Tedarikçi ata" }).click();

  await expect(page).toHaveURL(new RegExp(`/batches/${BATCH_0918}\\?step=`));
  await expect(sheet(page, "Tedarikçi ata")).toBeVisible();
});

test("48b: without tasks the page says so and the menu shows no count", async ({ page }) => {
  await open(page, "/tasks", { tasks: { total: 0, review: [], followUp: [], incomplete: [] } });

  await expect(page.getByRole("heading", { name: "Bekleyen görev yok" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Partilere git" })).toHaveAttribute("href", "/batches");
  await expect(page.getByRole("navigation", { name: "Ana menü" }).getByRole("link", { name: "Görevler" })).not.toContainText(/\d/);
});
