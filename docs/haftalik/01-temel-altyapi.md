# 01 — Temel altyapı

**Kilometre taşı:** M1  ·  **Tarih aralığı:** 24.09 – 27.09.2026  ·  **Canlı link:** https://kozapass.vercel.app (API: https://tekpas-api.onrender.com)

## Yapılanlar
- **Monorepo** (PR #1): pnpm workspace (`web`, `mobile`, `packages/*`), Spring Boot 4.1 backend, Next.js 16 web, Expo SDK 57 mobil. Flyway V1 + V2 (16 tablo).
- **Kimlik doğrulama** (PR #2):
  - `POST /auth/login`, `/auth/refresh`, `/auth/logout` ve `GET /auth/me`.
  - Access token 15 dk. Refresh 30 gün, rotation ve aile iptali; tekrar kullanım için 10 sn hoşgörü.
  - Hatalar RFC 7807 biçiminde. `DemoDataSeeder` demo kullanıcılarının gerçek BCrypt hash'ini üretiyor.
  - Sonra eklendi: "Beni hatırla" (oturum cookie'si).
- **Sözleşme ve CI** (PR #3, #4):
  - `openapi.json`'dan tipli TS client üretiliyor.
  - GitHub Actions'ta `backend`, `js` ve `contract` job'ları var. Client güncel değilse PR kırmızı oluyor; bu kasıtlı bir hatayla kanıtlandı.
  - DTO alanları varsayılan olarak non-null; boş gelebilenler `@Nullable`.
- **Canlıya çıkış** (PR #5–#7): Render (Docker, Frankfurt), Neon (Postgres 16, doğrudan bağlantı), Vercel (web, `/api/v1/*` proxy'si). cron-job.org 09:00–22:00 arası uyanık tutuyor.
- **Marka** (PR #8): KozaPass; kod adı `tekpas` değişmedi.
- **Giriş ekranı ve panel iskeleti** (PR #9, Claude Design v0.2):
  - Login masaüstü ve mobilde, TR/EN/DE.
  - Sol menü (daraltılabilir), üst bar, kullanıcı menüsü (tema, çıkış), 8 sayfanın boş durumu.
  - Access token sadece bellekte. Aynı anda gelen 401'ler tek bir refresh'le yenileniyor (single-flight).

## Teknik kararlar
- **K17 — Supabase Storage:** R2 kredi kartı istiyor.
- **K18 — Web API'ye kendi origin'i üzerinden, proxy ile erişir.** Refresh cookie birinci taraf olur, CORS gerekmez.
- **K19 — Neon'da pooler yok.** PgBouncer transaction modu ile prepared statement'lar arasında sadece canlıda çıkan sorun riski var.
- **K20 — Marka KozaPass, kod adı tekpas.**
- **Spring Boot 4.1:** 3.x serisinin OSS desteği bitti.
- **CDS arşivi:** 0,1 CPU'da açılış 166 sn'den 86 sn'ye indi (Render'da 63 sn).

## Karşılaşılan sorunlar ve çözümler
- **MinIO imajları kaldırıldı.** MinIO topluluk imajlarını yayınlamayı bıraktı → sabit sürümlü `pgsty/minio` fork'u kullanıldı.
- **Backend DB'ye bağlanamadı.** Makinedeki başka bir Postgres 5432'yi tutuyordu (ipucu: hata mesajı Türkçeydi) → Docker DB 5433'e taşındı.
- **pnpm 12 kurulamadı.** Node 22'deki corepack yeni dağıtım biçimini tanımıyor → pnpm 11. Vercel'de de `ENABLE_EXPERIMENTAL_COREPACK` ve Node 22 sabitlemesi gerekti.
- **Spring 7 değişikliği.** ProblemDetail'in varsayılan `type` değeri `null` oldu → hata işleyici çöküyordu. Testler yakaladı.
- **Prod config hatası.** Hikari `2m` gibi süre yazımını kabul etmiyor → uygulama canlıda açılmayacaktı. Build sırasındaki CDS eğitim koşusu yakaladı.
- **Proxy'de 403.** Tarayıcı aynı origin'e yaptığı POST'ta da `Origin` başlığını gönderiyor, proxy bunu iletiyor, Spring CORS reddediyordu → izin listesi boşsa CORS kapatıldı. curl ve Node testleri bu başlığı göndermediği için ancak gerçek tarayıcı testinde görüldü.
- **Sessiz yenileme çalışmıyordu.** Client, süresi dolmuş token'ı `/auth/refresh`'e de gönderiyordu; bearer filtresi cookie okunmadan reddediyordu → iki taraftan düzeltildi. Gerçek backend'e karşı 20 sn TTL ile doğrulandı.
- **Docker Desktop bilgisayar yeniden başlayınca kapalı kalıyor.** Testcontainers testleri "Docker bulunamadı" ile düştü → testlerden önce Docker'ın açık olduğu kontrol ediliyor (README'de gereksinim olarak yazılı).

## Test
- **Backend:** 69 test (Testcontainers + Postgres 16). Kapsanan senaryolar: tenant izolasyonu, token rotation ve tekrar kullanım, hoşgörü süresi, 401'e rağmen commit edilen iptal, beni hatırla, proxy Origin, bearer'sız auth uçları.
- **api-client:** 9 test (single-flight, gövdenin tekrar gönderilmesi, auth uçlarına token gönderilmemesi).
- **Web:** 30 birim testi; Playwright ile 2 klavye testi ve 15 ekran görüntüsü.
- **Lighthouse erişilebilirlik:** login ve panel, masaüstü ve 390 px mobil, dördü de 100; uyarı yok.
- **CI:** üç job da yeşil. Kritik testler mutasyonla doğrulandı: düzeltme geri alınınca test kırmızıya dönüyor.

## Ekran görüntüleri
- `docs/design/impl-v0.2/`: tasarım (`design-*`) ve uygulama (`impl-*`) yan yana; açık ve koyu tema; login varsayılan/hata/yükleniyor; panel Partiler.
- Tasarımla piksel farkı ~%1 (panelin 390 px mobil görünümü dahil: menü kapalı, drawer, kullanıcı menüsü).

## Sonraki adım
- **M2:** ürün ve parti CRUD (GTIN kontrol hanesi), ilk gerçek liste ekranları (TanStack Query, react-hook-form + Zod).
