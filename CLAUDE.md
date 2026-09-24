# TekPas — Claude Code Kuralları

Tekstil üreticileri için **Dijital Ürün Pasaportu (DPP)** platformu. Üretici bir üretim partisi açar, tedarik zincirindeki firmalardan (iplikçi, kumaşçı, boyahane, fason dikim) veri ve sertifika toplar, AI belgeleri okur ve tutarlılığı kontrol eder, sonunda parti için GS1 Digital Link QR'lı, herkese açık bir pasaport yayınlanır.

Bu hem bir bitirme projesi hem de bir ERP firmasına gösterilecek çalışan bir demo. Kod kalitesi, güvenlik ve anlatılabilirlik önemli.

Ayrıntılı plan, kararlar ve kilometre taşları: `docs/PLAN.md`. Her işe başlamadan önce ilgili bölümü oku.

## Yığın

| Parça | Teknoloji |
| --- | --- |
| `backend/` | Java 21, Spring Boot 4.1, Maven, Spring Security (JWT), Spring Data JPA, Flyway, springdoc-openapi |
| `web/` | Next.js (App Router), TypeScript, Tailwind, shadcn/ui, TanStack Query, next-intl, React Flow |
| `mobile/` | React Native + Expo (Expo Router), TypeScript, expo-camera, expo-secure-store, expo-notifications |
| `packages/api-client/` | Backend'in OpenAPI çıktısından **otomatik üretilen** TS client. Elle düzenlenmez. |
| `packages/shared/` | Ortak Zod şemaları, sabitler, çeviri dosyaları |
| DB | PostgreSQL 16 (local Docker, prod Neon) |
| Dosya | S3 API (local MinIO, prod Supabase Storage (S3)) |
| AI | Google Gemini API, `AiClient` arayüzünün arkasında |
| Deploy | Render (backend), Vercel (web), Neon (DB), Supabase Storage (S3), Expo EAS / Expo Go. **Hepsi ücretsiz katman.** |

JS tarafı pnpm workspaces ile yönetilir. Backend Maven ile ayrı çalışır.

## Komutlar

```bash
docker compose -f infra/docker-compose.yml up -d   # Postgres :5433, MinIO :9000/:9001
cd backend && ./mvnw spring-boot:run                # API :8080, Swagger: /swagger-ui.html
cd backend && ./mvnw verify                         # testler (Testcontainers, Docker açık olmalı)
pnpm --filter api-client generate                   # OpenAPI -> TS client (backend çalışırken)
pnpm --filter web dev                               # :3000
pnpm --filter mobile start                          # Expo
pnpm -r lint && pnpm -r typecheck && pnpm -r test
```

Not: 5432 makinedeki başka bir Postgres'e ait, local Docker DB 5433'te.

## Değişmez kurallar

1. **Çok kiracılık (tenant):** `company_id` ASLA istekten (body, query, path) alınmaz, her zaman JWT'deki kullanıcıdan gelir. Bir firmaya ait kaydı okuyan veya yazan her sorgu `company_id` ile filtrelenir. Başka firmanın kaydına erişim denemesi `404` döner, `403` değil (varlığı sızdırmamak için). Bu kuralın testini her yeni endpoint'te yaz.
2. **Uygulanmış bir Flyway migration'ı asla düzenleme.** Değişiklik = yeni `V{n}__aciklama.sql`.
3. **Secret commit etme.** Sadece `.env.example` repoda durur. Gerçek anahtarı koda, teste veya dokümana yazma.
4. **Gemini ücretsiz katmanı:** Gönderilen veri Google tarafından kullanılabilir. AI'a sadece sahte veya demo verisi gönder. Model adı koda gömülmez, `GEMINI_MODEL` config'inden okunur.
5. **AI önerir, insan onaylar.** AI çıktısı hiçbir zaman doğrudan asıl alana yazılmaz. `document.extraction` alanına güven skoruyla birlikte yazılır, kullanıcı onaylayınca asıl alanlara taşınır.
6. **Yayınlanmış pasaport değişmez.** `passport.snapshot` yayından sonra güncellenmez. Değişiklik = yeni sürüm, eskisi `SUPERSEDED` olur.
7. **Hata formatı:** Her hata RFC 7807 `ProblemDetail` olarak döner (`type`, `title`, `status`, `detail`, alan hataları için `errors`).
8. **Dil:** Kod, değişken, commit ve API İngilizce. Kullanıcıya görünen her metin çeviri dosyasından gelir (varsayılan `tr`, sonra `en`, `de`). Arayüzde sabit Türkçe string yazma.
9. **Sözleşme:** Backend'de bir DTO veya endpoint değişirse aynı iş içinde `pnpm --filter api-client generate` çalıştır ve üretilen client'ı commit et. CI uyuşmazlığı yakalar.

## Çalışma döngüsü (her görevde)

1. `docs/PLAN.md`'de ilgili kilometre taşını ve kabul kriterlerini oku.
2. Kod yazmadan önce kısa bir plan çıkar: hangi dosyalar, hangi testler. Emin olmadığın bir ürün kararı varsa sor, tahmin etme.
3. `main`'den branch aç: `feat/<kısa-ad>`, `fix/<kısa-ad>`, `chore/<kısa-ad>`.
4. Küçük ve anlamlı commit'ler at. Conventional Commits: `feat(batch): add supply chain tree endpoint`.
5. Testleri yaz ve çalıştır. Kırmızı testle iş bitmiş sayılmaz.
6. Lint, typecheck ve test'in hepsi yeşil olunca PR aç. PR açıklamasında şunlar olsun: ne değişti, nasıl test edildi, varsa ekran görüntüsü.
7. Bir kilometre taşı bittiğinde haftalık notu yaz (aşağıya bak) ve `docs/PLAN.md`'deki kutuyu işaretle.

**Bitti tanımı:** Kabul kriterleri sağlandı, testler yeşil, API client güncel, çeviri anahtarları eklendi, `main`'e merge edildiğinde canlıda çalışıyor.

## Haftalık / kilometre taşı notu

Her kilometre taşı bittiğinde (veya kullanıcı "not yaz" dediğinde) `docs/haftalik/` altına `NN-kisa-baslik.md` dosyası oluştur. Şablon: `docs/haftalik/_SABLON.md`.

- **Türkçe** yaz. Bu notlar hocaya gösterilecek ve bitirme raporunun hammaddesi olacak.
- Somut ol: eklenen endpoint'ler, ekranlar, tablo değişiklikleri, test sayısı, canlı link.
- "Karşılaşılan sorunlar ve çözümler" bölümünü atlama. Raporda en değerli kısım burası.
- Mimari bir karar verildiyse gerekçesiyle birlikte yaz.
- Kısa tut: en fazla bir sayfa.

## Yapma

- Kullanıcıya sormadan yeni bir üçüncü parti servis, ücretli servis veya büyük bir bağımlılık ekleme.
- Görevin kapsamı dışındaki kodu "bu arada" diye refactor etme. Gördüğün sorunu not et ve söyle.
- Testi geçirmek için testi zayıflatma veya atlama.
- `packages/api-client/` içini elle düzenleme.
