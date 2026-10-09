import { expect, type Page, test } from "@playwright/test";
import { mockAuthApi } from "./api-mock";
import { mockCatalogApi, NOW } from "./catalog-mock";

/*
 * A sleeping server (design v0.3.2 31–32): a request without an answer after 3 s switches to polling the
 * liveness check (/api/health) with short timeouts; the real request is sent once more when it answers.
 */

test.use({ viewport: { width: 1440, height: 900 } });

/** The liveness check answers 503 for the first `asleep` probes, then 200 (or never, with Infinity). */
async function mockLiveness(page: Page, asleep: number) {
  const probes = { count: 0 };
  await page.route("**/api/health", (route) => {
    probes.count++;
    return probes.count <= asleep ? route.fulfill({ status: 503, body: "" }) : route.fulfill({ json: { status: "UP" } });
  });
  return probes;
}

/** The first request to `url` never answers (a sleeping server); later ones go to the regular mock. */
async function firstRequestHangs(page: Page, url: RegExp, method = "GET") {
  const requests = { count: 0 };
  await page.route(url, (route) => {
    if (route.request().method() !== method) return route.fallback();
    requests.count++;
    return requests.count === 1 ? undefined : route.fallback();
  });
  return requests;
}

async function fillLogin(page: Page) {
  await page.getByLabel("E-posta").fill("elif@karacatekstil.com.tr");
  await page.getByLabel("Şifre", { exact: true }).fill("demo-sifre");
}

test("31a: a login without an answer waits for the server, then signs in with one more request", async ({ page }) => {
  await mockAuthApi(page, { signedIn: false });
  await mockCatalogApi(page);
  // The login page probes too (it checks for a session to restore), so the server sleeps a little longer.
  await mockLiveness(page, 6);
  const logins = await firstRequestHangs(page, /\/api\/v1\/auth\/login$/, "POST");
  await page.goto("/login");
  await fillLogin(page);
  await page.getByRole("button", { name: "Giriş yap" }).click();

  const note = page.getByRole("status").filter({ hasText: "Sunucu hazırlanıyor, bu bir dakika sürebilir." });
  await expect(note).toBeVisible({ timeout: 6_000 });
  await expect(note.getByRole("progressbar", { name: "Sunucunun açılması" })).toBeVisible();
  await expect(note).toContainText("Genellikle 60–90 saniye");
  await expect(page.getByRole("button", { name: "Giriş yapılıyor…" })).toBeDisabled();

  await expect(page).toHaveURL(/\/batches$/, { timeout: 20_000 });
  expect(logins.count).toBe(2);
});

test("31b: after 90 s without the server the login offers 'Tekrar dene' and keeps what was typed", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await mockAuthApi(page, { signedIn: false });
  await mockLiveness(page, Infinity);
  await firstRequestHangs(page, /\/api\/v1\/auth\/login$/, "POST");
  await page.goto("/login");
  await fillLogin(page);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sunucu hazırlanıyor" })).toBeVisible({ timeout: 6_000 });

  await page.clock.fastForward(91_000);

  const gaveUp = page.getByRole("alert").filter({ hasText: "Sunucu 90 saniyede hazır olmadı." });
  await expect(gaveUp).toContainText("Bilgileriniz korundu.");
  await expect(page.getByLabel("Şifre", { exact: true })).toHaveValue("demo-sifre");
  await expect(page.getByRole("button", { name: "Tekrar dene" })).toBeEnabled();
});

test("32: a list waiting for the server shows the strip and skeleton counts, then fills in by itself", async ({ page }) => {
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  // Awake while the panel opens; asleep (one 503) once the list is asked for.
  const probes = { afterList: 0 };
  let listAsked = false;
  await page.route("**/api/health", (route) => {
    if (!listAsked) return route.fulfill({ json: { status: "UP" } });
    probes.afterList++;
    return probes.afterList <= 1 ? route.fulfill({ status: 503, body: "" }) : route.fulfill({ json: { status: "UP" } });
  });
  const lists = { count: 0 };
  await page.route(/\/api\/v1\/batches(\?.*)?$/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    lists.count++;
    listAsked = true;
    return lists.count === 1 ? undefined : route.fallback();
  });
  await page.goto("/batches");

  const strip = page.getByRole("status").filter({ hasText: "Sunucu hazırlanıyor, bu bir dakika sürebilir." });
  await expect(strip).toBeVisible({ timeout: 6_000 });
  await expect(strip).toContainText("Hazır olunca liste kendiliğinden dolar.");
  await expect(strip).toContainText("genellikle 60–90 sn");
  // No numbers on the tabs while the server starts.
  await expect(page.getByRole("group", { name: "Durum" }).getByRole("button", { name: /Tümü/ })).toHaveText("Tümü");

  await expect.poll(() => lists.count, { timeout: 15_000 }).toBe(2);
  await expect(page.getByRole("row", { name: /KP-2026-0918-A/ })).toBeVisible({ timeout: 15_000 });
  await expect(strip).toBeHidden();
  await expect(page.getByRole("group", { name: "Durum" }).getByRole("button", { name: /Tümü/ })).toHaveText("Tümü7");
  expect(lists.count).toBe(2);
  expect(probes.afterList).toBeGreaterThanOrEqual(2);
});

/** Counts the refresh requests; the regular mock answers them. */
async function countRefreshes(page: Page) {
  const refreshes = { count: 0 };
  await page.route("**/api/v1/auth/refresh", (route) => {
    refreshes.count++;
    return route.fallback();
  });
  return refreshes;
}

test("opening the panel on a sleeping server: strip first, then exactly one refresh", async ({ page }) => {
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  const probes = await mockLiveness(page, 2);
  const refreshes = await countRefreshes(page);
  await page.goto("/batches");

  const strip = page.getByRole("status").filter({ hasText: "Sunucu hazırlanıyor, bu bir dakika sürebilir." });
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("Hazır olunca panel kendiliğinden açılır.");

  await expect(page.getByRole("heading", { level: 1, name: "Partiler" })).toBeVisible({ timeout: 15_000 });
  expect(refreshes.count).toBe(1);
  expect(probes.count).toBe(3);
});

test("the panel keeps the session when the server does not start within 90 s; 'Tekrar dene' opens it", async ({
  page,
}) => {
  await page.clock.install({ time: NOW });
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  let awake = false;
  await page.route("**/api/health", (route) =>
    awake ? route.fulfill({ json: { status: "UP" } }) : route.fulfill({ status: 503, body: "" }),
  );
  const refreshes = await countRefreshes(page);
  await page.goto("/batches");
  await expect(page.getByRole("status").filter({ hasText: "Sunucu hazırlanıyor" })).toBeVisible();

  await page.clock.fastForward(91_000);

  const gaveUp = page.getByRole("alert").filter({ hasText: "Sunucu 90 saniyede hazır olmadı." });
  await expect(gaveUp).toContainText("Oturumunuz korunuyor.");
  expect(refreshes.count).toBe(0);
  await expect(page).toHaveURL(/\/batches$/);

  awake = true;
  await gaveUp.getByRole("button", { name: "Tekrar dene" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Partiler" })).toBeVisible();
  expect(refreshes.count).toBe(1);
});
