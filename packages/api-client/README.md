# @tekpas/api-client

> **Bu klasör otomatik üretilir, elle düzenleme.**

Backend'in OpenAPI çıktısından (`/v3/api-docs`) üretilen TypeScript client. Backend'de bir DTO veya endpoint
değiştiğinde, backend çalışırken yeniden üret ve üretilen dosyaları aynı PR'da commit et:

```bash
pnpm --filter api-client generate
```

Üretim hattı M2'de kurulacak. CI, üretilen client ile backend arasındaki uyuşmazlığı yakalar.
