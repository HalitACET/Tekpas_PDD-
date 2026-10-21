# M8 planı — Mobil I

**Hedef:** Sahadaki kullanıcı telefonla giriş yapar, görevlerini görür ve bir sertifikanın fotoğrafını (birden çok sayfa) çekip yükler; AI okuması birkaç saniyede düzenlenebilir bir form olarak gelir, yetkili kişi onaylar. Kabul (PLAN): **telefonda sertifika fotoğrafı çekilir, 10 saniye içinde form dolu gelir.** Bu belge plandır; kod yok. Kararlar §9'da (kullanıcı "sen karar ver" dedi, itiraz edilebilir).

Dayandığı kurallar: kural 1 (tenant), 4 (Gemini yalnızca demo verisi, `LlmGate`), 5 (AI önerir, insan onaylar), 8 (metinler çeviri dosyasından), `mobile/CLAUDE.md` (Expo Router, SecureStore, `expo-camera`, 2000 px sıkıştırma, 44 pt dokunma alanı).

## 1. Mevcut durum

- `mobile/` yalnızca Expo SDK 57 şablonu (`src/app/_layout.tsx`, `index.tsx`); bağımlılıklar şablonunkiler.
- Giriş hazır: `POST /auth/login` `client=MOBILE` ile refresh token'ı gövdede döner, `POST /auth/refresh` gövdeden okur (rotasyon). `@tekpas/api-client` mobil için tasarlandı (`baseUrl`, `getAccessToken`, tek uçuşlu `refreshAccessToken`).
- Belge hattı hazır (M5): `POST /steps/{id}/documents` (tek dosya: PDF/JPEG/PNG, 10 MB) → okuma işi (kurallar, okunamazsa kapı açıksa LLM, dosyanın kendisiyle) → `GET /documents/{id}` → `POST /documents/{id}/verify` (OWNER, ADMIN). Taranmış belge/fotoğraf kurallarla okunamaz; yalnızca LLM okur, o da yalnızca demo firmasında.
- `GET /tasks` (üretici görevleri) ve `GET /documents/expiring` (M7) var. Firmanın **onay bekleyen belgelerini** listeleyen uç yok.
- Mobil tasarım yok (v0.7 brifi mobili kapsam dışı bıraktı): ekranlar Claude Design v0.8'i bekler (`docs/m8-tasarim-brifi.md`).

## 2. Kapsam

| Var (M8) | Yok (M9 ve sonrası) |
| --- | --- |
| Giriş, oturumun SecureStore'da kalması, çıkış | QR okutma (M9) |
| Görevlerim: onayınızı bekleyen belgeler, onay bekleyen veriler (yalnızca görüntüleme), süresi yaklaşan sertifikalar | Hızlı onay / red (M9) |
| Belge çek: parti ve adım seç → kamera (çok sayfa) → gözden geçir → yükle → okuma → form → onay | Push bildirimi (M9) |
| Bekleyen bir belgeyi açıp formdan onaylama | Zayıf bağlantıda yükleme kuyruğu (M9; M8'de "Tekrar dene") |
| Profil: kullanıcı, firma, rol, dil, çıkış | Tedarikçi hesabıyla mobil (tedarikçi M4'teki bağlantı sayfasını kullanır) |

## 3. Backend

### 3.1 Çok sayfalı fotoğraf → tek belge
`POST /steps/{id}/documents/photos` (multipart, `pages` 1–10 adet JPEG/PNG; toplam ≤ 10 MB; OWNER, ADMIN, EDITOR). Sunucu:
- Her sayfayı `FileInspector` ile doğrular (sihirli bayt, piksel sınırı), **görüntüyü çözüp yeniden JPEG'e kodlar**: EXIF/GPS ve diğer meta veri düşer (telefon fotoğrafı konum taşır). Uzun kenar 2000 px'i aşıyorsa küçültür (cihaz da küçültür; sunucu güvence).
- Sayfaları sırasıyla tek bir PDF'te birleştirir (PDFBox, sayfa başına bir görüntü, A4'e sığdırılır); belge adı `foto-<yyyyMMdd-HHmm>.pdf`, `docType` isteğe bağlı.
- Gerisi `POST /steps/{id}/documents` ile aynı: adım kilidi, yayınlanmış parti 409, adım başına belge sınırı, aynı dosya 409, okuma işi kuyruğa (202).
- Neden sunucuda: tek belge = tek LLM çağrısı (sayfaları tek dosya olarak görür), web'de de "bir sertifika bir belge"; cihazda PDF üretmek için ağır bir kütüphane gerekmez.

### 3.2 Onay bekleyen belgeler
`GET /documents/awaiting-review` (okuyan herkes; SUPPLIER 403): firmanın onaylanmamış ve okuması bitmiş (`READ`, `PARTIAL`, `UNREADABLE`, `FAILED`) belgeleri, en yeni önce, her birinde parti no, adım tipi, tedarikçi, okuma durumu ve belge türü. Mobil Görevlerim'in ilk grubu; web Belgeler sayfası da ileride kullanabilir. Tenant filtresi doğrudan `document.company_id`.

### 3.3 Değişmeyenler
`GET /documents/{id}` (çıkarım + güven), `POST /documents/{id}/verify`, `GET /tasks`, `GET /documents/expiring`, `GET /batches` (parti seçimi, durum süzgeci), `GET /batches/{id}/chain` (adım seçimi) olduğu gibi kullanılır.

## 4. Mobil uygulama

- **Yığın (CLAUDE.md'de öngörülen):** Expo Router, `@tekpas/api-client` + TanStack Query (web'deki query key yapısı), `expo-secure-store`, `expo-camera`, `expo-image-manipulator`, i18next + `expo-localization`. Test: Jest (`jest-expo`) + React Native Testing Library; kamera ve ağ mock'lanır.
- **Yönlendirme:** `app/(auth)/login`, `app/(tabs)/` (Görevler, Tara [M9, kapalı], Profil), `app/capture/` (parti → adım → kamera → gözden geçir → yükleniyor), `app/document/[id]` (form).
- **Oturum:** access token bellekte, refresh token SecureStore'da; açılışta refresh ile oturum geri gelir; 401'de tek refresh, olmazsa girişe döner.
- **Sunucu adresi:** `EXPO_PUBLIC_API_URL` (geliştirmede bilgisayarın yerel IP'si, demoda Render).
- **Sıkıştırma:** her sayfa yüklemeden önce uzun kenar en fazla 2000 px, JPEG kalite 0,7 (`expo-image-manipulator`); 10 MB toplamı aşarsa kullanıcıya söylenir.
- **Okumayı bekleme:** yükleme bitince `GET /documents/{id}` saniyede bir; `extractionStatus` `QUEUED/RUNNING` dışına çıkınca form açılır. 20 saniyeyi geçerse "Okuma uzun sürüyor" + elle doldurma seçeneği; okuma sonra gelirse form güncellenir.
- **Form:** belge türü, numara, sahip, veren kuruluş, geçerlilik başlangıç/bitiş; her alanın güveni (< 0,8 sarı) ve kaynağı (kural / AI); belge görüntüsü büyütülebilir. OWNER/ADMIN "Onayla" (`verify`); EDITOR ve VIEWER formu görür, onay düğmesi kapalı ve nedeni yazar ("Onay yöneticide").
- **Metinler:** `packages/shared/src/i18n/mobile/{tr,en,de}.json` (kural 8; web'in `web/messages` dosyalarından ayrı, yalnızca mobilin anahtarları). Anahtar kümeleri testle eşit tutulur.
- **Çevrimdışı:** M8'de yükleme hatasında "Tekrar dene" (sayfalar bellekte kalır); kalıcı kuyruk M9.

## 5. Ölçüm (kabul)

Demo firması, `LLM_ENABLED`, Gemini anahtarı ile; iki sayfalık bir sertifika fotoğrafı. Süre: **"Yükle"ye basıştan formun dolu açılışına** kadar (yükleme + okuma işi + LLM). Hedef ≤ 10 s; yükleme süresi bağlantıya bağlı olduğundan ölçüm Wi-Fi'da ve uygulama içinde kaydedilir (geliştirme ekranında süre gösterilir). Render uyuyorsa ilk istek uyandırır: ölçüm uyanık sunucuyla yapılır (M10'da demo öncesi uyandırma).

## 6. Test

- **Backend:** fotoğraf ucu (1 ve 3 sayfa → tek PDF, sayfa sayısı; EXIF düşer; 11 sayfa / 10 MB üstü / PDF gönderme 400; yayınlanmış parti 409; tenant 404; VIEWER ve SUPPLIER 403; okuma işi kuyrukta), bekleyen belgeler ucu (yalnızca okuması bitmiş ve onaylanmamış, firma bazlı, sıralama, 403/401).
- **Mobil:** oturum (SecureStore'a yazma/okuma, refresh, çıkış), görev listesi durumları, kamera akışı (izin yok, sayfa ekle/sil), yükleme (sıkıştırma çağrısı, hata ve tekrar), okuma bekleme (zaman aşımı), form (sarı alan, rol). Jest, kamera ve fetch mock.
- **Uçtan uca:** Expo Go'da gerçek telefonla, yerel backend ve demo firmasıyla; kabul süresi kaydı.

## 7. Görevler ve sıra

| # | İş | Bağımlılık |
| --- | --- | --- |
| T0 | Tasarım brifi → Claude Design v0.8 (mobil ekranlar bunu bekler) | |
| T1 | Backend: `POST /steps/{id}/documents/photos` (birleştirme, meta veri temizleme) + testler | |
| T2 | Backend: `GET /documents/awaiting-review` + testler | |
| T3 | Mobil iskelet (ekran yok): bağımlılıklar, API istemcisi + SecureStore oturumu, Query, i18n, Jest | |
| T4 | Mobil ekranlar: giriş, Görevlerim, profil | T0, T2, T3 |
| T5 | Mobil belge çekme akışı ve form | T0, T1, T3 |
| T6 | Kabul ölçümü, haftalık not, README, PLAN | hepsi |

## 8. Riskler

- **10 saniye:** taranmış belgeyi yalnızca LLM okur; ücretsiz katmanın gecikmesi değişken. Görüntüler küçültülür, tek çağrı yapılır, iş commit sonrası hemen uyanır (K9). Gemini cevabı yavaşsa ölçüm notu düşülür.
- **Expo SDK 57 yeni:** paketle gelen doküman (`mobile/AGENTS.md`) esas.
- **Render uykusu:** ilk istek 30–60 s sürebilir; uygulama "Sunucu uyanıyor" durumunu gösterir (web'deki gibi).

## 9. Kararlar (onay bekleyen yok; itiraz edilebilir)

1. **M8 mobil yalnızca firma çalışanları için** (OWNER, ADMIN, EDITOR, VIEWER). Tedarikçi bağlantı sayfasını kullanmaya devam eder; tedarikçi hesabıyla mobil sonra.
2. **Sayfalar sunucuda tek PDF'e birleşir**, meta veri (EXIF/GPS) sunucuda yeniden kodlamayla düşer.
3. **EDITOR yükler ama onaylayamaz** (backend kuralı); formu görür, onay yöneticidedir.
4. **Okuma beklemesi yoklamayla** (1 s, 20 s'de uyarı); sunucu itmesi (push) M9.
5. **Mobil metinleri `packages/shared`** altında ayrı dosyalarda.
6. **Kalıcı çevrimdışı kuyruk M9'a**, M8'de tekrar dene yeterli.
7. **Geliştirme Expo Go**, demo için EAS ücretsiz Android APK (M10).
