import { type Page, test } from "@playwright/test";
import path from "node:path";
import { mockAuthApi } from "./api-mock";
import { M12_NOW, mockInvitationApi, mockTeamApi } from "./m12-mock";

/*
 * Screenshots of M12 (design v1.2, docs/haftalik/img/): users and roles, the audit trail, the invitation page on a phone
 * and on desktop. The app against the mocked API.
 * Run: pnpm --filter web e2e screenshots-m12
 */
const OUT = path.resolve(__dirname, "../../docs/haftalik/img");

async function prepare(page: Page, scheme: "light" | "dark", width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.clock.install({ time: M12_NOW });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

for (const scheme of ["light", "dark"] as const) {
  test(`M12 kullanıcılar (${scheme})`, async ({ page }) => {
    await prepare(page, scheme);
    await mockAuthApi(page, { signedIn: true, role: "OWNER" });
    await mockTeamApi(page);
    await page.goto("/users");
    await page.getByText("Can Öztürk").waitFor();
    await shoot(page, `12-kullanicilar-${scheme}`);
  });

  test(`M12 denetim izi (${scheme})`, async ({ page }) => {
    await prepare(page, scheme);
    await mockAuthApi(page, { signedIn: true, role: "OWNER" });
    await mockTeamApi(page);
    await page.goto("/audit");
    await page.getByText("1–11 / 1.248 kayıt").waitFor();
    await shoot(page, `12-denetim-izi-${scheme}`);
  });
}

test("M12 davet, telefon", async ({ page }) => {
  await prepare(page, "light", 390, 844);
  await mockAuthApi(page, { signedIn: false });
  await mockInvitationApi(page);
  await page.goto("/davet#tok-zeynep");
  await page.getByRole("heading", { name: "Hoş geldiniz, Zeynep" }).waitFor();
  await shoot(page, "12-davet-telefon-light");
});

test("M12 davet, masaüstü", async ({ page }) => {
  await prepare(page, "light", 1280, 800);
  await mockAuthApi(page, { signedIn: false });
  await mockInvitationApi(page);
  await page.goto("/davet#tok-zeynep");
  await page.getByRole("heading", { name: "Hoş geldiniz, Zeynep" }).waitFor();
  await shoot(page, "12-davet-masaustu-light");
});
