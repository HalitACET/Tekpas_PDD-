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
| Tedarikçi linki `/r/[token]` | ✓ mobil uyumlu | – |
| Herkese açık pasaport | ✓ SSR | web'i açar |

---

## 4. API (`/api/v1`)

| Modül | Endpoint'ler |
| --- | --- |
| Auth | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` |
| Kullanıcı | `GET/POST /users` · `PATCH /users/{id}` |
| Tedarikçi ağı | `GET/POST /suppliers` · `DELETE /suppliers/{id}` |
| Ürün | `GET/POST /products` · `GET/PATCH/DELETE /products/{id}` |
| Parti | `GET/POST /batches` · `GET/PATCH /batches/{id}` · `GET /batches/{id}/tree` · `GET /batches/{id}/score` |
| Zincir adımı | `POST /batches/{id}/steps` · `PATCH /steps/{id}` · `POST /steps/{id}/approve` · `POST /steps/{id}/reject` |
| Görevler | `GET /tasks` (rolüne göre bekleyenler; mobil ana ekran) |
| Veri talebi | `POST /steps/{id}/requests` (ham link sadece bir kez döner) · `POST /requests/{id}/revoke` |
| Tedarikçi (girişsiz) | `GET /public/requests/{token}` · `PUT /public/requests/{token}/data` · `POST /public/requests/{token}/documents` · `POST /public/requests/{token}/submit` |
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

### M2 — Ürün ve parti
- [x] Ürün CRUD (GTIN kontrol hanesi doğrulaması), parti CRUD — backend, V3, demo verisi (3 ürün, 5 parti), `@tekpas/shared` Zod şemaları
- [ ] Web: ürün listesi/formu, parti listesi/formu/detay iskeleti (tasarım v0.3 01–08)
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

### M3 — Tedarik zinciri
- [ ] Tedarikçi ağı (ekle / listele / çıkar)
- [ ] Zincir adımı ekle / düzenle, `GET /batches/{id}/tree` (recursive CTE)
- [ ] Web: React Flow ile zincir görünümü ve düzenleme
- [ ] Zinciri son partiden kopyalama (tasarım v0.3)
- [ ] Tedarikçi telefon kolonu (`company_supplier`, WhatsApp paylaşımı için)
- [ ] `supply_step.data` alanları: enerji kaynağı, kWh, teslim miktarı, iplik numarası (tasarım 10/11 düğüm paneli referans)

**Kabul:** Bir parti için İplik → Kumaş → Boya → Dikim zinciri çizilir, düğüm renkleri durumu gösterir.

### M4 — Veri talebi ve tedarikçi sayfası
- [ ] Veri talebi oluştur (token hash), geri al, süre dolumu
- [ ] Girişsiz `/r/[token]` sayfası (mobil öncelikli): adım tipine göre form (lif bileşimi vb.)
- [ ] Gönder → SUBMITTED; üretici onay / red (gerekçeli)
- [ ] "Linki kopyala" + "WhatsApp'ta paylaş"
- [ ] `GET /tasks`

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

**Tasarım borcu** (tasarımı olmayan, şimdilik geçici çözümle duran yerler):
- [ ] Koyu tema login tasarımı: hikâye paneli koyu temada da açık (koza kremi) kalıyor.
- [ ] Login "sunucu uyanıyor" durumu (5 sn sonra buton metni) tasarımda yok; kullanıcı onayıyla eklendi.
- [ ] Ürün düzenle: GTIN kilidi (partisi olan ürün) — input devre dışı, kilit ikonu, ipucu satırında neden (`impl-v0.3/03b-locked-*`).
- [ ] Liste yükleniyor durumu: tablo içinde iskelet satırlar.
- [ ] Liste hata durumu: boş durum çerçevesinde hata ikonu, metin ve "Tekrar dene".
- [ ] VIEWER: devre dışı yazma butonları ve satır menüsü, "Bu işlem için yetkiniz yok" tooltip'i (tooltip bileşeni tasarımda yok).
- [ ] Ürün formunda GTIN dışındaki alan hataları (ad, SKU, lif oranı "Tam sayı girin", aynı lif iki kez): input altında kırmızı satır; tasarımda sadece GTIN hatası var.
- [ ] Kaydetme/silme sunucu hatası (5xx): toast.
- [ ] Parti durum chip'leri (Taslak=pending, Veri toplanıyor=submitted, Yayına hazır=approved, Yayında=brand): tasarımdaki chip'ler adım durumlarını gösteriyor (Beklemede, Gönderildi…).
- [ ] Yayında chip'i: dolu brand varyantı (zemin --brand, yazı --primary-foreground, nokta yerine onay ikonu); muted dut zemin "Reddedildi"ye çok benziyordu. Kontrast açıkta 7,5:1, koyuda 6,8:1.
- [ ] Partiler: tedarik zinciri çubuğu sadece sayılardan (onaylı yeşil, kalan gri, adım yoksa "—"); adım bazında renk M3'te zincirle gelir. Uyum skoru "—" (M6). Satır oku ve satıra tıklama gizli (parti detayı 09, M3).
- [ ] Partiler: filtre sonucu boş durumu ("Eşleşen parti yok", "Filtreleri temizle") ürünlerdeki tasarım metninden uyarlandı. Hiç parti yokken v0.2'nin (tasarım G) boş durumu ve "Nasıl başlanır" rehberi duruyor.
- [ ] Parti oluştur: "Zincir son partiden kopyalanır" alt başlığı ve "Tedarik zinciri: 5 adım kopyalanacak" ipucu M3'e kadar gizli. Tarih alanları tarayıcının tarih seçicisi (tasarımda düz metin "gg.aa.yyyy").
- [ ] Tasarım çerçevelerinde tanımlı olup globals.css'te olmayan token'lar: `--brand-text` eklendi (08 "Otomatik öneri" rozeti, "Yayında" chip'i); `--primary-hover`, `--destructive-hover`, `--ring-soft` hâlâ yok (web'de bg-primary/85 ve ring/18 kullanılıyor); her biri ilk kullanıldığı ekranda, tasarımdaki değeriyle (açık ve koyu) eklenecek.
- [ ] Mobil web liste (md altı): masaüstü tablo yatay kaydırılır; tasarım 16 web için uyarlanmalı.
- [ ] Popover üstünde muted zemin token'ı (dark'ta --muted = --popover, ikisi #1B202A): ürün silme dialogundaki ürün kutusu koyu temada geçici olarak --card kullanıyor. Mobil kullanıcı menüsündeki seçim grubunun zemini de koyu temada görünmüyor; seçili öğe zaten --card olduğu için orada --card kullanılamadı, token gelince düzelecek.

**Ertelenenler** (tasarımda var, verisi sonraki kilometre taşında gelecek):
- [ ] Menüdeki "Görevler" rozeti (bekleyen görev sayısı): M4'te, `GET /tasks` gelince. O zamana kadar gizli.

**Tasarım sapması** (tasarım yanlış, uygulama farklı yapacak):
- [ ] Tasarım v0.3 ekran 10 ("Düğüm paneli — Maraş Penye İplik, veri talep bağlantısı"): tedarikçi veri talebi linki `kozapass.com/v/…` görünüyor. Bu yazı `docs/design/v0.3/KozaPassPanel.dc.html` bileşenindeki örnek `url` sabitinden geliyor, koda taşınmaz. Uygulamada link `https://kozapass.vercel.app/r/{token}` olur (K14). Herkese açık pasaport ise GS1 yolunda kalır: `https://kozapass.vercel.app/01/{gtin}/10/{batch}` (K13).


- [x] Demo kullanıcılarının gerçek BCrypt hash'i (M1, `DemoDataSeeder`)
- [x] Render uyanık tutma cron'u (M1, demo ve jüri haftalarında kontrol et)
- [ ] Gemini'ye asla gerçek firma verisi gönderme
- [ ] Gemini model ID'sini geliştirme günü AI Studio'dan kontrol et, `GEMINI_MODEL`'e yaz
- [ ] Demo öncesi: sahte OEKO-TEX / GOTS örnek belgeleri hazırla (gerçek firma adı ve numarası olmadan)
- [ ] Gerçek pilot olursa: ücretli Gemini katmanı + alan adı + KVKK aydınlatma metni
