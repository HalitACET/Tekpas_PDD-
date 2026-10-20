import { expect, type Page, test } from "@playwright/test";
import { mockAuthApi } from "./api-mock";
import { designBatches, mockCatalogApi, NOW } from "./catalog-mock";

/** The Uyarılar tab, the header button, the score card line and the chain codes (design v0.7) against the mocked API. */

test.use({ viewport: { width: 1440, height: 900 } });

const BATCH = "30000000-0000-4000-8000-000000000002";

/** The batch has one blocking and one warning alert on its yarn step. */
async function openWithAlerts(page: Page, { role, path = "" }: { role?: string; path?: string } = {}) {
  await page.clock.install({ time: NOW });
  await mockAuthApi(page, { signedIn: true, role });
  const batches = designBatches();
  const yarn = batches[1].steps.find((s) => s.stepType === "YARN")!.id;
  const issue = (over: Record<string, unknown>) => ({
    id: "i",
    code: "SER-02",
    severity: "WARNING",
    source: "RULE",
    stepId: yarn,
    stepType: "YARN",
    supplierName: "Ege İplik",
    params: { docType: "OEKO_TEX", validUntil: "2026-10-15" },
    resolved: false,
    autoResolved: false,
    createdAt: "2026-10-03T08:00:00Z",
    ...over,
  });
  batches[1].issues = {
    open: [
      issue({
        id: "lif",
        code: "LIF-01",
        severity: "ERROR",
        params: {
          label: [{ fiber: "ORGANIC_COTTON", percent: 95 }, { fiber: "ELASTANE", percent: 5 }],
          declared: [{ fiber: "COTTON", percent: 80 }, { fiber: "POLYESTER", percent: 20 }],
          differing: ["ORGANIC_COTTON", "ELASTANE", "COTTON", "POLYESTER"],
        },
      }),
      issue({ id: "ser" }),
    ],
    resolved: [],
  };
  await mockCatalogApi(page, { batches });
  await page.goto(`/batches/${BATCH}${path}`);
}

test("the header button, the tab badge, the score card and the chain all lead to the open alerts", async ({ page }) => {
  await openWithAlerts(page);

  const summary = page.getByRole("button", { name: "1 engelleyici uyarı · Uyarılar" });
  await expect(summary).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Parti bölümleri" }).getByRole("button");
  await expect(tabs.nth(2)).toHaveText("Uyarılar2");
  await expect(page.getByRole("link", { name: "1 engelleyici uyarı açık" })).toHaveAttribute("href", `/batches/${BATCH}?tab=alerts`);
  await expect(page.getByText("LIF-01 · Uyarılar’a git")).toBeVisible();
  await expect(page.getByText("1 uyarı açık, yayını durdurmaz")).toBeVisible();
  // The yarn step's node carries the codes of its open alerts.
  await expect(page.getByRole("button", { name: "İplik adımı: Bursa İplik San." })).toContainText("LIF-01");

  await summary.click();

  await expect(page).toHaveURL(/tab=alerts/);
  await expect(tabs.nth(2)).toHaveAttribute("aria-current", "page");
  const lif = page.getByRole("article", { name: /LIF-01/ });
  await expect(lif.getByText("Düzeltilene kadar yayını engeller")).toBeVisible();
  await expect(lif.getByText("%95 organik pamuk")).toBeVisible();
  await expect(page.getByText(/Son kontrol:/)).toBeVisible();
});

test("an owner resolves a warning with a note and finds it under Çözülen", async ({ page }) => {
  await openWithAlerts(page, { path: "?tab=alerts" });

  const card = page.getByRole("article", { name: /SER-02/ });
  await card.getByRole("button", { name: "Çözüldü" }).click();
  await card.getByRole("textbox").fill("Yenisi yolda");
  await card.getByRole("button", { name: "Çözüldü işaretle" }).click();

  await expect(page.getByRole("article", { name: /SER-02/ })).toHaveCount(0);
  await page.getByRole("radio", { name: /Çözülen/ }).click();
  await expect(page.getByText(/Çözdü: Elif Yılmaz · .* — “Yenisi yolda”/)).toBeVisible();
});

test("an editor sees the alerts but cannot resolve them", async ({ page }) => {
  await openWithAlerts(page, { role: "EDITOR", path: "?tab=alerts" });

  const resolve = page.getByRole("article", { name: /SER-02/ }).getByRole("button", { name: "Çözüldü" });
  await expect(resolve).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("button", { name: "Kontrolleri çalıştır" })).toBeEnabled();
});
