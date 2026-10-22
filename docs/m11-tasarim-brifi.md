# M11 tasarım brifi — Claude Design v1.1 (çeviriler ve Excel içe aktarma)

İki iş:
1. Yayından önce pasaportun **serbest metinlerinin** İngilizce ve Almanca çevirisi; okuyanın dilinde gösterilmesi.
2. Ürün listesinin **Excel ile içe aktarılması**.

Bağlam: `docs/m11-plan.md` §3 ve §4.

**Mevcut tasarımlar kullanılır, yenisi icat edilmez:**
- Önizleme ve yayın diyaloğu: v0.6 çerçeve 68 ve 72a–e.
- Herkese açık pasaport: v0.6 63a/64 ve v1.0 121a–f (dil etiketi örneği: "Manufacturer’s note · in Turkish").
- İçe aktarma sayfası: tasarım G'nin boş çerçevesi (bugün "yakında"). Ürünler sayfasındaki "Excel'den içe aktar" düğmesi oraya gider.
- Token'lar, Geist + Geist Mono + Newsreader; durum renkleri (`--status-*`). AI önerisi her yerde olduğu gibi sarı (güven < 0,8 dili).

**Ekran ve tema:**
- Panel 1440 genişlik; pasaport 390 ve 1280.
- Her çerçeve açık ve koyu.
- Pasaport çerçeveleri İngilizce ve Almanca; en uzun metinle taşma kontrolü.

## A. Panel · yayından önce çeviriler (çerçeve 140'tan başlar)

Çevrilen alanlar: ürün açıklaması, bakım notu, kumaş tipi ("Süprem örme"), boyamada "diğer" süreç. Ürün adı, firma ve yer adları çevrilmez (bunu ekranda bir satırla söyle).

1. **Önizleme sayfasında (68) "Çeviriler" bölümü:** her alan için bir satır. Solda kaynak metin ve kaynak dili, yanında İngilizce ve Almanca kutuları. Satır durumları:
   - boş;
   - **AI önerisi, onaysız** (sarı, "AI önerisi" rozeti);
   - **onaylı** (yeşil, kim ve ne zaman);
   - **kaynak değişti, yeniden onay gerekir** (turuncu uyarı).
2. **"Çevirileri öner" düğmesi** (yalnızca demo firmasında):
   - Basınca satırlarda yükleniyor durumu; birkaç saniyede öneriler gelir.
   - Hata durumu ve günlük AI sınırı doldu durumu.
3. **Gerçek firma (AI yok):** düğme yerine kısa bilgi: "Çeviriyi kendiniz yazabilir ya da boş bırakabilirsiniz; boş kalan metin pasaportta Türkçe ve 'Türkçe' etiketiyle görünür."
4. **Tek tek ve toplu onay:** satırda "Onayla", bölümde "Tümünü onayla". Onaysız AI önerisi yayına girmez; bunu bölümün başında bir cümleyle söyle.
5. **Yayın diyaloğunda (72a) bir satır:** "2 alan çevrildi · 1 alan Türkçe kalacak", çeviriler bölümüne bağlantıyla. Engel değildir.
6. **Durumlar:** çevrilecek alan yok (bölüm görünmez ya da tek satır bilgi), yükleniyor, hata.

## B. Herkese açık pasaport (çerçeve 141'den başlar)

1. **Onaylı çeviri:** sayfanın dilinde gösterilir. AI ile hazırlanmışsa küçük, sakin bir not: "Bu metin yapay zekâ ile çevrildi ve üretici tarafından onaylandı". Nerede: alanın altında mı, sayfa sonunda bir kez mi? Tasarım karar versin; tekrar etmesin.
2. **Çevrilmemiş serbest metin:** özgün dilinde, dil etiketiyle (v1.0 121b'deki "in Turkish" örneği). Ürün açıklaması, bakım notu ve malzeme satırında ("Ana kumaş: Süprem örme").
3. **Çerçeveler:**
   - 390 ve 1280.
   - EN: hepsi çevrilmiş.
   - DE: açıklama çevrilmiş, bakım notu çevrilmemiş (karışık durum).
   - En uzun Almanca metin.

## C. Panel · Excel içe aktarma (çerçeve 150'den başlar)

1. **İçe aktarma sayfası, ilk kez:** üç adım ("Şablonu indirin · Doldurun · Yükleyin"), "Şablonu indir (.xlsx)" düğmesi, sürükle-bırak alanı.
   - Sınırlar: en fazla 1 MB, 1000 satır, yalnızca KozaPass şablonu.
   - Şablonun sütunları bir satırla anlatılır: GTIN, SKU, ürün adı, kategori, açıklama, en fazla üç lif ve yüzdesi.
2. **Yükleniyor ve işleniyor:** dosya adı, ilerleme (sayısal ilerleme yok, "işleniyor"), sayfadan ayrılınca da devam ettiği bilgisi.
3. **Sonuç, hepsi başarılı:** "50 ürün oluşturuldu", ürünler listesine bağlantı.
4. **Sonuç, kısmen başarılı (asıl çerçeve):**
   - Özet: "45 ürün oluşturuldu · 5 satır hatalı".
   - Hata tablosu: **Satır · Sütun · Değer · Sorun**. Sorunlar API'deki dille ("Kontrol hanesi hatalı", "Lif toplamı %99", "Bu GTIN zaten kayıtlı", "Dosyada iki kez").
   - "Düzeltip yeniden yükleyin; oluşan ürünler atlanır" notu.
5. **Dosya hataları:** yanlış şablon, bozuk dosya, çok büyük dosya, makrolu dosya (`.xlsm`). Her biri tek cümle ve bir eylem.
6. **Geçmiş:** son içe aktarmaların listesi (dosya, tarih, yükleyen, durum, oluşan/hatalı). Satıra tıklayınca o içe aktarmanın sonucu açılır.
7. **Yetki:** EDITOR ve VIEWER için sayfa salt okunur ya da düğmeler kilitli; mevcut kilitli düğme dili.
8. **Ürünler sayfası:** "Excel'den içe aktar" düğmesi bu sayfaya götürür. Ayrıca bir içe aktarma bitince ürün listesinde kısa bir bilgi şeridi ("Az önce 45 ürün içe aktarıldı").

## D. Kapsam dışı (çizilmesin)

Parti ve zincir içe aktarma, Excel'de bakım sütunları, ürün adının çevirisi, mobil uygulama.

## Teslim

Çerçeve numaraları: A **140**'tan, B **141**'den, C **150**'den. Her çerçeve açık ve koyu; `.dc.html` bileşenleri `docs/design/v1.1/` altına.
