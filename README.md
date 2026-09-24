# TekPas

TekPas, tekstil üreticileri için bir Dijital Ürün Pasaportu (DPP) platformudur. Üretici bir üretim partisi açar, tedarik zincirindeki firmalardan (iplikçi, kumaşçı, boyahane, fason dikim) veri ve sertifika toplar, AI belgeleri okur ve tutarlılığı kontrol eder. Sonunda parti için GS1 Digital Link QR'lı, herkese açık bir pasaport yayınlanır.

Ayrıntılı plan ve kararlar: [docs/PLAN.md](docs/PLAN.md). Geliştirme kuralları: [CLAUDE.md](CLAUDE.md).

## Yapı

| Klasör | İçerik |
| --- | --- |
| `backend/` | Java 21, Spring Boot 4.1, Maven, Flyway, PostgreSQL |
| `web/` | Next.js 16 (App Router), Tailwind, shadcn/ui, next-intl |
| `mobile/` | Expo SDK 57 (Expo Router) |
| `packages/shared` | Ortak şemalar, sabitler, çeviriler |
| `packages/api-client` | OpenAPI'den otomatik üretilen TS client (elle düzenlenmez) |
| `infra/` | Local geliştirme servisleri (docker compose) |

## Gereksinimler

- **Java 21** (JDK). Maven gerekmez, `backend/mvnw` wrapper'ı kullanılır.
- **Node 22 LTS** (`>=22.13`)
- **pnpm 11** — corepack ile: `corepack enable` (Node `Program Files` altındaysa yönetici yetkisi ister). Yönetici yetkisi yoksa Windows'ta PowerShell ile kullanıcı klasörüne kur ve o klasörü PATH'e ekle, sonra terminali yeniden aç:

  ```powershell
  corepack enable --install-directory "$env:APPDATA\npm" pnpm
  [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ";$env:APPDATA\npm", 'User')
  ```

  Kontrol: `pnpm -v` → `11.27.1`
- **Docker** (Docker Desktop). Backend testleri de Testcontainers için Docker ister.
- Mobil için telefonda **Expo Go**.

## Kurulum

```bash
cp .env.example .env        # gerekirse değerleri düzenle; .env asla commit edilmez
pnpm install
```

## Çalıştırma

Her komut repo kökünden çalıştırılır.

**1. Local servisler** — Postgres `:5433`, MinIO `:9000` (konsol `:9001`), `tekpas-docs` bucket'ı otomatik oluşur:

```bash
docker compose -f infra/docker-compose.yml up -d
```

> 5432 yerine 5433 kullanılıyor, çünkü geliştirme makinesinde 5432'yi başka bir Postgres tutuyor.

**2. Backend** — `http://localhost:8080`, sağlık: `/actuator/health`, Swagger: `/swagger-ui.html`:

```bash
cd backend && ./mvnw spring-boot:run
```

Varsayılan profil `local`'dir ve docker compose değerlerine bağlanır. Değerler `.env.example`'daki isimlerle ortam değişkeninden ezilebilir.

**3. Web** — `http://localhost:3000`, dil `?lang=tr|en|de`:

```bash
pnpm --filter web dev
```

**4. Mobil** — terminaldeki QR kodu Expo Go ile okut:

```bash
pnpm --filter mobile start
```

## Kontroller

```bash
cd backend && ./mvnw verify                       # backend testleri (Docker açık olmalı)
pnpm -r lint && pnpm -r typecheck && pnpm -r test  # JS tarafı
```
