import { expect, test } from "@playwright/test";
import { mockAuthApi } from "./api-mock";
import { M12_NOW, mockInvitationApi, mockTeamApi } from "./m12-mock";

/*
 * M12 (design v1.2): the owner invites a colleague, the colleague sets a password on the invitation page and lands on the
 * login with the e-mail filled in; the audit trail filters by type. The API is mocked in the browser.
 */
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: M12_NOW });
});

test("the owner invites a colleague and gets a link to share", async ({ page }) => {
  await mockAuthApi(page, { signedIn: true, role: "OWNER" });
  await mockTeamApi(page);
  await page.goto("/users");

  await expect(page.getByRole("tab", { name: /Tümü\s*6/ })).toBeVisible();
  await page.getByRole("button", { name: "Kişi davet et" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ad soyad").fill("Ayşe Demir");
  await dialog.getByLabel(/^E-posta/).fill("ayse@karacatekstil.com.tr");
  await dialog.getByRole("radio", { name: /Görüntüleyici/ }).click();
  await dialog.getByRole("button", { name: "Davet bağlantısı oluştur" }).click();

  const link = page.getByRole("dialog", { name: /Davet bağlantısı hazır/ });
  await expect(link.getByTitle(/\/davet#Kp7xR2vQ9mT4wZ8nB3cY6hJ1$/)).toBeVisible();
  await expect(link.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", /wa\.me\/\?text=.*davet%23Kp7xR2vQ9mT4wZ8nB3cY6hJ1/);
});

test("an invited colleague sets a password and signs in with the e-mail filled in", async ({ page }) => {
  await mockAuthApi(page, { signedIn: false });
  await mockInvitationApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/davet#tok-zeynep");

  await expect(page.getByRole("heading", { name: "Hoş geldiniz, Zeynep" })).toBeVisible();
  const password = page.locator('input[autocomplete="new-password"]');
  await password.nth(0).fill("kozapass");
  await page.getByRole("button", { name: "Şifremi belirle" }).click();
  await expect(page.getByText("En az 10 karakter olmalı · şu an 8")).toBeVisible();

  await password.nth(0).fill("Ipek.Koza.2026");
  await password.nth(1).fill("Ipek.Koza.2026");
  await page.getByRole("button", { name: "Şifremi belirle" }).click();
  await expect(page.getByRole("heading", { name: "Hesabınız hazır" })).toBeVisible();

  await page.getByRole("link", { name: "Panele giriş yap" }).click();
  await expect(page).toHaveURL(/\/login\?email=zeynep%40karacatekstil\.com\.tr$/);
  await expect(page.getByLabel("E-posta")).toHaveValue("zeynep@karacatekstil.com.tr");
});

test("an expired invitation names whom to ask", async ({ page }) => {
  await mockAuthApi(page, { signedIn: false });
  await mockInvitationApi(page, "expired");
  await page.goto("/davet#tok-zeynep");
  await expect(page.getByRole("heading", { name: "Bu davetin süresi doldu" })).toBeVisible();
  await expect(page.getByText("Selim Karaca · Karaca Tekstil")).toBeVisible();
});

test("the audit trail filters by type", async ({ page }) => {
  await mockAuthApi(page, { signedIn: true, role: "OWNER" });
  await mockTeamApi(page);
  await page.goto("/audit");

  await expect(page.getByText("1–11 / 1.248 kayıt")).toBeVisible();
  await expect(page.getByText("Bugün", { exact: true })).toBeVisible();
  await page.getByLabel("Tür", { exact: true }).selectOption("USER");
  await expect(page.getByText("3 kayıt", { exact: true })).toBeVisible();
  await expect(page.getByText("aktif: evet → hayır")).toBeVisible();
});
