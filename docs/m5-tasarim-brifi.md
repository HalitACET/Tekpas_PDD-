# M5 tasarım brifi — Claude Design v0.5

Belge yükleme ve belge okuma. v0.4'ün dili, token'ları ve bileşenleri korunur. Her ekran açık ve koyu temada; tedarikçi ekranları 390 px (mobil öncelikli), panel masaüstü. Bağlam ve kurallar: `docs/m5-plan.md`.

**Sabit kurallar:** PDF, JPG, PNG; en fazla 10 MB; PDF en fazla 20 sayfa; link başına en fazla 5 belge. Okunan alanlar: Belge türü, Sertifika no, Sertifika sahibi, Veren kuruluş, Geçerlilik başlangıcı, Geçerlilik bitişi. Güven < 0,8 sarı (`--status-low-confidence-*`). AI önerir, insan onaylar: onaylanmadan hiçbir değer kayda geçmez.

## A. Tedarikçi sayfası `/r` (v0.4 42'nin yerine)

1. **Belgeler bölümü, boş:** 42'deki kutu açık; "Belge yükle" (dosya seç; telefonda kamera / dosyalar seçimi tarayıcıdan gelir), tür ipucu (GOTS · OEKO-TEX · teknik föy), biçim ve boyut satırı. "İsteğe bağlı" etiketi kalır.
2. **Yükleniyor:** dosya satırında ilerleme çubuğu, yüzde, "İptal".
3. **Yüklendi:** dosya satırı (ad, boyut, tür simgesi, "Kaldır"); birden fazla belge listesi; 5. belgeden sonra yükleme düğmesi kapalı + neden.
4. **Hatalar (satır içi, dosya satırında):** desteklenmeyen biçim, 10 MB'ı aşıyor, aynı belge zaten yüklendi, şifreli veya bozuk PDF, 20 sayfayı aşıyor, belge sınırı doldu, çok fazla deneme (429), bağlantı koptu + "Tekrar dene".
5. **Demo uyarısı:** AI okuma açıkken bölümün üstünde tek satırlık not: "Demo ortamı: gerçek belge yüklemeyin."
6. **Gönderildi (43):** özetin içinde yüklenen belgelerin adları.
7. **Düzeltme (45):** gerekçe "Belge okunaksız" veya "Sertifika süresi dolmuş" ise Belgeler bölümü işaretli; önceki belgeler salt okunur "Önceki gönderim" altında, yeni belge eklenebilir.

Tedarikçi okunan değerleri görmez (açık karar 1; aksi karar çıkarsa B2'nin mobil hali eklenir).

## B. Panel

1. **Düğüm paneli / 47a "Belgeler" bölümü:** belge kartı (tür, ad, yükleyen ve tarih, durum çipi). Çipler: **Okunuyor**, **Onay bekliyor** (tam okundu), **Düşük güven** (en az bir alan < 0,8), **Okunamadı** (elle girilecek), **Hata** ("Tekrar oku"), **Onaylandı**. Boş durum + "Belge yükle".
2. **Belge inceleme ve onay** (sheet veya geniş diyalog): solda önizleme (PDF sayfa geçişi, görüntü yakınlaştırma), sağda alan formu. Her alanda kaynak rozeti (**Belgeden**, **AI**, **Elle**), güven yüzdesi, kanıt satırı ("Belgede: '…' · s. 1"). Durumlar:
   - a. okunuyor (form iskeleti + "Belge okunuyor", 30 sn sonra "Sayfadan ayrılabilirsiniz")
   - b. tam okundu (hepsi yeşil/nötr)
   - c. düşük güven (sarı alanlar, AI kaynaklı alanlar her zaman sarı)
   - d. okunamadı (boş form + neden: "Bu belgede okunabilir metin yok, alanları elle girin")
   - e. hata (neden kodu + "Tekrar oku")
   - f. onaylandı (salt okunur, "Onaylayan · tarih", düzeltilen alanlar işaretli)
   - g. sertifika süresi dolmuş (bitiş tarihi geçmişte: kırmızı uyarı, onay yine mümkün)
   - h. yetkisiz rol (EDITOR/VIEWER: form salt okunur, "Onay için yönetici yetkisi gerekir")
   - Düğmeler: "Onayla", "Vazgeç"; kaydedilmemiş değişiklikle kapatma onayı.
3. **Panelden yükleme:** düğüm panelinde "Belge yükle" + sürükle bırak alanı; A2–A4'ün masaüstü hali.
4. **Zincir düğümü:** belge simgesi ve sayısı (M3'te gizli bırakıldı), okunmayı bekleyen belge için nokta.
5. **47b red seçenekleri:** "Belge okunaksız", "Sertifika süresi dolmuş" açılır (M4'te gizliydi).
6. **Tedarikçiler (14) "Sertifikalar" sütunu:** onaylı ve geçerli sertifika türleri çip olarak, süresi dolmuşsa kırmızı (şu an "—").

## C. Kapsam dışı (M5'te çizilmesin)

Mobil uygulama kamerası (M8), sertifika süre takibi ve 30 gün uyarısı (M7), tutarlılık uyarıları (M7), ayrı "Belgeler" menü sayfası.
