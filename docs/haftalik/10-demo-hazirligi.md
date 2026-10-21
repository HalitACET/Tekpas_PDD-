# 10 — Demo hazırlığı

**Kilometre taşı:** M10  ·  **Tarih aralığı:** 21.10 – 22.10.2026  ·  **Canlı link:** web Vercel'de, API Render'da (merge ile canlıya çıkar)

## Yapılanlar
- **Plan ve brif (PR #82):** `docs/m10-plan.md` (T1–T12), bakım bilgisi için `docs/m10-tasarim-brifi.md` (Claude Design v1.0).
- **T1 Gerçekçi demo verisi (PR #83):** `DemoScenario` (yalnızca `demo` profili, V16 `demo_scenario`). Beş parti, demonun beş anı:
  - KP-2026-0901-A yayında (pasaport gerçek `PassportService.publish` ile).
  - KP-2026-0922-A yayına hazır (%100).
  - KP-2026-0915-A'da kumaş gönderilmiş, AI'ın okuduğu GOTS belgesi onay bekliyor.
  - KP-2026-0929-A'da LIF-01.
  - KP-2026-0918-A taslak, tedarikçi atanmamış.
  - Uludağ Boya'nın sertifikası 20 gün sonra bitiyor.
  - Belgeler PDFBox ile üretilen "ORNEK - GECERSIZ" PDF'leri; AI çağrılmıyor.
  - Senaryo bir kez uygulanıyor; sonraki açılışlar demo sırasında yapılan değişikliklere dokunmuyor.
- **T2 Düzeltme formu (PR #84):** `PublicRejection`'a önceki gönderenin adı ve görevi eklendi. Tedarikçinin formu bunlarla dolu açılıyor.
- **T3 İlgili kişi (PR #85):** V17 `company_supplier.contact_name`. Telefon gibi bağa ait, yani her üretici kendi kişisini tutar.
  - **Web:** tedarikçi formunda alan, listede ad; veri talebi penceresinde (46a) kişi üstte, WhatsApp mesajı "Merhaba {kişi}," ile başlıyor.
  - **Mobil:** düzeltme ekranında alıcı satırı ve selamlama.
- **T4 e2e CI'da (PR #86):** yeni `e2e` job'u. Next build alınıyor, Playwright Chrome ile 138 test mock API'ye karşı koşuyor (~5 dk). Başarısızlıkta rapor, ekran görüntüsü ve trace artefakt olarak yükleniyor.
- **T6 Kayıtsız dosya taraması (PR #87):** `FileStorage.list` (Supabase'te klasör klasör, 1000'lik sayfalarla).
  - Günlük temizlik işinin sonunda, hiçbir belgenin göstermediği `docs/` nesneleri log'a yazılıyor; 1 saatten yeni nesneler atlanıyor.
  - Silmek için `STORAGE_REMOVE_ORPHANS=true` gerekiyor.
- **T10 OCR araştırması (PR #88):** `docs/m10-ocr-arastirmasi.md`. Tarayıcıda tesseract.js sentetik Türkçe sertifikayı ~1 sn'de 9/9 okudu, ama yalnızca gri ton + eşikleme ön işlemesiyle. Kod eklenmedi; karar M11/M12'de.
- **T5 Açılış ölçümü (PR #89):** `docs/m10-acilis-olcumu.md` (ayrıntı aşağıda). Prod'a bir şey uygulanmadı.
- **T9 Cila (PR #90):** demo verisiyle bütün ekranlar gezildi. Çevrilmemiş anahtar, hata kutusu veya konsol hatası yok. Tek bulgu düzeltildi: pasaport sayfasında GS1 satırı 375 px'te parti numarasının kısa çizgisinden bölünüyordu.
- **T11 Demo senaryosu (PR #91):** `docs/m10-demo-senaryosu.md`: 5 dakikalık akış, yedek yollar, prova ve demo günü kontrol listesi.

## Teknik kararlar
- **Demo verisi kodda, sürümlü:** her ortam aynı başlangıçla açılır.
  - Senaryo pasaportu olan partiye dokunmaz, çünkü yayınlanmış pasaport değişmez.
  - Bu yüzden prova canlıda değil yerelde yapılır. Demodan sonra yeni bir "yayına hazır" parti gerekirse senaryo sürüm 2 ile açılır.
- **Kayıtsız dosya taraması yeni bir iş türü değil:** günlük `DOCUMENT_CLEANUP` işinin ikinci adımı olarak çalışıyor; yeni bir iş türü migration isterdi. Varsayılan yalnızca rapor; silme bilinçli bir bayrakla açılıyor.
- **İlgili kişiye unvansız hitap:** tasarımdaki "Murat Bey" gibi unvanlar için cinsiyet tahmini gerekirdi; mesaj kayıtlı adla hitap ediyor.
- **e2e'de her yerde Google Chrome:** belge önizlemesi Chrome'un PDF görüntüleyicisini kullanıyor, Playwright'ın headless Chromium'unda bu görüntüleyici yok. GitHub'ın runner'ında Chrome zaten kurulu.

## Karşılaşılan sorunlar ve çözümler
- **CI'daki e2e job'u 25 dakikada iptal oldu, testler 4 dakikada bitmişti:**
  - Kök neden: Playwright sunucuyu `pnpm build && pnpm start` ile açıyordu. Testler bitince `pnpm` kapandı ama altındaki `next-server` açık kaldı, job da onu bekledi.
  - Çözüm: CI'da build ayrı adımda alınıyor, sunucu `node …/next start` ile doğrudan açılıyor.
- **CI UTC, testler Türkiye saati bekliyor:** Node'daki mock'lar için `TZ=Europe/Istanbul`, tarayıcı için `timezoneId: "Europe/Istanbul"`.
- **CI'da arada bir kalan mobil klavye testi (PR #92):** CI makinesi yavaş olduğu için yerelde görünmeyen iki zamanlama hatası ortaya çıktı.
  - İlk Tab, çekmecenin odak tuzağı devreye girmeden basılıyordu. Çözüm: odak çekmeceye girene kadar bekleniyor.
  - Menü açılış animasyonu sürerken (ölçek 0,95→1) 44 px'lik düğmeler 42 px ölçülüyordu. Çözüm: ölçüm animasyonlar bitince yapılıyor.
  - İddiaların ikisi de aynı kaldı.
- **Yerelde açık backend e2e'yi bozuyor:** mock'lanmamış istekler 8080'deki gerçek API'ye gidip 401 alıyor. e2e yerelde backend kapalıyken koşulmalı; CI'da backend yok.
- **Açılışın asıl yükü:**
  - Ölçüm: Render'daki imajın aynısı Docker'da 0,1 CPU / 512 MB ile çalıştırıldı, açılış sırasında 3 sn'de bir iş parçacığı dökümü alındı.
  - Lazy init yalnızca işi ilk isteğe kaydırıyor (ilk cevap 162 → 163 sn). Flyway doğrulaması 0,6 sn. Mevcut CDS arşivi %30 kazandırıyor.
  - En pahalı tek kalem: Spring Data JPA'nın 24 `@Query` metnini açılışta ANTLR ile ayrıştırması. Regex tabanlı işleyiciyle ilk cevap 162 → 141 sn (-%13); 654 backend testi yeşil.
  - Değişiklik `exp/query-enhancer` dalında bekliyor; prod'a kullanıcı kararıyla.
- **OCR'da ön işleme belirleyici:** bozuk fotoğraf işlemesiz 20 sn ve 2/9 doğru; Otsu eşiklemeyle 0,9 sn ve 9/9 doğru.
- **Diğerleri:**
  - **Migration numarası kaydı:** planda ilgili kişi V16'ya yazılmıştı, demo senaryosu önce geldiği için V17 oldu; plan düzeltildi.
  - **Test eşleştiricisi:** GS1 satırı iki span'e bölününce Testing Library'nin metin eşleştiricisi tutmadı; test, öğenin tüm metnini karşılaştıracak şekilde yazıldı.

## Test
- **Backend:** toplam 654 test, hepsi yeşil.
  - Yeni testler: demo senaryosu (beş parti, public pasaport 200, LIF-01, bekleyen belge, süresi yaklaşan sertifika, ikinci açılışta değişiklik yok), ilgili kişi, kayıtsız dosya taraması (4), Supabase ve yerel listeleme (3).
- **Web:** birim testleri (form, şema, pasaport) ve e2e (46a'da adlı hitap, tedarikçi formunda ilgili kişi, düzeltme formunda dolu gönderen).
- **e2e artık CI'da:** 138 test, kararsız iki zamanlama hatası giderildi (PR #92).
- **Mobil:** düzeltme ekranı alıcı ve selamlama testi.
- **Henüz yapılmadı:** demo provası ve telefon kabul denemeleri (M8/M9). Kullanıcıyla, sonda.

## Ekran görüntüleri
- Prova sırasında alınacak: `docs/haftalik/img/10-*.png`.

## Kalanlar
- **T8 Bakım bilgisi (ISO 3758):** Claude Design v1.0 bekleniyor.
- **T7 Gerçek istemci IP'si:** canlıda Render loglarında başlık kontrolü (kullanıcı).
- **Kullanıcı kararları:**
  - Regex sorgu işleyicisi (-%13 açılış).
  - Java 25 AOT önbelleği ölçümü.
  - OCR'ın web'e alınması.
  - Demodan sonra sıfırlama yolu.
- **Kabul:** demo senaryosunun Slow 4G ile provası; M8 ve M9 telefon denemeleri.
