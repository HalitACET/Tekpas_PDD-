# M8 tasarım brifi — Claude Design v0.8 (mobil)

Sahadaki kullanıcı için **telefon uygulaması** (Expo, iOS ve Android). Web panelin dili, token'ları ve markası korunur (renkler, Geist + Geist Mono + serif başlık, `--status-*` çipleri, `--brand` yalnızca tekil ana eylemde), ama **web'in kopyası değildir: mobil sahada iş görür**. Bağlam: `docs/m8-plan.md`, `mobile/CLAUDE.md`. Önceki mobil öncelikli tasarım: tedarikçi sayfası (v0.4 39–45) ve herkese açık pasaport (v0.6 63); dokunma ve tipografi ölçüleri oradan.

**Ekran ve tema:** 390×844 (iPhone 14/15) ana çerçeve; önemli üç ekran ayrıca 360×800 (Android). Her çerçeve **açık ve koyu**. Güvenli alanlar (çentik, alt çubuk) çizilsin.

**Sabit kurallar:**
- Dokunma alanı en az 44 pt; ana eylemler başparmağın eriştiği altta, tek elle kullanım. Eldiven ve kötü ışık: yüksek kontrast, küçük gri metin yok.
- Alt sekme çubuğu: **Görevler**, **Tara** (M9, "Yakında" ile kapalı), **Profil**. Görevler'de belirgin bir **"Belge çek"** ana eylemi.
- Metinler Türkçe (çeviri anahtarına dönüşecek), tarih "12 Eki 2026", saat "14:32".
- Roller: OWNER ve ADMIN onaylar; EDITOR belge yükler, onay düğmesi kapalı ("Onay yöneticide"); VIEWER yalnızca görür.
- Örnek veri: firma Karaca Tekstil A.Ş., kullanıcı Elif Yılmaz (Yönetici); parti `KP-2026-0915-A` Organik Pamuk Polo; tedarikçiler Ege İplik, Demirtaş Örme Kumaş, Uludağ Boya Terbiye; sertifika GOTS (CU 1047823, Control Union, 13.03.2027'ye kadar).

## A. Giriş ve oturum (çerçeve 90'dan başlar)
1. **Giriş:** marka, e-posta, şifre (göster/gizle), "Giriş yap"; yükleniyor; hatalar: yanlış bilgiler, ağ yok, **"Sunucu uyanıyor"** (ilk istek 30–60 s; ilerleme ve açıklama, web'deki şeridin mobil hali).
2. **Açılış:** oturum geri gelirken kısa açılış ekranı.

## B. Görevlerim (ana ekran)
1. Başlık: "Görevler", tarih ve sayı; aşağı çekip yenileme.
2. Gruplar (kart listesi, her satır büyük dokunma alanı):
   - **Onayınızı bekleyen belgeler:** belge türü rozeti, parti no, adım ve tedarikçi, okuma durumu ("AI okudu · 2 alan sarı", "Okunamadı, elle girin"), zaman. Dokununca belge formu (D).
   - **Onay bekleyen veriler:** tedarikçinin gönderdiği adımlar (yalnızca görüntüleme; hızlı onay M9), "Web'de incele" notu.
   - **Süresi yaklaşan sertifikalar:** tedarikçi, sertifika, "12 gün içinde doluyor" / "Süresi doldu" (kırmızı).
3. Durumlar: yükleniyor (iskelet), boş ("Bekleyen görev yok" + "Belge çek"), hata (HTTP + tekrar dene), çevrimdışı şeridi.
4. VIEWER: "Belge çek" kapalı ve nedeni.

## C. Belge çek akışı
1. **Parti seç:** son partiler (veri toplanıyor / yayına hazır önce), arama (parti no, ürün); satırda ürün ve ilerleme.
2. **Adım seç:** partinin adımları (İplik · Ege İplik …), adımın belge sayısı; yayınlanmış parti seçilemez (neden yazılı).
3. **Kamera:** tam ekran önizleme, belge çerçeve kılavuzu, flaş, **sayfa sayacı** ("2. sayfa"), deklanşör, son çekilen küçük resim, "Bitti". İzin isteme ekranı ve **izin reddedildi** durumu ("Ayarlar'dan izin verin").
4. **Gözden geçir:** sayfa küçük resimleri (sıra numarası, sil, yeniden çek, sürükleyerek sırala isteğe bağlı), "Sayfa ekle", belge türü seçimi (isteğe bağlı: GOTS, OEKO-TEX…, "Bilmiyorum"), birincil **"Yükle"**. 10 sayfa sınırı ve boyut uyarısı.
5. **Yükleniyor ve okunuyor:** iki aşamalı ilerleme ("Yükleniyor %60" → "AI okuyor…"), iptal. 20 s'yi geçerse **"Okuma uzun sürüyor"** + "Elle doldur". Hata: bağlantı koptu → sayfalar korunur, "Tekrar dene".
6. **Okunamadı:** "Belge okunamadı, alanları elle girin" ile boş form.

## D. Belge formu (yükleme sonrası ve görevden)
1. Üstte belge görüntüsü (sayfa kaydırma, büyütme), parti/adım/tedarikçi satırı.
2. Alanlar: belge türü, sertifika no, sahip, veren kuruluş, geçerlilik başlangıç ve bitiş (tarih seçici). Her alanda **kaynak** ("AI okudu", "Kural okudu", "Siz girdiniz") ve **güven** (< %80 sarı kenar + "Kontrol edin"). Zorunlu alan hataları (sertifika için numara ve bitiş).
3. Alt sabit çubuk: OWNER/ADMIN **"Onayla"**; EDITOR/VIEWER kapalı + "Onay yöneticide". Onay sonrası başarı ("Belge onaylandı · GOTS · Ege İplik") ve Görevlere dönüş.
4. Çakışma: başkası onaylamış (409) → "Bu belge zaten onaylandı".

## E. Profil
Kullanıcı, firma, rol; dil (Türkçe / English / Deutsch); tema (sistem / açık / koyu); uygulama sürümü ve sunucu adresi (küçük); "Çıkış yap" (onay ile).

## F. Kapsam dışı (M8'de çizilmesin)
QR okutma ekranı (M9; yalnızca kapalı sekme), hızlı onay/red (M9), push izin ve bildirim ekranları (M9), çevrimdışı kuyruk ekranı (M9), tedarikçi hesabı, tablet düzeni.

## Teslim
Çerçeve numaraları **90'dan** devam eder. Her çerçeve açık + koyu PNG ve `.dc.html` bileşenleri `docs/design/v0.8/` altına.
