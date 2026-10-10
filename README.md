<p align="center">
  <img src="docs/brand/kozapass-mark.svg" width="88" height="88" alt="KozaPass logosu: kozadan çözülen bir iplik">
</p>

<h1 align="center">KozaPass</h1>

<p align="center">
  Tekstil üreticileri için Dijital Ürün Pasaportu: her üretim partisinin tedarik zincirini, belgelerini ve lif bileşimini tek bir QR'lı pasaportta toplar.
</p>

<p align="center">
  <a href="https://kozapass.vercel.app"><strong>kozapass.vercel.app</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/HalitACET/Tekpas_PDD-/actions/workflows/ci.yml"><img src="https://github.com/HalitACET/Tekpas_PDD-/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
</p>

> **In English:** KozaPass is a Digital Product Passport (DPP) platform for textile manufacturers. A manufacturer opens a production batch, collects data and certificates from its supply chain (spinning, knitting, dyeing, sewing), lets AI read the documents and check consistency, and publishes a public passport with a GS1 Digital Link QR code. It is a graduation project and a working demo, built with Spring Boot, Next.js and Expo.

<p align="center">
  <img src="docs/design/impl-v0.3/07-light.png" alt="Partiler ekranı: parti numarası, ürün, tedarik zinciri ilerlemesi ve durum sütunlarıyla parti listesi" width="900">
</p>

Kod adı `tekpas`: repo, paket adları (`@tekpas/*`), Java paketi (`com.tekpas`) ve servis adları bunu kullanır; kullanıcıya görünen marka KozaPass'tir.

## Ne yapar

1. **Ürün:** Üretici ürününü GTIN, kategori ve etiketteki lif bileşimiyle tanımlar. GTIN'in GS1 kontrol hanesi ve lif toplamının %100 olması doğrulanır.
2. **Parti:** Her üretim emri için bir parti açılır. Pasaport parti düzeyindedir, çünkü her partinin tedarik zinciri farklı olabilir.
3. **Tedarik zinciri:** Üretici tedarikçi ağını (iplikçi, kumaşçı, boyahane, konfeksiyon) kurar. Her partinin zinciri lif → iplik → kumaş → boya → konfeksiyon adımlarıyla çizilir; yeni parti zincirini ürünün son partisinden kopyalar, adımlara ağdaki tedarikçiler atanır ve düğümün rengi adımın durumunu gösterir. Tedarikçiler veriyi girişsiz, tek kullanımlık bir bağlantıdan girecek (M4).
4. **Belge ve AI:** Sertifikalar (OEKO-TEX, GOTS…) yüklenir, AI alanları okur ve tutarlılığı kontrol eder. AI önerir, insan onaylar.
5. **QR pasaport:** Onaylanan parti için GS1 Digital Link QR'lı, çok dilli ve herkese açık bir pasaport yayınlanır. Yayınlanan sürüm değişmez; değişiklik yeni sürüm demektir.

## Kilometre taşları

Ayrıntı ve kabul kriterleri: [docs/PLAN.md](docs/PLAN.md). ✅ tamamlandı · 🟡 sürüyor · ⬜ sırada

| # | Kilometre taşı | Durum |
| --- | --- | :-: |
| M1 | Temel altyapı: monorepo, JWT, API sözleşmesi, CI, canlıya çıkış, giriş ve panel | ✅ |
| M2 | Ürün ve parti: GTIN doğrulaması, ürün ve parti ekranları | ✅ |
| M3 | Tedarik zinciri: tedarikçi ağı, zincir (DAG), parti detayı | ✅ |
| M4 | Veri talebi ve tedarikçi sayfası | ⬜ |
| M5 | Belge ve AI çıkarımı | ⬜ |
| M6 | Pasaport ve QR | ⬜ |
| M7 | Tutarlılık kontrolü ve sertifika takibi | ⬜ |
| M8 | Mobil I: görevler, kamera ile belge | ⬜ |
| M9 | Mobil II: QR okutma, hızlı onay, bildirimler | ⬜ |
| M10 | Demo hazırlığı | ⬜ |
| M11 | Çok dil ve Excel içe aktarma | ⬜ |
| M12 | Detaylı roller, denetim izi, test | ⬜ |
| M13 | Bitirme teslimi | ⬜ |

## Ekran görüntüleri

Tasarım Claude Design v0.3 (ve ek çerçeveleri v0.3.1, v0.3.2) ile yapıldı; tasarımla yan yana karşılaştırmalar [docs/design/impl-v0.3](docs/design/impl-v0.3), [impl-v0.3.1](docs/design/impl-v0.3.1) ve [impl-v0.3.2](docs/design/impl-v0.3.2).

| Açık tema | Koyu tema |
| --- | --- |
| **01 Ürünler**<br><img src="docs/design/impl-v0.3/01-light.png" alt="Ürün listesi, satır menüsü açık, açık tema" width="440"> | <br><img src="docs/design/impl-v0.3/01-dark.png" alt="Ürün listesi, satır menüsü açık, koyu tema" width="440"> |
| **03 Ürünü düzenle:** kontrol hanesi hatası, lif toplamı %95<br><img src="docs/design/impl-v0.3/03-light.png" alt="Ürün düzenleme paneli: hatalı GTIN kontrol hanesi ve %95 lif toplamı uyarısı, açık tema" width="440"> | <br><img src="docs/design/impl-v0.3/03-dark.png" alt="Ürün düzenleme paneli: hatalı GTIN kontrol hanesi ve %95 lif toplamı uyarısı, koyu tema" width="440"> |
| **04 Yeni ürün:** GTIN başka üründe<br><img src="docs/design/impl-v0.3/04-light.png" alt="Yeni ürün paneli: GTIN başka bir üründe kullanılıyor uyarısı, açık tema" width="440"> | <br><img src="docs/design/impl-v0.3/04-dark.png" alt="Yeni ürün paneli: GTIN başka bir üründe kullanılıyor uyarısı, koyu tema" width="440"> |
| **05 Ürün silinemez:** partisi var<br><img src="docs/design/impl-v0.3/05-light.png" alt="Ürün silinemez diyaloğu, açık tema" width="440"> | <br><img src="docs/design/impl-v0.3/05-dark.png" alt="Ürün silinemez diyaloğu, koyu tema" width="440"> |
| **07 Partiler**<br><img src="docs/design/impl-v0.3/07-light.png" alt="Parti listesi, açık tema" width="440"> | <br><img src="docs/design/impl-v0.3/07-dark.png" alt="Parti listesi, koyu tema" width="440"> |
| **08 Yeni parti:** ürün araması açık<br><img src="docs/design/impl-v0.3/08-light.png" alt="Yeni parti diyaloğu, ürün araması açık, açık tema" width="440"> | <br><img src="docs/design/impl-v0.3/08-dark.png" alt="Yeni parti diyaloğu, ürün araması açık, koyu tema" width="440"> |
| **09 Parti detayı:** tedarik zinciri<br><img src="docs/design/impl-v0.3/09-light.png" alt="Parti detayı: beş sütunlu tedarik zinciri, iki iplik düğümü ve boş konfeksiyon adımı, açık tema" width="440"> | <br><img src="docs/design/impl-v0.3/09-dark.png" alt="Parti detayı: beş sütunlu tedarik zinciri, koyu tema" width="440"> |
| **10 Adım paneli:** tedarikçinin girdiği veriler<br><img src="docs/design/impl-v0.3/10-light.png" alt="İplik adımı paneli: lif bileşimi, menşe, enerji ve teslim bilgileri, açık tema" width="440"> | <br><img src="docs/design/impl-v0.3/10-dark.png" alt="İplik adımı paneli, koyu tema" width="440"> |
| **25 Tedarikçi ata**<br><img src="docs/design/impl-v0.3.1/25-light.png" alt="Tedarikçi ata paneli: konfeksiyon tedarikçileri, son durumları ve seçili tedarikçi, açık tema" width="440"> | <br><img src="docs/design/impl-v0.3.1/25-dark.png" alt="Tedarikçi ata paneli, koyu tema" width="440"> |
| **14 Tedarikçiler**<br><img src="docs/design/impl-v0.3/14-light.png" alt="Tedarikçi listesi: tip, şehir, telefon, parti sayısı ve son durum, açık tema" width="440"> | <br><img src="docs/design/impl-v0.3/14-dark.png" alt="Tedarikçi listesi, koyu tema" width="440"> |

## Mimari

```mermaid
flowchart LR
  subgraph clients["İstemciler"]
    web["Web paneli<br/>Next.js 16"]
    mobile["Mobil<br/>Expo 57"]
    public["Herkese açık pasaport<br/>QR ile açılır"]
  end

  subgraph api["API · Spring Boot 4.1"]
    rest["REST /api/v1<br/>JWT, RFC 7807 hatalar"]
    jobs["İş kuyruğu<br/>Postgres FOR UPDATE SKIP LOCKED"]
  end

  db[("PostgreSQL 16")]
  storage[("Dosya deposu<br/>S3 API")]
  ai["Google Gemini<br/>belge okuma"]

  web -- "aynı origin üzerinden /api/v1 proxy" --> rest
  public --> web
  mobile --> rest
  rest --> db
  rest --> storage
  rest -- "iş ekler" --> jobs
  jobs --> db
  jobs -- "AI çıkarımı" --> ai
```

- **API sözleşmesi:** Backend'in OpenAPI çıktısından `packages/api-client` (TypeScript) otomatik üretilir. CI, sözleşme ile client'ın uyuşmadığı her PR'ı kırmızıya çevirir.
- **Çok kiracılık:** Firma kimliği her zaman oturumdaki kullanıcıdan gelir, istekten asla. Başka firmanın kaydı `404` döner; varlığı bile sızdırılmaz.
- **Ortak kurallar:** Form doğrulaması (GTIN, lif toplamı, parti no) `packages/shared` içindeki Zod şemalarıyla yapılır; hata kodları backend'le aynıdır.

## Teknoloji

| Parça | Teknoloji |
| --- | --- |
| Backend | Java 21, Spring Boot 4.1, Spring Security (JWT), Spring Data JPA, Flyway, springdoc-openapi 3.1 |
| Web | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI), TanStack Query 5, react-hook-form, Zod 4, next-intl 4 |
| Mobil | React Native 0.86, Expo SDK 57 (Expo Router) |
| Veri | PostgreSQL 16, S3 uyumlu dosya deposu |
| AI | Google Gemini (bir arayüzün arkasında; yalnızca demo verisi) |
| Test | JUnit 5, Testcontainers, AssertJ · Vitest · Playwright |
| Araçlar | pnpm 11 workspaces, Node 22, Maven Wrapper, GitHub Actions |
| Yayın | Render (API), Vercel (web), yönetilen Postgres ve S3 deposu; hepsi ücretsiz katman |

## Monorepo

| Klasör | İçerik |
| --- | --- |
| `backend/` | Spring Boot API, Flyway migration'ları, testler |
| `web/` | Next.js paneli; ileride herkese açık pasaport ve tedarikçi sayfaları |
| `mobile/` | Expo uygulaması |
| `packages/api-client/` | OpenAPI'den üretilen TS client (`openapi.json`, `src/generated/` elle düzenlenmez) |
| `packages/shared/` | Ortak Zod şemaları, sabitler, GTIN test örnekleri |
| `infra/` | Yerel geliştirme servisleri (docker compose) |
| `docs/` | Plan, canlıya çıkış, haftalık notlar, tasarım dosyaları ve karşılaştırmalar |

## Yerelde çalıştırma

**Gereksinimler:** Java 21 (JDK; Maven gerekmez, `backend/mvnw` kullanılır), Node 22 (`>=22.13`), pnpm 11, Docker Desktop (backend testleri de Testcontainers için Docker ister), mobil için telefonda Expo Go.

<details>
<summary>pnpm 11 kurulumu (corepack)</summary>

`corepack enable` yeterlidir; Node `Program Files` altındaysa yönetici yetkisi ister. Yönetici yetkisi yoksa Windows'ta PowerShell ile kullanıcı klasörüne kur, o klasörü PATH'e ekle ve terminali yeniden aç:

```powershell
corepack enable --install-directory "$env:APPDATA\npm" pnpm
[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ";$env:APPDATA\npm", 'User')
```

Kontrol: `pnpm -v` → `11.27.1`
</details>

Her komut repo kökünden çalıştırılır:

```bash
cp .env.example .env                               # değerleri gerekirse düzenle; .env asla commit edilmez
pnpm install
docker compose -f infra/docker-compose.yml up -d   # Postgres :5433, MinIO :9000 (konsol :9001)
cd backend && ./mvnw spring-boot:run               # API :8080, Swagger: /swagger-ui.html
pnpm --filter web dev                              # web :3000, dil ?lang=tr|en|de
pnpm --filter mobile start                         # Expo; QR'ı Expo Go ile okut
```

Varsayılan profiller `local` ve `demo`'dur: `local` docker compose değerlerine bağlanır, `demo` örnek firma, ürün ve partileri yükler. Postgres 5433'te çalışır (5432 başka bir kurulum için boş bırakıldı).

## Testler

```bash
cd backend && ./mvnw verify                        # backend: birim + Testcontainers entegrasyon testleri, OpenAPI çıktısı
pnpm --filter api-client generate                  # openapi.json → TypeScript client
pnpm -r lint && pnpm -r typecheck && pnpm -r test  # JS: lint, tip kontrolü, Vitest
pnpm --filter web e2e                              # web: Playwright (mock API ile, yerel Chrome)
```

## Dokümanlar

- [docs/PLAN.md](docs/PLAN.md): mimari kararlar, rol matrisi, API listesi, kilometre taşları, tasarım borcu.
- [docs/DEPLOY.md](docs/DEPLOY.md): canlıya çıkış ve canlı doğrulama.
- [docs/haftalik/](docs/haftalik): her kilometre taşının notu; yapılanlar, kararlar, karşılaşılan sorunlar.
- [CLAUDE.md](CLAUDE.md): geliştirme kuralları ve çalışma döngüsü.

## Geliştirme süreci

- **Tasarım:** Her ekran önce Claude Design'da tasarlanır ve onaylanır. Onaylı tasarım olmadan arayüz kodlanmaz. Uygulama ekranları tasarımla yan yana karşılaştırılır ([docs/design](docs/design)).
- **Kod:** Kod, Claude Code ile yazılır: plan, branch, testler, PR. Kurallar [CLAUDE.md](CLAUDE.md)'de.
- **İnsan onayı:** Her PR, CI yeşil olduktan sonra yalnızca proje sahibinin açık onayıyla merge edilir. Ürün kararları da yine proje sahibine aittir.

## Lisans

Tüm hakları saklıdır © 2026 Halit Acet. Bu depo açık kaynak lisansı ile dağıtılmamaktadır.
