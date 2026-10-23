# 12 — Roller, denetim izi, test

**Kilometre taşı:** M12  ·  **Tarih aralığı:** 23.10.2026  ·  **Canlı link:** web Vercel'de, API Render'da (merge ile canlıya çıkar)

## Yapılanlar
- **Sizin işleriniz listesi (PR #108):**
  - `docs/kullanici-isleri.md`: bütün kilometre taşlarından kalan, kullanıcıya düşen işler, adım adım. Tasarım, telefon denemeleri, canlı kontroller, dil kontrolü, demo, teslim.
  - Kuralı `CLAUDE.md`'ye yazıldı: liste her kilometre taşında güncellenir.
  - Aynı PR'da log değişikliği: herkese açık uçlarda Vercel'in IP başlıklarının adı (adresi değil) yazılıyor. Böylece M10 T7'nin canlı IP kontrolü tek bir log satırına bakmak oluyor.
- **Plan ve brif (PR #109):** `docs/m12-plan.md` (T1–T7), `docs/m12-tasarim-brifi.md` (Claude Design v1.2: kullanıcılar 160, davet kabulü 161, denetim izi 162).
- **T1 Giriş deneme sınırı (PR #110):**
  - **E-posta başına:** 15 dakikada 5 hatalı deneme. Sonrasında doğru şifreyle bile 429 ve `Retry-After`. Var olmayan e-posta da aynı sayaçtan düşüyor (hangi hesabın var olduğu sızmıyor).
  - **IP başına:** 20 hatalı deneme. Yalnızca istemci IP'si biliniyorsa; canlıda IP kontrolünden sonra açılacak.
  - **Genel:** dakikada 300 giriş.
  - **Web ve mobil:** "Çok fazla hatalı deneme. N dakika sonra yeniden deneyin." Mevcut hata kutusunda, yeni ekran yok.
- **T2 Rol matrisi (PR #111):**
  - **`AccessMatrixTest`:** bütün `/api/**` uçlarını Spring'den okuyup erişim seviyesini `access-matrix.txt` ile karşılaştırıyor. Seviyeler PUBLIC, AUTHENTICATED, READ, WRITE, REVIEW, OWNER. Tabloya yazılmamış yeni uç testi düşürüyor.
  - **Bulunan tek sapma:** tedarikçi ağına firma ekleme, düzenleme ve çıkarma EDITOR'e de açıktı. Matriste yalnızca OWNER ve ADMIN. API'de ve web'de düzeltildi; EDITOR zincire mevcut tedarikçiyi atamaya devam ediyor.
- **T3 Kullanıcılar (PR #112):**
  - **Uçlar:** `GET /users`, `POST /users/invitations`, `POST /users/{id}/invitations` (bağlantıyı yenile), `PATCH /users/{id}` (rol, pasifleştir).
  - **Girişsiz kabul:** `GET/POST /public/invitation` (token `X-Invitation-Token` başlığında).
  - **Davet:** e-postasız, tek kullanımlık bağlantı (`/davet#token`, 7 gün, yalnızca SHA-256'sı saklanıyor). V22 `user_invitation`.
  - **Kurallar:** kimse kendi hesabını değiştiremez. Pasifleştirilen kişinin bütün oturumları kapanır. Tedarikçi kullanıcıları burada yönetilmez.
- **T4 Denetim izi (PR #113):**
  - **Ortak `AuditLog`:** kişiyi istekten alıyor; Excel işinde dosyayı yükleyenin adına yazıyor.
  - **Yazılan kayıtlar:** ürün, parti ve tedarikçi değişiklikleri; adım onayı ve reddi; belge doğrulama; uyarı çözme; yayın, geri çekme ve taslak; çeviri onayı; Excel içe aktarma (dosya başına tek kayıt); kullanıcı işlemleri.
  - **İçerik:** alan adları ve kısa değerler. Metin, şifre ve token yazılmıyor.
  - **`GET /audit`** (OWNER, ADMIN): en yeni üstte; tür, kişi, gün ve parti filtresi; "daha fazla yükle" imleci. V23 indeks.
- **T5 Kritik akışlar (PR #114):**
  - Herkese açık pasaport sayfası sunucuda render edildiği için tarayıcıdaki mock'lar ona ulaşmıyordu. Playwright'a ikinci bir sunucu eklendi: pasaport ucunu taklit eden küçük bir Node sunucusu (`e2e/passport-backend.mjs`).
  - Testler: EN çevirili, DE karışık, geri çekilmiş ve bilinmeyen kod.
  - Giriş, parti oluşturma, tedarikçi formu, onay ve yayın diyaloğu zaten e2e'de.

## Teknik kararlar
- **Davet e-postayla değil bağlantıyla:** e-posta servisi yeni bir üçüncü parti servis olurdu. Tedarikçi bağlantısının güvenlik deseni (token adreste `#` içinde, hash'li, süreli) aynen kullanıldı.
- **Rol matrisi bir test:** belgede yazan matrisle koddaki anotasyonlar zamanla ayrışabilir. Test, her ucu tek tek listeleyip karşılaştırıyor; tablo da matrisin okunabilir hâli oluyor.
- **Denetim kaydında kayıt adı da saklanıyor:** silinen ürünün adı sonradan da okunsun diye. Gösterimde varsa kaydın bugünkü adı, yoksa saklanan ad kullanılıyor.
- **Excel satırları tek tek yazılmıyor:** 1000 satırlık bir dosya 1000 kayıt yerine dosya başına bir kayıt (oluşan ve hatalı sayısıyla).
- **Giriş sınırı bellekte:** Render'da tek örnek çalışıyor; yeniden başlatmada sayaç sıfırlanır, kaba kuvvete karşı yeterli.

## Karşılaşılan sorunlar ve çözümler
- **Davet satırı yabancı anahtar hatası verdi:** kullanıcı JPA ile kaydedilip davet JDBC ile yazılınca kullanıcı henüz veritabanına gitmemişti. Çözüm: `saveAndFlush`.
- **Testlerde giriş sınırı:** test paketi dakikada yüzlerce kez giriş yapıyor. Genel sayaç test profilinde yükseltildi; e-posta başına sınır üretimdeki gibi kaldı.
- **"Son sahip" kuralı API'den tetiklenemiyor:** yalnızca Sahip rol değiştirebildiği ve kendini değiştiremediği için başka bir Sahip her zaman var. Kural güvenlik ağı olarak kodda kaldı.
- **e2e'de pasaport kodu iki yerde:** doğrulama kodu hem QR kontrol listesinde hem pasaport bilgilerinde görünüyor; test iki kez görünmesini bekliyor.

## Test
- Backend: 696 test, hepsi yeşil. Yeniler: `AccessMatrixTest`, `UserApiTest` (6), `AuditApiTest` (4), `LoginTest`'e 3, `SupplierApiTest`'e 1, `ImportApiTest`'e denetim kaydı.
- Web: giriş 429 mesajı, izinler (`canManageSuppliers`). Pasaport e2e 4 test.
- Mobil: giriş 429.
- CI: backend, contract, js ve e2e yeşil.

## Ekran görüntüleri
- Yeni ekran yok: kullanıcılar, davet kabulü ve denetim izi ekranları Claude Design v1.2'yi bekliyor.

## Sonraki adım
- **Tasarım v1.2 gelince:** Kullanıcılar, davet kabul sayfası (`/davet`) ve Denetim izi ekranları (T6).
- **M13:** rapor taslağı, diyagramlar, sunum taslağı.
