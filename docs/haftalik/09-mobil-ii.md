# 09 — Mobil II: QR, hızlı onay, bildirim, yükleme kuyruğu

**Kilometre taşı:** M9  ·  **Tarih aralığı:** 21.10.2026  ·  **Canlı link:** API Render'da (merge ile canlıya çıkar); uygulama Android geliştirme sürümü (EAS, APK) ve Expo Go

## Yapılanlar
- **Plan ve tasarım (PR #73, #76):** `docs/m9-plan.md`, `docs/m9-tasarim-brifi.md` → Claude Design v0.9 (çerçeve 101–107). Firebase ve EAS kurulum rehberi: `docs/mobil-push-kurulumu.md`.
- **Backend (PR #74, #75):**
  - **QR'dan parti:** `GET /batches/lookup?gtin=&batchNo=`. Başka firmanın partisi, olmayan parti ve bozuk kod aynı şekilde 404.
  - **Push token uçları:** `PUT /me/push-tokens` (telefon başka kullanıcıya geçince token ona taşınır) ve `DELETE /me/push-tokens?token=`.
  - **`PUSH_NOTIFY` işi:** Expo push servisine `RestClient` ile gider. Alıcılar firmanın OWNER/ADMIN'i, her biri kendi dilinde (`i18n/push*.properties`). Mesajlar 100'lük gruplarla gönderilir; `DeviceNotRegistered` gelen token silinir.
  - **Tetikleyiciler:** tedarikçi gönderimi; günlük sertifika taramasında firma başına tek özet.
  - **V15:** `document.client_upload_id`. Fotoğraf yüklemesinde `Idempotency-Key`: aynı anahtar ikinci belge açmaz, ilk belgeyi 200 ile döner.
- **Mobil:**
  - **Geliştirme sürümü (PR #77):** EAS projesi, `expo-dev-client`, `expo-notifications`, `expo-file-system`, `expo-network`, `app.config.js` ile `google-services.json`, `eas.json`.
  - **Tara, parti özeti, adım inceleme (PR #78):**
    - Tara: herhangi bir alan adındaki GS1 Digital Link okunur. Kendi parti → özet; başkasınınki → **bizim** pasaport sayfamız (koddaki alan adı açılmaz); başka kod → yalnızca gösterilir.
    - Parti özeti: skor ve eşik, uyarılar, adımlar.
    - Adım inceleme: veri satırları, belgeler, Onayla. Düzeltme iste: web'in hazır gerekçeleriyle, gerekçe zorunlu. Ardından yeni bağlantı oluşturulur ve WhatsApp'a ya da sistem paylaşımına gider.
  - **Bildirimler (PR #79):**
    - İzin açıklaması bir kez gösterilir; ret durumunda ayarlara yönlendirilir.
    - Uygulama açıkken kendi banner'ımız çıkar.
    - Profil'de açma/kapama var. Çıkışta telefonun token'ı silinir.
    - Bildirimden yalnızca görevler ya da adım incelemesi açılabilir.
  - **Yükleme kuyruğu (PR #80):**
    - Sayfalar uygulamanın kalıcı klasöründe bekler. Bağlantı gelince, uygulama öne gelince ve 30 sn / 2 dk / 10 dk aralıklarla yeniden denenir; her seferinde aynı anahtar gider.
    - Ekranlar: kuyruk, "sıraya alındı", Görevler'de şerit, çıkışta bekleyen sayı.

## Teknik kararlar
- **Tek QR biçimi:** parti etiketi ile ürün QR'ı aynı GS1 Digital Link'tir. Kod okununca bizim sayfamız açılır; QR'daki alan adına güvenilmez (sahte alan adıyla oltalamaya kapalı).
- **"Bildirimden onay" bir dokunuş daha:** bildirime dokununca veri ekranı açılır, onay orada verilir. Bildirimdeki düğmeyle veriyi görmeden onaylanmaz.
- **Uzak push Expo Go'da yok:** Expo'nun dokümanı bunu açıkça söylüyor; geliştirme sürümü şart oldu.
  - **Android:** ücretsiz EAS derlemesi ve Firebase (FCM) yeterli. Firebase yeni bir servis olarak kullanıcı onayıyla eklendi.
  - **iOS:** ücretli Apple hesabı istediği için kapsam dışı (kullanıcı kararı).
- **`google-services.json` repoda değil:** içi gizli değil, ama içindeki Google API anahtarı GitHub'ın taramasına takılır. EAS'ta "secret" dosya değişkeni olarak tutuluyor.
- **Çift yükleme sunucuda engelleniyor:** sunucu PDF'i her seferinde yeniden ürettiği için içerik özeti aynı sayfaları tanımıyordu. İstemcinin anahtarı ve kısmi benzersiz indeks bu yüzden eklendi.
- **Yalnızca uygulama açıkken kuyruk:** arka plan görevi M9'da yok.

## Karşılaşılan sorunlar ve çözümler
- **Köşeli parantezli token adres yolunda 400 verdi:** `ExponentPushToken[…]` silme ucunda yoldan sorgu parametresine taşındı; plan da güncellendi.
- **CI'da push testi kırıldı, yerelde geçti:**
  - Kök neden: CI bütün testleri tek veritabanında koşuyor. Kuyrukta başka testlerden kalan işler vardı, `runPending()` da tek çağrıda sınırlı sayıda iş çalıştırıyordu; "bir kez hata ver" ayarını başka bir testin işi tüketti.
  - Çözüm: kuyruk tamamen boşaltılıyor, sahte istemcinin hatası yalnızca o testin telefonlarına bağlı.
- **pnpm, yayın yaşı korumasını sessizce deldi:** `expo-network`'ün o gün yayınlanmış sürümü için muafiyet satırı eklemişti. Satır geri alındı, bir önceki sürüm sabitlendi.
- **Aynı yerel modülden iki sürüm vardı:** `expo-notifications` daha yeni bir `expo-constants` getirmişti. expo-doctor yakaladı, sürümler eşitlendi. Böyle kalsaydı yerel derleme bozulabilirdi.
- **Keystore ekranı:** EAS sitesi Android imza anahtarı istedi. Gerek yoktu; ilk derlemede EAS kendisi üretti.
- **Diğerleri:**
  - **Eski tip dosyası:** `.expo` altındaki eski tipli rota dosyası yeni rotaları tanımıyordu; silindi, CI'da zaten yok.
  - **React Compiler kuralı:** render sırasında ref okumaya izin vermedi; animasyon değeri `useState` ile oluşturuldu.
  - **Türkçe ek:** sayıya göre değişen ek ("4'ü / 1'i") yerine eksiz cümle kuruldu.

## Test
- **Backend:** 13 yeni test.
  - `BatchLookupTest` 3, `PushTokenApiTest` 3.
  - `PushNotifyJobTest` 4: alıcı seçimi ve dil, silinen token, incelenmiş adım, 100'lük bölme ve tekrar, günlük özet.
  - `PhotoUploadKeyTest` 3: aynı anahtar, adım ve firma ayrımı, eşzamanlı iki istek.
  - `JobWorkerTest`'teki örnek iş türü değiştirildi.
- **Mobil:** 78 Jest testi (+41).
  - Lib: QR çözümleme, veri satırları, bildirim mantığı, kuyruk motoru.
  - Ekranlar: Tara, parti özeti, adım inceleme, bildirim ekranları, kuyruk.
- **Paket ve CI:** `expo export --platform android` sorunsuz; CI yeşil. EAS geliştirme sürümü başarıyla derlendi (APK).
- **Kabul denemesi henüz yapılmadı:** tedarikçi gönderir → telefona bildirim → bildirimden onay. Kullanıcı kararıyla M10'dan sonra yapılacak; adımlar hazır.

## Ekran görüntüleri
- Telefonda kabul denemesinde alınacak: `docs/haftalik/img/09-*.png`.

## Sonraki adım
- M10: demo hazırlığı.
- Sonra: M9 kabul denemesi (Android telefon, geliştirme sürümü, `PUSH_ENABLED=true`) ve M8'in canlı API ile tekrarı.
