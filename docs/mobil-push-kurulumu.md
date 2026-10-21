# Mobil push kurulumu: Firebase (FCM) ve EAS geliştirme sürümü

M9'da telefona bildirim gönderebilmek için yapılan tek seferlik kurulum (`docs/m9-plan.md` §2, §10.1). Hesaplar kullanıcınındır; anahtarlar **repoya ve sohbete girmez** (CLAUDE.md kural 3).

**Neden gerekli:** Expo Go sunucudan gelen (uzak) bildirimleri almıyor. Bunun için uygulamanın kendi "geliştirme sürümü" (development build) gerekiyor. Android'de bildirimleri Google'ın Firebase Cloud Messaging (FCM) servisi taşıyor.

**Ne kadar sürer:** Hesaplar açıkken 20–30 dakika. İlk derleme ayrıca EAS kuyruğunda 15–45 dakika bekleyebilir.

**Ne gerekir:**
- Bir Google hesabı (Firebase için).
- Bir Expo hesabı (ücretsiz).
- Bir Android telefon.

## Sabit değerler

| Ne | Değer |
| --- | --- |
| Android paket adı | `com.tekpas.mobile` (kod adı `tekpas` değişmez; sonradan değiştirilemez) |
| Expo proje adı (slug) | `tekpas` (`mobile/app.json`'daki değer) |
| Firebase proje adı | `KozaPass` (istediğiniz başka bir ad da olabilir) |

## Sizin yapacaklarınız

### 1. Expo hesabı ve giriş
1. [expo.dev/signup](https://expo.dev/signup) adresinden ücretsiz hesap açın.
2. Bu bilgisayarda terminalde (`D:\projects\tekpas\mobile` klasöründe) giriş yapın. Kullanıcı adı ve şifreyi terminal sorar; şifreyi sohbete yazmayın.
   ```bash
   npx eas-cli@latest login
   ```
3. Kontrol: aşağıdaki komut kullanıcı adınızı yazmalı.
   ```bash
   npx eas-cli@latest whoami
   ```

### 2. Firebase projesi ve Android uygulaması
1. [console.firebase.google.com](https://console.firebase.google.com) → **Create a project** (Proje oluştur).
2. Ad `KozaPass`. Google Analytics'i **kapatın** (gerekmiyor) → **Create project**.
3. Proje açılınca ortadaki **Android** simgesine tıklayın (Uygulama ekle → Android).
4. **Android package name** alanına tam olarak `com.tekpas.mobile` yazın. Takma ad `KozaPass`. SHA-1 alanını boş bırakın → **Register app**.
5. **Download google-services.json** düğmesiyle dosyayı indirin. Sonraki "SDK ekle" adımlarını **atlayın** (Next → Next → Continue to console); Expo bunları kendisi yapar.
6. İnen dosyayı tam olarak şu yola koyun: `D:\projects\tekpas\mobile\google-services.json`. Git bu dosyayı yok sayar (`.gitignore`), commit edilmez.

### 3. Servis hesabı anahtarı (gizli)
1. Firebase konsolunda sol üstteki dişli → **Project settings** → **Service accounts** sekmesi.
2. **Generate new private key** → **Generate key**. Bir JSON dosyası iner (adı `kozapass-firebase-adminsdk-….json` gibi).
3. Bu dosya **gizlidir**:
   - Repo klasörünün **dışında** saklayın, ör. `Belgeler\kozapass-gizli\`.
   - Commit etmeyin, sohbete yapıştırmayın, kimseyle paylaşmayın.
   - Yalnızca 5. adımda EAS'a yüklenir.

### 4. Bana haber verin
1–3 bitince "Firebase ve Expo hazır" yazmanız yeterli. Anahtar ya da dosya içeriği göndermeyin.

Bu adımda ben şunları yaparım (T6):
- `npx eas-cli@latest init` ile Expo projesini oluşturur ve `mobile/app.json`'a proje kimliğini yazarım.
- Paket adını, `expo-dev-client`'ı, `expo-notifications`'ı ve derleme profilini (`eas.json`) eklerim.
- `google-services.json`'ı EAS'tan okuyan `app.config` ayarını yaparım.

### 5. Anahtarları EAS'a yükleme (proje oluşturulduktan sonra)
[expo.dev](https://expo.dev) → projeniz (`tekpas`) → **Project settings**.

1. **Servis hesabı anahtarı:**
   1. **Credentials** → **Android** → **Add application identifier** → `com.tekpas.mobile`.
   2. **Service credentials** → **FCM V1 service account key** → **Add a service account key** → **Upload new key**.
   3. 3. adımdaki gizli JSON dosyasını seçin → **Save**.
   4. Kontrol: "FCM V1 service account key" altında anahtar görünmeli.
2. **google-services.json (dosya değişkeni):**
   1. **Environment variables** → **Add Variables**.
   2. Ad: `GOOGLE_SERVICES_JSON`. Tür: **File**; `mobile/google-services.json` dosyasını yükleyin.
   3. Görünürlük (visibility): **Secret**. Ortamlar (environments): **development** (ileride **preview** ve **production** da).
   4. **Save**.

### 6. Geliştirme sürümünü derleme ve telefona kurma
1. Derlemeyi ben başlatırım (sizin onayınızla, ücretsiz kotadan bir derleme harcar):
   ```bash
   npx eas-cli@latest build --platform android --profile development
   ```
2. Derleme bitince expo.dev'de ve terminalde bir bağlantı ve QR çıkar.
3. Android telefonda QR'ı kamerayla okutun → APK'yı indirin → kurun. Telefon "bilinmeyen kaynaklardan uygulama yükleme" izni isterse yalnızca bu kurulum için verin.
4. Telefonda **KozaPass** adlı yeni bir uygulama görünür. Bu, Expo Go'nun yerine geçen kendi uygulamamızdır (simgesi farklı olabilir).
5. Bilgisayarda geliştirme sunucusunu başlatın (M8'deki gibi, bilgisayarın Wi-Fi adresiyle):
   ```bash
   pnpm --filter mobile start
   ```
6. Telefondaki KozaPass uygulamasını açıp sunucuya bağlanın: QR'ı uygulamanın içinden okutun ya da listeden seçin.

### 7. Backend'de bildirimleri açma (kabul denemesi için)
Backend'i başlatırken, M8'deki `LLM_*` değişkenlerine ek olarak:
```powershell
$env:PUSH_ENABLED = "true"
```
`EXPO_ACCESS_TOKEN` yalnızca expo.dev'de "Enhanced security for push" açılırsa gerekir; varsayılan olarak gerekmez.

## Sınırlar ve notlar
- **Ücretsiz EAS planı:** 15 Android derlemesi, düşük öncelikli kuyruk, derleme başına 45 dakika. Derleme yalnızca yerel (native) bir şey değişince gerekir (paket, izin, eklenti). Ekran kodu değişikliği yeniden derleme istemez, geliştirme sunucusundan gelir.
- **iOS** bu kurulumun dışında (ücretli Apple hesabı gerekir, `m9-plan.md` §10.1).
- **Gizli olan yalnızca servis hesabı anahtarıdır.** `google-services.json` herkese açık kimlikler taşır. Yine de içinde bir Google API anahtarı olduğu ve GitHub'ın taramasına takılacağı için repoya konmaz; EAS'a dosya değişkeni olarak yüklenir.
- **Bir şey yanlış giderse:** paket adı Firebase'de ve uygulamada aynı olmalı (`com.tekpas.mobile`). Farklıysa bildirim gelmez; Firebase'de doğru adla yeni bir Android uygulaması eklemek gerekir.
