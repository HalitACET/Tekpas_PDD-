# M6 tasarım brifi — Claude Design v0.6

Pasaport ve QR. v0.5'in dili, token'ları ve bileşenleri korunur (renkler, Geist + serif başlık, durum çipleri, `--brand` yalnızca yayınlama gibi tekil eylemlerde). Bağlam ve kurallar: `docs/m6-plan.md`. Her çerçeve **açık ve koyu** temada.

**Sabit kurallar:**
- Yayın eşiği uyum skoru **%90**; skorun üç ölçütü: Onaylı adımlar (50), Zorunlu alanlar (30), Geçerli sertifikalar (20). Engeller skordan bağımsız yayını kapatır (onaysız adım, süresi dolmuş sertifika, zincir yok).
- Yayınlanan sürüm **değiştirilemez**; değişiklik yeni sürümdür, eskisi "Eski sürüm" olur. QR sürüm içermez, her zaman güncel sürümü açar.
- Herkese açık sayfa adresi: `kozapass.vercel.app/01/{GTIN 14 hane}/10/{parti no}`. Dil: TR / EN / DE.
- Pasaporta yalnızca **onaylı** veriler ve onaylı belgelerin alanları girer; dosyanın kendisi, telefon, kişi adları, miktar, üretim emri no hiç görünmez.
- Örnek veriler demo seed'inden: Nilüfer Giyim A.Ş. (Bursa), "Organik Pamuk Polo", parti `KP-2026-0915-A`, GTIN `02012345000025`, tedarikçiler Ege İplik (Denizli), Demirtaş Örme Kumaş, Uludağ Boya Terbiye, İnegöl Fason Dikim.

## A. Herkese açık pasaport sayfası (tüketici, girişsiz)

**Mobil öncelikli:** önce 390 px çizilir, sonra 1024 px masaüstü (tek sütun, ortalanmış, en fazla ~720 px içerik). Tema sistemi izler (`prefers-color-scheme`); sağ üstte küçük tema düğmesi isteğe bağlı. Okunabilirlik: gövde en az 15 px, dokunma hedefleri 44 px, kontrast AA. Sayfa hafif olmalı: görsel yok (ürün fotoğrafı M6'da yok), ikonlar çizgi, React Flow yok.

1. **Üst bant:** KozaPass küçük logosu, "Dijital Ürün Pasaportu" etiketi, dil seçici (TR · EN · DE, bağlantı olarak).
2. **Ürün başlığı:** ürün adı (serif, büyük), kategori, üretici firma ve şehri. Altında tanımlayıcı satırı mono: `(01) 02012345000025 · (10) KP-2026-0915-A`. Durum çipi "Doğrulanmış pasaport · Sürüm 2 · 28 Eki 2026". İsteğe bağlı (plan §9 karar 3): "Belgelenme düzeyi %93" küçük satır veya mini halka.
3. **Lif bileşimi:** yatay yığılmış çubuk + liste (%100 Organik pamuk; çok lifli örnek için %95 Pamuk + %5 Elastan da çizilsin). Etiket beyanı olduğunu söyleyen tek satır not.
4. **Tedarik zinciri:** dikey zaman çizgisi, kaynaktan ürüne: Lif → İplik → Kumaş → Boya → Konfeksiyon. Her adım kartı: aşama adı ve ikonu, firma adı, şehir/ülke bayrağı yerine ülke kodu, öne çıkan 1–3 veri (ör. menşe ülke, boya işlemi, kimyasal standartlar, enerji kaynakları), o adımın sertifika çipleri, "Onaylandı · 20 Eyl" satırı. Birden fazla girdisi olan adım (ör. iki iplikçi tek kumaşa) için birleşme gösterimi önerilsin. Mobilde kartlar katlanabilir (ilk açık, diğerleri özet).
5. **Sertifikalar:** kart listesi: tür (GOTS, OEKO-TEX…), sertifika no (mono), sahibi, veren kuruluş, geçerlilik aralığı, durum çipi **Geçerli** / **30 gün içinde doluyor**. Hangi adıma ait olduğu. Dosya indirme yok.
6. **Çevresel veriler** (veri varsa): enerji kaynakları dağılımı, su tüketimi (L/kg), enerji (kWh/kg). Veri yoksa bölüm hiç çizilmez; boş durum gerekmez.
7. **Bakım** (plan §9 karar 9 onaylanırsa): ISO 3758 bakım sembolleri satırı + açıklamaları. Onaylanmazsa çizilmesin.
8. **Pasaport bilgisi (alt):** sürüm, yayın tarihi, yayınlayan firma, "doğrulama kodu" (kısa özet, mono, kopyalanabilir), "Önceki sürümler" bağlantısı (karar 8), "KozaPass ile oluşturuldu" altbilgisi.

**Durumlar (ayrı çerçeveler):**
- a. **Tam pasaport** (yukarıdaki), mobil açık + koyu, masaüstü açık + koyu.
- b. **Yükleniyor / sunucu uyanıyor:** kabuk ve iskelet hemen; içerik yerinde "Pasaport hazırlanıyor, sayfa kendiliğinden yenilenecek" (panelin 31/32 uyuyan sunucu dilinin tüketici sürümü, teknik terim yok).
- c. **Bulunamadı (404):** "Bu kod için pasaport bulunamadı" + okutulan kodun tanımlayıcıları + "Kodu yeniden okutun" ipucu.
- d. **Geri çekildi (410):** "Bu pasaport üretici tarafından geri çekildi · {tarih}". Gerekçe gösterilmez.
- e. **Eski sürüm (`?v=1`):** üstte şerit "Bu sürüm güncel değil · Güncel sürümü aç".
- f. **Önizleme (panelden):** üstte sabit şerit "Önizleme · henüz yayınlanmadı", eksik bölümler soluk yer tutucuyla ("Sertifika henüz yok").
- g. **En uzun metin:** DE dilinde ve uzun firma/ürün adıyla 390 px kontrolü.

## B. Panel (masaüstü; parti detayı v0.3 09 / v0.5 üzerine)

1. **Uyum skoru kartı** (sağ sütundaki "—" kartının yerine):
   - Halka grafik: değer, %90 eşik çentiği; renk eşik altında `pending`, üstünde `approved`.
   - Kırılım (açılır): üç ölçüt satırı "Onaylı adımlar 40/50", "Zorunlu alanlar 30/30", "Geçerli sertifikalar 13/20"; her birinin altında madde listesi (ör. "Boya · sertifika yok", "Kumaş · onay bekliyor") ve maddeye tıklayınca ilgili adımın paneli açılır.
   - Engeller listesi kartın altında, kırmızı/sarı ikonlu satırlar: "Konfeksiyon adımı onaylanmadı", "Ege İplik · GOTS sertifikasının süresi 12 Eki'de doldu", "Uyum skoru %86, yayın için en az %90 gerekli".
   - Durumlar: hesaplanıyor (iskelet), eşik altı, eşik üstü ama engelli, yayına hazır, yayında (skor yayın anındaki değer + "Yayındaki sürüm: v2").
2. **"Önizle" ve "Pasaportu yayınla" düğmeleri:** yayına hazırken "Pasaportu yayınla" `--brand` dolu; değilken kapalı + gerekçe satırları (v0.3 09'daki kalıp). EDITOR/VIEWER: kapalı + "Bu işlem için yetkiniz yok" tooltip'i (v0.3.1 21).
3. **"Pasaportu yayınla" diyaloğu:**
   - Özet: "Sürüm 3 yayınlanacak", skor, içerik sayıları (5 adım, 3 sertifika, 4 tedarikçi), herkese açık adres (mono, kısaltılmış).
   - Uyarılar (yayını durdurmaz): "2 belge onay bekliyor, pasaporta girmeyecek", "OEKO-TEX sertifikası 18 gün içinde doluyor".
   - Değişmezlik notu: "Yayınlanan sürüm değiştirilemez. Sonraki değişiklikler yeni sürüm olarak yayınlanır; QR kod aynı kalır."
   - Düğmeler: "Vazgeç", "Yayınla" (brand). Gönderiliyor durumu; hata durumu (409: başka biri az önce yayınladı / engel çıktı → gerekçe listesi).
   - **Başarı durumu:** "Sürüm 3 yayında" + QR kartı (aşağıda) + "Pasaportu aç".
4. **QR kartı** (başarı diyaloğunda ve yayındaki partinin sağ sütununda):
   - QR önizlemesi, altında insan okunur satır `(01) 02012345000025 (10) KP-2026-0915-A`.
   - "PNG indir" (boyut seçimi 512 / 1024 px), "SVG indir (baskı)", "Bağlantıyı kopyala", "Pasaportu aç".
   - Not: "Demo adresi; gerçek etikete basmayın" (alan adı gelene kadar, küçük satır).
5. **Yayındaki parti başlığı:** "Yayında · v2" çipi; eylemler "Pasaportu aç", "QR", taşma menüsünde "Düzenlemeye aç" ve "Geri çek".
   - **Düzenlemeye aç** onayı: "Yayındaki sürüm (v2) QR okutanlara gösterilmeye devam eder. Değişiklikleri yeniden yayınladığınızda v3 olur." Düzenlemedeki parti için başlık çipi önerilsin ("Yayında v2 · düzenleniyor").
   - **Geri çek** diyaloğu (destructive): gerekçe alanı zorunlu (en fazla 500 karakter), etkisi: "QR okutanlar 'geri çekildi' mesajı görür, parti yeniden düzenlenebilir hale gelir."
6. **"Pasaport sürümleri" sekmesi** (v0.3 09'daki sekme, boş durumu var):
   - Tablo: Sürüm (v3), Durum çipi (**Yayında** brand, **Eski sürüm** nötr, **Geri çekildi** kırmızı), Yayın tarihi, Yayınlayan, Skor, sağda "Görüntüle" (herkese açık `?v=` adresi yeni sekmede). Geri çekilen satırda gerekçe ve geri çeken kişi/tarih alt satırda.
   - Boş durum (mevcut metin), tek sürüm, çok sürüm, yükleniyor, hata.
7. **Partiler listesi (v0.3.1 22):** "Uyum skoru" sütunu gerçek değer: sayı + ince çubuk, eşik altı/üstü rengi; yayındaki partide yayın anındaki skor.
8. **Ürün formu, bakım sembolleri** (yalnızca plan §9 karar 9 onaylanırsa): ürün sheet'inde (v0.3 03) "Bakım" bölümü, beş ISO 3758 grubu (yıkama, ağartma, kurutma, ütü, profesyonel temizlik) için sembollü seçim.

## C. Kapsam dışı (M6'da çizilmesin)

AI ile EN/DE çeviri ve çeviri düzenleme (M11), tutarlılık uyarıları paneli ve kural kodları (M7; skor kartında yalnızca engel satırı için yer bırakılabilir), okutma istatistikleri, mobil uygulama ekranları ve QR okutma (M8–M9), ürün fotoğrafı, ürün düzeyi (partisiz `/01/{gtin}`) sayfa, firma ayarlarında pasaport görünümü.

## Teslim

Çerçeve numaraları 62'den devam eder (62a/b Belgeler "Belge yükle" diyaloğu tasarımsız uygulandı, `impl-v0.5/62*`; v0.6 bunu da resmileştirebilir). Her çerçeve için açık + koyu PNG ve `.dc.html` bileşenleri `docs/design/v0.6/` altına.
