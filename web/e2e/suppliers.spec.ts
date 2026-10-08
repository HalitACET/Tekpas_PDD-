import { expect, type Page, test } from "@playwright/test";
import { mockAuthApi } from "./api-mock";
import { designSuppliers, FAILED_REQUEST_ID, mockCatalogApi, NOW } from "./catalog-mock";

/** Suppliers (design v0.3 14–15, v0.3.1 27–28) against the mocked API. */

test.use({ viewport: { width: 1440, height: 900 } });

async function openSuppliers(page: Page, { role, failLists }: { role?: string; failLists?: boolean } = {}) {
  await page.clock.install({ time: NOW });
  await mockAuthApi(page, { signedIn: true, role });
  await mockCatalogApi(page, { failLists });
  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { level: 1, name: "Tedarikçiler" })).toBeVisible();
}

const row = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(name) });
const menu = (page: Page, name: string) => page.getByRole("button", { name: `Satır menüsü: ${name}` });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });

test("lists the network with type, city, phone, batch count and the latest step status", async ({ page }) => {
  await openSuppliers(page);

  const bursa = row(page, "Bursa İplik San.");
  await expect(bursa).toContainText("İplik");
  await expect(bursa).toContainText("Bursa");
  await expect(bursa).toContainText("+90 224 000 00 01");
  await expect(bursa).toContainText("9");
  await expect(bursa).toContainText("Onaylandı");
  // Certificates come with documents (M5); a supplier without steps has no status.
  await expect(bursa.getByRole("cell").nth(4)).toHaveText("—Sertifikalar belgelerle birlikte gelecek");
  await expect(row(page, "Ege Fason Dikim").getByRole("cell").nth(6)).toHaveText("—Henüz adım yok");
  await expect(page.getByText("10 tedarikçi")).toBeVisible();

  await page.getByRole("searchbox", { name: "Firma veya şehir ara" }).fill("denizli");
  await expect(page.getByText("2 tedarikçi")).toBeVisible();
  await page.getByRole("searchbox", { name: "Firma veya şehir ara" }).fill("");
  await page.getByLabel("Tip:").selectOption("SEWING");
  await expect(page.getByText("4 tedarikçi")).toBeVisible();
});

test("adds a supplier: type buttons, a searchable province list and a +90 phone", async ({ page }) => {
  await openSuppliers(page);
  await page.getByRole("button", { name: "Tedarikçi ekle" }).click();
  const form = dialog(page, "Tedarikçi ekle");
  const submit = form.getByRole("button", { name: "Tedarikçi ekle" });

  await expect(form.getByText("Firma adı, tip ve şehir gerekli")).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(form.getByLabel("İletişim telefonu")).toHaveAttribute("placeholder", "5xx xxx xx xx");

  await form.getByLabel("Firma adı").fill("Aras Örme Konfeksiyon");
  await form.getByRole("radio", { name: "Konfeksiyon" }).click();
  await expect(form.getByRole("radio", { name: "Konfeksiyon" })).toHaveAttribute("aria-checked", "true");
  await form.getByRole("combobox", { name: "Şehir" }).click();
  await form.getByRole("combobox", { name: "Şehir" }).fill("bur");
  await expect(page.getByRole("option")).toHaveText(["Bayburt", "Burdur", "Bursa"]);
  await page.getByRole("option", { name: "Bursa" }).click();
  await form.getByLabel("İletişim telefonu").fill("123");
  await expect(form.getByText("Biçim geçersiz.")).toBeVisible();
  await form.getByLabel("İletişim telefonu").fill("0224 000 00 99");
  await expect(form.getByText("Biçim geçersiz.")).toBeHidden();

  const sent = page.waitForRequest((r) => r.url().endsWith("/api/v1/suppliers") && r.method() === "POST");
  await submit.click();
  expect((await sent).postDataJSON()).toEqual({
    name: "Aras Örme Konfeksiyon",
    type: "SEWING",
    city: "Bursa",
    phone: "+902240000099",
  });
  await expect(form).toBeHidden();
  await expect(row(page, "Aras Örme Konfeksiyon")).toContainText("+90 224 000 00 99");
});

test("the province list follows Turkish letters", async ({ page }) => {
  await openSuppliers(page);
  await page.getByRole("button", { name: "Tedarikçi ekle" }).click();
  const city = dialog(page, "Tedarikçi ekle").getByRole("combobox", { name: "Şehir" });

  await city.click();
  await expect(page.getByRole("option")).toHaveCount(81);
  // Turkish case rules: "is" is İstanbul's i, "ıs" is Isparta's dotless ı.
  await city.fill("is");
  await expect(page.getByRole("option")).toHaveText(["Afyonkarahisar", "Bitlis", "İstanbul", "Kilis", "Manisa"]);
  await city.fill("ıs");
  await expect(page.getByRole("option")).toHaveText(["Isparta"]);
  await city.fill("ığ");
  await expect(page.getByRole("option")).toHaveText(["Elazığ", "Iğdır"]);
  await page.getByRole("option", { name: "Iğdır" }).click();
  await expect(city).toHaveValue("Iğdır");
});

test("a supplier used in batches keeps its type; name, city and phone still change", async ({ page }) => {
  await openSuppliers(page);
  await menu(page, "Bursa İplik San.").click();
  await page.getByRole("menuitem", { name: "Düzenle" }).click();
  const form = dialog(page, "Tedarikçiyi düzenle");

  await expect(form.getByLabel("Firma adı")).toHaveValue("Bursa İplik San.");
  await expect(form.getByLabel("İletişim telefonu")).toHaveValue("224 000 00 01");
  await expect(form.getByRole("radio", { name: "İplik" })).toBeDisabled();
  await expect(form.getByText("Bu tedarikçi 9 partide kullanıldığı için tipi değiştirilemez.")).toBeVisible();
  await expect(form.getByLabel("Firma adı")).toBeEnabled();

  await form.getByLabel("Firma adı").fill("Bursa İplik A.Ş.");
  const sent = page.waitForRequest((r) => r.method() === "PATCH");
  await form.getByRole("button", { name: "Kaydet" }).click();
  expect((await sent).postDataJSON()).toEqual({ name: "Bursa İplik A.Ş." });
  await expect(row(page, "Bursa İplik A.Ş.")).toBeVisible();
});

test("a company with its own account: only the phone changes", async ({ page }) => {
  await openSuppliers(page);
  await menu(page, "Ekin Aksesuar").click();
  await page.getByRole("menuitem", { name: "Düzenle" }).click();
  const form = dialog(page, "Tedarikçiyi düzenle");

  await expect(form.getByText("Bu firmanın kendi hesabı var; bilgilerini firma yönetir.")).toBeVisible();
  await expect(form.getByLabel("Firma adı")).toBeDisabled();
  await expect(form.getByRole("combobox", { name: "Şehir" })).toBeDisabled();
  await expect(form.getByRole("radio", { name: "Aksesuar" })).toBeDisabled();

  await form.getByLabel("İletişim telefonu").fill("");
  const sent = page.waitForRequest((r) => r.method() === "PATCH");
  await form.getByRole("button", { name: "Kaydet" }).click();
  expect((await sent).postDataJSON()).toEqual({ phone: null });
  await expect(row(page, "Ekin Aksesuar").getByRole("cell").nth(3)).toHaveText("—Telefon yok");
});

test("a supplier in use cannot be removed; 'Partileri gör' shows its batches", async ({ page }) => {
  await openSuppliers(page);
  await menu(page, "Bursa İplik San.").click();
  await page.getByRole("menuitem", { name: "Bağı kaldır" }).click();
  const blocked = page.getByRole("alertdialog", { name: "Tedarikçi kaldırılamaz" });

  await expect(blocked).toContainText("Bu tedarikçi 9 partide kullanılıyor, kaldırılamaz.");
  await expect(blocked).toContainText("İplik · Bursa");
  await blocked.getByRole("button", { name: "Partileri gör" }).click();

  const id = designSuppliers()[0].id;
  await expect(page).toHaveURL(new RegExp(`/batches\\?supplierId=${id}$`));
  await expect(page.getByText("Tedarikçi:")).toBeVisible();
  await expect(page.getByText("Bursa İplik San.")).toBeVisible();
  await expect(page.getByText("3 parti")).toBeVisible();
  // The stage counts stay the company's.
  await expect(page.getByRole("group", { name: "Durum" }).getByRole("button", { name: /Tümü/ })).toHaveText("Tümü7");
  await page.getByRole("button", { name: "Tedarikçi filtresini kaldır" }).click();
  await expect(page).toHaveURL(/\/batches$/);
  await expect(page.getByText("7 parti")).toBeVisible();
});

test("an unused supplier's link is removed after confirming", async ({ page }) => {
  await openSuppliers(page);
  await menu(page, "Ege Fason Dikim").click();
  await page.getByRole("menuitem", { name: "Bağı kaldır" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Tedarikçi bağını kaldır" });

  await expect(confirm).toContainText("Ege Fason Dikim tedarikçi ağınızdan çıkarılacak ve yeni partilere atanamayacak.");
  await expect(confirm).toContainText("Hiçbir partide kullanılmıyor.");
  await confirm.getByRole("button", { name: "Bağı kaldır" }).click();

  await expect(confirm).toBeHidden();
  await expect(row(page, "Ege Fason Dikim")).toHaveCount(0);
  await expect(page.getByText("9 tedarikçi")).toBeVisible();
});

test("viewers see the write actions disabled", async ({ page }) => {
  await openSuppliers(page, { role: "VIEWER" });

  await expect(page.getByRole("button", { name: "Tedarikçi ekle" })).toHaveAttribute("aria-disabled", "true");
  await expect(menu(page, "Bursa İplik San.")).toHaveAttribute("aria-disabled", "true");
});

test("a list that cannot load names the status and request id", async ({ page }) => {
  await openSuppliers(page, { failLists: true });

  const alert = page.getByRole("alert").filter({ hasText: "Tedarikçiler yüklenemedi" });
  await expect(alert).toContainText(`HTTP 503 · istek ${FAILED_REQUEST_ID}`);
});

test("a supplier id outside the network on the batch list is an error, not an empty list", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await mockAuthApi(page, { signedIn: true });
  await mockCatalogApi(page);
  await page.goto("/batches?supplierId=00000000-0000-4000-8000-000000000999");

  await expect(page.getByRole("alert").filter({ hasText: "Partiler yüklenemedi" })).toContainText("HTTP 404");
});
