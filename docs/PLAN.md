# TekPas — Proje Planı

Tekstil için Dijital Ürün Pasaportu platformu. Bitirme projesi + ERP firmasına gösterilecek çalışan demo.
Bütçe: **sıfır** — her servis ücretsiz katmanda.

---

## 1. Mimari kararlar

| # | Konu | Karar | Gerekçe |
| --- | --- | --- | --- |
| K1 | Repo | Monorepo (`backend/`, `web/`, `mobile/`, `packages/`) | Tipler paylaşılır, tek PR'da uçtan uca özellik, Claude Code bütünü görür |
| K2 | Backend | Java 21, Spring Boot 3, **Maven** | Kurumsal müşterinin güvendiği yığın, mevcut tecrübe |
| K3 | DB | PostgreSQL 16, esnek alanlar JSONB | Zincir ilişkisel (recursive CTE), AB veri şeması henüz kesin değil |
| K4 | API | Code-first: springdoc → OpenAPI → üretilen TS client | Hızlı, tipler hep senkron, CI uyuşmazlığı yakalar |
| K5 | Auth | Kendi JWT'miz: access 15 dk + refresh 30 gün (rotation, aile iptali) | Dış bağımlılık yok, çok kiracılı yapıya tam kontrol |
| K6 | Web | Next.js App Router, shadcn/ui, Tailwind, TanStack Query, next-intl | Pasaport sayfası SSR, kurumsal görünüm |
| K7 | Mobil | React Native + Expo | Web ile aynı dil ve client, kamera/QR hazır |
| K8 | AI | Google Gemini, `AiClient` arayüzü arkasında, model adı config'te | Ücretsiz katman, sağlayıcı değişirse tek sınıf |
| K9 | Arka plan işleri | Postgres tabanlı kuyruk (`FOR UPDATE SKIP LOCKED`) | Ek servis yok, Render ücretsiz katmanında çalışır |
| K10 | Dosya | S3 API: local MinIO, prod Cloudflare R2, backend üzerinden yükleme, max 10 MB | Tek kod yolu, demo için yeterli |
| K11 | Pasaport seviyesi | **Parti** (üretim emri) | Her partinin gerçek zinciri farklı olabilir |
| K12 | Pasaport değişmezliği | Yayında snapshot dondurulur, değişiklik = yeni sürüm | Denetim izi, güven |
| K13 | QR | GS1 Digital Link: `{PUBLIC_BASE_URL}/01/{gtin}/10/{batch}` | AB'nin öne çıkardığı standart |
| K14 | Tedarikçi erişimi | Girişsiz, tek kullanımlık token linki; **WhatsApp / kopyala** ile paylaşım | E-posta için alan adı yok, sektörde iletişim zaten WhatsApp |
| K15 | Web vs mobil | **Web yönetir, mobil sahada iş görür** (bkz. §3) | Her platform kendi kullanıcısının bağlamına göre |
| K16 | Git | Feature branch + PR, CI yeşilse merge, `main` → otomatik deploy | `main` her zaman gösterilebilir |

### Ücretsiz katman notları
- **Alan adı yok:** QR'lar `*.vercel.app` adresine gider. `PUBLIC_BASE_URL` config'te, ileride tek satır değişir. Gerçek etikete basılmaz.
- **Render ücretsiz sunucu uyur:** cron-job.org gibi ücretsiz bir servisle `/actuator/health` her 10 dakikada bir çağrılır.
- **Gemini ücretsiz katmanı:** Gönderilen veri Google tarafından kullanılabilir → **sadece demo verisi.** Gerçek firmayla pilotta ücretli katman şart.

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

### M1 — Temel altyapı
- [ ] Monorepo iskeleti (pnpm workspaces, `backend/` Maven, `web/`, `mobile/`, `packages/`)
- [ ] `infra/docker-compose.yml` (Postgres, MinIO, Mailpit), `.env.example`
- [ ] Flyway V1 + V2, `DemoDataSeeder` (**demo kullanıcılarının gerçek BCrypt hash'i**)
- [ ] ProblemDetail handler, `CurrentUser`, JWT login / refresh (rotation) / logout / me
- [ ] Next.js login ekranı + korumalı panel iskeleti (shadcn)
- [ ] CI: backend `mvn verify`, web lint/typecheck/test, OpenAPI ↔ client kontrolü
- [ ] Deploy: Render + Neon + Vercel, sağlık kontrolü + uyanık tutma cron'u

**Kabul:** Canlı web linkinde demo kullanıcıyla giriş yapılır, yenilenince oturum korunur, başka firmanın kullanıcısı olarak `/auth/me` doğru firmayı döner.

### M2 — Ürün ve parti
- [ ] Ürün CRUD (GTIN kontrol hanesi doğrulaması), parti CRUD
- [ ] OpenAPI → `packages/api-client` üretim hattı
- [ ] Web: ürün listesi/formu, parti listesi/formu/detay iskeleti

**Kabul:** Panelden ürün ve parti oluşturulur. Hatalı GTIN alan bazında hata gösterir. Başka firmanın ürününe erişim 404.

### M3 — Tedarik zinciri
- [ ] Tedarikçi ağı (ekle / listele / çıkar)
- [ ] Zincir adımı ekle / düzenle, `GET /batches/{id}/tree` (recursive CTE)
- [ ] Web: React Flow ile zincir görünümü ve düzenleme

**Kabul:** Bir parti için İplik → Kumaş → Boya → Dikim zinciri çizilir, düğüm renkleri durumu gösterir.

### M4 — Veri talebi ve tedarikçi sayfası
- [ ] Veri talebi oluştur (token hash), geri al, süre dolumu
- [ ] Girişsiz `/r/[token]` sayfası (mobil öncelikli): adım tipine göre form (lif bileşimi vb.)
- [ ] Gönder → SUBMITTED; üretici onay / red (gerekçeli)
- [ ] "Linki kopyala" + "WhatsApp'ta paylaş"
- [ ] `GET /tasks`

**Kabul:** Üretici link paylaşır, tedarikçi telefondan girişsiz veri girer, üretici onaylar, düğüm yeşile döner.

### M5 — Belge ve AI çıkarımı
- [ ] S3 depolama (MinIO / R2), belge yükleme (10 MB, PDF/JPG/PNG, SHA-256 tekrar kontrolü)
- [ ] Job kuyruğu + worker + retry/backoff
- [ ] `AiClient` + `GeminiAiClient` + fake client (testler için), yapılandırılmış JSON çıktı
- [ ] Web: yükle → "AI okuyor" → alan alan öneri (güven < 0.8 sarı) → düzenle → onayla

**Kabul:** Örnek bir OEKO-TEX PDF'i yüklenir, sertifika no, sahibi ve geçerlilik tarihi otomatik dolar, kullanıcı onaylayınca asıl alanlara geçer.

### M6 — Pasaport ve QR (**çekirdek tamam**)
- [ ] Uyum skoru (onaylı adımlar + zorunlu alanlar + geçerli sertifikalar)
- [ ] Yayınla: snapshot, sürüm, eski sürüm SUPERSEDED; geri çek
- [ ] QR üretimi (GS1 Digital Link), PNG indirme
- [ ] Web: `/01/[gtin]/10/[batch]` SSR pasaport sayfası (zincir, lif bileşimi, sertifikalar, bakım)

**Kabul:** Telefonla QR okutulur, pasaport 2 saniyede açılır. Yeni sürüm yayınlanınca aynı QR yeni sürümü gösterir.

### M7 — Tutarlılık kontrolü ve sertifika takibi
- [ ] Kural tabanlı: lif toplamı ≠ 100, süresi dolmuş sertifika, sertifika sahibi ≠ tedarikçi, eksik zorunlu alan
- [ ] AI tabanlı: sertifika kapsamı ürün kategorisini kapsıyor mu, çelişkili beyanlar
- [ ] Günlük `CERT_EXPIRY_SCAN` işi
- [ ] Web: parti detayında uyarı paneli, çözüldü olarak işaretleme

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
- [ ] Excel şablonu indir → doldur → yükle → satır bazlı hata raporu

**Kabul:** Pasaport `?lang=de` ile Almanca açılır. 50 satırlık Excel'den ürünler oluşur, hatalı satırlar gösterilir.

### M12 — Detaylı roller, denetim izi, test
- [ ] §2 rol matrisinin tamamı + kullanıcı yönetimi ekranı
- [ ] Denetim izi ekranı (kim, neyi, ne zaman)
- [ ] Kritik akışlar için Playwright testleri

**Kabul:** EDITOR yayınla butonunu göremez, API da 403 döner. Her yayın denetim izinde görünür.

### M13 — Bitirme teslimi
- [ ] `docs/haftalik/` notlarından rapor taslağı
- [ ] Mimari diyagram, veri modeli diyagramı, ekran görüntüleri
- [ ] Sunum, APK, canlı link, kaynak kod teslimi

---

## 6. Unutulmayacaklar

- [ ] Demo kullanıcılarının gerçek BCrypt hash'i (M1, `DemoDataSeeder`)
- [ ] Render uyanık tutma cron'u (M1, demo ve jüri haftalarında kontrol et)
- [ ] Gemini'ye asla gerçek firma verisi gönderme
- [ ] Gemini model ID'sini geliştirme günü AI Studio'dan kontrol et, `GEMINI_MODEL`'e yaz
- [ ] Demo öncesi: sahte OEKO-TEX / GOTS örnek belgeleri hazırla (gerçek firma adı ve numarası olmadan)
- [ ] Gerçek pilot olursa: ücretli Gemini katmanı + alan adı + KVKK aydınlatma metni
