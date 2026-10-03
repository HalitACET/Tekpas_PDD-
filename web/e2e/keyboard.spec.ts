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

test.describe("mobile panel (390 × 800)", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  /** Every visible button/link inside the scope is at least 44 × 44 px (design G mobile). */
  async function expectTouchTargets(page: Page, scope: Locator) {
    const small = await scope.locator("button:visible, a:visible").evaluateAll((elements) =>
      elements
        .map((el) => ({ name: el.getAttribute("aria-label") ?? el.textContent?.trim(), r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width < 44 || r.height < 44)
        .map(({ name, r }) => `${name} ${Math.round(r.width)}×${Math.round(r.height)}`),
    );
    expect(small, "touch targets smaller than 44 px").toEqual([]);
  }

  test("drawer and user menu work by keyboard and touch, with 44 px targets", async ({ page }) => {
    await mockAuthApi(page, { signedIn: true });
    // A page that still uses the design G mobile page view (Partiler and Ürünler follow v0.3, whose mobile
    // lists, design 16, are not built yet).
    await page.goto("/documents");
    await expect(page.getByRole("heading", { level: 1, name: "Belgeler" }).first()).toBeVisible();

    const header = page.locator("header:visible");
    await expectTouchTargets(page, header);
    await expectTouchTargets(page, page.locator("main"));

    // Drawer: opens from the keyboard, traps focus, closes with Escape and returns focus.
    const open = page.getByRole("button", { name: "Menüyü aç" });
    await open.focus();
    await expectVisibleFocus(open);
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: "KozaPass" });
    await expect(drawer).toBeVisible();
    // While the modal is open the page behind it is hidden from assistive tech, so query by attribute.
    await expect(page.locator('button[aria-label="Menüyü aç"]')).toHaveAttribute("aria-expanded", "true");
    await expectTouchTargets(page, drawer);
    for (let i = 0; i < 12; i++) {
      await tab(page);
      expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(open).toBeFocused();

    // Choosing a page navigates and closes the drawer.
    await open.click();
    await drawer.getByRole("link", { name: "Tedarikçiler" }).click();
    await expect(page).toHaveURL(/\/suppliers$/);
    await expect(drawer).toBeHidden();

    // User menu: 44 px segmented language/theme controls and sign out.
    const userButton = page.getByRole("button", { name: /Kullanıcı menüsü/ });
    // The last input was a tap; a key press puts the browser back in keyboard mode (:focus-visible).
    await page.keyboard.press("Shift");
    await userButton.focus();
    await expectVisibleFocus(userButton);
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Kullanıcı menüsü" });
    await expect(sheet).toBeVisible();
    await expectTouchTargets(page, sheet);
    await sheet.getByRole("button", { name: "Koyu" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await sheet.getByRole("button", { name: "EN" }).click();
    // The page behind the modal is hidden from assistive tech: check the language inside the sheet.
    await expect(page.getByRole("dialog", { name: "User menu" }).getByRole("button", { name: "Dark" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { level: 1, name: "Suppliers" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /User menu/ })).toBeFocused();

    await page.getByRole("button", { name: /User menu/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
