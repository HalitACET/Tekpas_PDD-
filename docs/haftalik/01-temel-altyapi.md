> **TASLAK — M1 bitince tamamlanacak**

# 01 — Temel altyapı

**Kilometre taşı:** M1  ·  **Tarih aralığı:** 24.09 – …  ·  **Canlı link:** henüz yok (deploy M1'in son görevi)

## Yapılanlar
- **Görev 1/5, monorepo iskeleti** ([PR #1](https://github.com/HalitACET/Tekpas_PDD-/pull/1)):
  - pnpm workspace (`web`, `mobile`, `packages/*`), Node 22 ve pnpm 11 sabit.
  - `backend/`: Spring Boot 4.1 + Java 21. Flyway mevcut V1 + V2 migration'larını uyguluyor (16 tablo). Açık uçlar: `/actuator/health`, Swagger (`/swagger-ui.html`, `/v3/api-docs`). Diğer her şey 401.
  - `web/`: Next.js 16 + shadcn/ui + next-intl (tr/en/de). Tek sayfa: başlık ve backend sağlık rozeti.
  - `mobile/`: Expo SDK 57 + Expo Router, tek ekran. Expo Go'da açıldı.
  - `packages/shared` ve `packages/api-client` boş iskelet.
  - `infra/docker-compose.yml`: Postgres (5433) ve MinIO (+ otomatik bucket). Mailpit kaldırıldı.
- *(Görev 2–5: JWT auth, login ekranı, CI, deploy — yapıldıkça eklenecek)*

## Teknik kararlar
- **E-posta gönderimi yok.** Tedarikçi linki WhatsApp veya kopyalama ile paylaşılıyor (K14). Bu yüzden Mailpit ve `MAIL_*` ayarları kaldırıldı.
- **Prod depolama Supabase Storage (K17).** Cloudflare R2 kredi kartı istiyor, bütçe sıfır. Supabase S3 protokolünü desteklediği için kod değişmiyor, sadece `S3_*` değerleri değişiyor. Dezavantajı: ücretsiz projeler hareketsizlikte duraklıyor, uyanık tutma cron'u storage'a da istek atacak.
- **Spring Boot 4.1 (K2).** 3.x serisinin OSS desteği Haziran 2026'da bitti. 4.0'ın desteği de Aralık 2026'da bitiyor, bitirme tesliminden önce.
- **Web dil seçimi sırası:** `?lang` → cookie → `Accept-Language` → `tr`. Pasaport sayfasının `?lang=` ihtiyacıyla aynı mekanizma.

## Karşılaşılan sorunlar ve çözümler
- **MinIO imajı çekilemedi.**
  - **Sorun:** `minio/minio:latest` ve `minio/mc:latest` çekilmiyordu (`access denied`).
  - **Kök neden:** MinIO topluluk imajlarını yayınlamayı bıraktı. Depolar Docker Hub'da da quay.io'da da artık yok.
  - **Çözüm:** Pigsty ekibinin sürdürdüğü topluluk fork'u `pgsty/minio` ve `pgsty/mc`, `latest` yerine sabit sürüm etiketleriyle kullanıldı. B planı `chrislusf/seaweedfs`. M5'te Testcontainers için de `asCompatibleSubstituteFor("minio/minio")` gerekecek.
- **Backend DB'ye bağlanamadı.**
  - **Sorun:** Docker'daki Postgres ayakta olduğu halde backend "şifre doğrulaması başarısız" hatası verdi. Hata mesajı Türkçeydi.
  - **Kök neden:** Makinede başka bir proje için Windows servisi olarak PostgreSQL 17 çalışıyor ve 5432'yi o tutuyor. `localhost:5432` Docker'a değil o servise gidiyordu. Türkçe mesaj bunun ipucuydu, çünkü Docker imajı İngilizce hata verir.
  - **Çözüm:** Diğer projeyi bozmamak için servise dokunulmadı, Docker Postgres 5433'e taşındı. Testcontainers rastgele port kullandığı için testler bundan etkilenmedi.
- **pnpm 12 kurulamadı.**
  - **Sorun:** `corepack prepare pnpm@12` sonrası `pnpm` çalışmadı (`Cannot find module ...pnpm.cjs`).
  - **Kök neden:** pnpm 12 native binary olarak dağıtılıyor. Node 22'nin içindeki eski corepack ise JS giriş dosyası arıyor. Ek olarak `corepack enable`, `Program Files`'a yazmak için yönetici yetkisi istedi.
  - **Çözüm:** Corepack ile çalışan pnpm 11.27.1'e sabitlendi. Kısayol kullanıcı klasörüne (`%APPDATA%\npm`) kuruldu ve bu klasörün PATH'e eklenmesi README'ye yazıldı.
- **Spring Boot 4 geçişi.**
  - **Sorun:** Plan Boot 3 varsayıyordu. Boot 4'te starter ve test bağımlılıkları farklı.
  - **Kök neden:** Boot 4 modüler yapıya geçti. Web starter'ı `starter-webmvc` oldu, Flyway ayrı starter'a taşındı, her modülün kendi `*-test` starter'ı var. Testcontainers 2.x'te modül ve paket adları değişti (`org.testcontainers.postgresql.PostgreSQLContainer`). Jackson 3'e (`tools.jackson`) ve Hibernate 7'ye geçildi. springdoc'un 2.x serisi Boot 4 ile çalışmıyor.
  - **Çözüm:** İskelet start.spring.io'dan Boot 4.1.1 ile üretildi. springdoc 3.1.1 kullanıldı. Sürümler Boot BOM'una bırakıldı. Jackson import kuralı `backend/CLAUDE.md`'ye yazıldı.

## Test
- Backend: 1 entegrasyon test sınıfı, 5 test (Testcontainers + Postgres 16). Kapsanan senaryolar: Flyway V1 ve V2 uygulanıyor, 16 tablo var, health `UP`, api-docs açık, korumalı yollar 401.
- JS: lint ve typecheck 5 projede de temiz. Henüz birim test yok.
- CI: henüz yok (M1 görev 4).

## Ekran görüntüleri
- *(eklenecek: `docs/haftalik/img/01-web-health.png`, `01-expo-go.png`, `01-swagger.png`)*

## Sonraki adım
- M1 görev 2: JWT ile login, refresh (rotation) ve logout, `/auth/me`, ProblemDetail handler, `CurrentUser`.
