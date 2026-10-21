import { type Page, test } from "@playwright/test";
import path from "node:path";
import { mockAuthApi } from "./api-mock";
import { designBatches, mockCatalogApi, NOW } from "./catalog-mock";

/*
 * Screenshots of M7 (design v0.7, docs/design/impl-v0.7/): the Uyarılar tab, resolving, the resolved side, the batch
 * header with the score card, and the certificates group of the tasks page. The app against the mocked API.
 * Run: pnpm --filter web e2e screenshots-v07
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v0.7");
const BATCH = "30000000-0000-4000-8000-000000000002";

type Scheme = "light" | "dark";

async function prepare(page: Page, scheme: Scheme) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install({ time: NOW });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
  await mockAuthApi(page, { signedIn: true });
  const batches = designBatches();
  const yarn = batches[1].steps.find((s) => s.stepType === "YARN")!.id;
  const fabric = batches[1].steps.find((s) => s.stepType === "FABRIC")!.id;
  const dyeing = batches[1].steps.find((s) => s.stepType === "DYEING")!.id;
  const base = { source: "RULE", resolved: false, autoResolved: false, createdAt: "2026-10-03T08:00:00Z" };
  batches[1].issues = {
    open: [
      {
        ...base,
        id: "lif",
        code: "LIF-01",
        severity: "ERROR",
        stepId: yarn,
        stepType: "YARN",
        supplierName: "Bursa İplik San.",
        params: {
          label: [{ fiber: "ORGANIC_COTTON", percent: 95 }, { fiber: "ELASTANE", percent: 5 }],
          declared: [{ fiber: "COTTON", percent: 80 }, { fiber: "POLYESTER", percent: 20 }],
          differing: ["ORGANIC_COTTON", "ELASTANE", "COTTON", "POLYESTER"],
        },
      },
      { ...base, id: "ser01", code: "SER-01", severity: "ERROR", stepId: yarn, stepType: "YARN", supplierName: "Bursa İplik San.", params: { docType: "GOTS", validUntil: "2026-09-29" } },
      { ...base, id: "ser02", code: "SER-02", severity: "WARNING", stepId: dyeing, stepType: "DYEING", supplierName: "Çınar Boya Apre", params: { docType: "OEKO_TEX", validUntil: "2026-10-15" } },
      { ...base, id: "ser03", code: "SER-03", severity: "WARNING", stepId: fabric, stepType: "FABRIC", supplierName: "Denizli Örme Tekstil", params: { docType: "GOTS", holder: "Denizli Tekstil Holding A.Ş.", supplier: "Denizli Örme Tekstil" } },
      {
        ...base,
        id: "ai01",
        code: "AI-01",
        severity: "WARNING",
        source: "AI",
        stepId: fabric,
        stepType: "FABRIC",
        supplierName: "Denizli Örme Tekstil",
        documentId: "d-gots",
        params: {
          docType: "GOTS",
          confidence: 0.7,
          evidence: [
            { source: "DOCUMENT", docType: "GOTS", stepType: "FABRIC", supplier: "Denizli Örme Tekstil", quote: "Products: woven fabrics (dyed, finished)" },
            { source: "STEP", stepType: "FABRIC", supplier: "Denizli Örme Tekstil", quote: "Süprem örme" },
          ],
        },
      },
      { ...base, id: "eks02", code: "EKS-02", severity: "INFO", params: { missing: "TO" } },
    ],
    resolved: [],
  };
  await mockCatalogApi(page, { batches });
  return { yarn, fabric, dyeing };
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

for (const scheme of ["light", "dark"] as const) {
  test(`78 Uyarılar sekmesi (${scheme})`, async ({ page }) => {
    await prepare(page, scheme);
    await page.goto(`/batches/${BATCH}?tab=alerts`);
    await page.getByRole("article").first().waitFor();
    await shoot(page, `78-uyarilar-${scheme}`);
  });
}

test("79j AI önerisi kartı (light, dark)", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await prepare(page, scheme);
    await page.goto(`/batches/${BATCH}?tab=alerts`);
    const card = page.getByRole("article", { name: /AI-01/ });
    await card.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await card.screenshot({ path: `${OUT}/79j-ai-onerisi-${scheme}.png` });
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("80 Çözme formu ve 81 Çözülenler (light)", async ({ page }) => {
  await prepare(page, "light");
  await page.goto(`/batches/${BATCH}?tab=alerts`);
  const card = page.getByRole("article", { name: /SER-02/ });
  await card.getByRole("button", { name: "Çözüldü" }).click();
  await card.getByRole("textbox").fill("Yenisi yolda, tedarikçi 20 Eki'ye kadar gönderecek.");
  await shoot(page, "80-cozme-formu-light");
  await card.getByRole("button", { name: "Çözüldü işaretle" }).click();
  await page.getByRole("radio", { name: /Çözülen/ }).click();
  await page.getByRole("article").first().waitFor();
  await shoot(page, "81-cozulenler-light");
});

test("86a Başlık, skor kartı ve zincir kodları (light)", async ({ page }) => {
  await prepare(page, "light");
  await page.goto(`/batches/${BATCH}`);
  await page.getByRole("region", { name: "Uyum skoru" }).waitFor();
  await shoot(page, "86a-baslik-skor-light");
});

test("89a Görevler, süresi yaklaşan sertifikalar (light)", async ({ page }) => {
  const { yarn, dyeing } = await prepare(page, "light");
  const cert = (over: Record<string, unknown>) => ({
    documentId: "d",
    docType: "GOTS",
    validUntil: "2026-09-29",
    daysLeft: -4,
    holderName: "Bursa İplik San.",
    stepId: yarn,
    stepType: "YARN",
    supplierId: "s1",
    supplierName: "Bursa İplik San.",
    batchId: BATCH,
    batchNo: "KP-2026-0918-A",
    batchStatus: "COLLECTING",
    ...over,
  });
  await page.route("**/api/v1/documents/expiring*", (route) =>
    route.fulfill({
      json: [
        cert({ documentId: "d1" }),
        cert({ documentId: "d2", batchId: "30000000-0000-4000-8000-000000000001", batchNo: "KP-2026-0927-A" }),
        cert({ documentId: "d3", docType: "OEKO_TEX", validUntil: "2026-10-15", daysLeft: 12, supplierName: "Çınar Boya Apre", supplierId: "s2", stepType: "DYEING", stepId: dyeing }),
      ],
    }),
  );
  await page.goto("/tasks");
  await page.getByRole("region", { name: /Süresi yaklaşan sertifikalar/ }).waitFor();
  await shoot(page, "89a-gorevler-sertifikalar-light");
});
