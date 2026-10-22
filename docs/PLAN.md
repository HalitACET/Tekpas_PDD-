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
| K9 | Arka plan işleri | Postgres tabanlı kuyruk (`FOR UPDATE SKIP LOCKED`), tek işçi iş parçacığı; **sabit aralıklı DB yoklaması yok**: işçi commit sonrası, sıradaki tekrarın zamanında, açılışta ve günlük işler için uyanır | Ek servis yok, Render ücretsiz katmanında çalışır; birkaç saniyede bir sorgu Neon'u Render uyanık oldukça (~410 sa/ay) uyutmazdı, bu da ayda 100 CU-saatlik bütçenin tamamı |
| K10 | Dosya | `FileStorage` arayüzü: prod Supabase Storage (REST, Spring `RestClient`), local ve testlerde sahte depolama; backend üzerinden yükleme, max 10 MB (M5 kararı: AWS SDK ve MinIO yok) | Ek bağımlılık yok, başlangıç süresi kısa, demo için yeterli |
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
- **Supabase ücretsiz projeleri hareketsizlikte duraklar** (resmi doküman, 18.10.2026'da doğrulandı): 7 günlük kayan pencerede çok az kullanıcı isteği alan proje duraklatılır, uyarı e-postası yaklaşık bir hafta önce gelir, 1 yıl içinde Dashboard'dan geri alınır. Etkinlik: veritabanı sorguları, API çağrıları, Dashboard ziyareti. **Storage isteklerinin sayılıp sayılmadığı belgede yok**, cron'a güvenme: demo haftasında Dashboard'u aç, demo sabahı bucket'a test yüklemesi yap (`docs/m5-plan.md` §8).
- **MinIO** M5'te kalktı (AWS SDK S3 kullanılmıyor); `docker-compose.yml`'den çıkarılması T1'de.

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
| Tedarikçi (girişsiz, token `X-Request-Token` başlığında, K21) | `GET /public/request` · `POST /public/request/submit` · `POST /public/request/documents` · `DELETE /public/request/documents/{id}` (M5) |
| Belge + AI | `POST /steps/{id}/documents` (202, okuma kuyruğa) · `GET /steps/{id}/documents` · `GET /documents/{id}` · `GET /documents/{id}/file` · `DELETE /documents/{id}` · `POST /documents/{id}/verify` · `GET /documents/expiring?days=30` (M7) |
| Tutarlılık | `POST /batches/{id}/validate` · `GET /batches/{id}/issues` · `POST /issues/{id}/resolve` |
| Pasaport | `POST /batches/{id}/passports` · `GET /batches/{id}/passports` · `GET /batches/{id}/passport-preview` · `POST /batches/{id}/passports/draft` · `GET /passports/{id}` · `POST /passports/{id}/withdraw` · `GET /passports/{id}/qr.png?size=512\|1024` · `GET /passports/{id}/qr.svg` |
| Pasaport (girişsiz) | `GET /public/passports/01/{gtin}/10/{batch}` (her zaman en son sürüm; dil sayfada seçilir, `?lang=` yok) |
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

### M4 — Veri talebi ve tedarikçi sayfası ✓
Tasarım: `docs/design/v0.4/` (39–45 tedarikçi sayfası, 46–48 panel). PR sırası: backend (V6, linkler, public uçlar, onay/red, rate limit) → `GET /tasks` → web (a) panel 46/47/48 + rozet → web (b) `/r` sayfası 39–45.

- [x] **V6:** `data_request`: `sent_to_email` kalkar; `revoked_at`, `revoked_by`, `open_count`, `submitter_name`, `submitter_role` eklenir; adım başına tek açık link (kısmi unique index, `SENT`/`OPENED`). `supply_step`: `rejection_reason`, `rejection_fields` (JSONB), `rejected_at`, `rejected_by`. Yeni `step_event` (istendi, açıldı, gönderildi, onaylandı, reddedildi, geri alındı, menşe girildi; kim, ne zaman): 47a'daki "Selin A. · 17 Eyl" ve M12 denetim izi
- [x] **Link:** 32 bayt SecureRandom, base64url; DB'de yalnızca SHA-256 hex. Ham token yalnızca oluşturma cevabında (46a o an); sonra panelde "Yeni link oluştur" (eskiyi geri alır). Geçerlilik 3, 7 veya 14 gün (46a "Son tarih", varsayılan 7; açık linkte `PATCH /requests/{id}` ile değişir, token aynı kalır, geçmişe giden tarih 409 `DEADLINE_PASSED`; V8), süre dolumu okunurken (`expires_at < now`). Link web'de kurulur: `{origin}/r#<token>`. "Gönderim no" `data_request` id'sinden türeyen kısa kod (`KP-R-XXXX`)
- [x] **Link oluştur / geri al:** `POST /steps/{id}/requests` (OWNER, ADMIN, EDITOR; adım PENDING veya REJECTED, tedarikçi atanmış, FIBER değil), `POST /requests/{id}/revoke`. Zincir cevabında linkin özeti (durum, son tarih, açılma sayısı; token yok)
- [x] **Public:** `GET /public/request` (görünüm; açılma sayısını artırır), `POST /public/request/submit` (tek gönderim; satır kilidi, ikinci gönderim 410). Link sahibi yalnızca kendi adımını görür: üretici firma adı, talebi açan kişinin adı (telefon yok), ürün adı, parti no, adım tipi, son tarih, red gerekçesi ve işaretli alanlar, kendi adımının verisi. Zincirin geri kalanı, diğer tedarikçiler, adım id'leri, GTIN, miktar asla (izinli alan listesi testi). Bilinmeyen token 404; süresi dolmuş / geri alınmış / gönderilmiş 410 + `LINK_EXPIRED` / `LINK_REVOKED` / `ALREADY_SUBMITTED` (44). `Cache-Control: no-store`, `X-Robots-Tag: noindex`, sayfada `Referrer-Policy: no-referrer`
- [x] **Gönderim:** çok kez açılır, tek gönderim, taslak yok. Zorunlu: "Gönderen ad soyad" ve adım tipine göre İplik: lif bileşimi, menşe ülke; Kumaş: lif bileşimi, kumaş tipi; Boya: işlem, kimyasal uyumu; Konfeksiyon: menşe ülke. Diğerleri isteğe bağlı (formda "İsteğe bağlı" etiketi, "aksi belirtilmedikçe zorunlu" kalıbı). Adım SUBMITTED, link COMPLETED
- [x] **Boya alanları (41, API tasarıma uyar):** `dyeProcess` (REACTIVE, DISPERSE, VAT, PIGMENT, OTHER; OTHER ise `dyeProcessOther` zorunlu, en fazla 80), `shade` (isteğe bağlı), `chemicalStandards` (ZDHC_MRSL, OEKO_TEX_ECO_PASSPORT, BLUESIGN, GOTS_APPROVED, NONE; en az biri, NONE diğerleriyle birlikte seçilemez), boya için `deliveredKg` ("İşlenen miktar"). `process` ve `chemicalCompliance` kalkar; eski anahtarları okuyan kod kalmaz, okuyucu bilinmeyen eski anahtarlarda patlamaz (test), seed güncellenir. Enum çevirileri tr/en/de (pasaportta da kullanılacak)
- [x] **Onay / red:** `POST /steps/{id}/approve`, `POST /steps/{id}/reject` (OWNER, ADMIN; yalnızca SUBMITTED). Red: gerekçe zorunlu, isteğe bağlı `fields` (adım tipinin alan adlarıyla whitelist, bilinmeyen alan 400). 47b'deki hazır seçim → alan eşlemesi `packages/shared`'de tek yerde ("Lif oranı uyuşmuyor" → `fiberComposition`; "Belge okunaksız", "Sertifika süresi dolmuş" M5'e kadar gizli). Red → REJECTED → üretici yeni link oluşturur; 45'te gerekçe üstte, önceki veri dolu, işaretli bölüm açılışta görünür (oraya kaydırılır)
- [x] **Parti durumu otomatik:** ilk link → COLLECTING; tüm adımlar APPROVED → READY
- [x] **Lif menşei (FIBER):** üretici düğüm panelinden girer (40a'daki "Lif bileşimi + menşe" bölüm bileşenleri panelde; tasarım borcu), link gönderilmez
- [x] **Rate limit** (uygulama içi, tek instance): public uçlarda IP başına dakikada 30, geçersiz token IP başına dakikada 10, gönderim token başına saatte 10; 429 + `Retry-After`. İstemci IP'si: istemci → Vercel → Render zincirinde Render'ın gördüğü `X-Forwarded-For`'da Vercel'in eklediği hop'tan alınır; istemcinin gönderdiği XFF'ye güvenilmez. Canlı doğrulama (10.10.2026): Render'da `xff=2` (hop sayısı doğru), sabit kaynaktan gelen istekte sınır doğru çalışıyor (10 deneme, 11.'si 429); ama Vercel rewrite'ta istemcinin kendi `X-Forwarded-For`'unu (en azından bazı isteklerde) gerçek IP'yle değiştirmeden geçiriyor, yani ilk eleman taklit edilebilir. Yedek: istemci IP'si kapalı (`-1`); bağlantı başına dakikada 60 açılış, gönderim token başına saatte 10, tüm istekler için dakikada 600 ve geçersiz tokenlar için dakikada 100 genel sayaç
- [x] **`GET /tasks`** + rozet sayısı. Gruplar (48a, başlıklar içeriğe uyduruldu): "Onay bekleyen veriler" (SUBMITTED; OWNER, ADMIN), "Takip bekleyen talepler" (son tarihe 2 günden az kalan, süresi dolup gönderilmemiş, düzeltme istenip yeni linki olmayan; açılma sayısı, "Hatırlat" = link içermeyen hazır WhatsApp metni; düzeltme istenen ve süresi dolanlar en üstte), "Eksik adımlar" (tedarikçisi atanmamış adım, menşesi girilmemiş Lif, zinciri olmayan parti). Sertifika süresi M7
- [x] **Web (a)** (PR #30): 46a/b/c link kartı ("Linki kopyala", "WhatsApp'ta paylaş": numara varsa `wa.me/<telefon>?text=`), 47a/b inceleme + onay/red, 48a/b Görevler, menü rozeti
- [x] **Web (b)** (PR #31): `/r` sayfası 39–45 (mobil öncelikli, 40c masaüstü). Token yalnızca adresin `#` kısmında, API'ye `X-Request-Token` başlığıyla gider; sayfa `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `Cache-Control: no-store`; oturum, refresh ve giriş yönlendirmesi yok. Uyuyan sunucu panelle aynı akış (önce liveness, tek yenileme, 3 dk sınırı). Adım tipine göre bölümler (İplik 40, Boya 41; Kumaş, Konfeksiyon aynı parçalarla); düzeltmede (45) önceki veri dolu, işaretli bölüm görünür alana kaydırılır. Ayrıca telefon normalizasyonu: `whatsAppNumber` (`0532 123 45 67`, `+90 532 123 45 67`, `532 123 45 67`, `0(532)123-45-67` → `905321234567`; geçersiz numarada WhatsApp numarasız açılır)

**Kabul:** Üretici link paylaşır, tedarikçi telefondan girişsiz veri girer, üretici onaylar, düğüm yeşile döner.

### M5 — Belge ve AI çıkarımı ✓
_Kodu tamam (T0–T9, PR #32–#44). Özet: `docs/haftalik/05-belge-ve-ai.md`. Canlı Supabase denemesi yapıldı: yükleme, önizleme ve AI hibrit okuma başarıyla çalıştı, CORS ve yönlendirme sorunu çıkmadı. Açık kalan: yükleme süresi ve PDFBox yazı tipi önbelleği ölçümü (`docs/m5-plan.md` §10–§11)._
Plan: `docs/m5-plan.md` (depolama, V9, okuma hattı, güvenlik, test, açık kararlar). Tasarım brifi: `docs/m5-tasarim-brifi.md` → Claude Design v0.5. Okuma hibrit: PDF metin katmanı + türe göre kural → (OCR M5'te yok, gerekçe planda) → LLM son çare, yalnızca `LlmGate` izin verirse (bayrak açık + anahtar + demo firması, üçü birden). PR sırası: tasarım → backend (a) T1+T2 → (b) T3–T5 → (c) T6 → web (a) T7 → web (b) T8 → T9.

- [x] **T0** Tasarım brifi → Claude Design v0.5 (tedarikçi Belgeler bölümü yalnızca yükleme durumlarıyla, panel belge kartı, inceleme ve onay; okuma durumları yalnızca panelde). Tasarım geldi: `docs/design/impl-v0.5/` (49–61), uygulama notları `docs/m5-plan.md` §9.
- [x] **T1** `FileStorage` arayüzü + `SupabaseFileStorage` (Spring `RestClient`, REST: yükleme, imzalı indirme bağlantısı, silme; AWS SDK yok) + yerel sahte depolama (MinIO ve `S3_*` kalkar, `STORAGE_*` gelir), sahte HTTP sunucusuyla test, Supabase kurulumu `DEPLOY.md`'ye, Vercel rewrite'ın 10 MB gövdeyi geçirdiğinin denemesi (en fazla 30 dk; geçmezse imzalı PUT + karantina). _Sonuç:_ canlı deneme 18.10.2026'da geçti (Vercel rewrite 10 MB JSON ve multipart'ı Render'a ulaştırıyor, imzalı PUT gerekmedi); T2'de Spring'in 1 MB multipart varsayılanı yükseltilecek. O gün Supabase projesi yoktu: `STORAGE_PROVIDER` boşken backend normal açılır, yükleme 503 verir; kurulum `docs/DEPLOY.md` §9 (proje sonradan kuruldu ve denendi, bkz. M5 başlığı). 24 yeni test (sahte HTTP sunucusu, yerel depolama, yapılandırma).
- [x] **T2** V9 (`document`: `request_id`, `uploaded_by_name`, `TECH_SHEET`/`UNKNOWN`, yeni okuma durumları, `review_status`, `extraction_method`, `page_count`, `verification`, `UNIQUE(step_id, sha256)`; `step_event` belge olayları; `company.is_demo`; `DOCUMENT_CLEANUP` işi). Uçlar: `POST /steps/{id}/documents`, `GET /steps/{id}/documents`, `GET /documents/{id}`, `GET /documents/{id}/file` (60 sn imzalı bağlantıya 302), `DELETE /documents/{id}` (onaysızsa); public `POST /public/request/documents`, `DELETE /public/request/documents/{id}` (gönderimden önce), `GET /public/request`'te belge listesi. İçerikten biçim (magic byte), 10 MB, dosya adı temizleme, rate limit (token başına saatte 20, link başına 5 belge, firma başına saatte 60), tenant 404 testleri _Sonuç (PR #36):_ V9 yazıldı; `document` eski durumlarıyla uyumlu taşındı (`UNIQUE(step_id, sha256)` kısmi indeks), `company.is_demo` seed firmalarında true, `DOCUMENT_CLEANUP` iş türü eklendi. Uçlar `POST/GET /steps/{id}/documents`, `GET /documents/{id}`, `GET /documents/{id}/file` (302; yerel depolamada baytlar doğrudan, `nosniff` + CSP `sandbox`), `DELETE /documents/{id}`, public `POST/DELETE /public/request/documents`; `GET /public/request` cevabına `documents` (yalnızca id, dosya adı, boyut, zaman, `previous`) eklendi. Yükleme iki aşamalı: kurallar → depolamaya aktarım (transaction dışında) → kurallar tekrar kilit altında + satır; satır yazılamazsa nesne geri silinir (eşzamanlı aynı dosya testi). PDFBox 3.0.8 eklendi (sayfa sayısı ve şifre; metin T4). Spring multipart 10 MB (+ istek 11 MB), Tomcat `max-swallow-size` 12 MB: gerçek sunucuda doğrulandı (5 MB geçer, 10 MB+1 ve 14 MB 413). **Eklenen güvenlik sınırı:** bir adımda en fazla 10 belge (ücretsiz 1 GB depolama). Planlanandan sapma: `DUPLICATE_DOCUMENT` cevabı mevcut belgenin id'sini taşımıyor (arayüz yalnızca "zaten yüklendi" der). 50 yeni test (birim 19, entegrasyon 31); gerçek Supabase PR sırasında denenmemişti, sonradan canlıda denendi (bkz. M5 başlığı).
- [x] **T3** Job worker (`FOR UPDATE SKIP LOCKED`, commit sonrası tetik + 5 sn yoklama, tek iş parçacığı, tekrar 30 sn → 2 dk → 10 dk, 5 dk'da kurtarma), gönderilmeyen belgelerin 7 gün sonra temizliği _Sonuç (PR #37):_ `jobs` paketi: `JobQueue` (iş, kaydı oluşturan transaction'da eklenir, commit sonrası işçiyi uyandırır), `JobWorker` (tek iş parçacığı, `SKIP LOCKED`, deneme başına zaman aşımı, takılan iş parçacığı bırakılıp yenisi alınır), `JobHandler<P>` (tipli payload, `onGiveUp`), `JobFailedPermanently` (tekrarsız FAILED). Tekrar 30 sn → 2 dk → 10 dk, `max_attempts` dolunca DEAD; 5 dk'dan eski RUNNING işler açılışta ve her çalışmada kurtarılır. **Plandan sapma:** 5 sn'lik DB yoklaması yok (K9 gerekçesi, Neon bütçesi); yedek olarak sıradaki işin zamanı bellekte planlanır. Her yüklemede `AI_EXTRACT_DOCUMENT` kuyruğa girer (işleyicisi T4; o zamana kadar QUEUED kalır). `DOCUMENT_CLEANUP` günde bir: gönderilmeden kapanan (süresi dolan veya geri alınan) linkin onaylanmamış belgeleri 7 gün sonra satır + nesne olarak silinir, `DOCUMENT_REMOVED` olayı gerekçeyle yazılır. Bilinen sınır: aktarım ile satır arasında süreç çökerse kalan sahipsiz nesne silinmez (depolama listelenemiyor). Testler: işçi 11, temizlik 4; yerelde işçi açık olarak açılış denendi.
- [x] **T4** Okuma: PDFBox metin (20 sayfa, 15 sn, şifreli ret), sınıflandırıcı, OEKO-TEX / GOTS / GRS kuralları, okuma sonucu şeması, sentetik belgeler + altın testler _Sonuç (PR #38):_ `AI_EXTRACT_DOCUMENT` işleyicisi (`DocumentReadingJob`): dosyayı depodan okur (`FileStorage.read`, Supabase `GET /object/authenticated/…`), PDFBox ile metin (en çok 20 sayfa, geçici dosya belleği), sınıflandırıcı (OEKO-TEX, GOTS, GRS, teknik föy) ve etiket kuralları; sonuç `document.extraction` (tipli `Extraction`: alan, değer, güven, kaynak, kanıt sayfa+satır, uyarılar EXPIRED / VALIDITY_RANGE_INVALID / TYPE_NOT_RECOGNISED). Güven: etiketle aynı satır 0,95, alt satır 0,8, kontrolü geçmeyen veya çelişen tarih 0,6. Durum: READ / PARTIAL / UNREADABLE (`NO_TEXT_LAYER`, `NO_KNOWN_FIELDS`) / FAILED (`EXTRACT_TIMEOUT`, `EXTRACT_FAILED`). Asıl alanlar ve belge türü değişmez (onay T6). Panel cevabına `extraction`, `extractionMethod`, `extractedAt` eklendi; tedarikçi cevabı aynı. Etiketler yalnızca satır başında ve iki noktayla okunur: metindeki talimat cümlesi alan sayılmaz (injection belgesi). 11 sentetik belge (`backend/src/test/resources/documents/`, üreteç `DemoCertificates`) ve altın dosyaları; görüntü/taranmış belge için OCR yok (LLM T5). **T4b (PR #39):** Türkçe güvenliği: eşleştirme `Folding` ile yerelden bağımsız (aksansız, büyük/küçük harf, noktalı/noktasız i, ayrık nokta NFC), ay adları her yazımda; değer özgün büyük harf ve noktalarıyla kalır (İSTANBUL). 3 Türkçe sentetik belge (DejaVu Sans gömülü, lisans `docs/m5-plan.md` §11), 12 Türkçe metin testi (tr/en/ROOT yerelinde). PDFBox yazı tipi önbelleği canlıda ölçülecek (§11).
- [x] **T5** `AiClient` + `GeminiAiClient` (RestClient, `responseSchema`, `GEMINI_MODEL`) + `FakeAiClient` + `LlmGate` (`tekpas.ai.llm.enabled`, `daily-limit`); LLM güveni en fazla 0,79; prompt injection testleri; demo olmayan firmada LLM'in hiç çağrılmadığının testi _Sonuç (PR #40):_ `ai/` paketi: `AiClient` (sağlayıcıdan bağımsız: talimat + belge parçaları + şema → JSON metni), `GeminiAiClient` (`generateContent` REST, anahtar yalnızca `x-goog-api-key` başlığında, araç yok, hata mesajında yalnızca HTTP durumu), `LlmGate` (bayrak + anahtar + `company.is_demo`, üçü birden; `tier=PAID` istisnası kullanıcı kararıyla yok), `LlmBudget` (V10 `llm_usage`, günlük sınır). `LlmDocumentReader`: kuralların `UNREADABLE` bıraktığını okur (metin ya da dosya), belge rastgele sınırlayıcılar arasında veri olarak gider, cevap güvenilmeyen girdi gibi denetlenir (yalnızca beş alan, tür/uzunluk/biçim, ISO ve makul tarih, kontrol ve yön karakterleri atılır). Güven 0,75 / 0,6 / 0,4, hepsi sarı; tür, onay durumu ve asıl alanlar değişmez. 429/4xx/günlük sınır → hemen elle giriş (`LLM_UNAVAILABLE`), zaman aşımı/5xx → işin tekrarları, son denemede elle giriş. Yeni sentetik belge `injection-letter.pdf` + kayıtlı LLM cevapları (`documents/llm/`). 37 yeni test (sahte sağlayıcı, gerçek çağrı yok). Model ve limit yalnızca yapılandırmada (`GEMINI_MODEL`, `LLM_DAILY_LIMIT`), resmi doküman notu `docs/m5-plan.md` §3.
- [x] **T6** `POST /documents/{id}/verify` (OWNER, ADMIN; değerler asıl kolonlara, alan bazında `verification`, `DOCUMENT_VERIFIED`), zincir cevabında belge sayısı, 47b'de "Belge okunaksız" ve "Sertifika süresi dolmuş" açılır _Sonuç (PR #41):_ `POST /documents/{id}/verify` (`@ReviewAccess`: yalnızca OWNER/ADMIN; EDITOR/VIEWER/SUPPLIER 403): gövdedeki değerler (tür, sertifika no, sahibi, veren kuruluş, başlangıç, bitiş) belgenin asıl alanlarına ve türüne yazılır; sunucu her alanı okumanın önerisiyle karşılaştırıp `verification`'a ACCEPTED / EDITED / ADDED yazar (öneri varken boş bırakılan alan EDITED; öneri yokken yazılan ADDED). Tam küme gönderilir, eksik alan boş kalır: öneriden kendiliğinden bir şey alınmaz. Elle giriş aynı çağrıdır (okunamadı, hata, taranmış). 409: `DOCUMENT_VERIFIED` (onaylı belge değişmez, silinmez), `DOCUMENT_NOT_READ` (okunuyor), `BATCH_PUBLISHED`; 400: `docType` UNKNOWN (`OneOf`), `validUntil` < `validFrom` (`DateRange`), uzunluk; **422**: sertifika türlerinde (OEKO_TEX, GOTS, GRS, BCI, OCS, BLUESIGN) sertifika no ve bitiş tarihi zorunlu, eksik alan başına `NotNull` (teknik föy ve diğer türlerde zorunlu değil; `docs/m5-plan.md` §7 karar 6). Süresi dolmuş sertifika onaylanabilir. Metinler NFC, kontrol/yön karakterleri atılır (`DocumentText`). Adımda `DOCUMENT_VERIFIED` olayı (belge, tür, onaylayan). Okumanın `extraction`'ı değişmez. Belge cevabına onaylı alanlar, `verifiedByName`, `verifiedAt`, `verification` eklendi. Zincir cevabında `documentCount` artık gerçek, yeni `unreviewedDocumentCount` (düğümdeki nokta). 47b: yeni `DOCUMENT_UNREADABLE` ve `CERTIFICATE_EXPIRED` ön ayarları (tr/en/de) `documents` alanını işaretler; backend `fields` listesi her adım türünde `documents`'ı kabul eder (tedarikçi formunda Belgeler bölümü, T8). Tedarikçi uçlarına yalnızca `aiReading` bayrağı eklendi (`LlmGate` o firma için açık mı: "Demo ortamı" uyarısı); okuma sonucu, onay, kapı nedeni yok. Migration yok (V9'daki kolonlar yeterli). 23 yeni test (`DocumentVerifyTest` 20, bayrak 2, `documents` ön ayarı 1; tedarikçi izinli alan testi sıkılaştırıldı). T7'ye devredilenler: "Tekrar oku" ucu (ayrı commit) ve Tedarikçiler "Sertifikalar" sütunu (ayrı PR), bkz. `docs/m5-plan.md` §7 karar 7–9.
- [x] **T7** Web (a) panel: belge kartları, inceleme ve onay, panelden yükleme, düğümde belge sayısı, Tedarikçiler "Sertifikalar" sütunu. Önizleme/indirme: `GET /documents/{id}/file` Bearer ister, bu yüzden web `fetch` + blob URL kullanır (302 hedefi depolamanın kendi origin'inde, başlık yönlendirmede düşer); yerel depolamanın cevabında `X-Frame-Options: DENY` var, doğrudan `<iframe src>` çalışmaz
- [x] **T8** Web (b) `/r` Belgeler bölümü (42 açılır): yükleme, ilerleme, hatalar, kaldırma, 43/45'te belgeler
- [x] **T9** Çeviriler en/de, haftalık not, README
- *Kararlar* (`docs/m5-plan.md` §7, onaylı): tedarikçi okunan değerleri ve okuma durumunu görmez, yalnızca yükleme durumunu; yeni bağımlılık yalnızca PDFBox (AWS SDK S3 ve Testcontainers MinIO yok, depolama RestClient + sahte); OCR yok (M10'da tarayıcıda OCR araştırması); LLM prod'da varsayılan kapalı, kural yolu tek başına demo'yu taşır; limitler 5 belge/link, 20 sayfa, 7 gün temizlik.
- *Demo yedek planı ve belge kontrol listesi:* `docs/m5-plan.md` §8 (kural yolu → LLM yalnızca taranmış belge gösteriminde → olmazsa elle giriş; Supabase duraklama kontrolü).

**Kabul:** Örnek bir OEKO-TEX PDF'i yüklenir, sertifika no, sahibi ve geçerlilik tarihi otomatik dolar, kullanıcı onaylayınca asıl alanlara geçer. Demo olmayan bir firmanın belgesi hiçbir koşulda LLM'e gitmez (test).

### M6 — Pasaport ve QR ✓
_Tamamlandı: 20.10.2026 (PR #46–#56). Özet: `docs/haftalik/06-pasaport-ve-qr.md`. Açık: canlıda ilk pasaport yayını, 2 saniye ölçümü ve Vercel önbelleğinin deploy sonrası korunması (M10); bakım bilgisi M10'da._
Plan: `docs/m6-plan.md` (uyum skoru kuralları, snapshot ve sürüm modeli, GS1 Digital Link ve QR, `/01/[gtin]/10/[batch]` önbellek ve dil mimarisi, açık kararlar §9). Tasarım brifi: `docs/m6-tasarim-brifi.md` → Claude Design v0.6. Sıra: tasarım + kararlar → backend T1–T4 → web T5–T6 → T7.

- [x] Uyum skoru (onaylı adımlar + zorunlu alanlar + geçerli sertifikalar). _T1 (backend) tamam: `GET /batches/{id}/score`, `GET /batches` ve `GET /batches/{id}`'de `score`, `ComplianceScore` (saf hesap) + 16 birim, 7 entegrasyon testi; web kartı T6'da._
- [x] Yayınla: snapshot, sürüm, eski sürüm SUPERSEDED; geri çek. _T2 (backend) tamam: V11 + değişmezlik tetikleyicisi, `POST /batches/{id}/passports`, önizleme, sürümler, `passports/draft`, `GET /passports/{id}`, geri çek; 17 entegrasyon testi. Herkese açık uç ve QR T3'te._
- [x] QR üretimi (GS1 Digital Link), PNG indirme. _T3 (backend) tamam: `Gs1DigitalLink` (Java + `packages/shared` ikizi, ortak vektörler), ZXing `core` 3.5.3, `qr.png`/`qr.svg`, herkese açık `GET /public/passports/01/{gtin}/10/{batch}` (200/404/410, 120/dk IP sınırı), `PUBLIC_BASE_URL` (`render.yaml`'a eklendi)._
- [x] Web: `/01/[gtin]/10/[batch]` SSR pasaport sayfası (zincir, lif bileşimi, sertifikalar, bakım). _T4 tamam (önbellek yenileme: `PASSPORT_CACHE_REFRESH` işi, V12, `POST /api/passport-cache`, `REVALIDATE_SECRET`). T5 tamam: sayfa `app/01/[gtin]/10/[batch]` (v0.6 `KozaPassPasaport`: ürün, lif, zincir, sertifikalar, sürdürülebilirlik, QR doğrulama; tr/en/de; açık/koyu; durumlar: hazırlanıyor, bulunamadı, geri çekildi), etiketli veri önbelleği, kanonik adrese 308, çerezsiz dil; `proxy.ts` matcher hatası düzeltildi. T6 tamam: panel (v0.6 `KozaPassYayin`): uyum skoru kartı ve kırılım, yayın diyaloğu (engeller, çakışma, başarı + QR), yeni sürüm taslağı, geri çekme, QR kartı, Pasaport sürümleri sekmesi, önizleme ve sürüm görüntüleme sayfaları, listede skor sütunu ve yaşam döngüsü çipi; `BatchResponse.passport`._
- [x] Yayın eşiği: uyum skoru %90 altındaysa yayınlanamaz; yayından önce "Önizle" (tasarım v0.3)
- *Kararlar* (`docs/m6-plan.md` §9, onaylı): onaysız adım yayını engeller; skor 50/30/20, tüketiciye görünmez; tedarikçi adları açık; QR backend'de ZXing; düzenleme = yeni sürüm taslağı (yayın geri çekilmez, yayınlanınca eskisi SUPERSEDED); geri çekilen QR'da "Geri çekildi"; eski sürümler yalnızca panelde; bakım bilgisi M10'da; Vercel ISR + `next.tags` ve yayında önbellek ısıtma; okutma istatistiği yok; public sayfa `noindex`.

**Kabul:** Telefonla QR okutulur, pasaport 2 saniyede açılır. Yeni sürüm yayınlanınca aynı QR yeni sürümü gösterir.

### M7 — Tutarlılık kontrolü ve sertifika takibi
Plan: `docs/m7-plan.md` (kural kodları, V13, eşitleme, API, tetikleyiciler, günlük tarama, AI ikinci aşama). Tasarım brifi: `docs/m7-tasarim-brifi.md` → Claude Design v0.7 (v0.3 "Uyarılar" kartı başlangıç noktası). Backend T1–T3 tasarım beklemeden, web T4 tasarımdan sonra.
- [x] Kural tabanlı: lif toplamı ≠ 100, süresi dolmuş sertifika, sertifika sahibi ≠ tedarikçi, eksik zorunlu alan (T1–T3, PR #59–#61)
- [x] AI tabanlı: sertifika kapsamı ürün kategorisini kapsıyor mu, çelişkili beyanlar (T5: `AI-01`, `AI-02`; yalnızca LLM kapısı açıkken, öneri olarak, alıntıyla doğrulanmış)
- [x] Günlük `CERT_EXPIRY_SCAN` işi (PR #61)
- [x] Web: parti detayında uyarı paneli, çözüldü olarak işaretleme (T4, PR #62; Görevler'de sertifika grubu dahil)
- [x] Kural kodları (`LIF-01` vb., tasarım v0.3): her kontrolün sabit bir kodu olur, uyarıda gösterilir

**Kabul:** Lif toplamı %95 girilen partide kırmızı uyarı çıkar, pasaport yayınlanmadan önce gösterilir.

### M8 — Mobil I
Plan: `docs/m8-plan.md` (kapsam, fotoğraf → tek PDF ucu, onay bekleyen belgeler ucu, mobil yığın, ölçüm, kararlar). Tasarım brifi: `docs/m8-tasarim-brifi.md` → Claude Design v0.8 (mobil). Backend ve mobil iskelet tasarım beklemeden, ekranlar tasarımdan sonra.
- [x] Expo iskeleti, giriş (SecureStore), Görevlerim (PR #67, #68)
- [x] Kamera → çok sayfalı fotoğraf → sıkıştır → yükle → AI sonucu → düzenle → onayla (PR #66, #68)

**Kabul:** Telefonda sertifika fotoğrafı çekilir, 10 saniye içinde form dolu gelir.
Durum: ✅ telefonda (Expo Go, gerçek Gemini, `gemini-3.5-flash-lite`) "Yükle → dolu form" 4,0 sn (`docs/haftalik/08-mobil-i.md`).

### M9 — Mobil II
Plan: `docs/m9-plan.md` (QR → parti/pasaport, hızlı onay/red, push, yükleme kuyruğu, Expo Go sınırı, kararlar). Tasarım brifi: `docs/m9-tasarim-brifi.md` → Claude Design v0.9. Backend tasarım beklemeden, ekranlar tasarımdan sonra; push kabulü Android telefonda geliştirme sürümü ve Firebase (FCM) ile (kullanıcı kararı, `m9-plan.md` §10.1).
- [x] QR okutma (parti etiketi → özet + zincir; ürün QR → pasaport) (PR #74, #78)
- [x] Hızlı onay / red (PR #78)
- [x] Push bildirimleri (Expo) (PR #74, #77, #79)
- [x] Zayıf bağlantıda yükleme kuyruğu (PR #75, #80)

**Kabul:** Tedarikçi veri gönderince üreticinin telefonuna bildirim gelir, bildirimden onaylanır.
Durum: kod ve Android geliştirme sürümü hazır; telefonda kabul denemesi kullanıcı kararıyla M10'dan sonra (`docs/haftalik/09-mobil-ii.md`).

### M10 — Arden demo hazırlığı
Plan: `docs/m10-plan.md` (görevler T1–T12, gerçekçi demo verisi, kullanıcıya düşenler, kararlar). Bakım bilgisi için tasarım brifi: `docs/m10-tasarim-brifi.md` → Claude Design v1.0. M8/M9 telefon kabul denemeleri bu kilometre taşının sonunda (kullanıcı kararı).
- [x] Gerçekçi demo verisi (3 ürün, 5 parti, farklı tamamlanma seviyeleri, 1 süresi dolmak üzere sertifika) _Sonuç (PR #83):_ `DemoScenario` (yalnızca `demo` profili, V16 `demo_scenario`, bir kez uygulanır): parti 1 yayında, 2 yayına hazır, 3'te gönderilmiş kumaş ve AI'ın okuduğu GOTS belgesi, 4'te LIF-01, 5 taslak; Uludağ'ın sertifikası 20 gün içinde bitiyor. Sentetik PDF'ler PDFBox ile, AI çağrısı yok. Pasaportu olan parti yeniden uygulanmaz.
- [x] Görsel cila, boş durumlar, yükleniyor durumları _Sonuç (PR #90):_ demo verisiyle bütün ekranlar gezildi; çevrilmemiş anahtar, hata kutusu, konsol hatası yok. Pasaportun GS1 satırı 375 px'te parti numarasından bölünüyordu, düzeltildi.
- [ ] Sunucu uyanık, APK hazır, 5 dakikalık demo senaryosu yazılı ve prova edilmiş _Durum:_ senaryo yazılı (`docs/m10-demo-senaryosu.md`, PR #91), APK hazır (M9); prova ve demo günü cron'u kullanıcıyla.
- [x] e2e testleri CI'da çalışsın _Sonuç (PR #86):_ `e2e` job'u: Next build + Playwright (Chrome, mock API), 138 test ~5 dk; başarısızlıkta rapor/ekran görüntüsü/trace artefakt. Ekran görüntüsü koşuları yerelde kalır.
- [ ] Genel 600/dk sayacı kasıtlı doldurulursa herkes 1 dk etkilenir; Vercel IP başlığı doğrulanınca IP bazlıya dönülecek (aşağıdaki madde).
- [x] Düzeltme formunda (v0.4 45) gönderen ad ve görev önceki gönderimden dolsun _Sonuç (PR #84):_ `PublicRejection.submitterName/submitterRole` (adımın son tamamlanan talebinden).
- [x] Tedarikçiye isteğe bağlı "ilgili kişi" alanı _Sonuç (PR #85):_ V17 `company_supplier.contact_name` (bağa ait); web formu ve listesi, 46a'da kişi üstte, mesaj "Merhaba {kişi},"; mobil düzeltme ekranında alıcı. Unvanlı hitap yok (cinsiyet tahmini gerekirdi).
- [ ] Public rate limit için gerçek istemci IP'si: Vercel'in kendi başlığı (`x-real-ip` veya `x-vercel-forwarded-for`) Render'a ulaşıyor mu, canlıda doğrula; ulaşıyorsa `ClientIp` onu okusun ve IP başına sınırlar (M4) yeniden açılsın. Şimdilik genel sayaç + token başına sayaç.
- [x] Açılışı hızlandırma / Render araştırması _Sonuç (PR #89, `docs/m10-acilis-olcumu.md`):_ Render imajı 0,1 CPU / 512 MB ile yerelde: ilk cevap ort. 162 sn; lazy init kazandırmıyor, Flyway 0,6 sn, CDS -%30. `@Query`'lerin ANTLR ile ayrıştırılması yerine regex işleyici -%13 (kullanıcı onayıyla uygulandı, `JpaRepositoriesConfig`). Erken kesilen istek sorusu canlıda bakılacak. Eski not: soğuk başlangıç 100–150 sn ("Started TekpasApplication in" 75–83 sn). Render'da önce/sonra ölç: lazy init, gereksiz auto-config, Flyway validate. Prod'a lazy init kullanıcı onayıyla. Uyuyan sunucuda erken kesilen isteğin uyanmayı iptal edip etmediği canlıda ölçülemedi (cron gün içinde uyanık tutuyor); burada bak.

- [x] Depoda kayıtsız dosya taraması _Sonuç (PR #87):_ `FileStorage.list`, günlük `DOCUMENT_CLEANUP`'ın sonunda `OrphanObjectScan`: 1 saatten eski, hiçbir belgenin göstermediği `docs/` nesneleri log'a; silme `STORAGE_REMOVE_ORPHANS=true` ile.
- [x] Tarayıcıda OCR araştırması _Sonuç (PR #88, `docs/m10-ocr-arastirmasi.md`):_ ön işlemeyle ~1 sn/sayfa, sentetik sertifikada 9/9; ilk indirme ~5 MB; PDF ve React Native'de yok. Kod yok, karar M11/M12.
- [x] Bakım bilgisi (ISO 3758 sembolleri) _Sonuç (PR #96–#98, Claude Design v1.0):_ `CareInfo` (beş grup, hassasiyet çizgileri, girildiği dilde not), ürün formunda bölüm, pasaportta "Bakım" bölümü, skor kartında bilgi notu (puan ve engel değil), snapshot `schemaVersion: 2` (sürüm 1 snapshot'lar aynen okunuyor). Semboller GINETEX kopyası olmayan çizgi ikonlar. İlgili kişi ekranları da v1.0'a göre düzeltildi (PR #99).
**Kabul:** Demo senaryosu baştan sona hatasız, internet yavaşken bile çalışıyor.

### M11 — Çok dil ve Excel
Plan: `docs/m11-plan.md` (çeviri taslağı ve onay, snapshot `schemaVersion: 3`, ürünler için Excel içe aktarma, kararlar). Tasarım brifi: `docs/m11-tasarim-brifi.md` → Claude Design v1.1. Excel kütüphanesi kararı (fastexcel, POI değil) kullanıcı onayı bekliyor.
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

- [ ] **v0.4 46a/47b/48a uyarlamaları**, PR #30: 46a iletişim kartında kişi yerine firma adı ve baş harfleri (kişi alanı M10); WhatsApp mesajı "Merhaba," ile başlar ve tarihi "… tarihine kadar" diye yazar (Türkçe ek gerekmesin). 47b'nin "… bilgilendirildi" metni "Düzeltme talebi kaydedildi …; tedarikçiye yeni bir bağlantı gönderin" oldu: bildirim yok, tedarikçi yeni linkle öğrenir. Metnin altına tasarımda olmayan "Yeni bağlantı oluştur" düğmesi eklendi (46 penceresini o adım için açar; `impl-v0.4/47b-sent-*`). 48a'da tasarımda olmayan satır tipleri: "Süresi doldu" (kırmızı, "Yeni bağlantı"), "Menşe yok" ("Menşe gir"); "Hatırlat" WhatsApp'ı telefon biliniyorsa `wa.me/<E.164>?text=` ile o numaraya, değilse numarasız; görev satırı `supplierPhone` taşır.
- [ ] **v0.4 39–45 uyarlamaları**, PR #31 (`impl-v0.4/39-*` … `45-*`, yan yana `design-*`):
  - **Tasarımı olmayan formlar:** Kumaş (Lif bileşimi, Enerji, Kumaş ve teslimat: kumaş tipi, gramaj, teslim edilen) ve Konfeksiyon / Aksesuar / Ambalaj (Üretim yeri, Enerji; Konfeksiyonda kWh/adet). "Sizden istenenler" maddeleri bunlara göre.
  - **"İsteğe bağlı" etiketleri:** Enerji, Teslim edilen, İplik numarası, Eğirme, Gramaj, Su tüketimi, Renk / ton zorunlu değil (karar: zorunlu olanlar API'nin listesi); tasarımda "Tüm alanlar zorunludur" diyor, etiket tasarımda yok. Enerji bölüm başlığında da etiket var.
  - **API'ye uyan seçenekler:** Eğirme'ye Open-end ve Diğer eklendi (4 seçenek); Kimyasal uyumuna "Hiçbiri" (NONE, diğerleriyle birlikte seçilemez); Boya işleminde tasarımdaki Ağartma ve Apre yok, "Diğer" seçilince "Diğer işlem" metin alanı çıkar (en çok 80 karakter); lif listesi API'nin 13 lifi (tasarımda Modal var, İpek yok); menşe ülke listesi 43 ülke (tasarımda 11 + Diğer).
  - **Metinler:** 43 başlığı "Verileriniz {firma} firmasına iletildi", 44'te "… {tarih} tarihine kadar" (Türkçe ek gerekmesin); 44'ün kod satırı API'nin kodunu yazar (`Hata: LINK_INVALID`, tasarımda `LINK_NOT_FOUND`); KVKK ve Gizlilik metin, sayfaları yok.
  - **Tasarımda olmayan durumlar:** yüklenirken iskelet, uyuyan sunucu şeridi (32'nin aynısı, "Hazır olunca form kendiliğinden açılır.") ve 3 dakikada "Tekrar dene" kutusu, 429 "Çok fazla deneme yapıldı", ulaşılamayan sunucu "Sayfa açılamadı", gönderim hatası satırları, adreste `#` kısmı yoksa 44'ün "Bağlantı geçersiz" hali.
  - **45'te Gönderen:** ad ve görev API'de dönmediği için boş açılır; tasarım dolu gösteriyor (soru: önceki gönderimin adı ve görevi `PublicRequestView`'a eklenecek mi).
  - **42:** Belgeler bölümü tasarımdaki gibi "Yakında" ve kapalı (M5'e kadar).
- [ ] **v0.3.1 30**, PR #30. M4 düğmeleri açıldı ("Bir sonraki sürümde" yok); panelin güncel hali v0.4 47a (`impl-v0.4/47a-*`), `impl-v0.3.1/30-*` buna göre yeniden çekildi.

- [ ] **Belgeler sayfası "Belge yükle"** (tasarımı yok, kullanıcı isteğiyle; `impl-v0.5/62a-*`, `62b-*`): "Yakında" yerine diyalog. Önce parti ve aşama seçilir (react-hook-form, 08 "Yeni parti" diyaloğunun parçaları, yerel select); yayındaki parti seçilemez, zinciri olmayan partide not çıkar. "Devam" sonrası seçilen adımın 56/58 belge bölümü aynen açılır. Sayfanın kendisi hâlâ tasarım G'nin boş çerçevesi; firma çapında belge listesi ve "Tedarikçiden iste" ayrı tasarım bekliyor.

**Ertelenenler** (tasarımda var, verisi sonraki kilometre taşında gelecek):
- [x] Menüdeki "Görevler" rozeti (bekleyen görev sayısı), PR #30 (`GET /tasks` `total`; 0'da gizli).

**Tasarım sapması** (tasarım yanlış, uygulama farklı yapacak):
- [ ] Tasarım v0.3 ekran 10 ("Düğüm paneli — Maraş Penye İplik, veri talep bağlantısı"): tedarikçi veri talebi linki `kozapass.com/v/…` görünüyor. Bu yazı `docs/design/v0.3/KozaPassPanel.dc.html` bileşenindeki örnek `url` sabitinden geliyor, koda taşınmaz. Uygulamada link `https://kozapass.vercel.app/r#<token>` olur (K14, K21). Herkese açık pasaport ise GS1 yolunda kalır: `https://kozapass.vercel.app/01/{gtin}/10/{batch}` (K13).


- [x] Demo kullanıcılarının gerçek BCrypt hash'i (M1, `DemoDataSeeder`)
- [x] Render uyanık tutma cron'u (M1, demo ve jüri haftalarında kontrol et)
- [ ] Gemini'ye asla gerçek firma verisi gönderme
- [ ] Gemini model ID'sini geliştirme günü AI Studio'dan kontrol et, `GEMINI_MODEL`'e yaz
- [ ] Demo öncesi: sahte OEKO-TEX / GOTS örnek belgeleri hazırla (gerçek firma adı ve numarası olmadan)
- [ ] Gerçek pilot olursa: ücretli Gemini katmanı + alan adı + KVKK aydınlatma metni
