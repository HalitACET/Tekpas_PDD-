import { expect, type Page, test } from "@playwright/test";
import { correctionView, LINK, mockPublicRequest, publicView, SUPPLIER_NOW, TOKEN } from "./supplier-mock";

/** M4, the supplier's side (design v0.4 39–45): /r#<token> on a phone, without an account. */

test.use({ viewport: { width: 390, height: 844 } });

async function openLink(page: Page) {
  await page.clock.install({ time: SUPPLIER_NOW });
  return page.goto(`/r#${TOKEN}`);
}

const heading = (page: Page) => page.getByRole("heading", { level: 1 });

async function start(page: Page) {
  await page.getByRole("button", { name: "Forma başla" }).click();
}

test("39: the welcome says who asks, what for and what is asked; the token travels in a header only", async ({ page }) => {
  const api = await mockPublicRequest(page, { view: publicView("YARN") });
  const authCalls: string[] = [];
  page.on("request", (r) => /\/api\/v1\/auth\//.test(r.url()) && authCalls.push(r.url()));
  const response = await openLink(page);

  await expect(heading(page)).toHaveText("İplik adımı için bilgilerinizi bekliyoruz.");
  await expect(page.getByText("sizden veri istiyor")).toBeVisible();
  const facts = page.locator("dl");
  await expect(facts).toContainText("Organik pamuk tişört, ekru");
  await expect(facts).toContainText("KP-2026-0918-A");
  await expect(facts).toContainText("17 Ekim 2026, Cumartesi");
  await expect(facts).toContainText("7 gün kaldı");
  await expect(page.getByRole("heading", { name: "Sizden istenenler" })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveText([
    "Lif bileşimi ve menşe ülke",
    "Enerji kaynakları ve tüketimi",
    "Teslim edilen miktar",
    "İplik numarası ve eğirme tipi",
  ]);
  await expect(page.getByText("Yaklaşık 5 dakika sürer. Belgeleriniz gerekmez.")).toBeVisible();
  // The contact is a name: no phone, no WhatsApp, no support address (until M12).
  await expect(page.getByRole("group", { name: "İletişim" })).toHaveText("Sorunuz mu var?Elif Yılmaz · Karaca Tekstil A.Ş.");
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("destek@");

  // Nothing about the token reaches a URL; the page is private and has no account behind it.
  expect(api.opens).toBe(1);
  expect(api.tokens).toEqual([TOKEN]);
  expect(api.urls.every((url) => !url.includes(TOKEN))).toBe(true);
  expect(authCalls).toEqual([]);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  expect(response?.headers()["cache-control"]).toContain("no-store");
});

test("40b → 43: an empty form shows its errors and focuses the first; a filled one is sent once", async ({ page }) => {
  const api = await mockPublicRequest(page, { view: publicView("YARN") });
  await openLink(page);
  await start(page);

  await expect(heading(page)).toHaveText("İplik verileri");
  await expect(page.getByText("Tüm alanlar zorunludur, aksi belirtilmedikçe.")).toBeVisible();
  // The documents' place is open since M5 (design v0.5 49): empty, optional, nothing uploaded yet.
  await expect(page.getByRole("region", { name: "Belgeler" })).toContainText("0 / 5");
  await expect(page.getByRole("region", { name: "Belgeler" })).not.toContainText("Yakında");
  await expect(page.getByRole("button", { name: "Belge yükle" })).toBeEnabled();

  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "alanda hata var" })).toContainText("3 alanda hata var. İlk hatalı alana gidildi.");
  await expect(page.getByLabel("Yüzde").first()).toBeFocused();
  await expect(page.getByText("Menşe ülkeyi seçin")).toBeVisible();
  await expect(page.getByText("Adınızı ve soyadınızı yazın")).toBeVisible();
  expect(api.submits).toHaveLength(0);

  // 40b: the shares do not add up; the total says so and every percent field is marked.
  await page.getByLabel("Yüzde").first().fill("80");
  await page.getByRole("button", { name: "Lif ekle" }).click();
  await page.getByLabel("Yüzde").nth(1).fill("15");
  await expect(page.getByText("Toplam %95")).toBeVisible();
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.getByText("Lif oranlarının toplamı %100 olmalı (şu an %95).")).toBeVisible();
  await expect(page.getByLabel("Yüzde").first()).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Yüzde").nth(1).fill("20");
  await expect(page.getByText("Toplam %100")).toBeVisible();
  await page.getByLabel("Menşe ülke").selectOption("TR");
  await page.getByLabel("Lif", { exact: true }).nth(1).selectOption("POLYESTER");
  await page.getByLabel("Teslim edilen").fill("1.150");
  await page.getByLabel("İplik numarası").fill("30/1");
  await page.getByRole("radio", { name: "Karde" }).click();
  await page.getByLabel("Ad soyad").fill("Ahmet Kaya");
  await page.getByLabel("Göreviniz").fill("Kalite sorumlusu");
  await page.getByRole("button", { name: "Gönder" }).click();

  await expect(heading(page)).toHaveText("Verileriniz Karaca Tekstil A.Ş. firmasına iletildi");
  expect(api.submits).toEqual([
    {
      token: TOKEN,
      body: {
        data: {
          fiberComposition: [
            { fiber: "COTTON", percent: 80 },
            { fiber: "POLYESTER", percent: 20 },
          ],
          originCountry: "TR",
          deliveredKg: 1150,
          yarnCount: "Ne 30/1",
          yarnProcess: "CARDED",
        },
        submitterName: "Ahmet Kaya",
        submitterRole: "Kalite sorumlusu",
      },
    },
  ]);

  // 43: what was sent, the submission number, and what happens next.
  await expect(page.getByText("10 Ekim 2026 14:32 · teşekkür ederiz.")).toBeVisible();
  await expect(page.getByText("Gönderim no KP-R-7HQ2")).toBeVisible();
  const summary = page.locator("dl");
  await expect(summary).toContainText("%80 pamuk · %20 polyester");
  await expect(summary).toContainText("Türkiye");
  await expect(summary).toContainText("1.150 kg");
  await expect(summary).toContainText("Ne 30/1 · karde");
  await expect(summary).toContainText("Ahmet Kaya · Kalite sorumlusu");
  await expect(page.getByText("Bu sayfayı kapatabilirsiniz.")).toBeVisible();
});

test("41: the dyeing form has its own sections; 'Hiçbiri' excludes the standards; 'Diğer' asks for the process", async ({ page }) => {
  const api = await mockPublicRequest(page, { view: publicView("DYEING") });
  await openLink(page);
  await expect(heading(page)).toHaveText("Boya adımı için bilgilerinizi bekliyoruz.");
  await expect(page.getByRole("listitem")).toHaveText([
    "Boya işlemi ve kimyasal uyumu",
    "İşlenen miktar ve su tüketimi",
    "Enerji kaynakları ve tüketimi",
  ]);
  await start(page);
  await expect(heading(page)).toHaveText("Boya verileri");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Boya işlemi", "Miktar ve su", "Enerji", "Belgeler", "Gönderen"]);

  await page.getByLabel("Ad soyad").fill("Kerem Çınar");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.getByText("İşlem tipini seçin")).toBeVisible();
  await expect(page.getByText("En az birini seçin; hiçbiri yoksa \"Hiçbiri\"ni seçin")).toBeVisible();

  await page.getByLabel("İşlem", { exact: true }).selectOption("OTHER");
  await page.getByLabel("Diğer işlem").fill("Ağartma");
  await page.getByLabel("Renk / ton").fill("Ekru");
  const zdhc = page.getByRole("button", { name: "ZDHC MRSL" });
  const none = page.getByRole("button", { name: "Hiçbiri" });
  await zdhc.click();
  await page.getByRole("button", { name: "bluesign" }).click();
  await expect(zdhc).toHaveAttribute("aria-pressed", "true");
  await none.click();
  await expect(none).toHaveAttribute("aria-pressed", "true");
  await expect(zdhc).toHaveAttribute("aria-pressed", "false");
  await zdhc.click();
  await expect(none).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("İşlenen miktar").fill("1.150");
  await page.getByLabel("Su tüketimi").fill("62");
  await page.getByRole("button", { name: "Gönder" }).click();

  await expect(heading(page)).toHaveText("Verileriniz Karaca Tekstil A.Ş. firmasına iletildi");
  expect(api.submits[0].body).toEqual({
    data: {
      dyeProcess: "OTHER",
      dyeProcessOther: "Ağartma",
      shade: "Ekru",
      chemicalStandards: ["ZDHC_MRSL"],
      deliveredKg: 1150,
      waterLPerKg: 62,
    },
    submitterName: "Kerem Çınar",
    submitterRole: null,
  });
});

test("fabric and sewing forms use the same pieces: the fabric type, and the country with energy per garment", async ({ page }) => {
  await mockPublicRequest(page, { view: publicView("FABRIC") });
  await openLink(page);
  await start(page);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Lif bileşimi", "Enerji", "Kumaş ve teslimat", "Belgeler", "Gönderen"]);
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(page.getByText("Kumaş tipini yazın")).toBeVisible();
});

test("45: a correction opens on the form with the reason on top, the marked section and the previous data", async ({ page }) => {
  const api = await mockPublicRequest(page, { view: correctionView() });
  await openLink(page);

  await expect(heading(page)).toHaveText("İplik verilerini düzeltin");
  const alert = page.getByRole("alert").filter({ hasText: "düzeltme istedi" });
  await expect(alert).toContainText("Karaca Tekstil A.Ş. düzeltme istedi");
  await expect(alert).toContainText("Elif Yılmaz · 8 Eki 2026 15:12");
  await expect(alert).toContainText("Teknik föyde lif oranı %80 pamuk · %20 polyester görünüyor");
  await expect(alert).toContainText("Önceki gönderiminiz kayıtlı kalır");
  const fibres = page.getByRole("region", { name: "Lif bileşimi" });
  await expect(fibres).toContainText("Düzeltme istenen alan");
  await expect(page.getByRole("region", { name: "Enerji" })).not.toContainText("Düzeltme istenen alan");
  await expect(fibres).toBeInViewport();
  // The previous data stands; the sender is asked again.
  await expect(page.getByLabel("Yüzde").first()).toHaveValue("80");
  await expect(page.getByLabel("Menşe ülke")).toHaveValue("TR");
  await expect(page.getByLabel("İplik numarası")).toHaveValue("30/1");
  await expect(page.getByLabel("Enerji tüketimi")).toHaveValue("3,4");
  await expect(page.getByLabel("Ad soyad")).toHaveValue("");

  await page.getByLabel("Yüzde").first().fill("95");
  await page.getByLabel("Yüzde").nth(1).fill("5");
  await page.getByLabel("Ad soyad").fill("Ahmet Kaya");
  await page.getByRole("button", { name: "Düzeltilmiş verileri gönder" }).click();
  await expect(heading(page)).toHaveText("Verileriniz Karaca Tekstil A.Ş. firmasına iletildi");
  expect(api.submits).toHaveLength(1);
});

test.describe("44: links that do not open", () => {
  const cases = [
    {
      name: "expired",
      closed: { status: 410, reason: "LINK_EXPIRED", link: LINK },
      title: "Bu bağlantının süresi doldu",
      texts: ["Karaca Tekstil A.Ş. bu formun 17 Ekim 2026 tarihine kadar doldurulmasını istemişti.", "Yeni bağlantı için", "17.10.2026", "Hata: LINK_EXPIRED"],
    },
    {
      name: "revoked",
      closed: { status: 410, reason: "LINK_REVOKED", link: LINK },
      title: "Bu bağlantı geri alındı",
      texts: ["Karaca Tekstil A.Ş. bu bağlantıyı iptal etti.", "Bilgi almak için", "Hata: LINK_REVOKED"],
    },
    {
      name: "already submitted",
      closed: {
        status: 410,
        reason: "ALREADY_SUBMITTED",
        link: { ...LINK, submitterName: "Ahmet Kaya", submittedAt: new Date(2026, 9, 8, 11, 4).toISOString(), code: "KP-R-7HQ2" },
      },
      title: "Bu form zaten gönderildi",
      texts: ["Değişiklik gerekiyorsa", "Ahmet Kaya", "8 Eki 2026 11:04", "KP-R-7HQ2", "Durum: ALREADY_SUBMITTED"],
    },
  ] as const;

  for (const c of cases) {
    test(c.name, async ({ page }) => {
      await mockPublicRequest(page, { closed: c.closed as never });
      await openLink(page);
      await expect(heading(page)).toHaveText(c.title);
      for (const text of c.texts) await expect(page.locator("main")).toContainText(text);
      // The contact is the person who asked, by name only.
      await expect(page.locator("main")).toContainText("Elif Yılmaz");
      await expect(page.locator("main")).toContainText("Karaca Tekstil A.Ş.");
      await expect(page.getByRole("link")).toHaveCount(0);
      await expect(page.getByRole("button")).toHaveCount(0);
    });
  }

  test("an unknown token", async ({ page }) => {
    await mockPublicRequest(page, { closed: { status: 404, reason: "LINK_INVALID" } });
    await openLink(page);
    await expect(heading(page)).toHaveText("Bağlantı geçersiz");
    await expect(page.locator("main")).toContainText("Bağlantıyı WhatsApp'tan size gönderen kişiye yazın ve yeni bir bağlantı isteyin.");
    await expect(page.locator("body")).not.toContainText("destek@");
    await expect(page.locator("main")).toContainText("Hata: LINK_INVALID");
  });

  test("no fragment: invalid without asking the server", async ({ page }) => {
    const api = await mockPublicRequest(page, { view: publicView("YARN") });
    await page.goto("/r");
    await expect(heading(page)).toHaveText("Bağlantı geçersiz");
    expect(api.opens).toBe(0);
  });

  test("a link used up while the form was open: the page changes to 44", async ({ page }) => {
    await mockPublicRequest(page, {
      view: publicView("SEWING"),
      submitProblem: {
        status: 410,
        body: {
          type: "urn:tekpas:problem:link-gone",
          title: "Gone",
          status: 410,
          reason: "LINK_REVOKED",
          link: { ...LINK, stepType: "SEWING" },
        },
      },
    });
    await openLink(page);
    await start(page);
    await page.getByLabel("Menşe ülke").selectOption("TR");
    await page.getByLabel("Ad soyad").fill("Gül Aydın");
    await page.getByRole("button", { name: "Gönder" }).click();
    await expect(heading(page)).toHaveText("Bu bağlantı geri alındı");
  });
});

test("a field the server does not accept is marked in the form; the data stays", async ({ page }) => {
  await mockPublicRequest(page, {
    view: publicView("YARN"),
    submitProblem: {
      status: 400,
      body: {
        type: "urn:tekpas:problem:validation",
        title: "Validation failed",
        status: 400,
        errors: [{ field: "data.deliveredKg", code: "Digits" }],
      },
    },
  });
  await openLink(page);
  await start(page);
  await page.getByLabel("Yüzde").first().fill("100");
  await page.getByLabel("Menşe ülke").selectOption("TR");
  await page.getByLabel("Teslim edilen").fill("12345678901");
  await page.getByLabel("Ad soyad").fill("Ahmet Kaya");
  await page.getByRole("button", { name: "Gönder" }).click();

  await expect(page.getByText("Çok fazla basamak var; değeri kısaltın.")).toBeVisible();
  await expect(page.getByLabel("Teslim edilen")).toBeFocused();
  await expect(page.getByLabel("Teslim edilen")).toHaveValue("12345678901");
  await expect(page.getByText("Sunucu bazı alanları kabul etmedi; işaretli alanları kontrol edin.")).toBeVisible();
});

test("40c: on a desktop screen the facts sit in a column beside the form", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockPublicRequest(page, { view: publicView("YARN") });
  await openLink(page);
  await start(page);
  const aside = page.getByRole("complementary");
  await expect(aside).toBeVisible();
  await expect(aside).toContainText("Karaca Tekstil A.Ş.");
  await expect(aside).toContainText("KP-2026-0918-A");
  await expect(aside).toContainText("7 gün kaldı");
  await expect(aside).toContainText("Elif Yılmaz · Karaca Tekstil A.Ş.");
  await expect(aside).not.toContainText("+90");
});

test("a sleeping server: the page waits for the health check, then asks once more", async ({ page }) => {
  const waking = {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: "<!DOCTYPE html><html><body><h1>SERVICE WAKING UP</h1></body></html>",
  };
  let probes = 0;
  await page.route("**/api/health", (route) => (++probes <= 3 ? route.fulfill(waking) : route.fulfill({ json: { status: "UP" } })));
  let opens = 0;
  await page.route(/\/api\/v1\/public\/request$/, (route) => {
    opens++;
    return opens === 1 ? undefined : route.fulfill({ json: publicView("YARN") });
  });
  await page.goto(`/r#${TOKEN}`);

  const note = page.getByRole("status").filter({ hasText: "Sunucu hazırlanıyor, bu bir dakika sürebilir." });
  await expect(note).toBeVisible({ timeout: 8_000 });
  await expect(note).toContainText("genellikle 1–2 dk");
  await expect(note).toContainText("Hazır olunca form kendiliğinden açılır.");
  await expect(heading(page)).toHaveText("İplik adımı için bilgilerinizi bekliyoruz.", { timeout: 30_000 });
  expect(opens).toBe(2);
});

test("after 3 minutes without the server the page says so and offers 'Tekrar dene'", async ({ page }) => {
  await page.clock.install({ time: SUPPLIER_NOW });
  await page.route("**/api/health", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<html><body>SERVICE WAKING UP</body></html>" }),
  );
  let opens = 0;
  await page.route(/\/api\/v1\/public\/request$/, (route) => {
    opens++;
    return opens === 1 ? undefined : route.fulfill({ json: publicView("YARN") });
  });
  await page.goto(`/r#${TOKEN}`);
  await expect(page.getByRole("status").filter({ hasText: "Sunucu hazırlanıyor" })).toBeVisible({ timeout: 6_000 });

  await page.clock.fastForward(181_000);

  const gaveUp = page.getByRole("alert").filter({ hasText: "Sunucu 3 dakikada hazır olmadı." });
  await expect(gaveUp).toContainText("Birkaç dakika sonra aynı bağlantıya tekrar dokunun");
  // The link is still in the address, so trying again opens it.
  await page.route("**/api/health", (route) => route.fulfill({ json: { status: "UP" } }));
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await expect(heading(page)).toHaveText("İplik adımı için bilgilerinizi bekliyoruz.", { timeout: 15_000 });
});

for (const width of [390, 360]) {
  test(`the spinning options stay on one line at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockPublicRequest(page, { view: publicView("YARN") });
    await openLink(page);
    await start(page);
    const options = page.getByRole("radio");
    await expect(options).toHaveText(["Penye", "Karde", "Open-end", "Diğer"]);
    for (const option of await options.all()) {
      const lines = await option.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      });
      expect(lines).toBe(1);
      expect(await option.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
