# M10 tasarım brifi — Claude Design v1.0 (bakım bilgisi)

Ürünün **bakım talimatı** (yıkama, ağartma, kurutma, ütüleme, profesyonel temizleme): üretici web panelinde ürün formunda girer, herkese açık pasaportta tüketici görür. Bağlam: `docs/m10-plan.md` T8, `docs/m6-plan.md` §9 karar 9 (M6'dan ertelendi).

**Mevcut tasarımlar kullanılır, yenisi icat edilmez:**
- Ürün formu ve paneli: v0.3, çerçeve 03–04.
- Herkese açık pasaport: v0.6, çerçeve 63a/63b; mobil öncelikli, üç dil.
- Token'lar: `--status-*`, Geist + Geist Mono + Newsreader başlık.

**Ekran ve tema:**
- Panel 1440 genişlik, pasaport 390 (telefon) ve 1280.
- Her çerçeve açık ve koyu.
- Pasaport çerçeveleri ayrıca **İngilizce** ve **Almanca**; en uzun metinle taşma kontrolü.

**Veri (ISO 3758 kategorileri):**

| Kategori | Seçenekler (örnek) |
| --- | --- |
| Yıkama | 30 °C, 40 °C, 60 °C, 95 °C; hassas (bir çizgi) / çok hassas (iki çizgi); elde yıkama; yıkanmaz |
| Ağartma | her türlü ağartıcı; yalnızca oksijenli; ağartılmaz |
| Kurutma | tamburda düşük / normal ısı; tamburda kurutulmaz; asarak, düz serip, gölgede (doğal kurutma) |
| Ütüleme | düşük (110 °C, 1 nokta) / orta (150 °C, 2 nokta) / yüksek (200 °C, 3 nokta); ütülenmez |
| Profesyonel | kuru temizleme P / F (hassas çizgisiyle); yapılmaz; profesyonel ıslak temizleme W |

Her kategoride en fazla bir seçim yapılır; kategori boş bırakılabilir. İsteğe bağlı serbest not (ör. "Ters çevirerek yıkayın", en fazla 200 karakter, üç dilde değil, girildiği dilde).

## A. Panel · ürün formu (çerçeve 120'den başlar)
1. **Ürün düzenleme panelinde "Bakım talimatı" bölümü** (mevcut 03 formunun altında):
   - Beş kategori satırı. Her satırda sembol düğmeleri (44 px); seçili olan dolu, diğerleri çizgi. Altında seçimin adı ("40 °C, hassas").
   - "Temizle" bağlantısı ve serbest not alanı.
2. **Boş durum:** "Bakım talimatı girilmedi" ve "Pasaportta bu bölüm görünmez" notu.
3. **Uyum skorunda ürün alanı:** bakım talimatı eksikse skor kartında bilgi satırı ("Bakım talimatı eksik", engelleyici değil).
4. **Yayınlanmış parti uyarısı:** ürünün bakım bilgisi değişirse yayınlanmış pasaport değişmez; yeni sürüm yayınlanınca girer. Formda kısa not.

## B. Herkese açık pasaport
1. **"Bakım" bölümü** (63a'daki bölüm düzeninde):
   - Sembol sırası ve her sembolün altında kısa metin ("40 °C'de yıkayın").
   - Serbest not varsa altında.
2. **Telefon (390):** semboller tek satırda sığmazsa iki satır.
3. Erişilebilirlik: her sembolün metni ekran okuyucuda okunur; sembol tek başına anlam taşımaz.
4. Bakım bilgisi olmayan pasaportta bölüm hiç görünmez.

## C. Not: semboller
ISO 3758 sembolleri GINETEX'in tescilli işaretleridir. Tasarım:
- standarda **benzeyen ama birebir kopyalamayan** sade çizgi ikonlar kullanmalı,
- ya da lisans durumunu not düşmeli.

Karar kullanıcınındır; bu çerçevelerde çizgi ikon kullanılsın.

## D. Tedarikçinin ilgili kişisi (kodda var, tasarım onayı için)
M10 T3'te tedarikçiye isteğe bağlı **"İlgili kişi"** eklendi (en fazla 100 karakter; telefon gibi üreticinin bu tedarikçiyle bağına ait). Mevcut bileşenlerle kodlandı; çerçevesi yok. Lütfen şu üç yeri çiz ya da düzelt:
1. **Tedarikçi ekle / düzenle diyaloğu** (v0.3.2 36a/36b): bugün "Şehir | İletişim telefonu" satırının altında tam genişlikte "İlgili kişi" alanı, yer tutucu "örn. Selin Arslan". Kendi hesabı olan firmada (36a, ad/tip/şehir kilitli) telefon gibi düzenlenebilir.
2. **Tedarikçiler listesi** (v0.3.1 27, "İletişim" sütunu): kişi adı üstte (13 px), telefon altında (mono). Kişi yoksa yalnızca telefon.
3. **Veri talep et** (v0.4 46a): kişi varsa üstte kişinin adı ve baş harfleri, altında "firma · şehir". Mesaj "Merhaba {ad}," ile başlar. Unvan yok ("Murat Bey" değil): cinsiyet tahmini gerekirdi.

## E. Kapsam dışı (çizilmesin)
Mobil uygulamada bakım bilgisi, Excel içe aktarmada bakım sütunu (M11), etiket basımı.

## Teslim
Çerçeve numaraları **120'den** başlar (A, B), D bölümü **130'dan**. Her çerçeve açık ve koyu PNG; `.dc.html` bileşenleri `docs/design/v1.0/` altına.
