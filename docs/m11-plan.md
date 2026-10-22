# M11 planı — Çok dil ve Excel

**Hedef:**
- Yayınlanan pasaport İngilizce ve Almanca okuyana yalnızca arayüz metinleriyle değil, üreticinin yazdığı serbest metinlerle de kendi dilinde ulaşsın.
- Üretici ürün listesini ERP'sinden çıkan bir Excel ile tek seferde yüklesin; hatalı satırları satır ve sütun düzeyinde görsün.

**Kabul (PLAN):** **Pasaport `?lang=de` ile Almanca açılır. 50 satırlık Excel'den ürünler oluşur, hatalı satırlar gösterilir.**

Bu belge plandır; kod yok. Kararlar §8'de, kullanıcıya düşenler §7'de.

**Dayandığı kurallar:**
- Kural 1: tenant; başka firmanın içe aktarımına 404.
- Kural 4: Gemini'ye yalnızca demo verisi.
- Kural 5: AI önerir, insan onaylar.
- Kural 6: yayınlanmış pasaport değişmez.
- Kural 8: metinler çeviri dosyasından.

## 1. Mevcut durum

- **Pasaportun arayüzü zaten üç dilde:** `?lang=` → `Accept-Language` → `tr` (M6). Kodlar (kategori, lif, boyama süreci, bakım sembolü) sayfada çevriliyor.
- **Serbest metinler özgün dilinde kalıyor (M6 kararı):**
  - Ürün açıklaması, bakım notu (M10, dili saklanıyor), kumaş tipi (`fabricType`, "Süprem"), boyamada "diğer" süreç (`dyeProcessOther`).
  - Almanca sayfada bunlar Türkçe görünüyor; bakım notu dışında "Türkçe" diye de belirtilmiyor.
- **Hiç çevrilmeyecekler (M6 kararı korunur):** ürün adı, firma ve tedarikçi adları, yer adları, iplik numarası ("Ne 30/1").
- **Hazır olanlar:**
  - `AI_TRANSLATE_PASSPORT` iş türü (V9) tanımlı, işleyicisi yok.
  - `LlmGate` (bayrak + anahtar + demo firması) ve `LlmBudget` (günlük sınır) M5'ten.
- **Excel:**
  - `IMPORT_EXCEL` iş türü (V9, tek deneme) tanımlı.
  - "İçe aktarma" sayfası tasarım G'nin boş çerçevesi.
  - Ürün sayfasında "Excel'den içe aktar" düğmesi "yakında" diyor.
  - Excel kütüphanesi yok.
- **Çeviri dosyaları:** EN/DE anadil kontrolünden geçmedi (`web/messages/README.md`).

## 2. Görevler

| # | İş | Tasarım gerekir mi | Kullanıcı gerekir mi |
| --- | --- | --- | --- |
| T1 | **Çeviri taslağı (backend):** V19 `passport_translation`, öneri işi (`AI_TRANSLATE_PASSPORT`), onay uçları | Hayır | Hayır |
| T2 | **Snapshot `schemaVersion: 3`:** onaylı çeviriler `translations` bloğunda donar; eski sürümler aynen okunur | Hayır | Hayır |
| T3 | **Panel: yayından önce çeviriler** (önizleme / yayınla akışında bir adım) | **Evet (v1.1)** | Tasarım |
| T4 | **Pasaport:** onaylı çeviriyi sayfanın dilinde göster; çevrilmemiş serbest metne "Türkçe" etiketi; AI çevirisi notu | **Evet (v1.1)** | Tasarım |
| T5 | **Excel kütüphanesi ve şablon:** `GET /imports/template?kind=products` (açılır listeli, üç dilde başlık) | Hayır | Bağımlılık onayı (§8 karar 4) |
| T6 | **İçe aktarma (backend):** `POST /imports` (dosya → depo → iş), `GET /imports`, `GET /imports/{id}`; satır bazlı sonuç | Hayır | Hayır |
| T7 | **İçe aktarma ekranı:** şablon indir, yükle, işleniyor, sonuç ve hata tablosu, geçmiş | **Evet (v1.1)** | Tasarım |
| T8 | **Anadil kontrolü:** EN/DE çeviri dosyalarını ve pasaport cümlelerini birine okutmak; düzeltmeleri işlemek | Hayır | **Kişi bulmak** |
| T9 | Kabul, haftalık not, README, PLAN | | |

**Sıra:** T1 → T2 → T5 → T6 (backend'ler tasarım beklemez) → tasarım gelince T3, T4, T7 → T8 (paralel, kişi bulununca) → T9.

## 3. Çeviriler (T1–T4)

**Neler çevrilir:** `product.description`, `product.care.note`, adımlardaki `fabricType` ve `dyeProcessOther`. Kaynak dil:
- Bakım notu kendi `noteLanguage`'ında yazılmıştır.
- Diğerleri Türkçe varsayılır (panel Türkçe öncelikli; ürün formunda dil seçimi yok).

**Akış (yayından önce, sürüm değişmez kalsın diye):**
1. Önizleme ya da yayınla adımında "Çeviriler" bölümü: her serbest metin için kaynak, İngilizce ve Almanca.
2. **Demo firmasında** "Çevirileri öner" bir `AI_TRANSLATE_PASSPORT` işi açar (202 + yoklama).
   - Gemini'ye yalnızca bu metinler gider, rastgele sınırlayıcılar arasında ve JSON şemasıyla (M5 kalıbı).
   - Cevap güvenilmeyen girdidir: uzunluk sınırı vardır, HTML ve bağlantı içeremez.
   - Öneriler `AI` kaynaklı ve **onaysız** yazılır.
3. **Gerçek firmada** AI yoktur (kural 4). Kullanıcı çeviriyi kendisi yazar ya da boş bırakır.
4. Kullanıcı her çeviriyi düzenleyebilir ve "Onayla" der. Onaysız AI önerisi yayına girmez.
5. **Yayınla:** yalnızca onaylı çeviriler snapshot'a girer (`translations.{en|de}.{alanYolu}`) ve donar. Ürün ya da adım metni sonradan değişirse, ilgili çeviri "kaynak değişti" diye onaysız düşer.

**Veri (V19):** `passport_translation(company_id, batch_id, field_path, language, text, source AI|MANUAL, source_hash, approved_by, approved_at, created_at)`.
- `field_path` örnekleri: `product.description`, `product.care.note`, `steps.{key}.fabricType`.
- `source_hash`: kaynak metnin SHA-256'sı. Kaynak değişince onay geçersiz olur.
- Tenant filtresi `company_id`.

**Uçlar:**
- `GET /batches/{id}/translations`: alanlar, kaynaklar, öneriler, onay durumu.
- `POST /batches/{id}/translations/suggest`: 202. Demo değilse 409 `AI_NOT_AVAILABLE`.
- `PUT /batches/{id}/translations`: toplu düzenleme ve onay.
- Başka firmanın partisine 404.

**Pasaport (T4):**
- Sayfanın dilinde onaylı çeviri varsa o gösterilir; AI kaynaklıysa küçük bir not düşülür ("Çeviri yapay zekâ ile hazırlandı, üretici onayladı"; metin tasarımdan).
- Çeviri yoksa özgün metin, `lang` özniteliği ve "Türkçe" etiketiyle gösterilir (bakım notundaki gibi).

## 4. Excel içe aktarma (T5–T7)

**Kapsam:** yalnızca **ürünler**. Partiler ve zincir kapsam dışı (§8 karar 5).

**Şablon (`products`, sürüm 1):**
- **Sütunlar:** GTIN · SKU · Ürün adı · Kategori · Açıklama · Lif 1 · % 1 · Lif 2 · % 2 · Lif 3 · % 3.
- **Başlıklar** panelin dilinde. Okurken sütunlar başlıkla değil **sıralarıyla** eşleşir; ikinci, gizli bir sayfada şablon türü ve sürümü durur (`kozapass:products:1`). Yanlış dosyaya `TEMPLATE_UNKNOWN` döner.
- **Kategori ve lif:** açılır listeden. Değerler her üç dildeki ad ya da API kodu olarak kabul edilir; Türkçe büyük/küçük harf duyarsız (`Folding`, M5).
- **Bakım talimatı** şablonda yok (§8 karar 6).

**Akış:**
1. `POST /imports` (multipart, `kind=products`, en fazla 1 MB ve 1000 satır).
   - Dosya `import_job` satırında (`BYTEA`, en çok 1 MB) bekler, `IMPORT_EXCEL` kuyruğa girer, cevap 202. Depolama servisine gitmez: depo kapalıyken de çalışır, kayıtsız dosya kalmaz. Tablo V1'den beri vardı, hiç kullanılmamıştı; V20 onu uyarlar.
2. **İş:**
   - Satırları okur, her satırı `ProductCreateRequest` ile **aynı doğrulayıcıdan** geçirir (aynı hata kodları: `GtinCheckDigit`, `FiberTotal`, `Unique`…).
   - Geçerli satırlar ürün olarak oluşur. Her satır kendi işleminde; bir satırın hatası diğerlerini durdurmaz.
   - Dosya içinde iki kez geçen GTIN: ikincisi `Duplicate`.
3. **Sonuç (`import_job`, V20):** `status` (QUEUED, RUNNING, DONE, FAILED), `total`, `created`, `failed`, `errors` (JSONB: `[{row, column, code, value}]`; değer kısaltılır). Dosya iş bitince satırdan silinir.
4. **Tekrar yükleme** idempotent sayılmaz: aynı GTIN ikinci kez `Unique` hatası verir (kayıt zaten var).

**Güvenlik:**
- Dosya türü uzantıya değil içeriğe bakılarak doğrulanır: ZIP imzası ve OOXML içerik türü.
- Sıkıştırma oranı ve açılmış boyut sınırlı (zip bombası).
- Formüller hesaplanmaz, yalnızca hücredeki kayıtlı değer okunur. Dış bağlantılar ve makrolar (`.xlsm`) reddedilir.
- İçe aktarma OWNER, ADMIN ve EDITOR içindir (rol matrisi, PLAN §2); VIEWER ve tedarikçi 403.

## 5. Test

- **T1:**
  - Öneri işi: FakeAiClient ile.
  - Demo olmayan firmada 409.
  - Onaysız öneri yayına girmez.
  - Kaynak değişince onay düşer.
  - Başka firmanın partisi 404.
- **T2:** sürüm 3 snapshot'ta `translations`; sürüm 1 ve 2 snapshot'lar okunuyor.
- **T5–T6:**
  - Şablonun kendisi geri yüklenince 0 satır ve hata yok.
  - **50 satırlık örnek dosya:** 45 geçerli, 5 hatalı (kontrol hanesi, toplam %99, eksik ad, dosyada çift GTIN, var olan GTIN). Hepsinin satır ve sütunu doğru.
  - Yanlış şablon, bozuk ZIP, 1 MB üstü dosya, `.xlsm`.
  - Tenant 404, VIEWER 403.
- **T3, T4, T7:** tasarımdan sonra bileşen ve e2e.
- **Kabul:** Almanca pasaport (demo partisi, onaylı AI çevirisiyle) ve 50 satırlık dosya, canlıda.

## 6. Riskler

- **Excel kütüphanesinin boyutu:** Apache POI (poi-ooxml ve bağımlılıkları) ~15 MB ve çok sayıda sınıf yükler. 0,1 CPU'da açılışı uzatır (M10 ölçümü: açılışın çoğu sınıf yükleme). Karar 4.
- **AI çevirisinin kalitesi:** tekstil terimleri ("süprem", "ribana") yanlış çevrilebilir. İnsan onayı zorunlu; öneri ekranında kaynak yan yana durur.
- **Ücretsiz Gemini kotası:** çeviri ve belge okuma aynı günlük sınırı (`LlmBudget`) paylaşır.

## 7. Kullanıcıya düşenler

1. **Tasarım (T3, T4, T7):** `docs/m11-tasarim-brifi.md` → Claude Design v1.1.
2. **Bağımlılık onayı (T5):** karar 4.
3. **Anadil kontrolü (T8):** İngilizce ve Almanca için birer kişi. Okunacaklar `web/messages/en.json`, `de.json` (özellikle `passport` ve bakım cümleleri) ve mobil çeviriler. Ben okunacak listeyi tablo olarak hazırlarım.
4. **Kabul:** canlıda Almanca pasaport ve 50 satırlık dosya.

## 8. Kararlar (itiraz edilebilir)

1. **Çeviri yayından önce, onayla:** yayından sonra çevirmek sürümü değiştirmek olurdu (kural 6). Onaysız AI metni pasaporta girmez (kural 5).
2. **AI çevirisi yalnızca demo firmasında:** gerçek firmanın metni Gemini'ye gitmez (kural 4). Gerçek firma elle yazar ya da metin özgün dilinde ve dil etiketiyle kalır.
3. **Ürün adı çevrilmez:** M6 kararı. Ürün adı marka gibidir; etiketteki ad pasaporttakiyle aynı kalmalı.
4. **Excel kütüphanesi: `fastexcel` (dhatim, Apache-2.0), POI değil.**
   - Sürüm 0.20.2: yazıcı (`opczip`) ve okuyucu (`aalto-xml`, `commons-compress`) bağımlılıklarıyla birlikte ~2 MB; POI ~15 MB.
   - Akış hâlinde okur, bellekte bütün çalışma kitabını tutmaz.
   - Şablondaki açılır liste `Range.validateWithList` ile yazılabiliyor.
   - Backend `CLAUDE.md` POI diyordu; Render'ın 0,1 CPU / 512 MB'ı için daha hafifi seçildi. Onay istenir.
5. **İçe aktarmada yalnızca ürünler:** partiler zincir ve tedarikçi atamasıyla birlikte anlamlı; ERP'den gelen en yaygın liste ürün kartıdır. Partiler M12 ya da sonrası.
6. **Bakım talimatı şablonda yok:** 23 sembol ve hassasiyet, Excel'de hataya açık. Ürün formunda girilir. İstenirse sürüm 2 şablona eklenir.
7. **Satır satır kayıt:** tek hatalı satır bütün dosyayı geri çevirmez. Sonuç ekranı hangi satırların oluştuğunu söyler, hatalılar düzeltilip yeniden yüklenir (oluşanlar `Unique` ile atlanır).
