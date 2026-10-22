# M12 planı — Detaylı roller, denetim izi, test

**Hedef:**
- PLAN §2'deki rol matrisi uçtan uca uygulansın; firma sahibi kendi ekibini davet edip rollerini yönetsin.
- Önemli her değişiklik (kim, neyi, ne zaman) denetim izinde görünsün.
- Giriş kaba kuvvete karşı korunsun; kritik akışlar Playwright ile güvence altında olsun.

**Kabul (PLAN):** **EDITOR yayınla butonunu göremez, API da 403 döner. Her yayın denetim izinde görünür.**

Bu belge plandır. Kararlar §8'de, kullanıcıya düşenler §7'de.

**Dayandığı kurallar:**
- Kural 1: tenant; başka firmanın kullanıcısına ve denetim kaydına 404.
- Kural 3: secret yok; davet bağlantısının ham değeri yalnızca bir kez döner, DB'de SHA-256'sı durur.
- Kural 7: ProblemDetail.
- Kural 8: metinler çeviri dosyasından.

## 1. Mevcut durum

- **Yetki anotasyonları (M1–M11):**
  - `@ReadAccess`: OWNER, ADMIN, EDITOR, VIEWER.
  - `@WriteAccess`: OWNER, ADMIN, EDITOR.
  - `@ReviewAccess`: OWNER, ADMIN.
  - Controller'ların hepsinde biri var. Web'de `canWriteCatalog`, `canReview` ve kilitli düğme dili (`GuardedButton`) mevcut.
- **Matristen sapmalar:**
  - Tedarikçi ağı yönetimi (`POST/PATCH/DELETE /suppliers`) `@WriteAccess`, yani EDITOR da yapabiliyor. Matriste yalnızca OWNER ve ADMIN.
  - "Kullanıcı ve rol yönetimi" (OWNER) için uç yok. `GET/POST /users`, `PATCH /users/{id}` PLAN §4'te yazılı ama yapılmadı.
- **Denetim izi:**
  - V1'de `audit_log` tablosu var (firma, kullanıcı, varlık tipi ve kimliği, eylem, `diff`).
  - Yalnızca pasaport yazıyor: PUBLISH, WITHDRAW, PASSPORT_DRAFT.
  - Adım geçmişi ayrıca `step_event`'te (V6): gönderim, onay, red, düzeltme.
- **Giriş:**
  - Deneme sınırı yok; `RateLimiter` (bellekte, sabit pencere) herkese açık uçlarda kullanılıyor.
  - İstemci IP'si canlıda güvenilir değil (`trusted-proxies: -1`, M10 T7).
- **Ekranlar:** "Kullanıcılar" ve "Ayarlar" sayfaları tasarım G'nin boş çerçevesi ("yakında").
- **e2e:** 138 test mock API'ye karşı CI'da (M10 T4). Panelde giriş, parti oluşturma, tedarikçi formu ve yayın diyaloğu kapsanıyor. Herkese açık pasaport sayfası (SSR, sunucu tarafında API'ye gider) e2e'de yok.

## 2. Görevler

| # | İş | Tasarım gerekir mi | Kullanıcı gerekir mi |
| --- | --- | --- | --- |
| T1 | **Giriş deneme sınırı:** e-posta başına ve genel sayaç; IP başına sınır IP doğrulanınca; web'de 429 mesajı | Hayır (mevcut hata kutusu) | Hayır |
| T2 | **Rol matrisi:** her ucun rolünü matrisle karşılaştıran test; sapmaları düzelt (tedarikçi ağı → OWNER/ADMIN); web'de aynı kilitler | Hayır | Hayır |
| T3 | **Kullanıcılar (backend):** liste, davet (tek kullanımlık bağlantı), rol değiştir, pasifleştir; davetle şifre belirleme; son OWNER korunur | Hayır | Hayır |
| T4 | **Denetim izi (backend):** önemli eylemler `audit_log`'a; `GET /audit` (filtre, sayfa) | Hayır | Hayır |
| T5 | **Kritik akışlar (e2e):** herkese açık pasaport sayfası için mock API sunucusu; giriş → parti → tedarikçi → onay → yayın → pasaport zinciri | Hayır | Hayır |
| T6 | **Ekranlar:** Kullanıcılar (liste, davet, rol, pasif), davet kabul sayfası, Denetim izi | **Evet (v1.2)** | Tasarım |
| T7 | Kabul, haftalık not, README, PLAN, `docs/kullanici-isleri.md` | | |

**Sıra:** T1 → T2 → T3 → T4 → T5 (tasarım beklemez) → tasarım gelince T6 → T7.

## 3. Giriş deneme sınırı (T1)

- **E-posta başına:** 15 dakikada 5 başarısız deneme. 6. denemede, şifre doğru olsa bile 429 ve `Retry-After`. Başarılı giriş sayacı sıfırlamaz (sabit pencere; saldırgan doğru şifreyi bilmiyor).
- **Genel:** dakikada 300 giriş isteği. Kasıtlı doldurmada herkes 1 dakika etkilenir; IP doğrulanana kadar kabul (M10 notu).
- **IP başına:** `ClientIp` bir adres verirse 15 dakikada 20 başarısız deneme. Prod'da şimdilik kapalı (`trusted-proxies: -1`); IP kontrolü (kullanıcı işi C) olumlu çıkınca açılır.
- **Sızıntı yok:** var olmayan e-posta da aynı sayaçtan düşer, cevap farkı yok.
- **Web:** giriş formunun mevcut hata kutusunda "Çok fazla deneme. {dakika} dakika sonra yeniden deneyin." Mobil girişte de aynı.

## 4. Rol matrisi (T2)

- Matris PLAN §2'deki gibi; uçlar:

| Yetki | Uçlar | Anotasyon |
| --- | --- | --- |
| Kullanıcı ve rol yönetimi | `/users` yazma | OWNER (yeni `@OwnerAccess`) |
| Tedarikçi ağı yönetimi | `/suppliers` yazma | `@ReviewAccess` (değişiyor) |
| Ürün, parti, zincir, veri talebi, Excel | ilgili yazma uçları | `@WriteAccess` |
| Onay, red, yayın, geri çekme, çeviri onayı | ilgili uçlar | `@ReviewAccess` |
| Görüntüleme | GET uçları | `@ReadAccess` |

- **Test:** Spring'in `RequestMappingHandlerMapping`'inden bütün uçlar okunur. Her biri için beklenen rol kümesi bir tablodan gelir; tabloda olmayan uç testi düşürür, yeni uç unutulamaz. Ayrıca kabul için entegrasyon testi: EDITOR'ün `POST /batches/{id}/passports` isteği 403.
- **Web:** tedarikçi ekranlarındaki yazma düğmeleri `canReview`'a geçer; EDITOR için kilitli düğme dili (yeni ekran değil).

## 5. Kullanıcılar (T3)

- **Uçlar:**
  - `GET /users` (OWNER, ADMIN okur).
  - `POST /users/invitations` (OWNER; e-posta, ad, rol) → kullanıcı pasif oluşur. Cevapta tek kullanımlık davet bağlantısı: `/davet#<token>`, 7 gün, tedarikçi bağlantısıyla aynı desen (K21).
  - `PATCH /users/{id}` (OWNER; rol, aktif).
  - `POST /users/{id}/invitations` (OWNER; bağlantıyı yenile; eskisi geçersiz).
- **Davet kabulü (girişsiz):**
  - `GET /public/invitations` (token `X-Invitation-Token` başlığında): firma, ad, e-posta.
  - `POST /public/invitations/accept` (şifre, en az 10 karakter) → kullanıcı aktif olur.
- **Kurallar:**
  - SUPPLIER rolü bu ekrandan verilmez (tedarikçi kullanıcıları ayrı akış).
  - Firmanın son aktif OWNER'ı pasifleştirilemez ve rolü düşürülemez: 409 `LAST_OWNER`.
  - Kişi kendi rolünü değiştiremez.
  - Pasifleştirilen kullanıcının refresh token'ları silinir; access token en geç 15 dakikada düşer.
- **E-posta yok:** bağlantı "Bağlantıyı kopyala" ve "WhatsApp'ta paylaş" ile verilir (tedarikçi linkiyle aynı, web CLAUDE.md).

## 6. Denetim izi (T4)

- **Yazılan eylemler:**
  - **Ürün:** oluştur, düzenle, sil.
  - **Parti:** oluştur, düzenle, sil.
  - **Tedarikçi:** ekle, düzenle, çıkar.
  - **Adım ve belge:** onay, red, düzeltme isteği. Belge doğrulama.
  - **Pasaport ve çeviri:** yayın, geri çekme, yeni taslak (bugünkü). Çeviri onayı.
  - **Kullanıcı ve içe aktarma:** davet, rol değişikliği, pasifleştirme. Excel içe aktarma.
  - **Uyarı:** elle çözme.
- **`diff`:** yalnızca değişen alan adları ve kısa değerler (ör. rol `EDITOR → ADMIN`); şifre, token ve belge içeriği asla yazılmaz.
- **`GET /audit`** (OWNER, ADMIN): filtreler `entityType`, `userId`, `from`, `to`; sayfalı, en yeni üstte. Her kayıt kim (ad), ne (eylem ve varlık), hangi kayıt (parti numarası, ürün adı gibi okunur bir etiket), ne zaman. Firma filtresi her sorguda (kural 1).
- **Saklama:** silinmez (ücretsiz Neon 0,5 GB; kayıt başına ~300 bayt, demo ölçeğinde önemsiz).

## 7. Kullanıcıya düşenler

- **Tasarım (T6):** `docs/m12-tasarim-brifi.md` → Claude Design v1.2. `docs/kullanici-isleri.md` A bölümüne yazılır.
- **IP kontrolü (T1'in IP kısmı):** `docs/kullanici-isleri.md` C bölümü.

## 8. Kararlar (itiraz edilebilir)

1. **Davet e-postayla değil bağlantıyla:** e-posta servisi eklemek yeni bir üçüncü parti servis olurdu (CLAUDE.md "yapma"). Tedarikçi bağlantısının güvenlik deseni (token `#` içinde, hash'li, tek kullanımlık) yeniden kullanılıyor.
2. **Tedarikçi ağı yalnızca OWNER/ADMIN:** matris böyle diyor. EDITOR zincire mevcut tedarikçiyi atayabilir ama ağa firma ekleyemez.
3. **Denetim izi tek tabloda:** adım onayı, reddi ve düzeltme isteği hem `step_event`'e (adım geçmişi, 47a) hem `audit_log`'a yazılır. Denetim listesi tek tablodan, basit bir sorguyla okunur.
4. **Login sınırı bellekte:** Render'da tek örnek çalışıyor; yeniden başlatmada sayaç sıfırlanır, kaba kuvvet için kabul edilebilir.
