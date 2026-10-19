# M6 planı — Pasaport ve QR

**Hedef:** Onaylı bir parti için değiştirilemez bir pasaport sürümü yayınlanır; GS1 Digital Link QR'ı okutulunca herkese açık sayfa telefonda **2 saniyede** açılır. Yeni sürüm yayınlanınca aynı QR yeni sürümü gösterir (PLAN M6 kabulü). Tasarım: v0.6 (`docs/m6-tasarim-brifi.md`). Bu belge plandır; kod yok. Açık kararlar §9'da, onaylanmadan ilgili görev başlamaz.

Dayandığı kararlar: K11 (pasaport seviyesi parti), K12 (snapshot dondurulur), K13 (`{PUBLIC_BASE_URL}/01/{gtin}/10/{batch}`), kural 6 (yayınlanmış pasaport değişmez), kural 1 (tenant).

## 1. Mevcut durum

- `passport` tablosu V1'de var: `batch_id`, `version`, `status` (`PUBLISHED | SUPERSEDED | WITHDRAWN`), `snapshot` JSONB, `completeness` (0–100), `published_by`, `published_at`; `UNIQUE (batch_id, version)` ve partide tek `PUBLISHED` için kısmi unique indeks. `passport_scan` tablosu da var (kullanılmıyor).
- Parti durumu `DRAFT → COLLECTING → READY` otomatik (`BatchProgress`); `PUBLISHED` henüz hiçbir kod yolunda atanmıyor. Belge ve zincir yazımları `BATCH_PUBLISHED` (409) korumasını zaten taşıyor; pasaportu olan parti silinemiyor (`BATCH_HAS_PASSPORT`).
- Parti detayında (v0.3 09) "Uyum skoru —", kilitli "Önizle" ve "Pasaportu yayınla", eşik %90 sabiti (`PUBLISH_THRESHOLD`) ve "Pasaport sürümleri" sekmesinin boş durumu duruyor.
- `product.care_info` JSONB V1'den beri var ama ne entity'de ne formda kullanılıyor.
- Demo GTIN'leri GS1 kısıtlı dolaşım aralığında (020–029): hiçbir markaya atanmaz, demo pasaport gerçek bir ürünle çakışmaz. QR'lar `https://kozapass.vercel.app` adresine gider, gerçek etikete basılmaz.

## 2. Uyum skoru

**Ne ölçer:** Partinin yayına ne kadar hazır olduğunu, açıklanabilir ve test edilebilir kurallarla. AI kullanılmaz (M7'nin AI kontrolleri ayrı). Değer 0–100 tam sayı, **aşağı yuvarlanır** (eşiğe yuvarlamayla ulaşılmaz). Tarih kuralları `Europe/Istanbul` gününe göre, `Clock` enjekte edilir.

| Kod | Ölçüt | Puan | Hesap |
| --- | --- | :-: | --- |
| `STEPS_APPROVED` | Onaylı adımlar | 50 | Zincirdeki her adım eşit pay; `APPROVED` adım tam puan (FIBER menşe girilince onaylı sayılıyor, M4). |
| `REQUIRED_FIELDS` | Zorunlu alanlar | 30 | Yarısı adımlar: her adımın `StepData.missingFor(type)` listesine göre doldurulan oran. Yarısı ürün/parti: lif bileşimi (toplam 100), kategori, üretim tarih aralığı, bakım bilgisi (§9 karar 9 onaylanırsa; yoksa bu madde ölçütten çıkar ve pay diğerlerine dağılır). |
| `VALID_CERTIFICATES` | Geçerli sertifikalar | 20 | Sertifika beklenen adımlar (öneri: `YARN`, `FABRIC`, `DYEING`; zincirde olanlar) eşit pay. Adımda en az bir **onaylı** (`VERIFIED`) sertifika türü belge (`DocType.isCertificate()`) ve `validUntil ≥ bugün` ise tam pay. Onaysız belge sayılmaz (kural 5). |

Örnek (varsayılan 5 adım, hepsi onaylı, alanlar tam): 3 sertifikadan 2'si → 50 + 30 + 13 = **93** (yayınlanır); 1'i → 50 + 30 + 6 = **86** (yayınlanamaz). Yani eşik pratikte "en az iki geçerli sertifika" demek.

**Engeller** (skordan bağımsız, biri bile varsa yayın kapalı; her biri koduyla ve varsa adımıyla döner):
- `NO_CHAIN`: zincir yok.
- `STEP_NOT_APPROVED`: onaysız adım var (§9 karar 1: önerimiz engel olması; halka açık veri insan onayı olmadan yayınlanmaz).
- `CERTIFICATE_EXPIRED`: onaylı bir sertifikanın süresi dolmuş (adımın sertifika payı da 0).
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
- `job.type`: `PASSPORT_CACHE_REFRESH` (§5.4).
- Yayın ve geri çekme `audit_log`'a yazılır (`entity_type = PASSPORT`, `action = PUBLISH | WITHDRAW | REOPEN`); M12'deki denetim izi ekranı bunu okur.
- Tablo şu an boş (seed pasaport üretmiyor), `company_id` için geri doldurma gerekmez; yine de migration `batch`'ten doldurup sonra `NOT NULL` yapar. `ApplicationSmokeTest` migration listesi ve tablo sayısı güncellenir (kural 2).

### 3.2 Snapshot içeriği (izinli alan listesi)

Snapshot **dilden bağımsızdır**: metin yerine kod ve sayı taşır (`T_SHIRT`, `ORGANIC_COTTON`, `REACTIVE`, `GOTS`), etiketler sayfada `web/messages/{tr,en,de}.json`'dan gelir. Böylece M6'da AI çevirisi gerekmez; serbest metinler (ürün adı, açıklama, firma adları) özgün dilinde kalır. M11 snapshot'a `translations` bloğu ekler (`schemaVersion: 2`), eski sürümler değişmez.

```json
{
  "schemaVersion": 1,
  "passport":     { "version": 2, "publishedAt": "2026-10-28T09:12:00Z", "gtin": "02012345000025", "batchNo": "KP-2026-0915-A" },
  "manufacturer": { "name": "Nilüfer Giyim A.Ş.", "city": "Bursa", "country": "TR" },
  "product":      { "name": "Organik Pamuk Polo", "category": "T_SHIRT", "description": null,
                    "fiberComposition": [{ "fiber": "ORGANIC_COTTON", "percent": 100 }],
                    "care": null },
  "batch":        { "producedFrom": "2026-09-01", "producedTo": "2026-09-10" },
  "supplyChain":  [{ "key": "s2", "type": "YARN", "inputs": ["s1"], "approvedAt": "2026-09-20T…",
                     "actor": { "name": "Ege İplik San. Ltd.", "city": "Denizli", "country": "TR" },
                     "data": { "fiberComposition": […], "originCountry": "TR", "energySources": […] },
                     "certificates": ["c1"] }],
  "certificates": [{ "key": "c1", "type": "GOTS", "certNo": "…", "holder": "…", "issuer": "…", "validFrom": "…", "validUntil": "…" }],
  "compliance":   { "score": 93, "threshold": 90, "criteria": [{ "code": "STEPS_APPROVED", "earned": 50, "possible": 50 }, …] }
}
```

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
- **Düzenlemeye aç** `POST /batches/{id}/reopen` (OWNER, ADMIN; §9 karar 6): parti kilidi kalkar (`READY`/`COLLECTING`, `BatchProgress` hesaplar), **yayındaki sürüm satırı olduğu gibi kalır**, QR okutan onu görmeye devam eder. Değişiklikler yeniden yayınlanınca yeni sürüm olur.
- **Geri çek** `POST /passports/{id}/withdraw` `{ reason }` (OWNER, ADMIN; gerekçe zorunlu, en fazla 500): `WITHDRAWN`, parti `READY`'e döner. Eski bir sürüme geri dönülmez (§9 karar 7).
- **Sürümler** `GET /batches/{id}/passports`: sürüm, durum, tarih, yayınlayan, skor, geri çekme gerekçesi.
- Tenant: bütün panel uçları `company_id` ile filtreler; başka firmanın partisi/pasaportu 404 (her uç için test).

## 4. GS1 Digital Link ve QR

**URL:** `{PUBLIC_BASE_URL}/01/{gtin14}/10/{batchNo}`. Tek yerde kurulur (`Gs1DigitalLink.of(gtin, batchNo)`, backend; web'de eşi `packages/shared`), iki yerde aynı test vektörleriyle doğrulanır.
- **GTIN** her zaman 14 hane (GS1 Digital Link'in önerdiği biçim; GTIN-8/12/13 başına sıfır eklenerek). Kontrol hanesi yayında zaten geçerli (M2).
- **Parti (AI 10):** en fazla 20 karakter, bizde yalnızca `A–Z 0–9 -` (M2 kuralı), yani URL'de yüzde kodlama gerekmez.
- Sorgu parametreleri GS1 DL'de serbest; `?lang=` ve `?v=` (sürüm) kullanırız, bilinmeyenler yok sayılır. `/01/{gtin}` (partisiz, ürün düzeyi) M6 kapsamı dışı: 404.
- **QR:** içerik URL'dir, **sürüm içermez** (kabul kriteri: aynı QR yeni sürümü gösterir). Hata düzeltme **M** (etiket aşınmasına yeterli, %15), sessiz bölge 4 modül. URL tamamı büyük harfe çevrilip QR'ın alfanümerik kipiyle daha küçük kod üretilebilir (şema ve alan adı büyük/küçük harf duyarsız, yolumuz rakam + büyük harf); ilk sürümde düz URL, ölçüm sonucu iyi çıkarsa açılır.
- **Uçlar:** `GET /passports/{id}/qr.png?size=512|1024` ve `qr.svg` (baskı için vektör). Altında insan tarafından okunur satır: `(01) 02012345000025 (10) KP-2026-0915-A`. İlk yayından sonra sunulur (önce okutulursa 404 verirdi). Panel ve tenant kontrolü; herkese açık değil.
- **Kütüphane (§9 karar 5, yeni bağımlılık):** öneri ZXing `core` (Apache-2.0, geçişli bağımlılığı yok, PNG için JDK `ImageIO`, SVG modül matrisinden elle). Testte üretilen PNG yine ZXing ile çözülüp URL'ye eşitlenir.

## 5. Herkese açık sayfa `/01/[gtin]/10/[batch]`

### 5.1 Backend ucu

`GET /public/passports/01/{gtin}/10/{batch}?v=` (girişsiz):
- Yayındaki sürümün snapshot'ını döner; `?v=N` eski (`SUPERSEDED`) sürümü döner ve `latestVersion` ile "güncel sürüm" bağlantısı kurulur (§9 karar 8).
- Bulunamayan, taslak veya hiç yayınlanmamış parti **404** `PASSPORT_NOT_FOUND` (taslağın varlığı sızmaz). Geri çekilmiş **410** `PASSPORT_WITHDRAWN` (yalnızca geri çekilme tarihi; gerekçe iç bilgi, dönmez).
- Snapshot zaten izinli alan listesi olduğu için uç ek alan eklemez; JWT yok, tenant filtresi yok, anahtar `(gtin, batch_no)` ve GTIN dünya çapında tekil (M2).
- Rate limit M4'teki genel sayaç düzeninde (ayrı kova). `Cache-Control: public, max-age=60` (asıl önbellek Next'te).
- `?lang=` backend'den kalkar (PLAN §4 güncellenir): snapshot dilden bağımsız, dili sayfa seçer.

### 5.2 Web mimarisi ve dil

- Yol GS1 ile birebir: `app/01/[gtin]/10/[batch]/page.tsx`. Yanlış biçimde gelen istek (13 haneli GTIN, küçük harfli parti no) **308** ile kanonik adrese yönlenir; kontrol hanesi hatalı GTIN 404 sayfası.
- **Dil sırası:** `?lang=` → `Accept-Language` → `tr` (panelin çerezine bakılmaz: sayfa paylaşılan ve önbelleklenen bir belge). `proxy.ts` dil kararını verip isteği iç yola yeniden yazar: `/01/…` → `/passport/{lang}/{gtin}/{batch}` (kullanıcı adresi değişmez). İç sayfa `cookies()`/`headers()` okumaz, dili parametreden alır (`getTranslations({ locale })`), böylece her dil ayrı ve statik önbelleklenir. Pasaport yollarında `proxy` çerez yazmaz (bugün `?lang=` ile `NEXT_LOCALE` çerezi yazıyor; pasaport için atlanır).
- Sayfada dil seçici `?lang=` bağlantılarıdır (JS gerekmez). `<html lang>` doğru dil; `hreflang` alternatifleri.
- **Bileşenler sunucu bileşeni:** istemci JS'i yalnızca tema düğmesi (varsa). React Flow yok; zincir dikey liste/zaman çizgisi. Yazı tipleri mevcut olanlar, alt küme ve `preload`.
- Metadata: başlık "{ürün} · {parti} · KozaPass", açıklama lif bileşiminden; **`noindex`** (demo GTIN'leri gerçek değil; gerçek alan adına geçince açılır).

### 5.3 SSR performansı (2 sn hedefi)

Risk: Render ücretsiz sunucu uyuyor, soğuk açılış 100–150 sn. Yani **QR okutmanın backend'e bağlı olmaması gerekir.**
- Snapshot değişmez olduğu için sonsuza kadar önbelleklenebilir. Öneri (cacheComponents'i bütün uygulamada açmadan, Next 16'nın önceki önbellek modeli): `fetch(url, { next: { tags: ["passport:{gtin}:{batch}"] } })` + sayfanın statik üretimi (ISR); geçersiz kılma yalnızca yayın ve geri çekmede. Alternatif: `cacheComponents: true` + `'use cache'` + `cacheTag` + `cacheLife('max')` (panelin tamamını etkiler, ayrı iş).
- **Önbellek ısıtma:** yayın / geri çekme / yeniden açma commit'inden sonra `PASSPORT_CACHE_REFRESH` işi (K9 kuyruğu, tekrarlı) web'e `POST /api/passport-cache` çağırır (`Authorization: Bearer REVALIDATE_SECRET`, yeni gizli değişken; Render ve Vercel'de, `.env.example`'da boş). Route handler `revalidateTag(tag, { expire: 0 })` yapar (yeni sürüm hemen görünsün), ardından iş üç dilin sayfasını bir kez ister. Backend o anda uyanık olduğu için önbellek dolar; sonraki okutmalar Vercel'den döner.
- **Önbellek boşsa ve backend uyuyorsa:** sayfa kabuğu (başlık, logo, iskelet) hemen gelir, içerik `Suspense` içinde; 8 sn'de cevap yoksa "Pasaport hazırlanıyor, sayfa kendiliğinden yenilenecek" (panelin uyuyan sunucu akışının aynısı, 3 dk sınırı). Bu yol hata değil, nadir durum.
- **Doğrulanacak (T4'te, en fazla 30 dk):** Vercel'in veri/ISR önbelleği yeni deploy'dan sonra korunuyor mu? Korunmuyorsa deploy sonrası ısıtma (yayındaki pasaportların listesi küçük; `main` deploy'unda bir kez) eklenir.
- **Ölçüm (kabul):** canlıda önbellekten TTFB < 300 ms, orta seviye telefonda 4G'de ilk anlamlı içerik < 2 sn (Chrome DevTools "Fast 4G" + gerçek telefonla QR). Sonuç haftalık nota.

### 5.4 Güvenlik

Sayfada oturum yok, panel çerezleri okunmaz; `Referrer-Policy: strict-origin-when-cross-origin`; snapshot dışında veri yok. Revalidate ucu sabit zamanlı gizli karşılaştırma, yalnızca POST, gövde şeması dar (`gtin`, `batchNo`). Okutma istatistiği (`passport_scan`) M6'da yazılmaz (§9 karar 11).

## 6. Web panel (tasarım v0.6 gelince)

- Parti detayı: uyum skoru kartı (halka + kırılım + engeller, adıma git bağlantılarıyla), "Önizle" ve "Pasaportu yayınla" açılır; yayın diyaloğu; yayından sonra QR kartı; "Düzenlemeye aç" ve "Geri çek"; "Pasaport sürümleri" sekmesi.
- Partiler listesi: "Uyum skoru" sütunu gerçek değer.
- Rol: OWNER/ADMIN yayınlar ve geri çeker; EDITOR/VIEWER düğmeleri `GuardedButton` ile kapalı görür (backend 403).

## 7. Test

- **Birim:** `ComplianceScore` tablo testleri (ağırlıklar, aşağı yuvarlama, eşik sınırı 89/90, süresi bugün dolan sertifika, onaysız belge sayılmaz, zincir yok); `Gs1DigitalLink` (GTIN-8/12/13/14 normalizasyonu, parti karakterleri) backend ve `packages/shared`'de aynı vektörler.
- **Entegrasyon:** yayın (sürüm artışı, `SUPERSEDED`, parti `PUBLISHED`), eşik/engel 409 ve gerekçeler, **izinli alan testi** (snapshot'ta yasak alan yok), **değişmezlik tetikleyicisi** (doğrudan SQL `UPDATE passport SET snapshot` hata verir), eşzamanlı iki yayın (biri 409), geri çekme ve yeniden açma, roller (EDITOR/VIEWER/SUPPLIER 403), tenant 404 (her yeni uç), public uç (404 taslak, 410 geri çekilmiş, `?v`), QR PNG çözülünce URL, önbellek işi (sahte HTTP sunucusu).
- **Web:** dil seçimi ve 308 normalizasyonu, snapshot görünümü bileşen testleri, i18n anahtar eşitliği; e2e: yayınla → `/01/…` v1 → v2 yayınla → aynı adres v2.

## 8. Görevler ve sıra

| # | İş | Bağımlılık |
| --- | --- | --- |
| T0 | Tasarım brifi → Claude Design v0.6 | — (UI işleri bunu bekler) |
| T1 | `ComplianceScore` + `GET /batches/{id}/score` + listede `score` | karar 1–2 |
| T2 | V11 + yayın / önizleme / sürümler / geri çek / yeniden aç + snapshot kurucusu + izinli alan testi | T1, karar 6–7 |
| T3 | Public uç + `Gs1DigitalLink` + QR PNG/SVG | T2, karar 5 |
| T4 | `PASSPORT_CACHE_REFRESH` işi + web revalidate ucu + Vercel önbellek denemesi | T3 |
| T5 | Web `/01/[gtin]/10/[batch]` | T0, T3, T4 |
| T6 | Web panel: skor kartı, yayın diyaloğu, QR kartı, sürümler, geri çek | T0, T2 |
| T7 | Canlı ölçüm (2 sn), e2e, çeviriler en/de, haftalık not, README | hepsi |

Her backend PR'ında `./mvnw verify` + `pnpm --filter api-client generate` (kural 9). PLAN §4 API tablosu T3'te güncellenir (`?lang` kalkar, `passport-preview`, `reopen`, `qr.svg` eklenir).

## 9. Açık kararlar (kullanıcı onayı bekliyor)

1. **Onaysız adım engel mi?** Öneri: evet (`STEP_NOT_APPROVED`). Hayır denirse skor %90 üstündeyken bir adım onaysız yayınlanabilir.
2. **Skor ağırlıkları ve sertifika beklenen adımlar:** öneri 50 / 30 / 20 ve `YARN`, `FABRIC`, `DYEING`. İddiaya bağlı kurallar (organik lif → GOTS/OCS, geri dönüştürülmüş → GRS) M7'ye.
3. **Skor tüketiciye görünsün mü?** Öneri: sayfada "Belgelenme düzeyi %93" küçük bir satır; ölçütlerin kırılımı yalnızca panelde.
4. **Tedarikçi adları herkese açık mı?** Öneri: ad + şehir görünür (demo değeri yüksek). Ticari gizlilik için ileride tedarikçi başına "adı gizle" (M12 ayarlar).
5. **QR kütüphanesi (yeni bağımlılık):** öneri ZXing `core`. Alternatif `qrcode` (npm, MIT) ile web'de üretmek; o zaman PLAN'daki `qr.png` ucu web'e taşınır.
6. **Yayından sonra düzenleme:** öneri "Düzenlemeye aç" (yayındaki sürüm canlı kalır, yeni sürüm yayınlanınca yer değiştirir). Alternatif: önce geri çek, sonra düzenle (QR arada "geri çekildi" der).
7. **Geri çekme:** öneri QR "Bu pasaport geri çekildi" der, önceki sürüme dönülmez.
8. **Eski sürümler herkese açık mı (`?v=N`)?** Öneri: evet, "Bu sürüm güncel değil" şeridiyle (şeffaflık, denetim izi).
9. **Bakım bilgisi:** `product.care_info` kullanılmıyor. Öneri: M6'da ürün formuna ISO 3758 bakım sembolleri seçimi (tasarım v0.6'ya eklenir) ve skorun ürün alanlarına girer. Alternatif: M10'a ertelenir, sayfada bölüm gizli, ölçütten çıkar.
10. **Önbellek:** öneri ISR + `next.tags` + yayında ısıtma, `cacheComponents` kapalı kalır. Yeni gizli değişken `REVALIDATE_SECRET` (Render + Vercel).
11. **Okutma istatistiği:** öneri M6'da yok (önbellekten dönen sayfa sunucuya uğramaz; ölçmek her okutmada Render'ı uyandırır). M10'da Vercel Analytics veya istemci beacon'ı değerlendirilir.
12. **Arama motoru:** öneri demo süresince `noindex`.
