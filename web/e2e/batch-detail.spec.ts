import { expect, type Page, test } from "@playwright/test";
import { mockAuthApi } from "./api-mock";
import { designBatches, mockCatalogApi, NOW } from "./catalog-mock";

/** Batch detail with its supply chain (design v0.3 09, v0.3.1 26 and 29) against the mocked API. */

test.use({ viewport: { width: 1440, height: 900 } });

const BATCH_0918 = "30000000-0000-4000-8000-000000000002";
const BATCH_0927 = "30000000-0000-4000-8000-000000000001";

async function openDetail(page: Page, id: string, { role, rejectSecondYarn = false }: { role?: string; rejectSecondYarn?: boolean } = {}) {
  await page.clock.install({ time: NOW });
  await mockAuthApi(page, { signedIn: true, role });
  const batches = designBatches();
  if (rejectSecondYarn) batches[1].steps[2].status = "REJECTED";
  await mockCatalogApi(page, { batches });
  await page.goto(`/batches/${id}`);
  return batches;
}

const chain = (page: Page) => page.getByRole("group", { name: "Tedarik zinciri" });

test("a row of the list opens the batch; the arrow is its link", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  await page.goto("/batches");

  const row = page.getByRole("row", { name: /KP-2026-0918-A/ });
  await expect(row.getByRole("link", { name: "KP-2026-0918-A partisini aç" })).toHaveAttribute("href", `/batches/${BATCH_0918}`);
  await row.getByText("Organik pamuk tişört, ekru").click();

  await expect(page).toHaveURL(new RegExp(`/batches/${BATCH_0918}$`));
  await expect(page.getByRole("heading", { level: 1, name: "KP-2026-0918-A" })).toBeVisible();
  const crumbs = page.getByRole("navigation", { name: "Konum" });
  await expect(crumbs.getByRole("link", { name: "Partiler" })).toHaveAttribute("href", "/batches");
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText("KP-2026-0918-A");
});

test("09: the header, the locked score and publishing, and what M3 can tell about why", async ({ page }) => {
  await openDetail(page, BATCH_0918);

  await expect(page.getByRole("heading", { level: 1, name: "KP-2026-0918-A" })).toBeVisible();
  await expect(page.getByText("Veri toplanıyor", { exact: true })).toBeVisible();
  await expect(page.getByText("Organik pamuk tişört, ekru · 2.400 adet")).toBeVisible();
  const meta = page.locator("dl");
  await expect(meta).toContainText("GTIN2012345000018");
  await expect(meta).toContainText("Üretim emriÜE-2026-0441");
  await expect(meta).toContainText("Üretim02.09 – 20.09.2026");
  await expect(meta).toContainText("Etiket beyanı%95 organik pamuk · %5 elastan");

  await expect(page.getByText("Uyum skoru henüz hesaplanmadı")).toBeAttached();
  await expect(page.getByText("Yayın eşiği %90")).toBeVisible();
  await expect(page.getByRole("button", { name: "Önizle" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pasaportu yayınla" })).toBeDisabled();
  await expect(page.getByRole("list", { name: "Yayın kilitli" }).getByRole("listitem")).toHaveText([
    "Konfeksiyon adımına tedarikçi atanmadı",
    "3 adım onay bekliyor",
  ]);

  // Only the supply chain tab has content in M3.
  const tabs = page.getByRole("navigation", { name: "Parti bölümleri" }).getByRole("button");
  await expect(tabs).toHaveText(["Tedarik zinciri6", "Belgeler—", "Uyarılar—", "Pasaport sürümleri—"]);
  await expect(tabs.nth(0)).toHaveAttribute("aria-current", "page");
  for (const i of [1, 2, 3]) await expect(tabs.nth(i)).toBeDisabled();
});

test("09: the chain in five columns, with the origin, the suppliers, an empty step and the declarations", async ({ page }) => {
  await openDetail(page, BATCH_0918);

  await expect(page.getByRole("list", { name: "Adım durumları" }).getByRole("listitem")).toHaveText([
    "Onaylandı",
    "Gönderildi",
    "Beklemede",
  ]);
  const nodes = chain(page).locator(".react-flow__node");
  await expect(nodes).toHaveCount(6);
  await expect(nodes.nth(0)).toContainText("Lif");
  // No document count until documents exist (M5).
  await expect(nodes.nth(0)).not.toContainText("belge");
  await expect(nodes.nth(0)).toContainText("Organik pamukHarran, Şanlıurfa");
  await expect(nodes.nth(1)).toContainText("Bursa İplik San.");
  await expect(nodes.nth(1)).toContainText("Onaylandı");
  await expect(nodes.nth(2)).toContainText("Maraş Penye İplik");
  await expect(nodes.nth(2)).toContainText("Gönderildi");
  await expect(nodes.nth(5)).toContainText("Tedarikçi ataKonfeksiyon adımı boş");
  // Two yarns stacked in the second column; each feeds the fabric.
  const box = async (i: number) => (await nodes.nth(i).boundingBox())!;
  const [lif, yarn1, yarn2, fabric] = [await box(0), await box(1), await box(2), await box(3)];
  expect(yarn1.x).toBe(yarn2.x);
  expect(yarn2.y - yarn1.y).toBe(156);
  expect(lif.y).toBe(fabric.y);
  await expect(chain(page).locator(".react-flow__edge")).toHaveCount(6);

  await expect(page.getByText("Bursa İplik San. %100 pamuk · Maraş Penye İplik %80 pamuk · %20 polyester")).toBeVisible();
  // No mismatch badge in M3 (the comparison arrives with M5).
  await expect(page.getByRole("button", { name: /uyuşmazlık/ })).toHaveCount(0);
});

test("29: a rejected step has a red border and adds Reddedildi to the legend", async ({ page }) => {
  await openDetail(page, BATCH_0918, { rejectSecondYarn: true });

  await expect(page.getByRole("list", { name: "Adım durumları" }).getByRole("listitem")).toHaveText([
    "Onaylandı",
    "Gönderildi",
    "Reddedildi",
    "Beklemede",
  ]);
  const node = (i: number) => chain(page).locator(".react-flow__node").nth(i).getByRole("button");
  await expect(node(2)).toContainText("Reddedildi");
  const border = (i: number) => node(i).evaluate((el) => getComputedStyle(el).borderTopColor);
  const red = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--status-rejected)";
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
  expect(await border(2)).toBe(red);
  expect(await border(1)).not.toBe(red);
});

test("26: a batch without a chain gets the default five steps", async ({ page }) => {
  await openDetail(page, BATCH_0927);

  await expect(page.getByRole("heading", { level: 2, name: "Bu partinin tedarik zinciri yok" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Yayın kilitli" })).toHaveText("Tedarik zinciri oluşturulmadı");
  await expect(page.getByRole("navigation", { name: "Parti bölümleri" }).getByRole("button").first()).toHaveText("Tedarik zinciri0");
  const sent = page.waitForRequest((r) => r.url().endsWith(`/batches/${BATCH_0927}/chain`) && r.method() === "POST");
  await page.getByRole("button", { name: "Varsayılan zinciri oluştur" }).click();
  await sent;

  const nodes = chain(page).locator(".react-flow__node");
  await expect(nodes).toHaveCount(5);
  // FIBER records an origin, not a supplier.
  await expect(nodes.nth(0)).toContainText("Menşe girilmediLif adımı boş");
  await expect(nodes.nth(0)).not.toContainText("Tedarikçi ata");
  await expect(nodes.nth(4)).toContainText("Tedarikçi ataKonfeksiyon adımı boş");
  await expect(page.getByRole("list", { name: "Yayın kilitli" }).getByRole("listitem")).toHaveText([
    "4 adıma tedarikçi atanmadı",
    "Lif adımında menşe girilmedi",
  ]);
  // Nothing assigned yet: no declarations card.
  await expect(page.getByText("İplikçi beyanları")).toHaveCount(0);
});

test("26: read-only users see the default chain button disabled", async ({ page }) => {
  await openDetail(page, BATCH_0927, { role: "VIEWER" });

  await expect(page.getByRole("button", { name: "Varsayılan zinciri oluştur" })).toBeDisabled();
});

test("another company's (or a missing) batch is not found", async ({ page }) => {
  await openDetail(page, "30000000-0000-4000-8000-000000000999");

  await expect(page.getByRole("heading", { name: "Parti bulunamadı" })).toBeVisible();
  await page.getByRole("link", { name: "Partilere dön" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Partiler" })).toBeVisible();
});

test("22: the list's chain bar is coloured step by step", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  await page.goto("/batches");

  const bar = page.getByRole("row", { name: /KP-2026-0909-A/ }).getByRole("img", { name: "2 / 5 adım onaylı" });
  await expect(bar).toBeVisible();
  const colours = await bar.locator("span.h-1\\.5").evaluateAll((segments) =>
    segments.map((s) => getComputedStyle(s).backgroundColor),
  );
  expect(colours).toHaveLength(5);
  expect(colours[0]).toBe(colours[1]);
  expect(new Set(colours).size).toBe(3); // approved, rejected, pending
  await expect(page.getByRole("row", { name: /KP-2026-0927-A/ })).toContainText("—");
});

const panel = (page: Page, name: string) => page.getByRole("dialog", { name });

test("10/30: a step opens its panel with the supplier's data; the M4 actions are disabled", async ({ page }) => {
  await openDetail(page, BATCH_0918);
  await expect(page.getByText("Ayrıntı için bir adıma tıklayın")).toBeVisible();

  const step = chain(page).getByRole("button", { name: "İplik adımı: Maraş Penye İplik" });
  await step.click();
  const sheet = panel(page, "Maraş Penye İplik");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("İplik · adım 2/5");
  await expect(sheet).toContainText("Kahramanmaraş");
  await expect(sheet).toContainText("Gönderildi");
  await expect(sheet.getByRole("heading", { name: "Tedarikçinin girdiği veriler" })).toBeVisible();
  await expect(sheet).toContainText("20 Eyl 2026 09:00");
  await expect(sheet.locator("dl > div")).toHaveText([
    "Lif bileşimi%80 pamuk · %20 polyester",
    "Menşe ülkeTürkiye",
    "Enerji kaynağıŞebeke %60 · GES %40",
    "Enerji tüketimi3,4 kWh/kg",
    "Teslim edilen640 kg · Ne 30/1 karde",
  ]);
  // The documents' fields (M5) stay out.
  await expect(sheet).not.toContainText("Belgelerden okunan alanlar");

  for (const name of ["Veri talep et", "Düzeltme iste", "Adımı onayla"]) {
    await expect(sheet.getByRole("button", { name })).toBeDisabled();
  }
  await sheet.getByRole("button", { name: "Adımı onayla" }).hover();
  await expect(page.locator("[data-slot=tooltip-content][data-open]")).toHaveText("Bir sonraki sürümde");

  // The open step is marked on the canvas (behind the modal sheet, so out of the accessibility tree).
  await expect(page.locator(".react-flow__node button").nth(2)).toHaveClass(/border-ring/);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("an empty fibre step opens the origin panel, not 'Tedarikçi ata'", async ({ page }) => {
  await openDetail(page, BATCH_0927);
  await page.getByRole("button", { name: "Varsayılan zinciri oluştur" }).click();

  await chain(page).getByRole("button", { name: /Menşe girilmedi/ }).click();
  const sheet = panel(page, "Menşe girilmedi");
  await expect(sheet.getByRole("heading", { name: "Menşe bilgileri" })).toBeVisible();
  await expect(sheet.locator("dl > div")).toHaveText([
    "Lif türü—",
    "Bölge—",
    "Menşe ülke—",
    "Hasat yılı—",
    "Lot miktarı—",
  ]);
});

test("25: an empty step gets a supplier of the step's type", async ({ page }) => {
  await openDetail(page, BATCH_0918);

  await chain(page).getByRole("button", { name: /Tedarikçi ata/ }).click();
  const sheet = panel(page, "Tedarikçi ata");
  await expect(sheet).toContainText("Konfeksiyon · adım 5/5");
  await expect(sheet).toContainText("Tedarikçi ağınızdaki konfeksiyon tedarikçileri listelenir.");
  await expect(sheet.getByText("4 tedarikçi · Konfeksiyon")).toBeVisible();
  const options = sheet.getByRole("radio");
  await expect(options).toHaveCount(4);
  const lale = sheet.locator("label").filter({ hasText: "Lale Konfeksiyon" });
  await expect(lale).toContainText("Bursa · 6 parti");
  await expect(lale).toContainText("Onaylandı");
  await expect(lale).toContainText("Son durum · 14 Eyl");
  // A supplier without steps has no status yet ("davet edildi" waits for data requests, M4).
  await expect(sheet.locator("label").filter({ hasText: "Ege Fason Dikim" })).toContainText("Son durum · —");

  const search = sheet.getByRole("searchbox", { name: "Firma veya şehir ara" });
  await search.fill("izmir");
  await expect(options).toHaveCount(1);
  await search.fill("");

  await expect(sheet.getByText("Bir tedarikçi seçin")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Ata" })).toBeDisabled();
  await lale.click();
  await expect(sheet.getByText("Lale Konfeksiyon atanacak")).toBeVisible();
  const sent = page.waitForRequest((r) => r.url().includes("/api/v1/steps/") && r.method() === "PATCH");
  await sheet.getByRole("button", { name: "Ata" }).click();
  expect((await sent).postDataJSON()).toEqual({ supplierId: "00000000-0000-4000-8000-000000000106" });

  await expect(sheet).toBeHidden();
  await expect(chain(page).getByRole("button", { name: "Konfeksiyon adımı: Lale Konfeksiyon" })).toContainText("Beklemede");
  await expect(page.getByRole("list", { name: "Yayın kilitli" }).getByRole("listitem")).toHaveText(["4 adım onay bekliyor"]);
});

test("25: 'Listede yok mu?' adds a supplier of the step's type and selects it", async ({ page }) => {
  await openDetail(page, BATCH_0918);
  await chain(page).getByRole("button", { name: /Tedarikçi ata/ }).click();
  const sheet = panel(page, "Tedarikçi ata");
  await sheet.getByRole("button", { name: "Listede yok mu? Tedarikçi ekle" }).click();

  const form = panel(page, "Tedarikçi ekle");
  await expect(form.getByRole("radio", { name: "Konfeksiyon" })).toHaveAttribute("aria-checked", "true");
  await form.getByLabel("Firma adı").fill("Aras Örme Konfeksiyon");
  await form.getByRole("combobox", { name: "Şehir" }).click();
  await form.getByRole("combobox", { name: "Şehir" }).fill("deni");
  await page.getByRole("option", { name: "Denizli" }).click();
  await form.getByRole("button", { name: "Tedarikçi ekle" }).click();

  await expect(form).toBeHidden();
  await expect(sheet.getByText("5 tedarikçi · Konfeksiyon")).toBeVisible();
  await expect(sheet.getByText("Aras Örme Konfeksiyon atanacak")).toBeVisible();
  await expect(sheet.getByRole("radio", { name: /Aras Örme Konfeksiyon/ })).toBeChecked();
});

test("25: read-only users see the list but cannot assign", async ({ page }) => {
  await openDetail(page, BATCH_0918, { role: "VIEWER" });
  await chain(page).getByRole("button", { name: /Tedarikçi ata/ }).click();
  const sheet = panel(page, "Tedarikçi ata");
  await sheet.locator("label").filter({ hasText: "Lale Konfeksiyon" }).click();
  await expect(sheet.getByRole("button", { name: "Ata" })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "Listede yok mu? Tedarikçi ekle" })).toBeDisabled();
});
