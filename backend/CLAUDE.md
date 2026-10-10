# backend/ — Spring Boot kuralları

Kök `CLAUDE.md` kuralları burada da geçerli. Bu dosya sadece backend'e özgü olanları içerir.

## Paket yapısı (feature bazlı)

```
com.tekpas
├── common/        ProblemDetail handler, CurrentUser, sayfalama, audit, S3 storage
├── auth/          login, refresh (rotation), logout, JWT filtresi, şifre hash
├── company/       firma, kullanıcı, tedarikçi ağı
├── product/
├── batch/         parti + uyum skoru
├── supplychain/   supply_step, supply_step_input (DAG), döngü kontrolü (recursive CTE)
├── request/       veri talebi linki + girişsiz /public/request (token X-Request-Token başlığında, K21), adım geçmişi
├── document/      yükleme, AI çıkarım sonucu, onay
├── ai/            AiClient arayüzü, GeminiAiClient, prompt'lar, JSON şemaları
├── validation/    kural tabanlı + AI tutarlılık kontrolleri
├── passport/      yayınlama, snapshot, GS1 çözümleme, QR, public endpoint
├── importer/      Excel (Apache POI)
└── jobs/          Postgres kuyruğu: JobQueue, JobWorker, JobHandler<T>
```

Her feature paketi içinde: `XController`, `XService`, `XRepository`, `dto/` (Java `record`), `X` (entity).

## Kurallar

- **DTO her zaman `record`.** Entity asla controller'dan dışarı çıkmaz. Mapping elle veya küçük statik `from()` metodlarıyla yapılır, MapStruct eklenmez.
- **Tenant:** `CurrentUser` bean'i JWT'den `userId`, `companyId` ve `role` verir. Repository metodları `findByIdAndCompanyId(...)` şeklindedir. Bulunamazsa `NotFoundException` → 404.
- **Yetki:** `@PreAuthorize("hasAnyRole('OWNER','ADMIN')")` gibi metot seviyesinde. Rol matrisi `docs/PLAN.md` içinde.
- **Transaction:** `@Transactional` sadece service katmanında. Okuma işlemleri `readOnly = true`.
- **Validasyon:** Request DTO'larında Jakarta Validation (`@NotBlank`, `@Size`, `@Pattern`). GTIN için özel `@Gtin` anotasyonu (14 hane + GS1 kontrol hanesi).
- **Jackson 3 kullanılır:** databind importları `tools.jackson.*` paketinden. `com.fasterxml.jackson.databind` (Jackson 2) sadece springdoc'un bağımlılığı olarak classpath'te durur, kodda import edilmez. Anotasyonlar (`@JsonProperty` vb.) `com.fasterxml.jackson.annotation` paketinde kalır, bu doğrudur.
- **Nullability:** DTO alanları varsayılan olarak non-null ve OpenAPI'de required. Boş gelebilen alan `org.jspecify.annotations.Nullable` ile işaretlenir. Alan başına `@Schema(requiredMode)` yazılmaz.
- **JSONB:** `supply_step.data`, `document.extraction` ve `passport.snapshot` için Hibernate 7 `@JdbcTypeCode(SqlTypes.JSON)` ve tipli record'lar kullan, `Map<String,Object>` değil.
- **OpenAPI:** Her controller'da `@Tag` ve her endpoint'te `@Operation(summary=...)`. Hata cevaplarını `@ApiResponse` ile belirt. Client bundan üretiliyor, isimler temiz olsun.
- **Tokenlar:** Tedarikçi linki token'ı ve refresh token 32 bayt `SecureRandom` ile üretilir, DB'de sadece SHA-256 hash'i tutulur. Ham değer sadece bir kez cevapta döner.
- **Şifre:** `BCryptPasswordEncoder` (strength 10). Demo kullanıcılarının hash'i `DemoDataSeeder` ile uygulama açılırken üretilir (sadece `demo` profilinde).

## Arka plan işleri

- İş eklemek: `jobQueue.enqueue(JobType.AI_EXTRACT_DOCUMENT, payload)`. Aynı transaction içinde yapılır, böylece kayıt geri alınırsa iş de geri alınır.
- `JobWorker` `@Scheduled(fixedDelay = 2000)` ile `FOR UPDATE SKIP LOCKED` üzerinden bir iş alır, ilgili `JobHandler`'a verir.
- Hata alırsa `attempts++`, `run_at = now() + 2^attempts dakika`. `max_attempts` aşılırsa `DEAD` olur.
- Handler'lar idempotent yazılır: aynı iş iki kez çalışsa sonuç bozulmaz.

## AI (Gemini)

- `AiClient` arayüzü: `extractDocument(bytes, mimeType, docType)`, `validateBatch(context)`, `translate(snapshot, targetLang)`.
- Gemini çağrısı yapılandırılmış çıktı (JSON şeması) ile yapılır. Serbest metin parse edilmez.
- Her alan için `{value, confidence}` döner. Güven skoru 0.8'in altındaysa arayüzde sarı gösterilir.
- Prompt'lar `src/main/resources/prompts/*.md` dosyalarında tutulur, koda gömülmez.
- Testlerde `AiClient` her zaman fake implementasyonla değiştirilir. **Testler gerçek API'yi çağırmaz.**

## Test

- Birim testler: JUnit 5 + AssertJ + Mockito.
- Entegrasyon testleri: `@SpringBootTest` + Testcontainers PostgreSQL 16 (`@ServiceConnection`).
- Her yeni endpoint için en az: mutlu yol, validasyon hatası, **başka firmanın kaydına erişim → 404**.
- `src/test/resources/db/` altındaki SQL testleri şemanın referansıdır.

## Profiller

`local` (docker-compose), `test` (Testcontainers), `demo` (demo verisi yüklenir), `prod` (Render).
