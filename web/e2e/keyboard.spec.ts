import { expect, type Locator, type Page, test } from "@playwright/test";
import { mockAuthApi } from "./api-mock";

/** Keyboard-only use of the login and the menu; focus must always be visible. */

async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  const shadow = await locator.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow, "focus ring (box-shadow) on the focused element").not.toBe("none");
}

async function tab(page: Page) {
  await page.keyboard.press("Tab");
}

test.use({ viewport: { width: 1440, height: 900 } });

test("login can be completed with the keyboard, with a visible focus ring on every stop", async ({ page }) => {
  await mockAuthApi(page, { signedIn: false });
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Giriş yap" })).toBeVisible();

  const stops: Locator[] = [
    page.getByRole("button", { name: "Türkçe" }),
    page.getByRole("button", { name: "English" }),
    page.getByRole("button", { name: "Deutsch" }),
    page.getByLabel("E-posta"),
    page.getByLabel("Şifre", { exact: true }),
    page.getByRole("button", { name: "Şifreyi göster" }),
    page.getByRole("checkbox", { name: "Beni hatırla" }),
    page.getByRole("button", { name: "Giriş yap" }),
  ];
  for (const stop of stops) {
    await tab(page);
    await expectVisibleFocus(stop);
  }

  // Fill and submit without the mouse.
  await page.getByLabel("E-posta").focus();
  await page.keyboard.type("elif@karacatekstil.com.tr");
  await tab(page);
  await page.keyboard.type("dogrusifre1");
  await tab(page);
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Şifre", { exact: true })).toHaveAttribute("type", "text");
  await tab(page);
  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: "Beni hatırla" })).not.toBeChecked();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/batches$/);
});

test("the panel menu, language switch and user menu work from the keyboard", async ({ page }) => {
  await mockAuthApi(page, { signedIn: true });
  await page.goto("/batches");
  await expect(page.getByRole("heading", { level: 1, name: "Partiler" })).toBeVisible();

  // Skip link first, then the menu in order.
  await tab(page);
  await expectVisibleFocus(page.getByRole("link", { name: "İçeriğe geç" }));
  for (const name of ["Görevler", "Ürünler", "Partiler", "Tedarikçiler"]) {
    await tab(page);
    await expectVisibleFocus(page.getByRole("link", { name }));
  }
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/suppliers$/);
  await expect(page.getByRole("heading", { level: 1, name: "Tedarikçiler" })).toBeVisible();

  // Collapse the menu with the keyboard; links keep their names.
  const collapse = page.getByRole("button", { name: "Menüyü daralt" });
  await collapse.focus();
  await expectVisibleFocus(collapse);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Menüyü genişlet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Partiler" })).toBeVisible();

  // Language switch from the top bar: the page re-renders in English, then back to Turkish.
  const english = page.getByRole("button", { name: "English" });
  await english.focus();
  await expectVisibleFocus(english);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Suppliers" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Türkçe" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Tedarikçiler" })).toBeVisible();

  // User menu opens with Enter and offers the theme choice and sign-out.
  const userMenu = page.getByRole("button", { name: "Elif Yılmaz Yönetici" });
  await userMenu.focus();
  await expectVisibleFocus(userMenu);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitemradio", { name: "Koyu" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(userMenu).toBeFocused();

  // Sign out from the menu with the keyboard.
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Çıkış yap" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login$/);
});
