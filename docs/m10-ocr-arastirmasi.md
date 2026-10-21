# Tarayıcıda OCR araştırması (M10 T10)

**Soru:** Taranmış belge ve fotoğraf bugün kurallarla okunamıyor (`UNREADABLE`, `NO_TEXT_LAYER`). Yalnızca LLM okuyor, o da yalnızca demo firmasında (`LlmGate`). Metni tarayıcıda tesseract.js ile çıkarıp sunucudaki mevcut kurallara (OEKO-TEX, GOTS, GRS, teknik föy) versek, belge üçüncü bir servise gitmeden okunabilir mi?

**Kısa cevap:**
- **Web'de evet.** Türkçe dil dosyasıyla ilk indirme yaklaşık 5 MB. Ön işlemeli bir sayfa masaüstünde 1 sn civarında okunuyor ve sentetik sertifikadaki 9 alanın 9'u doğru çıkıyor.
- **Ön işleme şart.** Gri ton + eşikleme olmadan bozuk bir fotoğraf 20 sn sürüyor ve neredeyse hiçbir şey okunmuyor.
- **Mobil uygulamada (React Native) bu yol yok.** Orada cihaz üstü OCR ayrı bir karar.

Bu belge yalnızca rapordur; repoya kod veya bağımlılık eklenmedi. Karar M11/M12'de (m10-plan §6 karar 5).

## 1. Ne indiriliyor

Sayılar jsDelivr'ın paket listesinden (21.10.2026):

| Parça | Boyut | Not |
| --- | --- | --- |
| `tesseract.js` 7.0.0 | 63 KB + worker 111 KB (küçültülmüş) | Apache-2.0, 15.12.2025'te yayınlandı |
| Çekirdek, yalnızca LSTM, SIMD (`tesseract-core-simd-lstm.wasm`) | 2,87 MB + 125 KB JS | WebAssembly; boyut core 6.1.2'den (npm'de "latest" etiketi hâlâ 6.1.2, 7.0.0 da yayında) |
| Türkçe dil verisi `tur.traineddata.gz` (`4.0.0_best_int`, varsayılan) | 2,14 MB | `4.0.0` (tam sayı olmayan): 8,06 MB |
| İngilizce `eng.traineddata.gz` (`4.0.0_best_int`) | 2,95 MB | Sertifikalar çoğu zaman iki dilli |

- **İlk kullanım:** yalnızca Türkçe ~5,2 MB, Türkçe + İngilizce ~8,2 MB. Sonrasında tarayıcının IndexedDB önbelleğinden gelir.
- **Ana sayfa paketi büyümez:** kütüphane yalnızca belge yükleme anında, dinamik olarak yüklenir.

## 2. Ölçüm

**Koşullar:**
- Uygulamanın içindeki Chromium tarayıcı, masaüstü bilgisayar.
- 150 dpi A4 sentetik sayfa: "ÖRNEK — GEÇERSİZ" GOTS sertifikası, uydurma firma ve numaralar.
- Aranan 9 değer: sertifika no, firma, kuruluş, iki tarih, lif bileşimi ve Türkçe karakter sınaması (Çığ, İzmir, IĞDIR).
- Ölçüm sayfası repoda değil; tek seferlik bir deneme.

| Görüntü | Dil | Süre (sayfa) | Güven | Doğru |
| --- | --- | --- | --- | --- |
| Temiz | tur | 1,2 sn (ikinci sayfa 1,0 sn) | 94 | 9/9 |
| Temiz | tur+eng | 1,4 sn | 94 | 9/9 |
| Orta bozulma (2° eğik, 0,8 px bulanık, düşük kontrast, gürültü ±10) | tur | 1,7 sn | 93 | 9/9 |
| Orta bozulma + **ön işleme** (gri ton, Otsu eşikleme) | tur | 0,9 sn | 91 | 9/9 |
| Ağır bozulma (1,2 px bulanık, gürültü ±25) | tur | **20,2 sn** | 18 | **2/9** |
| Ağır bozulma + **ön işleme** | tur | 0,9 sn | 91 | 9/9 |

- **Hazırlık süresi:** worker ve dil dosyası ilk açılışta 3,7 sn (indirme dahil), önbellekten 0,2 sn. Türkçe + İngilizce birlikte 5,1 sn.
- **Ön işleme belirleyici:** gürültülü fotoğrafta motor her lekeyi harf sanıyor, hem yavaşlıyor hem bozuluyor. Siyah-beyaza çevirmek ~20 satırlık canvas kodu ve ek bağımlılık istemiyor.
- **Telefonda ölçülmedi.** Orta segment bir Android'de 3–5 kat yavaşlık beklenir: ön işlemeli sayfa başına ~3–5 sn. Gerçek sayı, telefondaki kabul denemelerinde (M8/M9) web tedarikçi sayfasıyla ölçülmeli.
- **Gerçek fotoğraf sentetikten zordur.** Gölge, kıvrık kâğıt, perspektif ve mühür/imza üstündeki metin denenmedi. Bunlar için kırpma ve perspektif düzeltmesi gerekebilir; mobil uygulama bunu zaten yapıyor (M8).

## 3. Güvenlik ve gizlilik

- **Belge cihazdan çıkmadan okunur.** Gerçek firmanın belgesi için LLM'siz tek otomatik okuma yolu bu; Gemini kuralına (yalnızca demo verisi) dokunmaz.
- **Varlıklar kendi alan adımızdan sunulmalı.** tesseract.js varsayılan olarak çekirdeği ve dil dosyasını jsDelivr'dan indirir. Üçüncü taraf istek ve sürüm kayması olmasın diye dosyalar `web/public/ocr/` altında, sabit sürümle tutulmalı (`workerPath`, `corePath`, `langPath`). Vercel ücretsiz katmanında ~6 MB statik dosya sorun değil.
- **CSP:** web'de henüz bir Content-Security-Policy yok. İleride eklenirse `'wasm-unsafe-eval'` ve `worker-src blob:` gerekir.
- **İstemcinin metni güvenilmez girdidir.** Tedarikçi gönderilen metni değiştirebilir. Bu yeni bir risk değil, çünkü dosyanın kendisi de tedarikçiden geliyor. Yine de:
  - Sunucu metni olduğu gibi kabul etmez, aynı kural motorundan geçirir (satır başı etiket, iki nokta, tarih kontrolü; talimat cümlesi alan sayılmaz).
  - Okuma yöntemi ayrı işaretlenir (`extractionMethod: OCR_CLIENT`) ve güven en çok 0,75 olur: arayüzde her alan sarı.
  - Onaylayan kişi alanları özgün görüntüyle yan yana görür ("AI önerir, insan onaylar" değişmez).

## 4. Sınırlar

- **PDF okumaz.** tesseract.js yalnızca görüntü alır. Taranmış PDF için önce pdf.js ile sayfayı görüntüye çevirmek gerekir (+~1 MB); bu araştırmada yok.
- **Mobil uygulama (Expo/React Native):** WebAssembly worker çalıştırmıyor. Cihaz üstü OCR için yerel bir modül gerekir (ör. Google ML Kit Text Recognition: ücretsiz ve cihaz üstü, ama yeni bir üçüncü taraf bağımlılığı, onay ister). Mobilde bugünkü yol değişmez: fotoğraf sunucuya, sunucuda kurallar ve kapı açıksa LLM.
- **El yazısı, tablo düzeni ve mühür altı metin** güvenilir okunmaz.
- **Sunucuda OCR yine reddedilir.** M5'teki gerekçe geçerli: Render'ın 0,1 CPU / 512 MB'lik kabında sayfa başına 10–30 sn ve yüzlerce MB bellek.

## 5. Öneri

Bu yol seçilirse (M11/M12):

1. **Kapsam:** web'de tedarikçi sayfası ve panel; yalnızca JPEG/PNG. Yükleme sırasında tarayıcıda ön işleme ve OCR yapılır, metin dosyayla birlikte `clientText` olarak gider. OCR 15 sn'yi geçerse metinsiz yüklenir (bugünkü davranış).
2. **Backend:** `clientText` yalnızca görüntü belgelerde kabul edilir (en çok 20 000 karakter). Okuma işi, metin katmanı yoksa bunu kural motoruna verir. Yöntem `OCR_CLIENT`, güven tavanı 0,75. LLM, kapı açıksa yalnızca kurallar bir şey bulamazsa çalışır.
3. **Web:** tesseract.js ve varlıkları kendi alan adından, sabit sürümle; dinamik yükleme; "Belge okunuyor…" durumu. Bunun için tasarım gerekir (yükleme kartında bir durum daha).
4. **Test:** sentetik görüntü belgeleriyle altın testler (sunucu tarafı, metin girdi olarak); web'de mock'lu worker ile bileşen testi.
5. **Tahmini iş:** 2–3 gün, tasarım dahil değil.

**Kullanıcı kararı:** yeni bağımlılık (tesseract.js, Apache-2.0) ve web'e ~6 MB statik dosya. Mobil için ayrıca cihaz üstü OCR kararı.

## Kaynaklar

- tesseract.js: https://github.com/naptha/tesseract.js (sürümler, PDF desteği yok, worker kullanımı)
- Dil verisi boyutları: https://www.jsdelivr.com/package/npm/@tesseract.js-data/tur
- Çekirdek boyutları: https://www.jsdelivr.com/package/npm/tesseract.js-core
- Önceki karar: `docs/m5-plan.md` (OCR M5'te yok, gerekçe)
