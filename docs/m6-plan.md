# M6 planı — Pasaport ve QR

**Hedef:** Onaylı bir parti için değiştirilemez bir pasaport sürümü yayınlanır; GS1 Digital Link QR'ı okutulunca herkese açık sayfa telefonda **2 saniyede** açılır. Yeni sürüm yayınlanınca aynı QR yeni sürümü gösterir (PLAN M6 kabulü). Tasarım: v0.6 (`docs/m6-tasarim-brifi.md`). Bu belge plandır; kod yok. Kararlar §9'da, kullanıcı onaylı (20.10.2026).

Dayandığı kararlar: K11 (pasaport seviyesi parti), K12 (snapshot dondurulur), K13 (`{PUBLIC_BASE_URL}/01/{gtin}/10/{batch}`), kural 6 (yayınlanmış pasaport değişmez), kural 1 (tenant).

## 1. Mevcut durum

- `passport` tablosu V1'de var: `batch_id`, `version`, `status` (`PUBLISHED | SUPERSEDED | WITHDRAWN`), `snapshot` JSONB, `completeness` (0–100), `published_by`, `published_at`; `UNIQUE (batch_id, version)` ve partide tek `PUBLISHED` için kısmi unique indeks. `passport_scan` tablosu da var (kullanılmıyor).
- Parti durumu `DRAFT → COLLECTING → READY` otomatik (`BatchProgress`); `PUBLISHED` henüz hiçbir kod yolunda atanmıyor. Belge ve zincir yazımları `BATCH_PUBLISHED` (409) korumasını zaten taşıyor; pasaportu olan parti silinemiyor (`BATCH_HAS_PASSPORT`).
- Parti detayında (v0.3 09) "Uyum skoru —", kilitli "Önizle" ve "Pasaportu yayınla", eşik %90 sabiti (`PUBLISH_THRESHOLD`) ve "Pasaport sürümleri" sekmesinin boş durumu duruyor.
- `product.care_info` JSONB V1'den beri var ama ne entity'de ne formda kullanılıyor; bakım bilgisi M10'a ertelendi (§9 karar 9).
- Demo GTIN'leri GS1 kısıtlı dolaşım aralığında (020–029): hiçbir markaya atanmaz, demo pasaport gerçek bir ürünle çakışmaz. QR'lar `https://kozapass.vercel.app` adresine gider, gerçek etikete basılmaz.

## 2. Uyum skoru

**Ne ölçer:** Partinin yayına ne kadar hazır olduğunu, açıklanabilir ve test edilebilir kurallarla. AI kullanılmaz (M7'nin AI kontrolleri ayrı). Değer 0–100 tam sayı. Her ölçüt kendi puanını **aşağı yuvarlar**, skor bu puanların toplamıdır (panelde parçalar toplamla tutar; eşiğe yuvarlamayla ulaşılmaz). Adım payları tam kesirle toplanır. Tarih kuralları `Europe/Istanbul` gününe göre, `Clock` enjekte edilir.

| Kod | Ölçüt | Puan | Hesap |
| --- | --- | :-: | --- |
| `STEPS_APPROVED` | Onaylı adımlar | 50 | Zincirdeki her adım eşit pay; `APPROVED` adım tam puan (FIBER menşe girilince onaylı sayılıyor, M4). |
| `REQUIRED_FIELDS` | Zorunlu alanlar | 30 | Yarısı adımlar: her adımın `StepData.missingFor(type)` listesine göre doldurulan oran. Yarısı ürün/parti: lif bileşimi (toplam 100), kategori, üretim tarih aralığı. Bakım bilgisi M10'a ertelendi (karar 9), ölçütte yok. |
| `VALID_CERTIFICATES` | Geçerli sertifikalar | 20 | Sertifika beklenen adımlar (karar 2: `YARN`, `FABRIC`, `DYEING`; zincirde olanlar) eşit pay. Adımda en az bir **onaylı** (`VERIFIED`) sertifika türü belge (`DocType.isCertificate()`) ve `validUntil ≥ bugün` ise tam pay. Onaysız belge sayılmaz (kural 5). Zincirde sertifika beklenen adım yoksa (ör. yalnızca lif ve konfeksiyon) kaçıracak bir şey yoktur, tam puan; zincir yoksa 0. |

Örnek (varsayılan 5 adım, hepsi onaylı, alanlar tam): 3 sertifikadan 2'si → 50 + 30 + 13 = **93** (yayınlanır); 1'i → 50 + 30 + 6 = **86** (yayınlanamaz). Yani eşik pratikte "en az iki geçerli sertifika" demek.

**Engeller** (skordan bağımsız, biri bile varsa yayın kapalı; her biri koduyla ve varsa adımıyla döner):
- `NO_CHAIN`: zincir yok.
- `STEP_NOT_APPROVED`: onaysız adım var (karar 1: halka açık veri insan onayı olmadan yayınlanmaz; skor %90 üstündeyken bile engeldir).
- `CERTIFICATE_EXPIRED`: onaylı bir sertifikanın süresi dolmuş **ve aynı adımda aynı türden geçerli sertifika yok** (yenileme eskisinin yerini alır; süresi dolan GOTS'u geçerli bir OEKO-TEX kurtarmaz). Bitiş günü dahil geçerlidir. Sertifika beklenmeyen adımlardaki (ör. konfeksiyon) onaylı sertifikalar da kontrol edilir.
- `SCORE_BELOW_THRESHOLD`: skor < 90.
- M7 için yer: açık kritik tutarlılık uyarısı (`ISSUES_OPEN`), M6'da her zaman 0.

**Uyarılar** (yayını durdurmaz, diyalogda gösterilir): onay bekleyen belge var (pasaporta girmez), süresi 30 gün içinde dolacak sertifika.

**API:** `GET /batches/{id}/score` → `{ score, threshold, publishable, criteria: [{ code, earned, possible, items: [{ stepId?, code, ok }] }], blockers: [{ code, stepId? }], warnings: [...] }`. Skor her okumada hesaplanır (saklanmaz; sertifika süresi zamana bağlı). `GET /batches` liste cevabına yalnızca `score` (tam sayı) eklenir: sayfadaki en fazla 100 parti için adımlar ve belge özetleri iki toplu sorguyla okunur, N+1 yok. Hesap tek sınıfta (`ComplianceScore`, saf fonksiyon: girdi zincir + belgeler + ürün + tarih), yayın da aynı sınıfı çağırır.

## 3. Pasaport snapshot modeli

### 3.1 Veri modeli (V11, tek migration)

`passport` tablosuna eklenenler:
- `company_id UUID NOT NULL` (tenant filtresi doğrudan tabloda; kural 1), `gtin CHAR(14)`, `batch_no VARCHAR(20)`: herkese açık arama anahtarı, yayında kopyalanır; `(gtin, batch_no)` indeksi. Ürünün partisi varken GTIN zaten kilitli (M2), parti no da DRAFT'tan sonra değişmez (`BATCH_NOT_DRAFT`).
- `schema_version SMALLINT`, `snapshot_sha256 CHAR(64)` (kanonik JSON'un özeti; sayfada kısa "doğrulama kodu" olarak görünür).
- `superseded_at`, `withdrawn_at`, `withdrawn_by`, `withdraw_reason VARCHAR(500)`.
- **Değişmezlik tetikleyicisi** (`BEFORE UPDATE`): `snapshot`, `snapshot_sha256`, `version`, `batch_id`, `company_id`, `gtin`, `batch_no`, `completeness`, `published_*` değişirse hata. Yalnızca `PUBLISHED → SUPERSEDED` ve `PUBLISHED → WITHDRAWN` geçişine (ve ilgili `_at/_by/_reason` kolonlarına) izin verir. `BEFORE DELETE` engeli: pasaport satırı silinmez. JPA tarafında da kolonlar `updatable = false`. Kural 6 böylece uygulama hatasına karşı DB'de de korunur (rapor için iyi bir anlatı).
- `job.type`: `PASSPORT_CACHE_REFRESH` (§5.4) V11'e girmedi: işi T4 yazar, kısıt değişikliği o PR'ın V12'sinde.
- Yayın ve geri çekme `audit_log`'a yazılır (`entity_type = PASSPORT`, `action = PUBLISH | WITHDRAW`; taslak açma `entity_type = BATCH`, `action = PASSPORT_DRAFT`); M12'deki denetim izi ekranı bunu okur.
- Tablo şu an boş (seed pasaport üretmiyor), `company_id` için geri doldurma gerekmez; yine de migration `batch`'ten doldurup sonra `NOT NULL` yapar. `ApplicationSmokeTest` migration listesi ve tablo sayısı güncellenir (kural 2).

### 3.2 Snapshot içeriği (izinli alan listesi)

Snapshot **dilden bağımsızdır**: metin yerine kod ve sayı taşır (`T_SHIRT`, `ORGANIC_COTTON`, `REACTIVE`, `GOTS`), etiketler sayfada `web/messages/{tr,en,de}.json`'dan gelir. Böylece M6'da AI çevirisi gerekmez; serbest metinler (ürün adı, açıklama, firma adları) özgün dilinde kalır. M11 snapshot'a `translations` bloğu ekler (`schemaVersion: 2`), eski sürümler değişmez.

```json
{
  "schemaVersion": 1,
  "passport":     { "version": 2, "publishedAt": "2026-10-28T09:12:00Z", "gtin": "02012345000025", "batchNo": "KP-2026-0915-A" },
  "manufacturer": { "name": "Nilüfer Giyim A.Ş.", "city": "Bursa", "country": "TR" },
  "product":      { "name": "Organik Pamuk Polo", "category": "T_SHIRT", "description": null,
                    "fiberComposition": [{ "fiber": "ORGANIC_COTTON", "percent": 100 }] },
  "batch":        { "producedFrom": "2026-09-01", "producedTo": "2026-09-10" },
  "supplyChain":  [{ "key": "s2", "type": "YARN", "inputs": ["s1"], "approvedAt": "2026-09-20T…",
                     "actor": { "name": "Ege İplik San. Ltd.", "city": "Denizli", "country": "TR" },
                     "data": { "fiberComposition": […], "originCountry": "TR", "energySources": […] },
                     "certificates": ["c1"] }],
  "certificates": [{ "key": "c1", "type": "GOTS", "certNo": "…", "holder": "…", "issuer": "…", "validFrom": "…", "validUntil": "…" }]
}
```

**Uyum skoru snapshot'a girmez** (karar 3: tüketiciye görünmez); yayın anındaki değer `passport.completeness` kolonunda durur, yalnızca panel okur (sürümler sekmesi). Bakım bilgisi de yok (karar 9, M10'da `schemaVersion: 2` ile eklenir).

**Asla girmeyenler** (test ile korunur, M4'teki tedarikçi izinli alan testi gibi): veritabanı id'leri (adımlar `s1…`, belgeler `c1…` gibi opak anahtarla), parti miktarı, üretim emri no, tedarikçi telefonu, gönderen kişi adları, red gerekçeleri, veri talebi bilgisi, belge dosyası / depolama anahtarı / okuma sonucu, onaylanmamış belgeler, firma iç notları. Adım verisinden yalnızca halka açık alt küme (lif, menşe, enerji kaynakları, su, boya işlemi, kimyasal standartlar, kumaş tipi, gramaj).

### 3.3 Sürüm yaşam döngüsü

```
            yayınla (v1)              yayınla (v2)
  READY ─────────────────▶ v1 PUBLISHED ─────────▶ v1 SUPERSEDED, v2 PUBLISHED
                              │ geri çek
                              ▼
                         v1 WITHDRAWN (parti READY'e döner, QR "geri çekildi" der)
```

- **Yayınla** `POST /batches/{id}/passports` (OWNER, ADMIN): tek transaction; parti satırı `FOR UPDATE` kilitlenir, skor sunucuda yeniden hesaplanır (istemcinin skoruna güvenilmez), engel varsa 409 `PUBLISH_BLOCKED` + `blockers`. Snapshot veritabanından kurulur, `version = max + 1`, önceki `PUBLISHED` → `SUPERSEDED`, parti → `PUBLISHED`, `audit_log`, commit sonrası önbellek işi. Çift tık / iki sekme: kilit + kısmi unique indeks; ikinci istek 409 `ALREADY_PUBLISHED` (eşzamanlılık testi).
- **Önizle** `GET /batches/{id}/passport-preview`: aynı kurucuyla snapshot üretir, **kaydetmez**; web aynı bileşenle "Önizleme · yayınlanmadı" şeridiyle gösterir, `noindex`. Engelli partide de açılır (eksikler görünsün diye).
- **Yeni sürüm (taslak)** `POST /batches/{id}/passports/draft` (OWNER, ADMIN; karar 6): parti kilidi kalkar (`READY`/`COLLECTING`, `BatchProgress` hesaplar), **yayındaki sürüm olduğu gibi `PUBLISHED` kalır ve eski yayın geri çekilmez**: QR okutan onu görmeye devam eder. Taslak parti düzeyinde bir durumdur, `passport` tablosuna taslak satırı yazılmaz (snapshot yayın anında kurulur; `DRAFT` durumu eklenmez, değişmezlik tetikleyicisi olduğu gibi kalır). "Taslakta" = yayındaki sürümü olan ama durumu `PUBLISHED` olmayan parti. Taslak yayınlanınca yeni sürüm olur ve eski sürüm `SUPERSEDED` olur.
- **Geri çek** `POST /passports/{id}/withdraw` `{ reason }` (OWNER, ADMIN; gerekçe zorunlu, en fazla 500): `WITHDRAWN`, parti `READY`'e döner. Eski bir sürüme geri dönülmez (karar 7): yeni bir sürüm yayınlanana kadar QR "Geri çekildi" gösterir.
- **Sürümler** `GET /batches/{id}/passports`: sürüm, durum, tarih, yayınlayan, skor, geri çekme gerekçesi. **Eski sürümler yalnızca panelde görünür** (karar 8): `GET /passports/{id}` (panel, tenant 404) snapshot'ı döner; web panelde `/batches/[id]/passports/[version]` aynı sayfa bileşeniyle, "Eski sürüm · yalnızca panelde" şeridiyle gösterir.
- Tenant: bütün panel uçları `company_id` ile filtreler; başka firmanın partisi/pasaportu 404 (her uç için test).

## 4. GS1 Digital Link ve QR

**URL:** `{PUBLIC_BASE_URL}/01/{gtin14}/10/{batchNo}`. Tek yerde kurulur (`Gs1DigitalLink.of(gtin, batchNo)`, backend; web'de eşi `packages/shared`), iki yerde aynı test vektörleriyle doğrulanır.
- **GTIN** her zaman 14 hane (GS1 Digital Link'in önerdiği biçim; GTIN-8/12/13 başına sıfır eklenerek). Kontrol hanesi yayında zaten geçerli (M2).
- **Parti (AI 10):** en fazla 20 karakter, bizde yalnızca `A–Z 0–9 -` (M2 kuralı), yani URL'de yüzde kodlama gerekmez.
- Sorgu parametreleri GS1 DL'de serbest; yalnızca `?lang=` kullanırız; `?v=` yok (karar 8), bilinmeyen parametreler yok sayılır. `/01/{gtin}` (partisiz, ürün düzeyi) M6 kapsamı dışı: 404.
- **QR:** içerik URL'dir, **sürüm içermez** (kabul kriteri: aynı QR yeni sürümü gösterir). Hata düzeltme **M** (etiket aşınmasına yeterli, %15), sessiz bölge 4 modül. URL tamamı büyük harfe çevrilip QR'ın alfanümerik kipiyle daha küçük kod üretilebilir (şema ve alan adı büyük/küçük harf duyarsız, yolumuz rakam + büyük harf); ilk sürümde düz URL, ölçüm sonucu iyi çıkarsa açılır.
- **Uçlar:** `GET /passports/{id}/qr.png?size=512|1024` ve `qr.svg` (baskı için vektör), yalnızca panel (tenant 404, SUPPLIER 403). **Görüntüde yalnızca kod var, altındaki `(01) … (10) …` satırı yok:** sunucuda yazı çizmek yazı tipi ister, Render'ın küçük imajında olmayabilir; satırı QR kartı çizer (`PassportVersionResponse.digitalLink`, `gtin`, `batchNo`). Piksel boyutu kutu başına tam piksele yuvarlanır (en çok istenen boyut). Sürüm içermez: yeni sürümün QR'ı birebir aynıdır (testte).
- **Kütüphane (karar 5, yeni bağımlılık, onaylı):** backend'de ZXing `core` (Apache-2.0, geçişli bağımlılığı yok, PNG için JDK `ImageIO`, SVG modül matrisinden elle). Testte üretilen PNG yine ZXing ile çözülüp URL'ye eşitlenir.

## 5. Herkese açık sayfa `/01/[gtin]/10/[batch]`

### 5.1 Backend ucu

`GET /public/passports/01/{gtin}/10/{batch}` (girişsiz):
- Yalnızca **yayındaki** (`PUBLISHED`) sürümün snapshot'ını döner; eski sürümler herkese kapalı (karar 8), `?v=` verilse de yok sayılır. Karar partinin **en son** sürümüne göre: `PUBLISHED` 200, `WITHDRAWN` 410 (sayfa "Geri çekildi" der), hiç yok 404.
- Bulunamayan, taslak veya hiç yayınlanmamış parti **404** `PASSPORT_NOT_FOUND` (taslağın varlığı sızmaz). Geri çekilmiş **410** `PASSPORT_WITHDRAWN` (yalnızca geri çekilme tarihi; gerekçe iç bilgi, dönmez).
- Snapshot zaten izinli alan listesi olduğu için uç ek alan eklemez; JWT yok, tenant filtresi yok, anahtar `(gtin, batch_no)` ve GTIN dünya çapında tekil (M2).
- Rate limit M4'teki genel sayaç düzeninde (ayrı kova). `Cache-Control: public, max-age=60` (asıl önbellek Next'te).
- `?lang=` backend'den kalkar (PLAN §4 güncellenir): snapshot dilden bağımsız, dili sayfa seçer.

### 5.2 Web mimarisi ve dil

- Yol GS1 ile birebir: `app/01/[gtin]/10/[batch]/page.tsx`. Yanlış biçimde gelen istek (13 haneli GTIN, küçük harfli parti no) **308** ile kanonik adrese yönlenir; kontrol hanesi hatalı GTIN 404 sayfası.
- **Dil sırası:** `?lang=` → `Accept-Language` → `tr` (panelin çerezine bakılmaz: sayfa paylaşılan ve önbelleklenen bir belge). `proxy.ts` dil kararını verip isteği iç yola yeniden yazar: `/01/…` → `/passport/{lang}/{gtin}/{batch}` (kullanıcı adresi değişmez). İç sayfa `cookies()`/`headers()` okumaz, dili parametreden alır (`getTranslations({ locale })`), böylece her dil ayrı ve statik önbelleklenir. Pasaport yollarında `proxy` çerez yazmaz (bugün `?lang=` ile `NEXT_LOCALE` çerezi yazıyor; pasaport için atlanır).
- Sayfada dil seçici `?lang=` bağlantılarıdır (JS gerekmez). `<html lang>` doğru dil; `hreflang` alternatifleri.
- **Bileşenler sunucu bileşeni:** istemci JS'i yalnızca tema düğmesi (varsa). React Flow yok; zincir dikey liste/zaman çizgisi. Yazı tipleri mevcut olanlar, alt küme ve `preload`.
- Metadata: başlık "{ürün} · {parti} · KozaPass", açıklama lif bileşiminden; **`noindex`** (karar 12): meta robots ve `X-Robots-Tag: noindex` başlığı, demo süresince; gerçek alan adına geçilince yeniden değerlendirilir.

### 5.3 SSR performansı (2 sn hedefi)

Risk: Render ücretsiz sunucu uyuyor, soğuk açılış 100–150 sn. Yani **QR okutmanın backend'e bağlı olmaması gerekir.**
- Snapshot değişmez olduğu için sonsuza kadar önbelleklenebilir. Karar 10 (`cacheComponents` bütün uygulamada kapalı kalır, Next 16'nın önceki önbellek modeli): `fetch(url, { next: { tags: ["passport:{gtin}:{batch}"] } })` + sayfanın statik üretimi (ISR); geçersiz kılma yalnızca yayın ve geri çekmede. Reddedilen alternatif: `cacheComponents: true` + `'use cache'` + `cacheTag` + `cacheLife('max')` (panelin tamamını etkiler, ayrı iş).
- **Önbellek ısıtma:** yayın / geri çekme commit'inden sonra (taslak açmak herkese açık sayfayı değiştirmez, işe gerek yok) `PASSPORT_CACHE_REFRESH` işi (K9 kuyruğu, tekrarlı) web'e `POST /api/passport-cache` çağırır (`Authorization: Bearer REVALIDATE_SECRET`, yeni gizli değişken; Render ve Vercel'de, `.env.example`'da boş). Route handler `revalidateTag(tag, { expire: 0 })` yapar (yeni sürüm hemen görünsün), ardından iş üç dilin sayfasını bir kez ister. Backend o anda uyanık olduğu için önbellek dolar; sonraki okutmalar Vercel'den döner.
- **Önbellek boşsa ve backend uyuyorsa:** sayfa kabuğu (başlık, logo, iskelet) hemen gelir, içerik `Suspense` içinde; 8 sn'de cevap yoksa "Pasaport hazırlanıyor, sayfa kendiliğinden yenilenecek" (panelin uyuyan sunucu akışının aynısı, 3 dk sınırı). Bu yol hata değil, nadir durum.
- **Doğrulanacak (T4'te, en fazla 30 dk):** Vercel'in veri/ISR önbelleği yeni deploy'dan sonra korunuyor mu? Korunmuyorsa deploy sonrası ısıtma (yayındaki pasaportların listesi küçük; `main` deploy'unda bir kez) eklenir.
- **Ölçüm (kabul):** canlıda önbellekten TTFB < 300 ms, orta seviye telefonda 4G'de ilk anlamlı içerik < 2 sn (Chrome DevTools "Fast 4G" + gerçek telefonla QR). Sonuç haftalık nota.

### 5.4 Güvenlik

Sayfada oturum yok, panel çerezleri okunmaz; `Referrer-Policy: strict-origin-when-cross-origin`; snapshot dışında veri yok. Revalidate ucu sabit zamanlı gizli karşılaştırma, yalnızca POST, gövde şeması dar (`gtin`, `batchNo`). Okutma istatistiği (`passport_scan`) M6'da yazılmaz (§9 karar 11).

## 6. Web panel (tasarım v0.6 gelince)

- Parti detayı: uyum skoru kartı (halka + kırılım + engeller, adıma git bağlantılarıyla), "Önizle" ve "Pasaportu yayınla" açılır; yayın diyaloğu; yayından sonra QR kartı; "Yeni sürüm (taslak)" ve "Geri çek"; "Pasaport sürümleri" sekmesi (eski sürümler burada, panelde salt okunur).
- Partiler listesi: "Uyum skoru" sütunu gerçek değer.
- Rol: OWNER/ADMIN yayınlar ve geri çeker; EDITOR/VIEWER düğmeleri `GuardedButton` ile kapalı görür (backend 403).

## 7. Test

- **Birim:** `ComplianceScore` tablo testleri (ağırlıklar, aşağı yuvarlama, eşik sınırı 89/90, süresi bugün dolan sertifika, onaysız belge sayılmaz, zincir yok); `Gs1DigitalLink` (GTIN-8/12/13/14 normalizasyonu, parti karakterleri) backend ve `packages/shared`'de aynı vektörler.
- **Entegrasyon:** yayın (sürüm artışı, `SUPERSEDED`, parti `PUBLISHED`), eşik/engel 409 ve gerekçeler, **izinli alan testi** (snapshot'ta yasak alan yok), **değişmezlik tetikleyicisi** (doğrudan SQL `UPDATE passport SET snapshot` hata verir), eşzamanlı iki yayın (biri 409), geri çekme ve taslak açma (yayındaki sürüm `PUBLISHED` kalır, yayınlanınca eskisi `SUPERSEDED`), skorun snapshot'ta ve public cevapta olmadığı, `GET /passports/{id}` tenant 404, roller (EDITOR/VIEWER/SUPPLIER 403), tenant 404 (her yeni uç), public uç (404 taslak, 410 geri çekilmiş, `?v` yok sayılır ve `SUPERSEDED` sürüm public'ten dönmez), QR PNG çözülünce URL, önbellek işi (sahte HTTP sunucusu).
- **Web:** dil seçimi ve 308 normalizasyonu, snapshot görünümü bileşen testleri, i18n anahtar eşitliği; e2e: yayınla → `/01/…` v1 → v2 yayınla → aynı adres v2.

## 8. Görevler ve sıra

| # | İş | Bağımlılık |
| --- | --- | --- |
| T0 | Tasarım brifi → Claude Design v0.6 | — (UI işleri bunu bekler) |
| T1 | `ComplianceScore` + `GET /batches/{id}/score` + listede `score` | karar 1–2 |
| T2 | V11 + yayın / önizleme / sürümler (`GET /passports/{id}` dahil) / geri çek / yeni sürüm taslağı + snapshot kurucusu + izinli alan testi | T1, karar 6–7 |
| T3 | Public uç + `Gs1DigitalLink` + QR PNG/SVG | T2, karar 5 |
| T4 | `PASSPORT_CACHE_REFRESH` işi + web revalidate ucu + Vercel önbellek denemesi | T3 |
| T5 | Web `/01/[gtin]/10/[batch]` | T0, T3, T4 |
| T6 | Web panel: skor kartı, yayın diyaloğu, QR kartı, sürümler, geri çek | T0, T2 |
| T7 | Canlı ölçüm (2 sn), e2e, çeviriler en/de, haftalık not, README | hepsi |

Her backend PR'ında `./mvnw verify` + `pnpm --filter api-client generate` (kural 9). PLAN §4 API tablosu T3'te güncellenir (`?lang` kalkar, `passport-preview`, `passports/draft`, `GET /passports/{id}`, `qr.svg` eklenir).

## 9. Kararlar (kullanıcı onaylı, 20.10.2026)

1. **Onaysız adım yayını engeller** (`STEP_NOT_APPROVED`), skor %90 üstünde olsa bile (§2).
2. **Skor ağırlıkları 50 / 30 / 20 ve sertifika beklenen adımlar (`YARN`, `FABRIC`, `DYEING`) kabul edildi.** İddiaya bağlı kurallar (organik lif → GOTS/OCS, geri dönüştürülmüş → GRS) M7'ye.
3. **Skor tüketiciye görünmez.** Public sayfada ve public API cevabında skor ve kırılımı yok; snapshot'a girmez, `passport.completeness` ve panel kalır (§3.2).
4. **Tedarikçi adları tüketiciye açıktır** (ad + şehir/ülke). Tedarikçi başına "adı gizle" ileride (M12 ayarlar).
5. **QR üretimi backend'de, ZXing `core`** (yeni bağımlılık, onaylı). `qr.png` ve `qr.svg` uçları backend'de kalır (§4).
6. **Düzenleme "yeni sürüm (taslak)" ile yapılır, eski yayın geri çekilmez.** Yeni sürüm yayınlanınca eskisi `SUPERSEDED` olur. _Uygulama yorumu:_ taslak parti düzeyinde bir durumdur, `passport` tablosunda `DRAFT` satırı yoktur (§3.3); değişmezlik tetikleyicisi bozulmaz.
7. **Geri çekilen pasaport QR'da "Geri çekildi" gösterir**, eski sürüme dönülmez (§3.3, §5.1).
8. **Eski sürümler tüketiciye kapalıdır, yalnızca panelde görünür.** Public uçta `?v=` yok; panelde `GET /passports/{id}` ve sürüm görüntüleme sayfası (§3.3).
9. **Bakım bilgisi M10'a (demo cilası) ertelendi.** M6'da ürün formu, sayfa bölümü ve skor ölçütü yok; M10 listesine eklendi.
10. **SSR performansı: Vercel ISR + `next.tags`, yayın anında önbellek ısıtma;** `cacheComponents` kapalı kalır. Yeni gizli değişken `REVALIDATE_SECRET` (Render + Vercel, `.env.example`'da boş) (§5.3).
11. **Okutma istatistiği kapsam dışı** (önbellekten dönen sayfa sunucuya uğramaz; `passport_scan` M6'da yazılmaz).
12. **Public sayfaya `noindex` eklenir** (meta + `X-Robots-Tag`), demo süresince.

## 10. Uygulama notları (tasarım v0.6)

Tasarım dosyaları: `docs/design/impl-v0.6/` (`KozaPassPasaport.dc.html` yeni; `KozaPassPanel`, `KozaPassSupplier`, `KozaPassBelgeInceleme` v0.5 ile bayt bayt aynı).

### 10.1 `product_title` ve varsayılan metinler (`KozaPassPasaport.dc.html`)

**Tasarımda ne olduğu:** `product_title` yalnızca bileşenin **önizleme parametresidir** (`text`, varsayılan `""`). Tasarım aracında ürün adını elle denemek içindir; veri modeli değildir.

Ad şu sırayla çözülür (`renderVals`, `p.name`):
1. `product_title` boş değilse aynen kullanılır (`String(...)`, çevrilmez, kırpılmaz).
2. Boşsa ve `long` açıksa uzun örnek: TR "Organik Pamuklu Kontrast Yakalı Düğmeli Polo", EN "Organic Cotton Polo Shirt with Contrast Collar", DE "Bio-Baumwoll-Poloshirt mit Kontrastkragen und Knopfleiste". Taşma denemesi içindir.
3. Aksi halde kısa örnek: TR "Organik Pamuk Polo", EN "Organic Cotton Polo", DE "Bio-Baumwoll-Polo".

(`g()` önce `state`'e, sonra parametreye bakar; boş metin "verilmedi" sayılır, bu yüzden boş `product_title` örneğe düşer.)

**Ad nerede görünür:**
- `<h1>`: serif (Newsreader), `clamp(34px, 8.6cqi, 52px)`, `line-height: 1.05`, `text-wrap: balance`. Uzun ad **satır kırar**, kesilmez, üç nokta yok.
- Zaman çizgisinin son maddesi `p.short` = yerelleştirilmiş önek + ad: "Ürün: " / "Product: " / "Produkt: ". Önek çevrilir, ad çevrilmez.

**Koda geçerken (karar, tasarımda yok):**
- Üretimde değer `snapshot.product.name` olur (§3.2): serbest metin, özgün dilinde, **hiçbir zaman çevrilmez ve varsayılana düşmez**. `product.name` zorunlu alan olduğundan yedek metin gerekmez; tasarımdaki üç kısa/uzun örnek yalnızca tasarım verisidir, koda ve çeviri dosyalarına **girmez**.
- Sayfa başlığı (`<title>`, §5.2) ve `og:title` aynı değeri kullanır: "{ürün} · {parti} · KozaPass".
- `p.short` öneki `web/messages/{tr,en,de}.json`'a girer (`passport.timeline.product`); ad ICU yer tutucusuyla eklenir.
- Test: tasarımın üç dildeki **uzun** örnek adı ve uzun üretici adı ("Nilüfer Giyim Tekstil Sanayi ve Dış Ticaret A.Ş.") 390 px'te taşmadan satır kırıyor mu (bileşen testi + e2e ekran görüntüsü, brifteki "en uzun metin" durumu).

### 10.2 Tasarımın onaylı kararlardan ayrıldığı yerler

- **`state=superseded` (herkese açık "Eski sürüm" durumu, "Güncel sürüm" bandı, QR doğrulamada "Eski sürüm · güncel sürüm 2") uygulanmaz.** Karar 8: eski sürümler tüketiciye kapalı. Aynı görünüm yalnızca panelde sürüm görüntüleme sayfasında kullanılır (şerit "Eski sürüm · yalnızca panelde", brif B8).
- Tasarımdaki "QR doğrulama" bölümünün "Sürüm durumu" satırı herkese açık sayfada yalnızca "Güncel · Sürüm N" der.
- Doğrulama kodu tasarımda `7Q4K-2M9X` biçiminde (4-4, büyük harf ve rakam), altında "içerikten üretilir; içerik değişirse kod da değişir" notu var. Nasıl türetileceği tasarımda yok. **T2'de böyle uygulandı (`VerificationCode`):** `snapshot_sha256`'dan türetilen 8 karakter, karışan karakterler (0/O, 1/I) çıkarılmış alfabeyle; tam özet DB'de kalır (§3.1). **Açık nokta:** tasarım "etiketteki kodla karşılaştırın" diyor, ama M6 planında etikete doğrulama kodu basılmıyor (QR altındaki satır yalnızca GTIN ve parti, §4). Ya kod QR kartına eklenir ya da bu ipucu metinden çıkar; karar bekliyor.
- Önizleme durumunda tasarım "Sürüm 3 taslağı" der; önizleme yalnızca panelden (`passport-preview`), halka açık değil.

### 10.3 T2 uygulama notları (yayın, sürümler, geri çekme)

- **V11:** `passport`'a `company_id`, `gtin`, `batch_no`, `schema_version`, `snapshot_sha256`, `superseded_at`, `withdrawn_*`; durum ile geçiş kolonlarının birlikte dolması CHECK ile. Değişmezlik tetikleyicisi `pg_trigger_depth() > 1` iken geçer: kullanıcı silinince `published_by` SET NULL ve firma silinince CASCADE gibi dış anahtar eylemleri bozulmasın; doğrudan `UPDATE` ve `DELETE` derinlik 1'dir ve reddedilir.
- **Uçlar:** `POST /batches/{id}/passports` (OWNER, ADMIN; 201), `GET /batches/{id}/passport-preview`, `GET /batches/{id}/passports` (düz liste, en yeni önce), `POST /batches/{id}/passports/draft` (OWNER, ADMIN), `GET /passports/{id}` (sürüm + snapshot), `POST /passports/{id}/withdraw` `{reason}` (OWNER, ADMIN). Okuma uçları OWNER/ADMIN/EDITOR/VIEWER; SUPPLIER hepsinde 403. Başka firmanın partisi ve pasaportu 404.
- **Hatalar:** 409 `PUBLISH_BLOCKED` (gövdede `blockers`, T1'deki kodlarla), `ALREADY_PUBLISHED`, `BATCH_NOT_PUBLISHED`, `NOT_PUBLISHED`; geri çekme gerekçesi boşsa 400. `ConflictException` gövdeye ek alan taşıyabiliyor.
- **Kilit sırası** her yerde parti, sonra pasaport satırı (yayın ve geri çekme aynı sırada, kilitlenme yok). İki eşzamanlı yayından biri 201, öbürü 409 `ALREADY_PUBLISHED` (testte).
- **Küçük yarış penceresi:** skor ve snapshot aynı transaction'da ama READ COMMITTED'da ayrı okunur; arada bir adım değişirse skor milisaniyelik eski kalabilir. Snapshot kurucusu yine de yalnızca onaylı adımların verisini ve onaylı belgeleri alır; onaysız adım görürse 409 verir. Dondurulan veri her zaman onaylıdır.
- **Snapshot:** yalnızca geçerli (bitişi bugünden önce olmayan) ve onaylı sertifikalar girer; süresi dolmuş eski sertifika (yenilenmiş) listede yok. Onaylı adımların verisi izinli alan listesiyle (`SnapshotStepData`) kopyalanır: miktarlar, hasat yılı ve ton girmez. Anahtarlar `s1…` ve `c1…`. Önizlemede onaysız adım `approved: false`, verisiz görünür.
- **Özet:** snapshot'ın JSON metninin (kayıt alanlarının tanım sırası) SHA-256'sı; satırdan okunan kayıt yeniden yazılınca aynı özeti verir (testte). `VerificationCode` bundan türetilir.

### 10.4 T3 uygulama notları (herkese açık uç, adres, QR)

- **`PUBLIC_BASE_URL`** `tekpas.public.base-url` (varsayılan `http://localhost:3000`); `render.yaml`'da `https://kozapass.vercel.app`. Geçersiz adres açılışı durdurur.
- **`Gs1DigitalLink`** (`path`, `url`, `parse`) ve TS ikizi `packages/shared/src/gs1-digital-link.ts`, `test-vectors/gs1-digital-link.json` ile iki tarafta aynı vakalar. `parse`: GTIN-8/12/13/14 (kontrol hanesi geçerli) → 14 hane, parti no büyük harfe.
- **Herkese açık uç:** `GET /api/v1/public/passports/01/{gtin}/10/{batch}` → `{ verificationCode, snapshot }`, başka bir şey yok (skor, id, iç gerekçe yok; testte). Partinin **en son** sürümü karar verir: `PUBLISHED` 200, `WITHDRAWN` 410 `PASSPORT_WITHDRAWN` (`withdrawnAt`; gerekçe dönmez), yok ya da okunamayan kod 404 `PASSPORT_NOT_FOUND`. Taslaktaki ve hiç yayınlanmamış parti de 404 ve mesajı bilinmeyen koddan ayırt edilemez. `?v=` yok sayılır; eski sürüm dönmez.
- **Başlıklar:** başarılı cevapta `Cache-Control: public, max-age=60`, hatalarda yok (404 yayından sonra eski kalmasın); `X-Robots-Tag: noindex`, `Referrer-Policy: strict-origin-when-cross-origin`. Tedarikçi linkinin `no-store` kuralı `/api/v1/public/passports/` için uygulanmaz.
- **Hız sınırı:** ayrı kova `passport`, IP başına dakikada 120, IP bilinmiyorsa genel 600 (testte 121. istek 429). Önbellek (T4) çoğu isteği zaten sunucuya getirmeyecek.
- **Kütüphane:** ZXing `core` 3.5.3 (Apache-2.0, geçişli bağımlılık yok); PNG için JDK `ImageIO`, SVG modül matrisinden. Hata düzeltme M, sessiz bölge 4 modül (testte ölçülüyor), PNG ve SVG ZXing ile geri çözülüp adrese eşitleniyor. `PassportVersionResponse.digitalLink` eklendi.
- `ApiException` ek alan taşıyabiliyor (`property`); `ConflictException.with` ayrı kaldı.

### 10.5 T4 uygulama notları (önbellek yenileme)

- **Önbellek kararı:** kök yerleşim `getLocale()` ile başlık/çerez okuduğu için pasaport sayfası statik (ISR) olamaz; sayfa sunucuda çizilir, **veri** `unstable_cache` ile etiketli önbelleğe alınır (Next 16'da `use cache`'in yerine geçtiği belirtilen ama `cacheComponents` istemeyen yol; sonuç istekler ve deploy'lar arasında kalır). Veri dilden bağımsız olduğundan bir kayıt üç dili de karşılar; dil yalnızca çizimde seçilir. Önbelleğe 200 (yayında) ve 410 (geri çekilmiş) sonuçları girer; 404 ve hatalar girmez (rastgele kodlarla önbellek şişirilemez, yayından sonra eski 404 kalmaz). Bu uygulama T5'te.
- **`PASSPORT_CACHE_REFRESH`** (V12'de iş türü, en çok 4 deneme: 30 sn, 2 dk, 10 dk): yayın ve geri çekme transaction'ında kuyruğa girer (geri alınırsa iş de gider), commit sonrası çalışır; taslak açmak herkese açık sayfayı değiştirmediği için iş yok. İş önce `POST {PUBLIC_BASE_URL}/api/passport-cache` (Bearer `REVALIDATE_SECRET`) çağırır, sonra her dilde sayfayı bir kez ister (backend uyanıkken önbelleği doldurur; en iyi çaba, hata yalnızca loglanır). 401/403/404 tekrarsız FAILED (yanlış gizli değer ya da uç yok), 5xx ve ulaşılamama tekrar denenir. Gizli değer yoksa (yerel, test) iş hemen biter.
- **Web ucu** `POST /api/passport-cache`: gizli değer en az 32 karakter değilse 503 (kapalı), Bearer'ı sabit zamanlı karşılaştırır (401, gövdesiz), gövdedeki kodu `parseDigitalLink` ile kanonikleştirir (400), `revalidateTag(tag, { expire: 0 })` (bayat içerik sunulmaz, sonraki tarama taze veriyi bekler) ve 204 döner. Etiket `passport:{gtin14}:{BATCHNO}`.
- **Yeni ortam değişkeni `REVALIDATE_SECRET`** Render (`render.yaml`, `sync: false`) ve Vercel'de aynı değerle; kullanıcı tarafından girilmesi gerekir (`docs/DEPLOY.md`).
- **Açık, canlıda ölçülecek (T7):** Vercel'de `unstable_cache` verisinin yeni deploy'dan sonra korunduğu; korunmuyorsa deploy sonrası ısıtma eklenir.

