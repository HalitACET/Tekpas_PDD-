import { type Page, test } from "@playwright/test";
import path from "node:path";
import { mockAuthApi } from "./api-mock";
import { mockCatalogApi, NOW } from "./catalog-mock";

/*
 * Screenshots of M11 (design v1.1, docs/haftalik/img/): the translations on the preview page with the passport in German,
 * an import's result with its error table, and the products page right after an import. The app against the mocked API.
 * Run: pnpm --filter web e2e screenshots-m11
 */
const OUT = path.resolve(__dirname, "../../docs/haftalik/img");
const BATCH = "30000000-0000-4000-8000-000000000002";
const IMPORT = "40000000-0000-4000-8000-000000000001";

type Scheme = "light" | "dark";

const approved = { approved: true, approvedAt: "2026-10-02T09:00:00Z", approvedByName: "Elif Yılmaz" };
const entry = (language: string, over: object = {}) => ({ language, text: null, aiSuggested: false, approved: false, stale: false, ...over });

const translations = {
  aiAvailable: true,
  suggesting: false,
  fields: [
    {
      field: "product.description",
      kind: "PRODUCT_DESCRIPTION",
      source: "Yuvarlak yaka, kısa kollu basic tişört. Yan dikişsiz tüp örme gövdesi yıkamadan sonra formunu korur.",
      sourceLanguage: "tr",
      translations: [
        entry("en", { text: "Crew-neck, short-sleeved basic T-shirt. The seamless tubular knit body keeps its shape after washing.", aiSuggested: true, ...approved }),
        entry("de", { text: "Basic-T-Shirt mit Rundhalsausschnitt und kurzen Ärmeln. Der rundgestrickte Körper behält nach dem Waschen seine Form.", aiSuggested: true, ...approved }),
      ],
    },
    {
      field: "product.care.note",
      kind: "CARE_NOTE",
      source: "Ters çevirerek yıkayın. İlk yıkamada benzer renklerle yıkayın.",
      sourceLanguage: "tr",
      translations: [entry("en", { text: "Turn inside out before washing. Wash with similar colours the first time.", ...approved }), entry("de")],
    },
    {
      field: "step.f1.fabricType",
      kind: "FABRIC_TYPE",
      stepType: "FABRIC",
      source: "Süprem örme",
      sourceLanguage: "tr",
      translations: [entry("en", { text: "Single jersey knit", aiSuggested: true, ...approved }), entry("de", { text: "Single-Jersey-Strick", aiSuggested: true })],
    },
  ],
};

const snapshot = {
  schemaVersion: 3,
  passport: { version: 3, publishedAt: null, gtin: "08690123456789", batchNo: "KP-2026-0915-A" },
  manufacturer: { name: "Nilüfer Giyim A.Ş.", city: "Bursa", country: "TR" },
  product: {
    name: "Organik Pamuk Polo",
    category: "T_SHIRT",
    description: translations.fields[0].source,
    fiberComposition: [{ fiber: "ORGANIC_COTTON", percent: 100 }],
    care: {
      washing: { symbol: "WASH_40", gentleness: "GENTLE" },
      bleaching: { symbol: "DO_NOT_BLEACH", gentleness: "NORMAL" },
      ironing: { symbol: "IRON_MEDIUM", gentleness: "NORMAL" },
      note: translations.fields[1].source,
      noteLanguage: "tr",
    },
  },
  batch: {},
  supplyChain: [
    { key: "s1", type: "FIBER", approved: true, approvedAt: "2026-09-14T10:00:00Z", inputs: [], certificates: [], data: { fiberType: "ORGANIC_COTTON", originCountry: "TR", originRegion: "Şanlıurfa" } },
    { key: "s2", type: "YARN", approved: true, approvedAt: "2026-09-16T10:00:00Z", inputs: ["s1"], actor: { name: "Ege İplik", city: "Denizli", country: "TR" }, certificates: [], data: { yarnCount: "Ne 30/1" } },
    { key: "s3", type: "FABRIC", approved: true, approvedAt: "2026-09-18T10:00:00Z", inputs: ["s2"], actor: { name: "Demirtaş Örme Kumaş", city: "Bursa", country: "TR" }, certificates: [], data: { fabricType: "Süprem örme", gsm: 180 } },
  ],
  certificates: [],
  translations: [
    { field: "product.description", language: "en", text: translations.fields[0].translations[0].text, aiAssisted: true },
    { field: "product.description", language: "de", text: translations.fields[0].translations[1].text, aiAssisted: true },
    { field: "product.care.note", language: "en", text: translations.fields[1].translations[0].text, aiAssisted: false },
    { field: "s3.fabricType", language: "en", text: "Single jersey knit", aiAssisted: true },
  ],
};

const err = (row: number, column: string, code: string, value: string | null, detail: string | null = null) => ({ row, column, code, value, detail });
const finished = new Date(NOW.getTime() - 2 * 60_000).toISOString();
const importJob = {
  id: IMPORT,
  kind: "PRODUCTS",
  fileName: "urunler_ekim.xlsx",
  fileSize: 86_000,
  status: "DONE",
  totalRows: 50,
  createdRows: 45,
  failedRows: 5,
  errors: [
    err(4, "gtin", "GtinCheckDigit", "8690123456781", "4"),
    err(4, "percent1", "Integer", "62,5"),
    err(9, "name", "NotBlank", null),
    err(9, "gtin", "Unique", "8690123450012", "Basic tişört beyaz"),
    err(17, "category", "UnknownValue", "Polo yaka"),
    err(17, "fibers", "FiberTotal", "60 + 30", "90"),
    err(23, "fiber2", "NotNull", null, "20"),
    err(31, "gtin", "Duplicate", "8690123456798", "12"),
  ],
  failureCode: null,
  createdByName: "Elif Yılmaz",
  createdAt: new Date(NOW.getTime() - 3 * 60_000).toISOString(),
  finishedAt: finished,
};

async function prepare(page: Page, scheme: Scheme) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install({ time: NOW });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  await page.route(/\/api\/v1\/batches\/[0-9a-f-]{36}\/passport-preview$/, (route) => route.fulfill({ json: snapshot }));
  await page.route(/\/api\/v1\/batches\/[0-9a-f-]{36}\/score$/, (route) =>
    route.fulfill({
      json: { score: 96, threshold: 90, publishable: true, careInstructionsMissing: false, criteria: [], blockers: [], warnings: [] },
    }),
  );
  await page.route(/\/api\/v1\/batches\/[0-9a-f-]{36}\/translations$/, (route) => route.fulfill({ json: translations }));
  await page.route(/\/api\/v1\/imports$/, (route) => route.fulfill({ json: [{ ...importJob, errors: [] }] }));
  await page.route(/\/api\/v1\/imports\/[0-9a-f-]{36}$/, (route) => route.fulfill({ json: importJob }));
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

for (const scheme of ["light", "dark"] as const) {
  test(`M11 çeviriler ve önizleme (${scheme})`, async ({ page }) => {
    await prepare(page, scheme);
    await page.goto(`/batches/${BATCH}/preview`);
    await page.getByRole("heading", { name: "Çeviriler" }).waitFor();
    await page.getByRole("button", { name: "DE", exact: true }).click();
    await page.getByText("Hinweis des Herstellers · auf Türkisch").waitFor();
    await shoot(page, `11-ceviriler-${scheme}`);
  });

  test(`M11 içe aktarma sonucu (${scheme})`, async ({ page }) => {
    await prepare(page, scheme);
    await page.goto(`/imports?id=${IMPORT}`);
    await page.getByRole("table", { name: "Hatalı satırlar" }).waitFor();
    await shoot(page, `11-ice-aktarma-${scheme}`);
  });
}

test("M11 ürünler, içe aktarma şeridi", async ({ page }) => {
  await prepare(page, "light");
  await page.goto("/products");
  await page.getByText("Az önce 45 ürün içe aktarıldı").waitFor();
  await shoot(page, "11-urunler-serit-light");
});
