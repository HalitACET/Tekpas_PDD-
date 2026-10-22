# M12 tasarım brifi — Claude Design v1.2 (kullanıcılar, davet, denetim izi)

Üç iş:
1. **Kullanıcılar:** firma sahibinin ekibini davet etmesi, rollerini ve erişimini yönetmesi.
2. **Davet kabulü:** davet edilen kişinin bağlantıyı açıp şifresini belirlemesi.
3. **Denetim izi:** kim, neyi, ne zaman değiştirdi.

Bağlam: `docs/m12-plan.md` §4–§6.

**Mevcut tasarımlar kullanılır, yenisi icat edilmez:**
- Panel kabuğu, liste ve tablo dili: v0.3 01 (Ürünler), 07 (Partiler), boş/yükleniyor/hata durumları v0.3.1 19–20.
- Kilitli düğme ve "Bu işlem için yetkiniz yok" ipucu: v0.3.1 21.
- Bağlantı paylaşımı ("Bağlantıyı kopyala", "WhatsApp'ta paylaş"): v0.4 46a (tedarikçiye veri talebi).
- Girişsiz, telefon öncelikli sayfa: v0.4 39 (tedarikçi karşılama) ve giriş ekranı v0.2 / v0.3.1 17.
- "Kullanıcılar" sayfası bugün tasarım G'nin boş çerçevesi.
- Token'lar, Geist + Geist Mono + Newsreader; durum renkleri (`--status-*`).

**Ekran ve tema:**
- Panel 1440 genişlik; davet kabul sayfası 390 ve 1280.
- Her çerçeve açık ve koyu.

## Roller (ekranda geçen adlar)

| Rol | Türkçe ad | Ne yapar |
| --- | --- | --- |
| OWNER | Sahip | Her şey + kullanıcı ve rol yönetimi |
| ADMIN | Yönetici | Tedarikçi ağı, onay, yayın, geri çekme |
| EDITOR | Düzenleyici | Ürün, parti, zincir, veri talebi, Excel; onaylayamaz, yayınlayamaz |
| VIEWER | Görüntüleyici | Yalnızca okur |

Tedarikçi kullanıcıları (SUPPLIER) bu ekranda yönetilmez, listede de görünmez.

## A. Kullanıcılar (çerçeve 160'tan başlar)

1. **Liste:**
   - Sütunlar: ad soyad, e-posta, rol, durum, son giriş.
   - Durumlar: Aktif, Davet bekliyor (bağlantı geçerli; kalan gün), Davetin süresi doldu, Pasif.
   - Satır menüsü: Rolü değiştir, Davet bağlantısını yenile (yalnızca davette), Pasifleştir / Yeniden etkinleştir.
   - Kişinin kendi satırında "Siz" etiketi; kendi rolünü değiştiremez.
2. **"Kullanıcı davet et" diyaloğu:**
   - Alanlar: ad soyad, e-posta, rol (her rolün altında bir cümle; yukarıdaki tablo).
   - Gönderince: tek kullanımlık bağlantı (7 gün), "Bağlantıyı kopyala", "WhatsApp'ta paylaş" ve mesaj önizlemesi ("Merhaba {ad}, {firma} sizi KozaPass'e davet etti…").
   - E-posta gönderilmez; bunu bir satırla söyle.
3. **Rol değiştirme:**
   - Satır içinde ya da küçük diyalogda.
   - Yükseltme ve düşürmede tek cümle onay ("Selin A. artık yayınlayabilir").
4. **Pasifleştirme:**
   - Onay diyaloğu: "Giriş yapamaz; yaptığı işler ve denetim kayıtları kalır."
   - Yeniden etkinleştirilebilir.
5. **Hatalar ve sınırlar:**
   - **Son sahip:** firmanın son Sahibi pasifleştirilemez ve rolü düşürülemez. Düğme kilitli, nedeni ipucunda.
   - **E-posta kayıtlı:** bu e-posta zaten kayıtlı (alan hatası).
   - **Bağlantı yenileme:** eski bağlantı geçersiz olur; bunu da söyle.
6. **Yetki:**
   - Sahip her şeyi yapar.
   - Yönetici listeyi görür; davet, rol ve pasif düğmeleri kilitli (mevcut kilitli düğme dili).
   - Diğer roller menüde "Kullanıcılar"ı görmez.
7. **Durumlar:** yükleniyor, hata. Boş durum yok: en az kişinin kendisi listede.

## B. Davet kabulü, girişsiz (çerçeve 161'den başlar)

Adres: `/davet#<token>`. Telefon öncelikli.

1. **Karşılama ve şifre belirleme:**
   - Üst kısım: firma adı, "{davet eden} sizi {rol} olarak davet etti", e-posta (salt okunur).
   - Şifre ve şifre tekrarı: en az 10 karakter; kuralı alanın altında göster.
   - "Hesabı etkinleştir".
2. **Başarılı:** "Hesabınız hazır" ve giriş ekranına geçiş (e-posta dolu gelir).
3. **Bağlantı sorunları:**
   - Süresi doldu: "Davet eden kişiden yeni bağlantı isteyin."
   - Kullanılmış: zaten etkinleştirilmiş, girişe yönlendir.
   - Geçersiz.
   - Her biri tek cümle ve bir eylem.
4. **Diller:** TR/EN/DE (giriş ekranındaki dil seçici).

## C. Denetim izi (çerçeve 162'den başlar)

1. **Sayfa: "Denetim izi"** (Yönetim grubunda, Kullanıcılar'ın altında). Liste en yeni üstte. Satır: zaman, kişi, eylem cümlesi, kayda bağlantı. Örnekler:
   - "Elif Y. · KP-2026-0915-A pasaportunu yayınladı (Sürüm 3)".
   - "Can Ö. · İplik adımını onayladı · KP-2026-0922-A".
   - "Elif Y. · Selin A.'nın rolünü Düzenleyici → Yönetici yaptı".
   - "Elif Y. · 45 ürünü Excel'den içe aktardı (urunler_ekim.xlsx)": içe aktarma, dosyayı yükleyenin adıyla.
2. **Filtreler:**
   - Kişi.
   - Kayıt türü: ürün, parti, pasaport, tedarikçi, kullanıcı, içe aktarma.
   - Tarih aralığı (mevcut tarih seçici v0.3.1 24).
   - Filtre sonucu boş durumu.
3. **Ayrıntı:**
   - Değişen alanlar varsa satır açılır, "Rol: Düzenleyici → Yönetici" gibi.
   - Şifre ve belge içeriği hiç görünmez; bunu belirtmeye gerek yok.
4. **Sayfalama:** "Daha fazla yükle". Kayıtlar silinmez.
5. **Yetki:**
   - Sahip ve Yönetici görür.
   - Diğer roller menüde görmez; adresi açarsa yetki yok durumu.
6. **Parti detayından giriş (isteğe bağlı, tasarım karar versin):** parti başlığında "Geçmiş" bağlantısıyla bu sayfa o partiye süzülmüş açılır.

## D. Kapsam dışı (çizilmesin)

E-posta ile davet, şifremi unuttum, iki adımlı doğrulama, tedarikçi kullanıcıları, denetim kaydını dışa aktarma.

## Teslim

Çerçeve numaraları: A **160**'tan, B **161**'den, C **162**'den. Her çerçeve açık ve koyu; `.dc.html` bileşenleri `docs/design/v1.2/` altına.
