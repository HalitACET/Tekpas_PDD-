# @tekpas/api-client

Backend'in OpenAPI sözleşmesinden üretilen, tipli TypeScript client.

| Dosya | Kim yazar | Elle düzenlenir mi? |
| --- | --- | --- |
| `openapi.json` | Backend testi `OpenApiExportTest` | **Hayır** |
| `src/generated/schema.ts` | `openapi-typescript` | **Hayır** |
| `src/client.ts`, `src/index.ts` | Elle | Evet |

> **`openapi.json` ve `src/generated/` otomatik üretilir, elle düzenleme.**

## Üretim akışı

Backend'de bir DTO veya endpoint değiştiğinde aynı PR'da:

```bash
cd backend && ./mvnw verify        # OpenApiExportTest -> packages/api-client/openapi.json
pnpm --filter api-client generate  # openapi.json -> src/generated/schema.ts
```

Sonra iki dosyayı da commit et. Çalışan bir backend gerekmez. Sadece dosyayı üretmek için `./mvnw test -Dtest=OpenApiExportTest` yeter.

CI'daki `contract` job'u aynı iki adımı tekrarlar. Commit'lenen `openapi.json` veya `src/generated/` farklı çıkarsa kırmızı olur.

## Kullanım

```ts
import { createApiClient, hasProblemType, ProblemTypes } from "@tekpas/api-client";

const api = createApiClient({
  baseUrl: "", // web: aynı origin (Next.js proxy, K18)
  getAccessToken: () => accessToken,
  onUnauthorized: (problem) => { /* refresh dene veya /login */ },
});

const { data, error } = await api.GET("/api/v1/auth/me");
if (hasProblemType(error, ProblemTypes.unauthorized)) {
  // ...
}
```

Hata gövdeleri `ApiProblem` (RFC 7807) tipindedir. Arayüz metnini `type` URN'ine göre çeviri dosyasından seç. `detail` alanı sadece İngilizce bir yedektir.
