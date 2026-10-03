# @tekpas/shared

Web ve mobil arasında paylaşılan kod. Kurallar backend validasyonuyla aynıdır.

| Dosya | İçerik |
| --- | --- |
| `src/constants.ts` | API enum değerleri (`FIBERS`, `PRODUCT_CATEGORIES`, `BATCH_STATUSES`), `BATCH_NO_PATTERN`, alan hata kodları (`FIELD_ERROR_CODES`) |
| `src/gtin.ts` | GTIN biçimi, GS1 kontrol hanesi, 14 haneye normalizasyon |
| `src/schemas/product.ts` | `productCreateSchema`, `fiberCompositionSchema` (toplam 100, tekrar yok), `fiberTotal()` |
| `src/schemas/batch.ts` | `batchCreateSchema` (parti no GS1 AI(10), boşsa otomatik, tarih aralığı) |
| `test-vectors/gtin.json` | GTIN test örnekleri. Backend'in `GtinTest`'i de aynı dosyayı okur, iki tarafın kuralı ayrışırsa test kırmızı olur. |

Zod hatalarının `message` alanında backend'in döndüğü alan hata kodu bulunur (`GtinCheckDigit`, `FiberTotal`…). Form, istemci ve sunucu hatalarını aynı çeviri anahtarıyla gösterir: `errors.field.<kod>` (`web/messages`). `FiberTotal` hatası `params.total`, `FiberDuplicate` hatası `params.fiber` taşır.

`src/contract.test.ts`, buradaki enum listelerinin üretilen API client tipleriyle birebir aynı olduğunu `pnpm typecheck` sırasında kontrol eder.
