# M9 planı — Mobil II

**Hedef:** Sahadaki kullanıcı bir QR'ı okutup partinin özetine ve zincirine ya da herkese açık pasaporta ulaşır. Tedarikçinin gönderdiği veriyi telefondan onaylar ya da düzeltme ister. Yeni veri gelince bildirim alır. Kötü bağlantıda çektiği belge kaybolmaz, bağlantı gelince kendiliğinden yüklenir.

**Kabul (PLAN):** **Tedarikçi veri gönderince üreticinin telefonuna bildirim gelir, bildirimden onaylanır.**

Bu belge plandır; kod yok. Kararlar §10'da; push ile ilgili ikisini kullanıcı verdi (§10.1).

**Dayandığı kurallar:**
- Kural 1: tenant, başka firmanın kaydına 404.
- Kural 3: secret yok.
- Kural 8: metinler çeviri dosyasından.
- `mobile/CLAUDE.md`: QR, hızlı onay/red, push, zayıf bağlantı kuyruğu.
- Kök `CLAUDE.md` "Yapma" bölümü: sormadan yeni üçüncü parti servis eklenmez.

## 1. Mevcut durum

- **Mobil (M8):** giriş, Görevler, belge çekme → yükleme → AI formu → onay. "Tara" sekmesi kapalı ("Yakında").
  - "Onay bekleyen veriler" grubu yalnızca gösterim yapıyor ("Web'de inceleyip onaylayın").
  - Yükleme hatasında yalnızca "Tekrar dene" var; sayfalar bellekte, uygulama kapanınca kaybolur.
- **Adım onayı hazır (M4):**
  - `POST /steps/{id}/approve` ve `POST /steps/{id}/reject` (`reason` zorunlu, `fields` isteğe bağlı). İkisi de yalnızca OWNER/ADMIN; adım `SUBMITTED` değilse 409 `STEP_NOT_SUBMITTED`.
  - Red sonrası tedarikçiye yeni bağlantı gerekir: `POST /steps/{id}/requests` bağlantıyı bir kez döner. Görevler'de bunun için `CORRECTION_NO_LINK` görevi var.
  - Adımın gönderilen verisi `GET /batches/{id}/chain` içinde (`data`, `submission`, `documentCount`). Yeni okuma ucu gerekmez.
- **Pasaport QR'ı (M6):** GS1 Digital Link `{base}/01/{gtin14}/10/{partiNo}`. Aynı adres bir partinin bütün sürümleri için geçerli. Herkese açık sayfa web'de; `GET /public/passports/01/{gtin}/10/{batch}`.
  - Yayından önce bir "parti etiketi" QR'ı üretilmiyor; ayrı bir parti etiketi biçimi de yok.
- **Push altyapısı yarım:** V2'de `push_token` tablosu (kullanıcı, `expo_token` benzersiz, `ANDROID|IOS`, `last_seen_at`) ve `JobType.PUSH_NOTIFY` var. Bunları kullanan kod, token kaydı ucu ve gönderici yok.
- **Bildirim tetikleyebilecek olaylar:** tedarikçinin gönderimi `PublicRequestService.submit` (adım `SUBMITTED`); günlük `CERT_EXPIRY_SCAN` (M7).

## 2. Expo'dan doğrulananlar (docs.expo.dev, SDK 57, 21.10.2026)

- **QR:** `expo-camera`'nın `CameraView`'ı `barcodeScannerSettings={{ barcodeTypes: ["qr"] }}` ve `onBarcodeScanned` ile QR okur; Expo Go'da var. Aynı kodun art arda gelmesini uygulama kendisi süzmeli.
- **Uzak push Expo Go'da yok:** "While in-app notifications are available in Expo Go, remote push notifications … are not." (development builds FAQ). Bildirim almak için bir **geliştirme sürümü** (development build) gerekir:
  - **Android:** EAS Build ve Firebase Cloud Messaging (FCM V1) kimlik bilgisi.
  - **iOS:** ücretli Apple Developer hesabı ("A paid Apple Developer Account is required to generate credentials").
- **Push token:** `getExpoPushTokenAsync({ projectId })`. EAS proje kimliği gerekir; Android 13+'ta önce bildirim kanalı açılır, izin istemi ondan sonra çıkar.
- **Dokunma:** `addNotificationResponseReceivedListener` ve `useLastNotificationResponse`; bildirimdeki `data.url` ile ilgili ekrana gidilir.
  - Bildirime düğme (kategori) eklenebilir. M9'da kullanılmayacak (§10, karar 4).
- **Gönderim:** `POST https://exp.host/--/api/v2/push/send`, en fazla 100 mesajlık dizi, her mesaj için bir "ticket". `DeviceNotRegistered` gelen token bir daha kullanılmaz.
  - Kimlik doğrulama varsayılan olarak yok; EAS panelinden "access token zorunlu" açılabilir.
  - Servisin SLA'sı yok.

## 3. Kapsam

| Var (M9) | Yok |
| --- | --- |
| Tara sekmesi: QR → kendi partisiyse özet ve zincir (yalnızca görüntüleme), değilse herkese açık pasaport uygulama içi tarayıcıda | Web'de yayından önce parti etiketi basma (M10'da gerekirse) |
| Adım inceleme: gönderilen veri, belgeler, "Onayla", "Düzeltme iste" (gerekçe zorunlu, hazır gerekçeler), sonra yeni bağlantıyı paylaşma | Alan alan işaretleme (web'de var; mobilde yalnızca gerekçe ve "belgeler" işareti) |
| Push: veri geldi (OWNER/ADMIN), sertifika süresi doluyor (günlük özet); dokununca ilgili ekran | Bildirimdeki düğmeyle uygulamayı açmadan onay |
| Profil'de bildirim aç/kapat; izin açıklaması ve reddedilmiş izin durumu | Bildirim türü seçimi, sessiz saatler |
| Kalıcı yükleme kuyruğu: çevrimdışı "Yükle" sıraya alır, bağlantı gelince yükler, Görevler'de ve kuyruk ekranında durum | Uygulama kapalıyken arka planda yükleme |
| Geliştirme sürümü (Android, EAS ücretsiz) | iOS push (ücretli Apple hesabı) |

## 4. Backend

### 4.1 QR'dan partiye
`GET /batches/lookup?gtin=&batchNo=`. OWNER, ADMIN, EDITOR ve VIEWER çağırabilir; SUPPLIER 403.
- GTIN 14 haneye normalleştirilir; ürünün GTIN'i ve parti numarası firmada aranır.
- Bulunursa `BatchResponse` döner. Başka firmanın partisi ya da hiç olmayan parti 404 (kural 1: varlık sızmaz). Mobil 404'te herkese açık pasaporta geçer.

### 4.2 Push token'ları
- `PUT /me/push-tokens` `{ token, platform }`: giriş yapan kullanıcıya bağlar.
  - Aynı token başka kullanıcıdaysa (telefonda kullanıcı değişti) bu kullanıcıya taşınır.
  - `last_seen_at` güncellenir. Token biçimi `ExponentPushToken[…]` olarak doğrulanır.
- `DELETE /me/push-tokens?token=…`: çıkışta ve Profil'de bildirim kapatılınca. Yalnızca kendi token'ı silinir, başkasınınki 404.
- Yeni tablo yok.

### 4.3 Gönderim
- **`PushNotifyHandler` (`PUSH_NOTIFY`):**
  - Payload `{ kind, companyId, refId }`. Alıcılar firmanın OWNER/ADMIN kullanıcılarının token'ları.
  - Metin kullanıcının `locale`'ine göre `src/main/resources/i18n/push_{tr,en,de}.properties` dosyalarından gelir (kural 8). `data` alanında uygulama içi yol (`/step/{id}`, `/` gibi).
  - Mesajlar 100'lük dizilerle `ExpoPushClient`'a gider; `RestClient`, SDK yok. `DeviceNotRegistered` gelen token silinir.
  - 429 ve 5xx işin kendi tekrarlarıyla (30 sn, 2 dk) yeniden denenir. Token yoksa çağrı yapılmaz.
- **Tetikleyiciler (aynı transaction'da `enqueue`):**
  1. **`STEP_SUBMITTED`:** `PublicRequestService.submit`. Metin: "Ege İplik verisini gönderdi · KP-2026-0915-A · İplik". Dokununca adım inceleme.
  2. **`CERTS_EXPIRING`:** `CERT_EXPIRY_SCAN` gününde yeni dolmaya giren sertifika varsa firma başına tek özet. Metin: "2 sertifikanın süresi 30 gün içinde doluyor". Dokununca Görevler.
- **Kilit ekranında ne görünür:** parti no, adım ve tedarikçi adı. Kişisel veri, belge içeriği ve sertifika numarası yok.
- **Yapılandırma:**
  - `PUSH_ENABLED` (varsayılan kapalı): yerelde ve testte gönderici sahte.
  - `EXPO_ACCESS_TOKEN` isteğe bağlı. EAS'ta "access token zorunlu" açılırsa gerekir; secret, yalnızca Render'da.

### 4.4 Çift yüklemeye karşı (kuyruk için)
- **Sorun:** kuyruk aynı yüklemeyi cevap kaybolunca yeniden gönderir. Sunucu PDF'i her seferinde yeniden ürettiği için içerik özeti (`UNIQUE (step_id, sha256)`) aynı sayfaları tanımaz.
- **Çözüm:** `POST /steps/{id}/documents/photos` isteğe bağlı `Idempotency-Key` başlığı (UUID) alır.
  - V15: `document.client_upload_id UUID` ve `(company_id, client_upload_id)` benzersiz.
  - Aynı anahtar ikinci kez gelirse yeni belge açılmaz, ilk belge 200 ile döner.

## 5. Mobil uygulama

- **Tara (sekme açılır):**
  - `CameraView` yalnızca QR okur; aynı kod 2 sn içinde tekrar gelirse yok sayılır.
  - Okunan adres GS1 Digital Link mi diye çözülür. Herhangi bir alan adında `/01/{gtin}/10/{parti}` yolu aranır; GTIN kontrol hanesi doğrulanır.
  - Sonra `lookup` çağrılır:
    - Bulunursa **parti özeti** (`batch/[id]`): ürün, durum, uyum skoru, açık uyarı sayısı, adımlar (durum, tedarikçi, belge sayısı). Bir adıma dokununca adım inceleme. Yalnızca görüntüleme; düzenleme web'de.
    - 404 ise herkese açık pasaport `expo-web-browser` ile uygulama içinde açılır. Paket zaten kurulu.
    - GS1 değilse "Bu kod tanınmadı".
  - İzin ekranı ve reddedilmiş izin durumu M8 kamerasından alınır.
- **Adım inceleme (`step/[id]`):**
  - Görevler'deki "Onay bekleyen veriler" satırları, parti özeti ve bildirim buraya açılır.
  - Gönderilen veri adım tipine göre özet halinde gösterilir: lif bileşimi, iplik no, menşe, enerji vb. Gönderen ve zaman, belgeler (dokununca M8 formu) da görünür.
  - **OWNER/ADMIN:**
    - "Onayla": tek dokunuş, ardından başarı.
    - "Düzeltme iste": alttan açılan panel. Web'in hazır gerekçeleri ("Lif oranı uyuşmuyor", "Belge okunaksız", "Sertifika süresi dolmuş") ve serbest metin; gerekçe zorunlu.
    - Red sonrası "Yeni bağlantı gönder": `POST /steps/{id}/requests`, sonra WhatsApp (`https://wa.me/{telefon}?text=…`) ya da sistem paylaşımı (React Native `Share`).
  - **EDITOR/VIEWER:** veriyi görür, düğmeler kapalı ("Onay yöneticide").
  - Adım bu arada değiştiyse (409 `STEP_NOT_SUBMITTED`) "Bu veri zaten incelendi" denir.
- **Bildirimler (`expo-notifications`):**
  - İlk girişten sonra bir kez açıklama ekranı ("Yeni veri gelince haber verelim"), ardından sistem izni.
  - İzin verilirse token `PUT /me/push-tokens`'a gider; çıkışta ve Profil'de kapatılınca silinir.
  - Uygulama açıkken gelen bildirim üstte banner olarak gösterilir. Dokunma `data.url`'e gider; uygulama kapalıyken açılış da aynı yolu izler.
  - **Expo Go'da** (`Constants.executionEnvironment`) token alınmaz. Profil'de "Bildirimler yalnızca uygulamanın kurulu sürümünde" notu görünür; çökme olmaz.
- **Yükleme kuyruğu (`expo-file-system`, `expo-network`):**
  - Sayfalar yüklenene kadar uygulamanın kendi klasöründe durur (önbellekte değil; sistem silebilir). Kuyruk bilgisi bir JSON dosyasında.
  - **Ne zaman sıraya girer:** çevrimdışı "Yükle", ya da yükleme bağlantı yüzünden düşerse.
  - **Ne zaman yeniden denenir:** bağlantı gelince, uygulama öne gelince ve 30 sn → 2 dk → 10 dk aralıklarla. Her denemede aynı `Idempotency-Key` gider.
  - **Ret:** sunucu reddederse (409 yayınlanmış parti, 413…) öğe "Yüklenemedi" olur ve sebebi yazılır; kullanıcı siler.
  - **Ekranlar:**
    - Görevler'de şerit: "2 belge yüklenmeyi bekliyor · bağlantı yok".
    - Kuyruk ekranı: öğe, durum, yüzde, sil.
    - Yükleme sonucu: okunan belge Görevler'deki "Onayınızı bekleyen belgeler" grubuna düşer. Kuyruktan yüklenen belgenin formu kendiliğinden açılmaz.
  - **Çıkış:** sayfalar silinir; çıkış onayında bekleyen sayı yazılır.
- **Geliştirme sürümü:**
  - `expo-dev-client`, `app.json`'da `android.package`, EAS proje kimliği.
  - FCM V1 kimlik bilgisi EAS'a yüklenir; repoya girmez (kural 3).
  - Ücretsiz EAS Build ile Android APK. Expo Go M8 akışları için kullanılmaya devam eder.

## 6. Ölçüm (kabul)

Telefonda geliştirme sürümü, Render'daki ya da yerel backend, `PUSH_ENABLED=true`, demo firması.
1. Tedarikçi bağlantısından (web) veri gönderilir.
2. Telefona bildirim gelir; gönderimden bildirime kadarki süre kaydedilir.
3. Bildirime dokunulur → adım inceleme → "Onayla".
4. Web'de adım "Onaylandı" görünür.

Video ya da ekran görüntüleriyle haftalık nota.

## 7. Test

- **Backend:**
  - `lookup`: kendi parti, başka firma 404, GTIN normalleştirme, SUPPLIER 403.
  - Push token: kayıt, kullanıcı değiştirme, silme, başkasının token'ı 404, biçim 400.
  - `PushNotifyHandler`, sahte `ExpoPushClient` ile: yalnızca aynı firmanın OWNER/ADMIN'i, dil, `DeviceNotRegistered` → silme, token yoksa çağrı yok, 100'lük bölme.
  - Tetikleyiciler: gönderim → iş kuyrukta; tarama → firma başına tek özet.
  - `Idempotency-Key`: ikinci istek aynı belge, başka firmanın aynı anahtarı ayrı.
- **Mobil:**
  - GS1 çözümleme: birim testleri, farklı alan adları, bozuk GTIN.
  - Tara ekranı durumları; adım inceleme (onay, gerekçesiz red engeli, 409, roller).
  - Bildirim yönlendirmesi: sahte response.
  - Kuyruk: saklama/geri yükleme, yeniden deneme, ret, aynı anahtar, çıkışta temizleme. Kamera, ağ ve dosya sistemi mock'lanır.
- **Uçtan uca:** §6 telefonla.

## 8. Görevler ve sıra

| # | İş | Bağımlılık |
| --- | --- | --- |
| T0 | Tasarım brifi → Claude Design v0.9 (mobil ekranlar bunu bekler) | |
| T1 | Backend: `lookup` + push token uçları + testler | |
| T2 | Backend: `PushNotifyHandler`, `ExpoPushClient`, tetikleyiciler, `push_*.properties` + testler | T1 |
| T3 | Backend: `Idempotency-Key` (V15) + testler | |
| T4 | Mobil: Tara sekmesi, parti özeti | T0, T1 |
| T5 | Mobil: adım inceleme, onay/red, yeni bağlantı paylaşımı | T0 |
| T6 | Mobil: bildirimler (izin, token, yönlendirme), geliştirme sürümü | T0, T2, §10.1 |
| T7 | Mobil: yükleme kuyruğu | T0, T3 |
| T8 | Kabul ölçümü, haftalık not, README, PLAN | hepsi |

## 9. Riskler

- **Push için Expo Go yetmez.** Geliştirme sürümü ve FCM kurulumu gerekir. Kullanıcının telefonu iPhone ise ücretli Apple hesabı olmadan bildirim alınamaz (§10.1).
- **Expo Push Service'in SLA'sı yok.** Bildirim gecikebilir. Ölçümde süre kaydedilir; bildirim gelmezse Görevler zaten aynı işi gösterir.
- **Kuyrukta dosya kaybı:** önbellek klasörü sistemce silinebilir. Sayfalar kalıcı klasöre taşınır, yükleme bitince silinir.
- **Render uykusu:** bildirim işi sunucu uyanıkken çalışır. Gönderim zaten sunucuyu uyandıran bir istekle geldiği için gecikme yok.

## 10. Kararlar (itiraz edilebilir)

1. **Tek QR biçimi:** parti etiketi ile ürün QR'ı aynı GS1 Digital Link'tir. Kendi partisiyse iç özet açılır, değilse herkese açık pasaport. Ayrı bir "parti etiketi" kodu icat edilmez.
2. **Hızlı onay mobilde, alan işaretleme web'de:** mobilde gerekçe zorunlu ve hazır gerekçeler var; tek tek alan işaretleme yok.
3. **Bildirim yalnızca OWNER/ADMIN'e:** onaylayabilecek kişilere gider. EDITOR ve VIEWER M9'da bildirim almaz.
4. **"Bildirimden onay" = bildirime dokun → adım inceleme → "Onayla".** Bildirimdeki düğmeyle veriyi görmeden onay verilmez; insan veriye bakar.
5. **Kuyruk yalnızca uygulama açıkken çalışır.** Arka plan görevi M9'da yok.
6. **Çift yükleme sunucuda önlenir** (`Idempotency-Key`); istemcinin "bir kez gönderdim" varsayımına güvenilmez.
7. **Yeni bağımlılıklar yalnızca Expo'nun kendi modülleri:** `expo-notifications` (CLAUDE.md yığınında var), `expo-dev-client`, `expo-file-system`, `expo-network`. Hepsi `npx expo install` ile, ücretsiz.

### 10.1 Kullanıcının verdiği kararlar (21.10.2026)
- **A. Firebase (FCM) onaylandı.** Android'de push için Google'ın Firebase projesi (ücretsiz) kullanılır; kimlik bilgisi yalnızca EAS'ta durur, repoya girmez.
- **B. Kabul Android telefonda, geliştirme sürümüyle yapılır.** iOS push (ücretli Apple hesabı) kapsam dışı.
