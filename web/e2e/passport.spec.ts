import { expect, test } from "@playwright/test";

/*
 * The public passport page (M12 T5, a critical flow: the QR code is scanned). Rendered on the server from the backend's
 * public endpoint, here the stand-in e2e/passport-backend.mjs: a published passport (EN translated, DE partly), a
 * withdrawn one and an unknown code.
 */
const PUBLISHED = "/01/08690123456789/10/KP-2026-0915-A";

test("a scanned code opens the published passport in the reader's language, with the approved translations", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${PUBLISHED}?lang=en`);

  await expect(page.getByRole("heading", { level: 1, name: "Organik Pamuk Polo" })).toBeVisible();
  await expect(page.getByText(/Verified passport · Version 2/)).toBeVisible();
  await expect(page.getByText("Crew-neck, short-sleeved basic T-shirt.")).toBeVisible();
  await expect(page.getByText("Wash inside out.")).toBeVisible();
  await expect(page.getByText("Single jersey knit · 180 g/m²").first()).toBeVisible();
  await expect(page.getByText("Translated texts on this page were prepared with AI and approved by the manufacturer.")).toBeVisible();
  // The verification code: in the QR check list and in the passport details.
  await expect(page.getByText("7Q4K-2M9X")).toHaveCount(2);
  // The page states its language for screen readers and hyphenation.
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(errors).toEqual([]);
});

test("a text without a German translation stays Turkish and says so", async ({ page }) => {
  await page.goto(`${PUBLISHED}?lang=de`);

  await expect(page.getByText("Basic-T-Shirt mit Rundhalsausschnitt.")).toBeVisible();
  const care = page.getByRole("region", { name: "Pflege" });
  await expect(care.getByText("Hinweis des Herstellers · auf Türkisch")).toBeVisible();
  await expect(care.getByText("Ters çevirerek yıkayın.")).toHaveAttribute("lang", "tr");
  await expect(page.getByText("Stoffart auf Türkisch: „Süprem örme“")).toBeVisible();
});

test("a withdrawn passport says so and shows no product information", async ({ page }) => {
  await page.goto("/01/08690123456796/10/KP-2026-0901-A");

  await expect(page.getByText("Bu pasaport üretici tarafından geri çekildi")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Organik Pamuk Polo" })).toHaveCount(0);
});

test("an unknown code has no passport", async ({ page }) => {
  await page.goto("/01/08690123456802/10/KP-0000-0000-X");

  await expect(page.getByText("Bu kod için pasaport bulunamadı")).toBeVisible();
});
