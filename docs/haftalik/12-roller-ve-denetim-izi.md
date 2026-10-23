# 12 — Roller, denetim izi, test

**Kilometre taşı:** M12 (tamamlandı)  ·  **Tarih aralığı:** 23.10.2026  ·  **Canlı link:** web Vercel'de, API Render'da (merge ile canlıya çıkar)

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
- **Ekranların ihtiyacı (PR #117):** tasarım v1.2 gelince API'de eksik kalanlar.
  - V24 `app_user.deactivated_at`: "12 Eki 2026 tarihinden beri pasif".
  - `GET /auth/me`'de firma sahibinin adı: erişimi olmayan kişiye "firma sahibi Selim Karaca ile görüşün".
  - Süresi dolmuş davetin cevabında firma ve davet edenin adı: kimden yeni bağlantı isteneceği.
  - `GET /audit` sayfalı (toplam sayıyla, "1–25 / 1.248 kayıt"); çeviri onayı ayrı tür.
- **T6 Ekranlar (PR #118, Claude Design v1.2):**
  - **Kullanıcılar** (160–169): Tümü / Aktif / Davet bekleyen / Pasif sekmeleri; davet diyaloğu ve bağlantı (kopyala, WhatsApp, mesaj önizlemesi); rol değiştirme ("son sahip" uyarısı); pasifleştirme ve yeniden etkinleştirme; bağlantıyı yenileme. Kişi kendi satırını değiştiremez. Yönetici listeyi görür ama değiştiremez; Editör ve Görüntüleyici kime soracağını görür.
  - **Davet sayfası** `/davet#token` (170–174): telefonda tek sütun, masaüstünde yanda firma ve rol bilgisi. Şifre kuralı yazarken gösteriliyor, eşleşmeme ve sunucu hatası formun içinde. Bitince "Panele giriş yap" giriş ekranını e-postayla dolu açar. Süresi dolmuş, kullanılmış ve geçersiz bağlantının her birinin kendi ekranı var. Sayfa arama motorlarına kapalı, adres başka siteye gönderilmiyor.
  - **Denetim izi** (180–184): güne göre gruplu tablo (Bugün, Dün, gün adı), tür / kişi / tarih filtresi, sayfa başına 25 kayıt. "Ne yaptı" sütunu eylemi kayıt türüne göre söylüyor ("Davet etti", "Rolünü değiştirdi", "İçe aktardı"); değişiklik kısa bir satır ("rol: Görüntüleyici → Editör", "sürüm 2", "alanlar: Gramaj, Kumaş tipi").

## Teknik kararlar
- **Davet e-postayla değil bağlantıyla:** e-posta servisi yeni bir üçüncü parti servis olurdu. Tedarikçi bağlantısının güvenlik deseni (token adreste `#` içinde, hash'li, süreli) aynen kullanıldı.
- **Rol matrisi bir test:** belgede yazan matrisle koddaki anotasyonlar zamanla ayrışabilir. Test, her ucu tek tek listeleyip karşılaştırıyor; tablo da matrisin okunabilir hâli oluyor.
- **Denetim kaydında kayıt adı da saklanıyor:** silinen ürünün adı sonradan da okunsun diye. Gösterimde varsa kaydın bugünkü adı, yoksa saklanan ad kullanılıyor.
- **Excel satırları tek tek yazılmıyor:** 1000 satırlık bir dosya 1000 kayıt yerine dosya başına bir kayıt (oluşan ve hatalı sayısıyla).
- **Giriş sınırı bellekte:** Render'da tek örnek çalışıyor; yeniden başlatmada sayaç sıfırlanır, kaba kuvvete karşı yeterli.
- **Denetim izinde değer yok, alan adı var:** tasarım "neden: sertifika eksik" gibi değerler gösteriyordu. Red gerekçesi ve eski/yeni değerler serbest metin olabildiği için denetim kaydına yazılmıyor (T4 kararı); ekran bu yüzden alan adlarını gösteriyor.
- **Tasarımdaki telefon satırı yok:** süresi dolmuş davette "yeni bağlantı için" kutusunda telefon vardı; veri modelinde firma telefonu olmadığı için yalnızca ad ve firma gösteriliyor.
- **Türkçe ek sorunu:** "9 Eki 2026'dan beri" gibi tarihe bağlı ekler yerine "tarihinden beri", "Selim Karaca'ya" yerine "Selim Karaca ile görüşün" kullanıldı (başka isimlerde ek değişirdi).

## Karşılaşılan sorunlar ve çözümler
- **Davet satırı yabancı anahtar hatası verdi:** kullanıcı JPA ile kaydedilip davet JDBC ile yazılınca kullanıcı henüz veritabanına gitmemişti. Çözüm: `saveAndFlush`.
- **Testlerde giriş sınırı:** test paketi dakikada yüzlerce kez giriş yapıyor. Genel sayaç test profilinde yükseltildi; e-posta başına sınır üretimdeki gibi kaldı.
- **"Son sahip" kuralı API'den tetiklenemiyor:** yalnızca Sahip rol değiştirebildiği ve kendini değiştiremediği için başka bir Sahip her zaman var. Kural güvenlik ağı olarak kodda kaldı.
- **e2e'de pasaport kodu iki yerde:** doğrulama kodu hem QR kontrol listesinde hem pasaport bilgilerinde görünüyor; test iki kez görünmesini bekliyor.
- **React'in saflık kuralı:** "7 gün içinde · 6 gün kaldı" hesabı render sırasında `Date.now()` çağırıyordu; lint bunu hata saydı (her render farklı sonuç verebilir). Çözüm: şimdiki zaman bileşen açılırken bir kez alınıyor (`useState(() => Date.now())`), projedeki diğer ekranlardaki gibi.
- **Sahte hata cevabı tanınmadı:** e2e'de süresi dolmuş davet "Bağlantı geçersiz" gösterdi. Sahte cevapta RFC 7807'nin `type` alanı eksikti, istemci gövdeyi hata ayrıntısı olarak tanımadı. Gerçek backend bu alanı her zaman yazıyor; sahte cevap düzeltildi.
- **Yerel çalışma kopyasında kayıp:** `main`'i güncellerken kaydedilmemiş değişiklikler silindi. Az önce alınan `git stash` kaydı git'in içinde hâlâ duruyordu (`git fsck`), dosyalar oradan geri alındı. Ders: dal değiştirmeden önce commit.

## Test
- Backend: 696 test, hepsi yeşil. Yeniler: `AccessMatrixTest`, `UserApiTest` (6), `AuditApiTest` (4), `LoginTest`'e 3, `SupplierApiTest`'e 1, `ImportApiTest`'e denetim kaydı.
- Web: giriş 429 mesajı, izinler (`canManageSuppliers`). Pasaport e2e 4 test. Ekranlar için bileşen testleri: kullanıcılar 5, davet sayfası 7, denetim izi 6; e2e `m12-team.spec.ts` 4 (davet et → bağlantı, şifre belirle → giriş e-postayla dolu, süresi dolmuş davet, denetim izi filtresi). Web toplam 285 bileşen testi.
- Mobil: giriş 429.
- CI: backend, contract, js ve e2e yeşil.

## Ekran görüntüleri
- Kullanıcılar: `img/12-kullanicilar-light.png`, `img/12-kullanicilar-dark.png`
- Denetim izi: `img/12-denetim-izi-light.png`, `img/12-denetim-izi-dark.png`
- Davet sayfası: `img/12-davet-telefon-light.png`, `img/12-davet-masaustu-light.png`
- Tasarımın kendi kareleri: `docs/design/impl-v1.2/`

## Sonraki adım
- **Canlı kontrol (kullanıcıda):** davet bağlantısını gerçek bir telefonla baştan sona denemek (`docs/kullanici-isleri.md` C).
- **M13:** rapor taslağına M12 ekranlarını ve görüntülerini eklemek; sunum ve teslim.
