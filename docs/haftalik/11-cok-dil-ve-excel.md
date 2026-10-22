# 11 — Çok dil ve Excel içe aktarma

**Kilometre taşı:** M11  ·  **Tarih aralığı:** 22.10 – 23.10.2026  ·  **Canlı link:** web Vercel'de, API Render'da (merge ile canlıya çıkar)

## Yapılanlar
- **Plan ve brif (PR #101, #104):** `docs/m11-plan.md` (T1–T9), çeviriler ve içe aktarma için `docs/m11-tasarim-brifi.md` (Claude Design v1.1). Brif, backend yazıldıktan sonra API'nin gerçek dili ve rolleriyle güncellendi.
- **T1–T2 Çeviriler, backend (PR #102):**
  - V19 `passport_translation`: parti başına alan × dil satırı; kaynak metnin SHA-256'sı, kaynağı (AI / elle) ve onaylayan.
  - Çevrilen alanlar: ürün açıklaması, bakım notu, kumaş tipi ve "diğer" boyama süreci. Ürün adı, firma ve yer adları çevrilmez.
  - Uçlar: `GET /batches/{id}/translations`, `POST …/suggest` (202), `PUT …` (düzenle, onayla, sil).
  - Öneri işi `AI_TRANSLATE_PASSPORT`. Yalnızca demo firmasında çalışır (`LlmGate`) ve günlük sınırdan düşer. Onaylı ya da elle yazılmış çeviriye dokunmaz, öneriyi onaysız yazar.
  - Snapshot `schemaVersion: 3`: onaylı çeviriler yayın anında `translations` bloğunda donar. Sürüm 1 ve 2 aynen okunur.
- **T5–T6 Excel, backend (PR #103):** kütüphane fastexcel 0.20.2 (okuma ve yazma; kullanıcı onayıyla).
  - **Şablon:** `GET /imports/template?kind=products&lang=`. Başlıklar ve kategori/lif listeleri üç dilde; açılır listeli; çok gizli sayfada `kozapass:products:1` işareti var.
  - **Yükleme:** `POST /imports` (en fazla 1 MB, .xlsx, makro yok, zip bombası kontrolü) → `IMPORT_EXCEL` işi. Sonuç `GET /imports` ve `GET /imports/{id}` ile okunur.
  - **Satır kontrolü:** her satır ürün API'sinin kurallarından geçer (aynı hata kodları) ve tek başına kaydedilir; hatalı satır diğerlerini durdurmaz.
  - **V20:** V1'den beri kullanılmayan `import_job` tablosu bu iş için yeniden şekillendirildi.
- **T3 Önizlemede çeviriler (Claude Design v1.1 140; PR #105):**
  - Önizleme artık tüm pencereyi kullanıyor: koyu üst şeritte "Partiye dön" ve "Yayınla…" var. Solda "Çeviriler", sağda 390 px pasaport; pasaport TR/EN/DE ile okuyanın dilinde gösteriliyor.
  - Kutu durumları: boş, AI önerisi (sarı), onaylı (yeşil; kim ve ne zaman), elle yazıldı, kaynak değişti (turuncu).
  - "Çevirileri öner" (yalnızca demo firmasında), tek tek ve toplu onay. Kutuya yazılan metin kutudan çıkınca onaylı kaydediliyor.
  - Öneri hatası ve günlük AI sınırı bandı için backend iki bilgi döndürüyor: `suggestionFailure` ve `409 AI_LIMIT_REACHED`.
  - Yayın diyaloğunda "2 alan çevrildi · 1 alan Türkçe kalacak" satırı, çevirilere bağlantıyla. Yayını engellemiyor.
- **T4 Pasaportta çeviriler (141; PR #105):** onaylı çeviri sayfanın dilinde gösteriliyor. Çevrilmemiş metin kendi dilinde, etiketiyle duruyor ("Product description · in Turkish", "Stoffart auf Türkisch: „Süprem“"). AI ile çevrilmiş metin varsa sayfanın sonunda bir kez not çıkıyor. Ürün açıklaması artık başlığın altında görünüyor.
- **T7 İçe aktarma ekranı (150–157; PR #106):**
  - **Sayfa:** üç adım, panelin dilinde şablon, sürükle-bırak, "İşleniyor…" (sayfadan ayrılınca da sürüyor), sonuç.
  - **Hata tablosu:** Satır · Sütun · Değer · Sorun, çözüm ipucuyla. Örnekler: "Son hane 4 olmalı", "Toplam %90", "12. satırla aynı", "Ürün: Basic tişört beyaz".
  - **Dosya hataları:** her biri tek cümle ve bir eylem.
  - **Geçmiş ve yetki:** son içe aktarmalar listeleniyor. Görüntüleyici geçmişi görüyor, yükleyemiyor.
  - **Ürünler sayfası:** "Excel'den içe aktar" bağlantısı ve "Az önce 45 ürün içe aktarıldı" şeridi.
  - **Backend eklentileri:** hata satırına `detail`; V21 `import_job.file_size`; şablonda yüzde başlıkları "Lif 1 %".

## Teknik kararlar
- **Onay, metnin o anki hâline bağlı:** her çeviri kaynak metnin hash'iyle saklanıyor. Kaynak değişince onay düşüyor ve yeni sürüme girmiyor (yayındaki eski sürüm zaten değişmez). Tasarımdaki "onaylanana dek önceki çeviri yayında kalır" cümlesi bu yüzden "onaylanana dek yeni sürüme girmez" olarak yazıldı.
- **Elle yazılan çeviri onaylı sayılıyor:** kişinin kendi yazdığı metin için ikinci bir "Onayla" tıklaması istenmiyor. Elle değiştirilen AI metni artık AI önerisi değil (rozet kalkıyor, sayfa sonundaki AI notuna katılmıyor).
- **AI yalnızca demo firmasında:** Gemini'nin ücretsiz katmanına gerçek firma verisi gitmez (kural 4). Gerçek firma çeviriyi kendisi yazıyor ya da boş bırakıyor; boş kalan metin pasaportta Türkçe ve etiketli görünüyor.
- **fastexcel, POI değil:** bağımlılıklarıyla ~2 MB, POI ~15 MB. Render'ın 0,1 CPU'sunda açılışın çoğu sınıf yükleme (M10 ölçümü), bu yüzden hafif olanı seçildi. Şablonun açılır listeleri ve gizli sayfası da fastexcel ile yazılabiliyor.
- **Şablon sütun sırasıyla okunuyor:** başlık metnine bakılmıyor, böylece Türkçe şablonu İngilizce panelden yüklemek de çalışıyor. Şablon olduğu, çok gizli sayfadaki işaretten anlaşılıyor.
- **Başka firmanın ürünü adlandırılmıyor:** GTIN bütün firmalar arasında tekil. Hata satırında ürün adı yalnızca ürün aynı firmanınsa veriliyor; aksi halde başka firmanın varlığı sızardı (kural 1).
- **Önizleme kendi düzeninde:** `(focus)` rota grubu yalnızca oturum kontrolü yapıyor; menü ve üst çubuk yok. Pasaport, ayrı bir `NextIntlClientProvider` ile seçilen dilde çiziliyor.

## Karşılaşılan sorunlar ve çözümler
- **V20 ilk denemede düştü:** `import_job` tablosu V1'den beri vardı (hiç kullanılmamıştı). Çözüm: tabloyu yeniden yaratmak yerine `ALTER` ile şekillendirmek; uygulanmış migration'a dokunulmadı.
- **fastexcel'in yazdığı dosya `ZipInputStream` ile okunamadı:** dosya "data descriptor" kullanıyor, akış hâlinde boyut bilinmiyor. Çözüm: güvenlik kontrolleri dosyayı geçici diske yazıp `ZipFile` ile (merkez dizinden) okuyor.
- **`JobWorkerTest` "iki handler" hatası:** yeni çeviri işi, testin sahte handler'ıyla aynı türü kullandı. Çözüm: test yalnızca kendi handler'ıyla bir `JobWorker` kuruyor.
- **Üretilen istemcide içe aktarma tipi `never` çıktı:** `getImport` yalnızca 404'ünü belgeliyordu, springdoc 200'ü yazmadı. Çözüm: `@ApiResponse(200)` eklendi, istemci yeniden üretildi.
- **Öneri işinin başarısızlığı panelden görünmüyordu:** iş hata alınca sessizce DONE oluyordu. Çözüm: iş nedeniyle FAILED bitiyor (`AI_LIMIT_REACHED` / `SUGGESTION_FAILED`), GET bunu son işten okuyor.
- **CI'da içe aktarma saati 3 saat geri çıktı (11:32 / 14:32):** CI makinesi UTC'de, tarih biçimi makinenin saat dilimini kullanıyordu. Testi gevşetmek yerine kod düzeltildi: panelin geri kalanı gibi saat `Europe/Istanbul` ile yazılıyor.
- **Almanca önizlemede "T-SHİRT":** pasaport bölmesi panelin `lang="tr"`'sini miras aldığı için CSS büyük harfi Türkçe kurala göre yaptı. Bölmeye okuyanın dili `lang` olarak verildi.
- **"Lif 0" sütunu:** `fiber` önekiyle eşleme bileşimin `fibers` anahtarını da yakaladı. Tarayıcıda görülüp düzeltildi (tam eşleşme).

## Test
- Backend: 680 test (M10 sonunda 663'tü). Yeni testler `PassportTranslationApiTest` (öneri, onay, kaynak değişince onayın düşmesi, gerçek firmanın AI'a gitmemesi, başarısız öneri ve günlük sınır, başka firma 404) ile `ImportApiTest` (50 satırlık kabul, ipuçları, başka firmanın ürününün adlandırılmaması, şablon dilleri, dosya hataları, başka firma 404, görüntüleyici 403).
- Web: 265 bileşen testi. Yeniler: `translations-section`, `passport-view` (EN tamamı çevrili, DE karışık, TR kaynak), yayın diyaloğu satırı, `imports-page` ve `import-strip`. e2e'de ürünler sayfası görüntüleyici için içe aktarma bağlantısını bekliyor.
- Elle: yerel backend'le çeviri yazıldı (önizlemede EN göründü); 17 satırlık şablon sayfadan yüklendi (12 ürün, 5 hatalı satır, ipuçlarıyla).
- CI: backend, contract, js ve e2e yeşil.

## Ekran görüntüleri
- `docs/haftalik/img/11-ceviriler-light.png`, `11-ceviriler-dark.png`: önizlemede çeviriler, pasaport Almanca.
- `docs/haftalik/img/11-ice-aktarma-light.png`, `11-ice-aktarma-dark.png`: içe aktarma sonucu ve hata tablosu.
- `docs/haftalik/img/11-urunler-serit-light.png`: içe aktarmadan sonra ürünler sayfası.

## Sonraki adım
- **T8, anadil kontrolü:** EN/DE arayüz ve pasaport cümlelerini anadili İngilizce ve Almanca olan birine okutmak (`web/messages/README.md`). Kişi bulununca düzeltmeler işlenecek.
- **Canlı kabul:** pasaportun `?lang=de` ile Almanca açılması canlıda kontrol edilecek. Bu bilgisayardan Vercel ve Render'a TLS bağlantısı kurulamıyor.
- **M12:** detaylı roller, denetim izi, login hız sınırı.
