# Tanıtım animasyonu brifi — Claude Design

KozaPass'i hiç görmemiş birine, anlatıcı olmadan, yaklaşık 2,5 dakikada anlatan bir animasyon. Uygulamanın gerçek ekran görüntüleri kullanılır.

**Nasıl kullanılır:**
1. Bu dosyanın tamamını Claude Design'a yapıştırın.
2. Aşağıdaki "Yüklenecek görseller" listesindeki dosyaları da yükleyin.
3. Çıkan dosyaları `docs/design/animasyon/` klasörüne koyun.

---

## 1. Kim izleyecek, ne anlamalı

**İzleyici:** bir ERP yazılım firmasının yöneticisi. Tekstil üreticilerini tanıyor; yazılımın içini bilmesi gerekmiyor. Videoyu tek başına, büyük ihtimalle sessiz izleyecek.

**Video bitince aklında kalması gereken üç cümle:**
1. Tekstilde bir partinin tedarik zinciri bilgisi bugün WhatsApp, e-posta ve Excel'e dağılmış; KozaPass onu tek bir akışta topluyor.
2. Tedarikçi hesap açmadan telefondan veri gönderiyor; yapay zekâ sertifikayı okuyor, insan onaylıyor; sistem tutarsızlığı yayından önce yakalıyor.
3. Sonunda parti için QR kodlu, çok dilli, değiştirilemeyen bir dijital ürün pasaportu çıkıyor.

**Ton:** sakin, net, güven veren. Reklam abartısı yok ("devrim", "mükemmel" gibi kelimeler kullanmayın).

---

## 2. Biçim

- **Boyut:** yatay 16:9, 1920 × 1080.
- **Süre:** 2:20–2:40. Sahne süreleri aşağıda; toplam bunun içinde kalsın.
- **Ses olmadan anlaşılmalı:** her sahnede ekranda kısa, büyük bir metin var. Metinler okunacak kadar uzun kalsın (her 10 kelime için en az 3 saniye).
- **Oynatma:** baştan sona kendiliğinden oynasın. Duraklat / oynat ve sahneler arasında ileri-geri gitme olsun. Sunumda elle ilerletilebilsin diye.
- **Seslendirme (isteğe bağlı):** her sahnenin seslendirme cümlesi tabloda var. Animasyonun içine ses koymayın; metin ayrı kullanılabilsin.

---

## 3. Görsel dil

**KozaPass'in mevcut kimliği kullanılır, yenisi icat edilmez.**

| Öğe | Değer |
| --- | --- |
| Arka plan | Krem `#FAF6EE` (hikâye zemini), kenarlar `#EFE6D8` |
| Marka rengi | Dut `#8C2F4B` (logo, vurgular, ilerleme çizgisi) |
| Yazı | Koyu `#1C1B19`; ikincil metin gri |
| Durum renkleri | Onaylı yeşil `#22945A`, gönderildi mavi `#2F6FDB`, reddedildi kırmızı `#D92D20`, süresi yaklaşıyor turuncu `#E8680C`, AI'ın emin olmadığı alan sarı |
| Başlık yazı tipi | Newsreader (serif) |
| Metin yazı tipi | Geist; kodlar ve parti numaraları Geist Mono |
| Logo | `kozapass-mark.svg` (koza ve iplik). Logoyu değiştirmeyin, yeniden çizmeyin. |

**Ekran görüntülerinin sunumu:**
- Panel görüntüleri sade bir tarayıcı penceresi çerçevesinde; telefon görüntüleri sade bir telefon çerçevesinde.
- **Hareket:** yavaş yakınlaşma ve kaydırma. Anlatılan alana yumuşak bir vurgu (marka renginde ince çerçeve ya da etrafı hafifçe karartma).
- Bir sahnede aynı anda en fazla iki görüntü.
- Geçişler sade: kayma ya da solma. Dönen, zıplayan efektler yok.
- **Görüntülerin içi değiştirilmez:** rakamlar, adlar ve metinler oldukları gibi kalır. Kırpılabilir, büyütülebilir.
- Görüntülerde iki demo firma adı geçiyor (panelde Karaca Tekstil, pasaportta Nilüfer Giyim). Adları ekran metninde kullanmayın, böylece fark göze batmaz.

**Sürekli öğe:** ekranın altında ince bir ilerleme çizgisi. Beş durağı var: Parti → Tedarikçi → Belge ve AI → Kontrol → Pasaport. Hangi aşamadaysak o durak marka renginde yanar. İzleyici hikâyenin neresinde olduğunu hep görür.

---

## 4. Sahneler

Süreler yaklaşık; toplam ~2:30. Görsel yolları depodaki yerleridir. Claude Design'a dosya adıyla yüklenir.

| # | Süre | Ekran metni | Görsel | Hareket ve vurgu | Seslendirme (isteğe bağlı) |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00–0:06 | **KozaPass** · Tekstil için dijital ürün pasaportu | Logo | Koza ortada belirir, iplik çizilerek uzar; ad yanına yazılır. | "KozaPass: tekstil için dijital ürün pasaportu." |
| 2 | 0:06–0:20 | Bir tişörtün hikâyesi beş firmaya dağılmış. İplikçi, kumaşçı, boyahane, dikim… Bilgi WhatsApp'ta, e-postada, Excel'de. | Çizim, ekran görüntüsü yok | Beş küçük firma kartı (ikon + ad) dağınık durur. Aralarında mesaj, e-posta ve tablo simgeleri uçuşur, bazıları kaybolur. Bir sertifikanın üstünde "süresi doldu" damgası belirir. | "Bir tişörtün hikâyesi beş ayrı firmaya dağılmış durumda. Bilgi mesajlarda, e-postalarda, tablolarda kayboluyor." |
| 3 | 0:20–0:28 | Avrupa Birliği ürünler için dijital pasaport istiyor. Tekstil ilk sıralarda. | Çizim | Bir etiket üstünde boş bir QR kare belirir, soru işaretiyle. | "Avrupa Birliği ürünler için dijital pasaport istiyor; tekstil ilk sıralarda." |
| 4 | 0:28–0:38 | KozaPass bu hikâyeyi tek bir akışta topluyor. | Çizim | 2. sahnedeki dağınık kartlar soldan sağa tek bir çizgiye dizilir: Lif → İplik → Kumaş → Boya → Dikim. Altta ilerleme çizgisi belirir. | "KozaPass, bu hikâyeyi tek bir akışta topluyor." |
| 5 | 0:38–0:50 | **1. Parti** · Üretici bir üretim partisi açar. Zincir kendiliğinden kurulur; renk, adımın durumunu söyler. | `07-light.png` → `09-light.png` | Parti listesinden bir satır vurgulanır, parti detayına geçilir. Zincire yavaşça yakınlaşılır: onaylı yeşil, bekleyen gri düğümler. | "Üretici bir parti açar. Tedarik zinciri soldan sağa kurulur; her düğümün rengi o adımın durumunu gösterir." |
| 6 | 0:50–1:00 | **2. Tedarikçi** · Her tedarikçiye tek bir bağlantı. WhatsApp'tan gider; hesap yok, şifre yok. | `46a-light.png` | WhatsApp mesajı ve "Bağlantıyı kopyala" alanı vurgulanır. | "Her tedarikçiye tek bir bağlantı gider, WhatsApp'tan. Tedarikçinin hesap açması gerekmez." |
| 7 | 1:00–1:12 | Tedarikçi telefondan doldurur. Form, hatayı gönderilmeden söyler. | Telefon çerçevesinde `39-light.png` → `40b-light.png` | Karşılama ekranı ("kim istiyor, ne zamana kadar") görünür. Form kayarak gelir; "%100 değil" uyarısı vurgulanır. | "Tedarikçi formu telefondan doldurur. Lif oranları yüzde yüze tamamlanmıyorsa form bunu daha göndermeden söyler." |
| 8 | 1:12–1:22 | Gelen veri panelde. Üretici onaylar ya da gerekçeyle düzeltme ister. | `47a-light.png` | İnceleme bandı ve "Onayla" / "Düzeltme iste" düğmeleri vurgulanır. | "Gelen veri panele düşer. Üretici onaylar ya da gerekçesini yazarak düzeltme ister." |
| 9 | 1:22–1:38 | **3. Belge ve AI** · Yapay zekâ sertifikayı okur ve her değerin belgedeki yerini gösterir. Emin olmadığı alan sarıdır. **AI önerir, insan onaylar.** | `57c-light.png`, köşede telefon çerçevesinde `08-form-ai.png` | Önce soldaki belge, sonra sağdaki alanlar. Sarı "%61" alanı ve altındaki "Belgede: …" alıntısı vurgulanır. Telefon görüntüsü küçük girer: sahadan çekilen sertifika, 4 saniyede dolu form. | "Yapay zekâ sertifikayı okur, her değerin belgede nerede yazdığını gösterir. Emin olmadığı alanı sarıyla işaretler. Son kararı her zaman bir insan verir." |
| 10 | 1:38–1:50 | **4. Kontrol** · Etikette %95 organik pamuk yazıyor, iplikçi %80 pamuk diyor. KozaPass yayından önce yakalar. | `78-uyarilar-light.png` | LIF-01 kartındaki iki kutu yan yana vurgulanır: "Etiket beyanı" ve "Bursa İplik San. beyanı". Ardından sağ üstteki kilitli "Pasaportu yayınla" düğmesi. | "Etikette yüzde doksan beş organik pamuk yazıyor, iplikçi yüzde seksen pamuk diyor. KozaPass bu çelişkiyi yayından önce yakalar ve yayını durdurur." |
| 11 | 1:50–1:58 | Süresi dolan sertifikalar her gün taranır. | `89a-gorevler-sertifikalar-light.png` | Turuncu "süresi doluyor" satırları vurgulanır. | "Süresi dolmak üzere olan sertifikalar her gün taranır, görev listesine düşer." |
| 12 | 1:58–2:10 | **5. Pasaport** · Her şey onaylı: pasaport yayında. Yayınlanan sürüm değişmez; değişiklik yeni sürümdür. | `64a-yayin-diyalog.jpg` → `64b-yayin-basari-qr.jpg` | Yayın diyaloğu, ardından QR kodu büyür ve ekranın ortasına gelir. | "Her şey onaylandığında pasaport yayınlanır. Yayınlanan sürüm değiştirilemez; her değişiklik yeni bir sürümdür." |
| 13 | 2:10–2:22 | Müşteri QR'ı okutur; pasaport kendi dilinde açılır. Uygulama indirmeye gerek yok. | Telefon çerçevelerinde `63a-pasaport-mobil-acik-en.jpg` ve `63b-pasaport-mobil-koyu-de.jpg` | Önceki sahnedeki QR bir telefona "okunur". Pasaport İngilizce açılır, yanına Almanca ikinci telefon kayar. | "Müşteri QR kodu okutur, pasaport kendi dilinde açılır. Uygulama indirmesi gerekmez." |
| 14 | 2:22–2:32 | Ekip rollerle çalışır. Kim neyi ne zaman değiştirdi, kayıtlı. | `12-kullanicilar-light.png` → `12-denetim-izi-light.png` | Roller sütunu, sonra denetim izinde "Yayınladı" satırı vurgulanır. | "Ekip rollerle çalışır; kim neyi ne zaman değiştirdi, denetim izinde kayıtlıdır." |
| 15 | 2:32–2:40 | Ürünler Excel'den toplu gelir. | `11-ice-aktarma-light.png` | "45 ürün oluşturuldu" sonucu vurgulanır. | "Ürün listesi Excel'den toplu olarak aktarılır." |
| 16 | 2:40–2:48 | **KozaPass** · Bir partinin hikâyesi, tek QR'da. · kozapass.vercel.app | Logo + QR | Zincir çizgisi tek bir QR'a toplanır, logo ve canlı adres belirir. | "KozaPass: bir partinin hikâyesi, tek QR'da." |

---

## 5. Yapılmaması gerekenler

- **Olmayan özellik gösterilmez.** Şunlar yok: e-postayla bildirim veya davet, ERP'ye hazır entegrasyon, ödeme. Ürünler Excel'den gelir; "ERP ile entegre" gibi bir cümle yazılmaz.
- **Görüntülerdeki rakamlar ve adlar değiştirilmez.** Hepsi kurgusal demo verisidir (firma adları, sertifika numaraları). Gerçek bir firma adı ya da logosu eklenmez. OEKO-TEX, GOTS gibi kuruluşların logoları çizilmez; adları geçebilir.
- **Mevzuat için tarih ya da tüzük numarası yazılmaz.** Kaynağı rapor tamamlanınca eklenecek. 3. sahnedeki genel cümle yeterli.
- Yeni arayüz ekranı tasarlanmaz. Ekran görüntüsü dışındaki çizimler (2., 3., 4. ve 16. sahne) sade ikon ve kart düzeyinde kalır.

---

## 6. Yüklenecek görseller

Hepsi depodaki gerçek uygulama ekranları (tasarım çizimi değil).

| Dosya | Yer | Ne gösteriyor |
| --- | --- | --- |
| `kozapass-mark.svg` | `docs/brand/` | Logo |
| `07-light.png` | `docs/design/impl-v0.3/` | Parti listesi |
| `09-light.png` | `docs/design/impl-v0.3/` | Parti detayı, tedarik zinciri |
| `46a-light.png` | `docs/design/impl-v0.4/` | Veri talebi: bağlantı ve WhatsApp mesajı |
| `39-light.png` | `docs/design/impl-v0.4/` | Tedarikçi sayfası, karşılama (telefon) |
| `40b-light.png` | `docs/design/impl-v0.4/` | Tedarikçi formu, doğrulama uyarıları (telefon) |
| `47a-light.png` | `docs/design/impl-v0.4/` | Gelen veri: onayla / düzeltme iste |
| `57c-light.png` | `docs/design/impl-v0.5/` | Belge inceleme: AI'ın okuduğu alanlar, sarı alan, alıntı |
| `08-form-ai.png` | `docs/haftalik/img/` | Mobil: çekilen belge, 4 saniyede dolu form |
| `78-uyarilar-light.png` | `docs/design/impl-v0.7/` | LIF-01 uyarısı: etiket ve kumaş beyanı |
| `89a-gorevler-sertifikalar-light.png` | `docs/design/impl-v0.7/` | Süresi dolan sertifikalar |
| `64a-yayin-diyalog.jpg` | `docs/design/impl-v0.6/` | Pasaportu yayınla diyaloğu |
| `64b-yayin-basari-qr.jpg` | `docs/design/impl-v0.6/` | Yayında, QR kodu |
| `63a-pasaport-mobil-acik-en.jpg` | `docs/design/impl-v0.6/` | Pasaport, telefonda, İngilizce. Sol alttaki yuvarlak "N" simgesi geliştirme aracına ait; kırpın ya da örtün. |
| `63b-pasaport-mobil-koyu-de.jpg` | `docs/design/impl-v0.6/` | Pasaport, telefonda, Almanca, koyu tema. Aynı "N" simgesi varsa kırpın. |
| `12-kullanicilar-light.png` | `docs/haftalik/img/` | Kullanıcılar ve roller |
| `12-denetim-izi-light.png` | `docs/haftalik/img/` | Denetim izi |
| `11-ice-aktarma-light.png` | `docs/haftalik/img/` | Excel içe aktarma sonucu |

**Yedek görseller** (gerekirse):
- `docs/design/impl-v0.7/79j-ai-onerisi-light.png`: AI önerisi kartı.
- `docs/haftalik/img/11-ceviriler-light.png`: çeviriler ve Almanca pasaport önizlemesi.
- `docs/haftalik/img/08-form-alanlar.png`: mobilde sarı alanlar.
- `docs/design/impl-v0.4/48a-light.png`: Görevler.
