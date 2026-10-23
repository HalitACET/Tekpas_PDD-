# Veri modeli

PostgreSQL 16, Flyway migration'ları `backend/src/main/resources/db/migration/` (V1–V23). 22 tablo. Aşağıdaki diyagram tabloları ve yabancı anahtarları gösterir; sütunların tamamı migration dosyalarında.

```mermaid
erDiagram
  company ||--o{ app_user : "çalışanları"
  company ||--o{ company_supplier : "üretici"
  company ||--o{ company_supplier : "tedarikçi"
  company ||--o{ product : "ürünleri"
  company ||--o{ import_job : "içe aktarmaları"
  company ||--o{ audit_log : "denetim izi"
  product ||--o{ batch : "partileri"
  batch ||--o{ supply_step : "zincir adımları"
  supply_step ||--o{ supply_step_input : "girdi"
  supply_step ||--o{ data_request : "veri talepleri"
  supply_step ||--o{ document : "belgeler"
  supply_step ||--o{ step_event : "adım geçmişi"
  company ||--o{ supply_step : "tedarikçi olarak"
  batch ||--o{ validation_issue : "uyarılar"
  batch ||--o{ passport : "sürümler"
  batch ||--o{ passport_translation : "çeviriler"
  passport ||--o{ passport_scan : "okutmalar"
  app_user ||--o{ refresh_token : "oturumlar"
  app_user ||--o{ push_token : "telefonlar"
  app_user ||--o{ user_invitation : "davet"

  company { uuid id PK; string name; string type; boolean is_demo }
  app_user { uuid id PK; uuid company_id FK; string email; string role; boolean active }
  company_supplier { uuid manufacturer_id FK; uuid supplier_id FK; string phone; string contact_name }
  product { uuid id PK; uuid company_id FK; char gtin; string name; jsonb declared_fiber_composition; jsonb care_info }
  batch { uuid id PK; uuid product_id FK; string batch_no; string status }
  supply_step { uuid id PK; uuid batch_id FK; string step_type; uuid supplier_company_id FK; string status; jsonb data }
  supply_step_input { uuid step_id FK; uuid input_step_id FK }
  data_request { uuid id PK; uuid step_id FK; char token_hash; timestamptz expires_at }
  document { uuid id PK; uuid step_id FK; string doc_type; jsonb extraction; string review_status }
  validation_issue { uuid id PK; uuid batch_id FK; string code; string severity }
  passport { uuid id PK; uuid batch_id FK; int version; jsonb snapshot; string status }
  passport_translation { uuid id PK; uuid batch_id FK; string field; string language; char source_hash; timestamptz approved_at }
  passport_scan { uuid passport_id FK; timestamptz scanned_at }
  step_event { uuid id PK; uuid step_id FK; string kind }
  import_job { uuid id PK; uuid company_id FK; string status; jsonb errors }
  audit_log { bigint id PK; uuid company_id FK; uuid user_id FK; string entity_type; string action; jsonb diff }
  refresh_token { uuid id PK; uuid user_id FK; uuid family_id; char token_hash }
  push_token { uuid id PK; uuid user_id FK; string expo_token; string platform }
  user_invitation { uuid id PK; uuid user_id FK; char token_hash; timestamptz expires_at }
```

**Bağımsız tablolar** (diyagramda ilişkisi yok):
- `job`: Postgres iş kuyruğu (AI okuma, çeviri, Excel, günlük taramalar).
- `llm_usage`: günlük AI çağrı sayacı.
- `demo_scenario`: demo verisinin hangi sürümünün uygulandığı.

## Tasarım kararları

- **Çok kiracılık:** firmaya ait her tablo `company_id` taşır ya da bir zincirle firmaya bağlanır (parti → ürün → firma). Her sorgu firmayla süzülür; başka firmanın kaydı 404'tür.
- **JSONB, tipli kayıtlarla:** adım verisi (`supply_step.data`), AI çıkarımı (`document.extraction`) ve pasaport anı (`passport.snapshot`) JSONB'de durur. Java tarafında tipli `record`'lara okunur (Hibernate 7 `SqlTypes.JSON`).
- **Pasaport değişmez:**
  - Yayında `snapshot` donar; yeni yayın yeni satır demektir, eskisi `SUPERSEDED` olur.
  - Şema sürümü (`schemaVersion` 1–3) eski snapshot'ların aynen okunmasını sağlar.
- **Tedarik zinciri bir DAG:** `supply_step_input` bir adımın hangi adımlardan girdi aldığını tutar (iki iplikçiden tek kumaş gibi). Döngü, recursive CTE ile reddedilir.
- **Gizli değerler hash'li:** tedarikçi bağlantısı, davet bağlantısı ve yenileme token'ı yalnızca SHA-256'larıyla saklanır; ham değer bir kez cevapta döner.
- **Uygulanmış migration değişmez:** her değişiklik yeni bir `V{n}` dosyasıdır. `ApplicationSmokeTest` migration listesini ve tablo sayısını doğrular.
