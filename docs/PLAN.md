# KozaPass (kod adı: tekpas) — Proje Planı

Tekstil için Dijital Ürün Pasaportu platformu. Bitirme projesi + ERP firmasına gösterilecek çalışan demo.
Bütçe: **sıfır** — her servis ücretsiz katmanda.

---

## 1. Mimari kararlar

| # | Konu | Karar | Gerekçe |
| --- | --- | --- | --- |
| K1 | Repo | Monorepo (`backend/`, `web/`, `mobile/`, `packages/`) | Tipler paylaşılır, tek PR'da uçtan uca özellik, Claude Code bütünü görür |
| K2 | Backend | Java 21, Spring Boot 4.1, **Maven** | Kurumsal müşterinin güvendiği yığın, mevcut tecrübe; 3.x serisi OSS desteği bitti |
| K3 | DB | PostgreSQL 16, esnek alanlar JSONB | Zincir ilişkisel (recursive CTE), AB veri şeması henüz kesin değil |
| K4 | API | Code-first: springdoc → OpenAPI → üretilen TS client | Hızlı, tipler hep senkron, CI uyuşmazlığı yakalar |
| K5 | Auth | Kendi JWT'miz: access 15 dk + refresh 30 gün (rotation, aile iptali) | Dış bağımlılık yok, çok kiracılı yapıya tam kontrol |
| K6 | Web | Next.js App Router, shadcn/ui, Tailwind, TanStack Query, next-intl | Pasaport sayfası SSR, kurumsal görünüm |
| K7 | Mobil | React Native + Expo | Web ile aynı dil ve client, kamera/QR hazır |
| K8 | AI | Google Gemini, `AiClient` arayüzü arkasında, model adı config'te | Ücretsiz katman, sağlayıcı değişirse tek sınıf |
| K9 | Arka plan işleri | Postgres tabanlı kuyruk (`FOR UPDATE SKIP LOCKED`) | Ek servis yok, Render ücretsiz katmanında çalışır |
| K10 | Dosya | S3 API: local MinIO, prod Supabase Storage (S3), backend üzerinden yükleme, max 10 MB | Tek kod yolu, demo için yeterli |
| K11 | Pasaport seviyesi | **Parti** (üretim emri) | Her partinin gerçek zinciri farklı olabilir |
| K12 | Pasaport değişmezliği | Yayında snapshot dondurulur, değişiklik = yeni sürüm | Denetim izi, güven |
| K13 | QR | GS1 Digital Link: `{PUBLIC_BASE_URL}/01/{gtin}/10/{batch}` | AB'nin öne çıkardığı standart |
| K14 | Tedarikçi erişimi | Girişsiz, tek kullanımlık token linki; **WhatsApp / kopyala** ile paylaşım | E-posta için alan adı yok, sektörde iletişim zaten WhatsApp |
| K15 | Web vs mobil | **Web yönetir, mobil sahada iş görür** (bkz. §3) | Her platform kendi kullanıcısının bağlamına göre |
| K16 | Git | Feature branch + PR, CI yeşilse merge, `main` → otomatik deploy | `main` her zaman gösterilebilir |
| K17 | Prod depolama | Supabase Storage (S3 protokolü) | R2 kart istiyor, bütçe sıfır |
| K18 | Web → API erişimi | Web, API'ye kendi origin'i üzerinden proxy ile erişir (Next.js rewrites, `/api/v1/*`) | Refresh cookie birinci taraf olur (SameSite=Strict çalışır), web için CORS gerekmez |
| K19 | Neon bağlantısı | Pooler yok: uygulama ve Flyway tek bir doğrudan bağlantı (`DATABASE_URL`, `sslmode=require`) kullanır | PgBouncer transaction modu ile pgjdbc/Hibernate prepared statement'ları arasında sadece canlıda görülen sorun riski; tek uygulama ve en fazla 5 bağlantı için pooler gereksiz |
| K20 | Marka | Kullanıcıya görünen ad **KozaPass**, kod adı `tekpas` (repo, paketler, `com.tekpas`, Render servisi) | Bursa ipekçiliği / koza hikâyesi; kod adını değiştirmek gereksiz churn |
| K21 | Tedarikçi linki | `/r#<token>`: token adresin `#` kısmında, API'ye `X-Request-Token` başlığıyla gider; DB'de yalnızca SHA-256 | `#` kısmı sunucuya gitmez: token Vercel/Render istek log'larına ve Referer'a düşmez. Erişim log maskelemesi ikinci savunma hattı olarak kalır |

### Ücretsiz katman notları
- **Alan adı yok:** QR'lar `https://kozapass.vercel.app` adresine gider. `PUBLIC_BASE_URL` config'te, ileride tek satır değişir. Gerçek etikete basılmaz.
- **Render ücretsiz sunucu uyur** (15 dk trafiksizlikte, uyanma ~1 dk): cron-job.org `/actuator/health/liveness`'ı (DB'ye dokunmaz) **sadece 09:00–22:00 (Europe/Istanbul)** arasında 10 dakikada bir çağırır. Bu ayda ~410 saat eder. 750 saat **workspace başına** ve diğer servislerle paylaşılıyor; diğer iki servis uyanık tutulmuyor (Eylül 2026 kullanımı toplam 7,9 saat), bu yüzden pencere sorunsuz ve demo günlerinde 7/24'e geçmek de sığar. Ayrıntı: `docs/DEPLOY.md` §6.
- **Neon ücretsiz:** proje başına ayda 100 CU-saat (0.25 CU ile ~400 saat), 5 dk hareketsizlikte uyur (kapatılamaz). Render'ın health check'i ve cron DB'ye dokunmayan liveness'ı kullandığı için Neon sadece gerçek kullanımda uyanır; Hikari boşta bağlantı tutmaz (`minimum-idle: 0`).
- **Render pipeline dakikaları:** workspace başına ayda 500 dk, Docker build süresi buradan düşer. Bağımlılık katmanı cache'li, `buildFilter` sadece backend değişikliklerinde build eder, `checksPass` kırmızı CI'da build etmez. İlk canlı build ~2 dk (cache yok); kod değişikliğinde ~1,5 dk beklenir → ayda ~200–330 backend deploy'a yeter. Ayrıntı ve sınıra yaklaşınca yapılacaklar: `docs/DEPLOY.md` §8.
- **Gemini ücretsiz katmanı:** Gönderilen veri Google tarafından kullanılabilir → **sadece demo verisi.** Gerçek firmayla pilotta ücretli katman şart.
- **Supabase ücretsiz projeleri hareketsizlikte duraklar:** uyanık tutma cron'u storage'a da küçük bir istek atmalı.
- **MinIO topluluk imajları güncellenmiyor** (`minio/minio` artık yayınlanmıyor): local için Pigsty topluluk fork'u `pgsty/minio` sabit sürümle kullanılıyor. Sorun çıkarsa B planı: `chrislusf/seaweedfs`.

---

## 2. Rol matrisi

| Yetki | OWNER | ADMIN | EDITOR | SUPPLIER | VIEWER |
| --- | :-: | :-: | :-: | :-: | :-: |
| Kullanıcı ve rol yönetimi | ✓ | | | | |
| Tedarikçi ağı yönetimi | ✓ | ✓ | | | |
| Ürün / parti oluştur, düzenle | ✓ | ✓ | ✓ | | |
| Zincir kur, veri talebi gönder | ✓ | ✓ | ✓ | | |
| Adım / belge onayla, reddet | ✓ | ✓ | | | |
| Pasaport yayınla / geri çek | ✓ | ✓ | | | |
| Excel içe aktar | ✓ | ✓ | ✓ | | |
| Kendine atanan adıma veri ve belge gir | | | | ✓ | |
| Her şeyi görüntüle (kendi firması) | ✓ | ✓ | ✓ | | ✓ |

SUPPLIER sadece `supplier_company_id`'si kendi firması olan adımları görür. M1–M10 arasında OWNER ve SUPPLIER yeterli, tam matris M12'de uygulanır.

---

## 3. Web / mobil ayrımı

| Özellik | Web | Mobil |
| --- | :-: | :-: |
| Ürün, parti, zincir kurma, Excel, kullanıcılar, yayınlama | ✓ | – |
| Zinciri görüntüleme | ✓ | ✓ |
| Görevlerim | ✓ | ✓ ana ekran |
| Belge → AI → onay | dosya yükleme | ✓ **kamera** |
| QR okutma | – | ✓ |
| Hızlı onay / red | ✓ | ✓ |
| Push bildirim | – | ✓ |
| Tedarikçi linki `/r#<token>` (K21) | ✓ mobil uyumlu | – |
| Herkese açık pasaport | ✓ SSR | web'i açar |

---

## 4. API (`/api/v1`)

| Modül | Endpoint'ler |
| --- | --- |
| Auth | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` |
| Kullanıcı | `GET/POST /users` · `PATCH /users/{id}` |
| Tedarikçi ağı | `GET/POST /suppliers` · `GET/PATCH/DELETE /suppliers/{id}` |
| Ürün | `GET/POST /products` · `GET/PATCH/DELETE /products/{id}` · `GET /products/{id}/chain-preview` |
| Parti | `GET/POST /batches` · `GET/PATCH /batches/{id}` · `GET/POST /batches/{id}/chain` · `GET /batches/{id}/score` |
| Zincir adımı | `POST /batches/{id}/steps` · `PATCH/DELETE /steps/{id}` · `POST /steps/{id}/approve` · `POST /steps/{id}/reject` |
| Görevler | `GET /tasks` (rolüne göre bekleyenler ve rozet sayısı; mobil ana ekran) |
| Veri talebi | `POST /steps/{id}/requests` (ham token sadece bu cevapta, bir kez) · `POST /requests/{id}/revoke` |
| Tedarikçi (girişsiz, token `X-Request-Token` başlığında, K21) | `GET /public/request` · `POST /public/request/submit` · `POST /public/request/documents` (M5) |
| Belge + AI | `POST /documents` (202, AI kuyruğa) · `GET /documents/{id}` · `POST /documents/{id}/verify` · `GET /documents/expiring?days=30` |
| Tutarlılık | `POST /batches/{id}/validate` · `GET /batches/{id}/issues` · `POST /issues/{id}/resolve` |
| Pasaport | `POST /batches/{id}/passports` · `GET /batches/{id}/passports` · `POST /passports/{id}/withdraw` · `GET /passports/{id}/qr.png` |
| Pasaport (girişsiz) | `GET /public/passports/01/{gtin}/10/{batch}?lang=` |
| Excel | `GET /imports/template?kind=` · `POST /imports` · `GET /imports/{id}` |
| Mobil | `POST /push-tokens` · `DELETE /push-tokens/{token}` |

Kurallar: tenant JWT'den · RFC 7807 hatalar · sayfalama `?page&size&sort` · AI işleri asenkron (202 + polling).

---

## 5. Kilometre taşları

Sıralı. Biri bitmeden sonrakine geçilmez. Hocaya en son biteni göster. Her biri bitince `docs/haftalik/` notu yazılır.
**M1–M10 Arden demosu için kritik.** M11–M12 aynı zamanda tampondur.

### M1 — Temel altyapı ✓
_Tamamlandı: 27.09.2026 (PR #1–#9). Özet: `docs/haftalik/01-temel-altyapi.md`. Canlı kabul 27.09.2026'da `https://kozapass.vercel.app` üzerinde doğrulandı: gerçek Chrome ile giriş, yenilemede oturumun kalması, çıkış, "Beni hatırla" kapalıyken tarayıcı kapanınca oturumun düşmesi; `scripts/live-check.mjs` yeşil._
- [x] Monorepo iskeleti (pnpm workspaces, `backend/` Maven, `web/`, `mobile/`, `packages/`)
- [x] `infra/docker-compose.yml` (Postgres, MinIO), `.env.example`
- [x] Flyway V1 + V2, `DemoDataSeeder` (**demo kullanıcılarının gerçek BCrypt hash'i**)
- [x] ProblemDetail handler, `CurrentUser`, JWT login / refresh (rotation) / logout / me
- [x] OpenAPI → `packages/api-client` üretim hattı
- [x] Next.js login ekranı + korumalı panel iskeleti (shadcn) — Claude Design v0.2, masaüstü ve mobil (390 px)
- [x] CI: backend `mvn verify`, web lint/typecheck/test, OpenAPI ↔ client kontrolü
- [x] Deploy: Render + Neon + Vercel, sağlık kontrolü + uyanık tutma cron'u

**Kabul:** Canlı web linkinde demo kullanıcıyla giriş yapılır, yenilenince oturum korunur, başka firmanın kullanıcısı olarak `/auth/me` doğru firmayı döner.

### M2 — Ürün ve parti ✓
_Tamamlandı: 06.10.2026 (PR #11–#15). Özet: `docs/haftalik/02-urun-ve-parti.md`. Canlı kabul 06.10.2026'da `https://kozapass.vercel.app` üzerinde doğrulandı: live-check yeşil (Nilüfer Giyim A.Ş., 3 ürün, 5 parti), Ürünler ve Partiler ekranları v0.3 tasarımıyla açılıyor._
- [x] Ürün CRUD (GTIN kontrol hanesi doğrulaması), parti CRUD — backend, V3, demo verisi (3 ürün, 5 parti), `@tekpas/shared` Zod şemaları
- [x] Web: ürün listesi/formu, parti listesi/formu (tasarım v0.3 01–08); parti detay iskeleti M3'e taşındı
  - [x] Ürünler (01–06): liste, boş durum, düzenle/yeni sheet'i, silme onayı ve engeli
  - [x] Partiler (07–08): liste, parti oluştur

Web kuralları (M2):
- Ürün listesi tek sayfada en fazla 100 ürün gösterir (`size=100`); tasarımda sayfalama yok. 100'ü aşan firmada ilk 100 görünür; sayfalama tasarımı gelince eklenecek.
- GTIN ekranda 13 hane (başında 0 olan GTIN-14), Geist Mono. Input 8/12/13/14 hane kabul eder.
- Lif oranı tam sayı; "90,5" alan hatası verir (`Integer`), yuvarlanmaz.
- GTIN çakışma ön kontrolü sadece kendi ürünlerde, normalize edilmiş 14 hane birebir eşleşirse; başka firmanın GTIN'i kayıtta 409 ile, ad olmadan gösterilir.
- VIEWER yazma butonlarını devre dışı ve gerekçeli görür; SUPPLIER `/products` ve `/batches`'tan `/tasks`'a yönlenir (asıl koruma backend 403).

Backend kuralları (M2):
- GTIN-8/12/13/14 kabul edilir, 14 haneye normalize edilir, dünya çapında tekildir. Çakışmada 409 döner ama sahibi firma açıklanmaz. Ürünün partisi varsa GTIN değişmez (409 `gtin-locked`).
- Lif bileşimi: tam sayı, 1–100 arası, toplam tam 100, her lif bir kez. Hata alan bazındadır, toplam `params.total` olarak döner.
- Parti no: GS1 AI(10) kuralı (en fazla 20 karakter, A–Z 0–9 -), ürün içinde tekil. Boş bırakılırsa `KP-YYYY-MMDD-A, B, …` atanır (firma ve gün bazında, Europe/Istanbul). `GET /batches/next-batch-no` numarayı sadece önerir, ayırmaz.
- Parti `DRAFT` başlar. Durum PATCH ile değişmez. Sadece pasaportu olmayan DRAFT parti silinir.
- Yetki: OWNER/ADMIN/EDITOR yazar, VIEWER okur, SUPPLIER ürün ve parti uçlarına erişemez (403).
- Bilinen karar: PATCH'te bilinmeyen veya değiştirilemeyen alanlar (`status`, `productId`, `companyId`) 400 vermez, yok sayılır (Spring Boot'un global ayarı korunur); değişmedikleri testlerle doğrulanır.

**Kabul:** Panelden ürün ve parti oluşturulur. Hatalı GTIN alan bazında hata gösterir. Başka firmanın ürününe erişim 404.

### M3 — Tedarik zinciri ✓
_Tamamlandı: 10.10.2026 (PR #18–#26). Özet: `docs/haftalik/03-tedarik-zinciri.md`._
- [x] Parti detay ekranı (M2'den taşındı): 09 Parti detayı + zincir ekranıyla birlikte, PR 3a.
- [x] API: tedarikçi ağı (ekle / listele / düzenle / çıkar). Tedarikçi = `company` + `created_by_company_id`; ad, tip ve şehri yalnızca onu oluşturan ve kullanıcısı olmayan firmanın üreticisi değiştirir, diğer durumda sadece bağlantı alanları (telefon)
- [x] API: zincir adımı ekle / düzenle / çıkar, `GET /batches/{id}/chain`. Zincir ağaç değil **DAG**: `supply_step_input(step_id, input_step_id)`; bağlantı yalnızca aynı partinin adımları arasında, kendine bağlantı ve döngü yasak (recursive CTE kontrolü). `parent_step_id` V4'te kaldırıldı
- [x] API: zinciri son partiden kopyalama (yapı + ağda kalan tedarikçiler; durum PENDING, veri boş), yoksa varsayılan Lif → İplik → Kumaş → Boya → Dikim; `GET /products/{id}/chain-preview`
- [x] Tedarikçi telefon kolonu (`company_supplier.phone`, E.164, WhatsApp paylaşımı için)
- [x] `supply_step.data` alanları (tipli `StepData`): ölçüler BigDecimal (kWh/kg, L/kg, g/m², kg), yüzdeler tam sayı, enerji kaynakları toplamı 100; adım tipine ait olmayan alan `NotApplicable`
- [x] Web: Tedarikçiler ekranı (tasarım v0.3 14/15), PR 2b. Şehir 81 il (tek kaynak `packages/shared/src/tr-provinces.json`, backend aynı listeyle doğrular, alan hatası `City`), aramalı liste; telefon +90 sabit, E.164 saklanır; sertifikalar "—" (M5); durum = son adım durumu, yoksa "—". Düzenleme 15'teki diyalogla: kendi hesabı olan firmada ad/tip/şehir kilitli, partide kullanılan tedarikçinin tipi kilitli (`SUPPLIER_TYPE_IN_USE`), telefon her zaman değişir
- [x] Web: Tedarikçi kaldırma (v0.3.1 27 kaldırılamaz, 28 bağı kaldır onayı), PR 2b ile birlikte. "Partileri gör" → `/batches?supplierId=` (API filtresi; ağda olmayan tedarikçi 404, her parti bir kez; sekme sayaçları filtreden bağımsız)
- [x] Web: Parti detay + React Flow zincir (v0.3 09, v0.3.1 26 zinciri olmayan parti, 29 reddedildi + lejant), PR 3a. Sabit 5 sütun (`web/lib/batches/chain-layout.ts`, yerleşim kütüphanesi yok); uyum skoru "—", Önizle ve Pasaportu yayınla kilitli, gerekçeler M3'ün bildikleri; sadece Tedarik zinciri sekmesi açık; lejantta 4 durum (Reddedildi yalnızca reddedilmiş adım varsa); alttaki beyan kartında uyuşmazlık rozeti yok (M5)
- [x] Web: Düğüm paneli (v0.3 10, v0.3.1 30: "Belgelerden okunan alanlar" gizli, başlıkta yalnızca tarih, M4 aksiyonları devre dışı "Bir sonraki sürümde"; 11'in düzeltme formu M4) ve Tedarikçi ata paneli (v0.3.1 25: adımın tipindeki tedarikçiler, son durum ve göreli tarihi, "Listede yok mu?" ile 15'teki diyalog tip seçili açılır ve yeni tedarikçi seçilir; "davet edildi" gizli), PR 3b. Lejant ipucu panelle geldi. Düğümlerde belge simgesi ve sayısı M5'e kadar gizli. Boş Lif düğümü "Menşe girilmedi" der ve menşe panelini açar (Lif'in tedarikçisi olmaz; kullanıcı kararı)
- [x] "Yeni parti" formu: üretim tarihleri isteğe bağlı (boş = tarih yok); ikisi doluyken sıra kontrolü sürüyor, PR 3b
- [x] PR 3a: Partiler listesindeki zincir çubuğu adım adım renklenir (v0.3.1 22: onaylı yeşil, gönderildi mavi, reddedildi kırmızı, bekleyen gri). Liste cevabına her partinin adım durumları sıralı dizi olarak eklenir (`GET /batches`). Satır oku ve satıra tıklama → parti detayı (09).

**Kabul:** Bir parti için İplik → Kumaş → Boya → Dikim zinciri çizilir, düğüm renkleri durumu gösterir.

### M4 — Veri talebi ve tedarikçi sayfası
Tasarım: `docs/design/v0.4/` (39–45 tedarikçi sayfası, 46–48 panel). PR sırası: backend (V6, linkler, public uçlar, onay/red, rate limit) → `GET /tasks` → web (a) panel 46/47/48 + rozet → web (b) `/r` sayfası 39–45.

- [ ] **V6:** `data_request`: `sent_to_email` kalkar; `revoked_at`, `revoked_by`, `open_count`, `submitter_name`, `submitter_role` eklenir; adım başına tek açık link (kısmi unique index, `SENT`/`OPENED`). `supply_step`: `rejection_reason`, `rejection_fields` (JSONB), `rejected_at`, `rejected_by`. Yeni `step_event` (istendi, açıldı, gönderildi, onaylandı, reddedildi, geri alındı, menşe girildi; kim, ne zaman): 47a'daki "Selin A. · 17 Eyl" ve M12 denetim izi
- [ ] **Link:** 32 bayt SecureRandom, base64url; DB'de yalnızca SHA-256 hex. Ham token yalnızca oluşturma cevabında (46a o an); sonra panelde "Yeni link oluştur" (eskiyi geri alır). Geçerlilik 7 gün, süre dolumu okunurken (`expires_at < now`). Link web'de kurulur: `{origin}/r#<token>`. "Gönderim no" `data_request` id'sinden türeyen kısa kod (`KP-R-XXXX`)
- [ ] **Link oluştur / geri al:** `POST /steps/{id}/requests` (OWNER, ADMIN, EDITOR; adım PENDING veya REJECTED, tedarikçi atanmış, FIBER değil), `POST /requests/{id}/revoke`. Zincir cevabında linkin özeti (durum, son tarih, açılma sayısı; token yok)
- [ ] **Public:** `GET /public/request` (görünüm; açılma sayısını artırır), `POST /public/request/submit` (tek gönderim; satır kilidi, ikinci gönderim 410). Link sahibi yalnızca kendi adımını görür: üretici firma adı, talebi açan kişinin adı (telefon yok), ürün adı, parti no, adım tipi, son tarih, red gerekçesi ve işaretli alanlar, kendi adımının verisi. Zincirin geri kalanı, diğer tedarikçiler, adım id'leri, GTIN, miktar asla (izinli alan listesi testi). Bilinmeyen token 404; süresi dolmuş / geri alınmış / gönderilmiş 410 + `LINK_EXPIRED` / `LINK_REVOKED` / `ALREADY_SUBMITTED` (44). `Cache-Control: no-store`, `X-Robots-Tag: noindex`, sayfada `Referrer-Policy: no-referrer`
- [ ] **Gönderim:** çok kez açılır, tek gönderim, taslak yok. Zorunlu: "Gönderen ad soyad" ve adım tipine göre İplik: lif bileşimi, menşe ülke; Kumaş: lif bileşimi, kumaş tipi; Boya: işlem, kimyasal uyumu; Konfeksiyon: menşe ülke. Diğerleri isteğe bağlı (formda "İsteğe bağlı" etiketi, "aksi belirtilmedikçe zorunlu" kalıbı). Adım SUBMITTED, link COMPLETED
- [ ] **Boya alanları (41, API tasarıma uyar):** `dyeProcess` (REACTIVE, DISPERSE, VAT, PIGMENT, OTHER; OTHER ise `dyeProcessOther` zorunlu, en fazla 80), `shade` (isteğe bağlı), `chemicalStandards` (ZDHC_MRSL, OEKO_TEX_ECO_PASSPORT, BLUESIGN, GOTS_APPROVED, NONE; en az biri, NONE diğerleriyle birlikte seçilemez), boya için `deliveredKg` ("İşlenen miktar"). `process` ve `chemicalCompliance` kalkar; eski anahtarları okuyan kod kalmaz, okuyucu bilinmeyen eski anahtarlarda patlamaz (test), seed güncellenir. Enum çevirileri tr/en/de (pasaportta da kullanılacak)
- [ ] **Onay / red:** `POST /steps/{id}/approve`, `POST /steps/{id}/reject` (OWNER, ADMIN; yalnızca SUBMITTED). Red: gerekçe zorunlu, isteğe bağlı `fields` (adım tipinin alan adlarıyla whitelist, bilinmeyen alan 400). 47b'deki hazır seçim → alan eşlemesi `packages/shared`'de tek yerde ("Lif oranı uyuşmuyor" → `fiberComposition`; "Belge okunaksız", "Sertifika süresi dolmuş" M5'e kadar gizli). Red → REJECTED → üretici yeni link oluşturur; 45'te gerekçe üstte, önceki veri dolu, işaretli bölüm açılışta görünür (oraya kaydırılır)
- [ ] **Parti durumu otomatik:** ilk link → COLLECTING; tüm adımlar APPROVED → READY
- [ ] **Lif menşei (FIBER):** üretici düğüm panelinden girer (40a'daki "Lif bileşimi + menşe" bölüm bileşenleri panelde; tasarım borcu), link gönderilmez
- [ ] **Rate limit** (uygulama içi, tek instance): public uçlarda IP başına dakikada 30, geçersiz token IP başına dakikada 10, gönderim token başına saatte 10; 429 + `Retry-After`. İstemci IP'si: istemci → Vercel → Render zincirinde Render'ın gördüğü `X-Forwarded-For`'da Vercel'in eklediği hop'tan alınır; istemcinin gönderdiği XFF'ye güvenilmez. Canlıda doğrulanır (en fazla 30 dk); doğrulanamazsa token + genel sayaç
- [ ] **`GET /tasks`** + rozet sayısı. Gruplar (48a, başlıklar içeriğe uyduruldu): "Onay bekleyen veriler" (SUBMITTED; OWNER, ADMIN), "Takip bekleyen talepler" (son tarihe 2 günden az kalan, süresi dolup gönderilmemiş, düzeltme istenip yeni linki olmayan; açılma sayısı, "Hatırlat" = link içermeyen hazır WhatsApp metni; düzeltme istenen ve süresi dolanlar en üstte), "Eksik adımlar" (tedarikçisi atanmamış adım, menşesi girilmemiş Lif, zinciri olmayan parti). Sertifika süresi M7
- [ ] **Web (a):** 46a/b/c link kartı ("Linki kopyala", "WhatsApp'ta paylaş": numara varsa `wa.me/<telefon>?text=`), 47a/b inceleme + onay/red, 48a/b Görevler, menü rozeti
- [ ] **Web (b):** `/r` sayfası 39–45 (mobil öncelikli, 40c masaüstü)

**Kabul:** Üretici link paylaşır, tedarikçi telefondan girişsiz veri girer, üretici onaylar, düğüm yeşile döner.

### M5 — Belge ve AI çıkarımı
- [ ] S3 depolama (MinIO / Supabase Storage), belge yükleme (10 MB, PDF/JPG/PNG, SHA-256 tekrar kontrolü)
- [ ] Job kuyruğu + worker + retry/backoff
- [ ] `AiClient` + `GeminiAiClient` + fake client (testler için), yapılandırılmış JSON çıktı
- *Not:* Testcontainers MinIO modülü varsayılan `minio/minio` ister → `DockerImageName.parse("pgsty/minio:...").asCompatibleSubstituteFor("minio/minio")` kullan
- [ ] Web: yükle → "AI okuyor" → alan alan öneri (güven < 0.8 sarı) → düzenle → onayla

**Kabul:** Örnek bir OEKO-TEX PDF'i yüklenir, sertifika no, sahibi ve geçerlilik tarihi otomatik dolar, kullanıcı onaylayınca asıl alanlara geçer.

### M6 — Pasaport ve QR (**çekirdek tamam**)
- [ ] Uyum skoru (onaylı adımlar + zorunlu alanlar + geçerli sertifikalar)
- [ ] Yayınla: snapshot, sürüm, eski sürüm SUPERSEDED; geri çek
- [ ] QR üretimi (GS1 Digital Link), PNG indirme
- [ ] Web: `/01/[gtin]/10/[batch]` SSR pasaport sayfası (zincir, lif bileşimi, sertifikalar, bakım)
- [ ] Yayın eşiği: uyum skoru %90 altındaysa yayınlanamaz; yayından önce "Önizle" (tasarım v0.3)

**Kabul:** Telefonla QR okutulur, pasaport 2 saniyede açılır. Yeni sürüm yayınlanınca aynı QR yeni sürümü gösterir.

### M7 — Tutarlılık kontrolü ve sertifika takibi
- [ ] Kural tabanlı: lif toplamı ≠ 100, süresi dolmuş sertifika, sertifika sahibi ≠ tedarikçi, eksik zorunlu alan
- [ ] AI tabanlı: sertifika kapsamı ürün kategorisini kapsıyor mu, çelişkili beyanlar
- [ ] Günlük `CERT_EXPIRY_SCAN` işi
- [ ] Web: parti detayında uyarı paneli, çözüldü olarak işaretleme
- [ ] Kural kodları (`LIF-01` vb., tasarım v0.3): her kontrolün sabit bir kodu olur, uyarıda gösterilir

**Kabul:** Lif toplamı %95 girilen partide kırmızı uyarı çıkar, pasaport yayınlanmadan önce gösterilir.

### M8 — Mobil I
- [ ] Expo iskeleti, giriş (SecureStore), Görevlerim
- [ ] Kamera → çok sayfalı fotoğraf → sıkıştır → yükle → AI sonucu → düzenle → onayla

**Kabul:** Telefonda sertifika fotoğrafı çekilir, 10 saniye içinde form dolu gelir.

### M9 — Mobil II
- [ ] QR okutma (parti etiketi → özet + zincir; ürün QR → pasaport)
- [ ] Hızlı onay / red
- [ ] Push bildirimleri (Expo)
- [ ] Zayıf bağlantıda yükleme kuyruğu

**Kabul:** Tedarikçi veri gönderince üreticinin telefonuna bildirim gelir, bildirimden onaylanır.

### M10 — Arden demo hazırlığı
- [ ] Gerçekçi demo verisi (3 ürün, 5 parti, farklı tamamlanma seviyeleri, 1 süresi dolmak üzere sertifika)
- [ ] Görsel cila, boş durumlar, yükleniyor durumları
- [ ] Sunucu uyanık, APK hazır, 5 dakikalık demo senaryosu yazılı ve prova edilmiş
- [ ] e2e testleri CI'da çalışsın (şu an yalnızca yerelde; `pnpm --filter web exec playwright test`)
- [ ] Açılışı hızlandırma / Render araştırması: soğuk başlangıç 100–150 sn ("Started TekpasApplication in" 75–83 sn). Render'da önce/sonra ölç: lazy init, gereksiz auto-config, Flyway validate. Prod'a lazy init kullanıcı onayıyla. Uyuyan sunucuda erken kesilen isteğin uyanmayı iptal edip etmediği canlıda ölçülemedi (cron gün içinde uyanık tutuyor); burada bak.

**Kabul:** Demo senaryosu baştan sona hatasız, internet yavaşken bile çalışıyor.

### M11 — Çok dil ve Excel
- [ ] Yayında AI ile EN / DE çeviri (snapshot içine), dil seçici
- [ ] Pasaport metinlerinin Almancası (ve arayüzün EN/DE çevirileri) anadili Almanca/İngilizce biri tarafından kontrol edilecek (`web/messages/README.md`)
- [ ] Excel şablonu indir → doldur → yükle → satır bazlı hata raporu

**Kabul:** Pasaport `?lang=de` ile Almanca açılır. 50 satırlık Excel'den ürünler oluşur, hatalı satırlar gösterilir.

### M12 — Detaylı roller, denetim izi, test
- [ ] §2 rol matrisinin tamamı + kullanıcı yönetimi ekranı
- [ ] Denetim izi ekranı (kim, neyi, ne zaman)
- [ ] Kritik akışlar için Playwright testleri
- [ ] Login rate limiting (IP + e-posta başına deneme sınırı)

**Kabul:** EDITOR yayınla butonunu göremez, API da 403 döner. Her yayın denetim izinde görünür.

### M13 — Bitirme teslimi
- [ ] `docs/haftalik/` notlarından rapor taslağı
- [ ] Mimari diyagram, veri modeli diyagramı, ekran görüntüleri
- [ ] Sunum, APK, canlı link, kaynak kod teslimi

---

## 6. Unutulmayacaklar

**Tasarım borcu** (tasarımı olmayan, şimdilik geçici çözümle duran yerler). İşaretliler `docs/design/v0.3.1/` (17–30) ve `docs/design/v0.3.2/` (31–38) ile kapandı; çerçeve numarası yanında, uygulama hangi PR'da:
- [x] **v0.3.1 17** (+23 `--story`), PR 2a. Koyu tema login tasarımı: hikâye paneli koyu temada da açık (koza kremi) kalıyor.
- [ ] Login altbilgisi: v0.3.1 17'deki "KVKK · Gizlilik · Durum" bağlantıları sayfaları olmadığı için yok; sadece "© 2026 KozaPass · Bursa".
- [x] **v0.3.2 31a/31b** (panelde **32**), PR 2c. Login "sunucu uyanıyor" durumu (5 sn sonra buton metni) tasarımda yok; kullanıcı onayıyla eklendi.
- [x] **v0.3.1 18**, PR 2a. Ürün düzenle: GTIN kilidi (partisi olan ürün) — input devre dışı, kilit ikonu, ipucu satırında neden (`impl-v0.3.1/18-*`).
- [x] **v0.3.1 19**, PR 2a. Liste yükleniyor durumu: tablo içinde iskelet satırlar.
- [x] **v0.3.1 20**, PR 2a. Liste hata durumu: boş durum çerçevesinde hata ikonu, metin ve "Tekrar dene".
- [x] **v0.3.1 21** (+23 `--tooltip`), PR 2a. VIEWER: devre dışı yazma butonları ve satır menüsü, "Bu işlem için yetkiniz yok" tooltip'i (tooltip bileşeni tasarımda yok).
- [x] **v0.3.2 38** (hata kalıbı, "N alanda hata var", ilk hatalı alana odak; SKU biçim kuralı uygulanmaz, serbest + trim + en fazla 64), PR 2c. Ürün formunda GTIN dışındaki alan hataları (ad, SKU, lif oranı "Tam sayı girin", aynı lif iki kez): input altında kırmızı satır; tasarımda sadece GTIN hatası var.
- [x] **v0.3.2 33**, PR 2c. Kaydetme/silme sunucu hatası (5xx): toast.
- [x] **v0.3.1 22** (+23 §5: aşama chip'i köşeli ve ikonlu, adım durumu rozeti hap biçimli), PR 2a. Parti durum chip'leri (Taslak=pending, Veri toplanıyor=submitted, Yayına hazır=approved, Yayında=brand): tasarımdaki chip'ler adım durumlarını gösteriyor (Beklemede, Gönderildi…).
- [x] **v0.3.1 22**, PR 2a. Yayında chip'i: dolu brand varyantı (zemin --brand, yazı --primary-foreground, nokta yerine onay ikonu); muted dut zemin "Reddedildi"ye çok benziyordu. Kontrast açıkta 7,5:1, koyuda 6,8:1.
- [x] Satır oku, tıklama ve adım bazında renkli zincir çubuğu, PR 3a. Partiler: tedarik zinciri çubuğu sadece sayılardan (onaylı yeşil, kalan gri, adım yoksa "—"); adım bazında renk M3'te zincirle gelir. Uyum skoru "—" (M6). Satır oku ve satıra tıklama gizli (parti detayı 09, M3).
- [x] **v0.3.2 34**, PR 2c. Partiler: filtre sonucu boş durumu ("Eşleşen parti yok", "Filtreleri temizle") ürünlerdeki tasarım metninden uyarlandı. Hiç parti yokken v0.2'nin (tasarım G) boş durumu ve "Nasıl başlanır" rehberi duruyor.
- [x] Tarih → **v0.3.1 24** (Popover + Calendar, aralık, pazartesi), PR 2a; zincir ipucu → 08 + `chain-preview`, PR 3a: alt başlık ve "Tedarik zinciri: N adım kopyalanacak"; ürünün zincirli partisi yoksa "Tedarik zinciri: varsayılan 5 adım" (tasarımda yok). Tarih alanları tarayıcının tarih seçicisi (tasarımda düz metin "gg.aa.yyyy").
- [x] **v0.3.1 23** (globals.css'te açık/koyu değerleriyle), PR 2a. Tasarım çerçevelerinde tanımlı olup globals.css'te olmayan token'lar: `--brand-text` eklendi (08 "Otomatik öneri" rozeti, "Yayında" chip'i); `--primary-hover`, `--destructive-hover`, `--ring-soft` hâlâ yok (web'de bg-primary/85 ve ring/18 kullanılıyor); her biri ilk kullanıldığı ekranda, tasarımdaki değeriyle (açık ve koyu) eklenecek.
- [ ] Mobil web liste (md altı): masaüstü tablo yatay kaydırılır; tasarım 16 web için uyarlanmalı.
- [x] **v0.3.1 23 §6** `--popover-muted`, PR 2a. Popover üstünde muted zemin token'ı (dark'ta --muted = --popover, ikisi #1B202A): ürün silme dialogundaki ürün kutusu koyu temada geçici olarak --card kullanıyor. Mobil kullanıcı menüsündeki seçim grubunun zemini de koyu temada görünmüyor; seçili öğe zaten --card olduğu için orada --card kullanılamadı, token gelince düzelecek.

- [x] **v0.3.2 35**, PR 2c. Partiler: "Tedarikçi: X" filtre chip'i (`?supplierId=`, tedarikçiden "Partileri gör") tasarımda yok; filtre satırında bordürlü chip + temizle butonu olarak duruyor (v0.3.2).
- [x] **v0.3.2 36a/36b** (WhatsApp ipucu M4'e kadar gizli), PR 2c. Tedarikçiyi düzenle diyaloğu: 15 "Tedarikçi ekle" yeniden kullanılıyor (başlık "Tedarikçiyi düzenle", "Kaydet"); kilitli alanlar 18'deki GTIN kilidi gibi, kilit nedeni üstte not veya tip altında satır (`impl-v0.3/15b-edit-locked-*`). v0.3.2'de resmileşecek.
- [x] **v0.3.2 37**, PR 2c. Tedarikçi şehir alanı: tasarımda 11 şehirlik select; 81 il için aramalı combobox (v0.3.2'de resmileşecek).

- [ ] Panel açılışında uyuyan sunucu: önce liveness yoklanır, refresh sunucu hazır olunca tek kez gider (rotation tek kullanımlık); 32'deki şerit kabuk iskeletinin içinde, 90 sn veya bağlantı hatasında 31b benzeri "Tekrar dene" kutusu, oturum korunur (`impl-v0.3.2/32b-*`, `32c-*`). Tasarımda yok.

- [ ] Flaky test: `web/e2e/keyboard.spec.ts` "mobile panel (390 × 800) › drawer and user menu…" tam e2e paketi çalışırken bir kez odak çekmece dışına çıktı (satır 142); tek başına 3/3 geçiyor. Ayrı bakılacak (PR 3 dışında).

- [ ] **v0.4 40a → panel**, M4. Lif menşeini üretici düğüm panelinden girer: 40a'daki "Lif bileşimi + menşe" bölüm bileşenleri panelde kullanılır; panel için ayrı tasarım yok.
- [ ] **v0.4 48a**, M4. Grup başlıkları içeriğe uyduruldu: "Süresi yaklaşan talepler" → "Takip bekleyen talepler" ("Son tarihi yaklaşan, süresi dolan veya düzeltme istenen talepler"), "Atanmamış adımlar" → "Eksik adımlar" ("Tedarikçisi atanmamış veya bilgisi girilmemiş adımlar"). Eşik 7 gün değil 2 gün (linkler 7 gün geçerli).
- [ ] **v0.4 düzeltmeleri**, M4: 46a link alanı `kozapass.vercel.app/r#…`; 44'te `destek@kozapass.com` yok; 39 iletişim kartında yalnızca isim, telefon / WhatsApp düğmeleri M12'ye (ayarlar) kadar gizli; 47a'da "Etiket beyanıyla uyumlu", "önceki partiler ortalaması" (M7) ve "Belgelerden okunan alanlar" (M5) gizli; 48a'da sertifika süresi satırı M7; 47b'de belge hazır seçimleri M5'e kadar gizli.
- [ ] **v0.4 Kumaş ve Konfeksiyon formları**, M4. Tasarımda yalnızca İplik (40) ve Boya (41) var; diğerleri aynı iskeletle, adım tipinin alanlarından kurulur ("aynı iskelet, farklı bölümler").

**Ertelenenler** (tasarımda var, verisi sonraki kilometre taşında gelecek):
- [ ] Menüdeki "Görevler" rozeti (bekleyen görev sayısı): M4'te, `GET /tasks` gelince. O zamana kadar gizli.

**Tasarım sapması** (tasarım yanlış, uygulama farklı yapacak):
- [ ] Tasarım v0.3 ekran 10 ("Düğüm paneli — Maraş Penye İplik, veri talep bağlantısı"): tedarikçi veri talebi linki `kozapass.com/v/…` görünüyor. Bu yazı `docs/design/v0.3/KozaPassPanel.dc.html` bileşenindeki örnek `url` sabitinden geliyor, koda taşınmaz. Uygulamada link `https://kozapass.vercel.app/r#<token>` olur (K14, K21). Herkese açık pasaport ise GS1 yolunda kalır: `https://kozapass.vercel.app/01/{gtin}/10/{batch}` (K13).


- [x] Demo kullanıcılarının gerçek BCrypt hash'i (M1, `DemoDataSeeder`)
- [x] Render uyanık tutma cron'u (M1, demo ve jüri haftalarında kontrol et)
- [ ] Gemini'ye asla gerçek firma verisi gönderme
- [ ] Gemini model ID'sini geliştirme günü AI Studio'dan kontrol et, `GEMINI_MODEL`'e yaz
- [ ] Demo öncesi: sahte OEKO-TEX / GOTS örnek belgeleri hazırla (gerçek firma adı ve numarası olmadan)
- [ ] Gerçek pilot olursa: ücretli Gemini katmanı + alan adı + KVKK aydınlatma metni
