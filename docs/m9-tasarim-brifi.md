# M9 tasarım brifi — Claude Design v0.9 (mobil II)

Mevcut telefon uygulamasının (Claude Design v0.8, çerçeve 90–100) devamı. **v0.8'in token'ları, bileşenleri ve kalıpları aynen kullanılır, yenisi icat edilmez:**
- Renk ve tipografi: `--status-*` çipleri, `--brand` yalnızca tekil ana eylemde; Geist + Geist Mono + Newsreader başlık.
- Butonlar 56 pt, alttan açılan panel (sheet), banner, kart listesi, 64 pt sekme çubuğu.

Bağlam: `docs/m9-plan.md`, `mobile/CLAUDE.md`. Gerçek telefondan M8 ekran görüntüleri: `docs/haftalik/img/08-*.png`.

**Ekran ve tema:** 390×844 ana çerçeve. Önemli üç ekran (Tara, adım inceleme, kuyruk) ayrıca 360×800 (Android). Her çerçeve **açık ve koyu**; güvenli alanlar çizilsin.

**Sabit kurallar (v0.8 ile aynı):**
- Dokunma alanı en az 44 pt; ana eylem altta, tek elle kullanım.
- Yüksek kontrast, küçük gri metin yok.
- Metinler Türkçe (çeviri anahtarına dönüşecek); tarih "12 Eki 2026", saat "14:32".
- Roller:
  - OWNER ve ADMIN onaylar ve düzeltme ister.
  - EDITOR ve VIEWER veriyi görür, düğmeler kapalı ("Onay yöneticide").
- Sekme çubuğu: **Görevler**, **Tara** (artık açık), **Profil**.
- Örnek veri (v0.8 ile aynı):
  - Firma Karaca Tekstil A.Ş., kullanıcı Elif Yılmaz (Yönetici).
  - Parti `KP-2026-0915-A` Organik Pamuk Polo, GTIN 08691234567890 (kontrol hanesi geçerli).
  - Tedarikçiler Ege İplik (Mehmet Kaya, +90 532 …), Demirtaş Örme Kumaş, Uludağ Boya Terbiye.

## A. Tara (çerçeve 101'den başlar)
1. **Tarayıcı:**
   - Tam ekran kamera, koyu, tema ne olursa olsun; ortada kare QR kadrajı (köşeler).
   - Altta açıklama: "Ürün etiketindeki veya pasaporttaki QR'ı okutun". Flaş düğmesi.
   - Okunduğu an kadraj yeşil olur, kısa bir onay hissi verilir.
2. **Çözümleniyor:** kod okundu, parti aranıyor (kısa yükleniyor durumu, iptal).
3. **Sonuçlar:**
   - **Kendi partisi →** parti özeti (B).
   - **Başka firmanın / bulunamadı →** "Bu parti sizin firmanızda değil, herkese açık pasaportu açılıyor" ara bilgisi, sonra sistemin uygulama içi tarayıcısı açılır. Tarayıcının kendisi çizilmesin, yalnızca geçiş anı.
   - **Tanınmayan kod →** alttan panel: "Bu kod bir KozaPass pasaportu değil", okunan metin (mono, kısaltılmış), "Tekrar okut".
   - **Bağlantı yok →** "Parti aranamadı, bağlantınızı kontrol edin", "Tekrar dene".
4. **İzin:** M8 kamerasının izin isteme ve reddedildi ekranlarının QR'a uyarlanmış hali. Metin: "QR okutmak için kameraya ihtiyacımız var".

## B. Parti özeti (QR'dan ya da bildirimden)
- **Başlık:** parti no (mono), ürün adı, durum çipi (Veri toplanıyor / Yayına hazır / Yayınlandı), uyum skoru (sayı + eşik), açık uyarı sayısı (engelleyici kırmızı).
- **Adımlar listesi:** Lif → İplik → Kumaş → Boya → Konfeksiyon. Her satırda:
  - adım, tedarikçi, durum çipi (Bekleniyor / Gönderildi / Onaylandı / Düzeltme istendi), belge sayısı;
  - "Gönderildi" satırı vurgulu: "İncele".
- **Altta ikincil eylemler:** "Pasaportu aç" (yayınlandıysa), "Belge çek" (bu partiye, M8 akışına parti seçili girer).
- **Yalnızca görüntüleme** notu: "Zinciri düzenlemek için web panelini kullanın".
- **Durumlar:** yükleniyor (iskelet), hata.

## C. Adım inceleme ve hızlı onay
1. **Gönderilen veri:**
   - Üstte parti no, adım ve tedarikçi; gönderen ve zaman ("Mehmet Kaya · bugün 14:32").
   - Veri adım tipine göre okunur bir özet olarak gösterilir. Örnek iplik adımı:
     - Lif bileşimi: %95 organik pamuk, %5 elastan, oran çubuğuyla.
     - İplik no Ne 30/1, proses penye.
     - Menşe Türkiye · Şanlıurfa.
     - Enerji 2,4 kWh/kg, %60 şebeke + %40 güneş.
     - Teslim 1.200 kg.
   - Başka bir örnek: boya adımı (boya prosesi, kimyasal standartları, su l/kg).
   - Belgeler: kart listesi (tür rozeti, okuma çipi); dokununca v0.8 belge formu.
2. **Alt sabit çubuk (OWNER/ADMIN):**
   - Birincil **"Onayla"** (brand).
   - İkincil **"Düzeltme iste"**.
3. **Onaylandı:** v0.8 başarı ekranı kalıbı: "Veri onaylandı · İplik · Ege İplik", parti ilerlemesi ("5 adımdan 4'ü onaylandı"), "Görevlere dön".
4. **Düzeltme iste paneli:**
   - Hazır gerekçe çipleri: "Lif oranı uyuşmuyor", "Belge okunaksız", "Sertifika süresi dolmuş".
   - Gerekçe metin alanı (zorunlu; boşken gönder kapalı) ve not: "Gerekçe tedarikçiye iletilir ve parti geçmişine kaydedilir".
   - Birincil düğme: "Düzeltme talebini gönder" (yıkıcı değil, nötr).
5. **Red sonrası:**
   - "Düzeltme istendi. Tedarikçiye yeni bir bağlantı gönderin." ve **"WhatsApp'ta gönder"** (birincil).
   - İkincil eylemler: "Bağlantıyı paylaş" (sistem paylaşımı), "Sonra".
   - Bağlantı oluşturulurken yükleniyor; hata durumu.
6. **Durumlar:**
   - EDITOR/VIEWER: düğmeler kapalı ve nedeni.
   - Zaten incelenmiş (409): "Bu veri zaten incelendi · Ahmet Demir onayladı".
   - Yükleniyor, hata.
7. **Görevler'de değişiklik:** "Onay bekleyen veriler" satırları artık dokunulabilir (sağda ok). "Web'de inceleyip onaylayın" notu kalkar.

## D. Bildirimler
1. **İzin açıklaması** (ilk girişten sonra bir kez, tam ekran):
   - "Yeni veri gelince haber verelim". Örnek bildirim önizlemesi.
   - "Bildirimlere izin ver" (birincil), "Şimdi değil".
2. **İzin reddedildi:** Profil'den ulaşılan durum. "Ayarlar'dan bildirimlere izin verin" ve adımları (M8 kamera reddi kalıbı).
3. **Bildirimin görünümü** (sistem çizer; yalnızca içeriği göstermek için kilit ekranı ve bildirim merkezi örneği, açık ve koyu):
   - Veri geldi: başlık "Yeni veri: İplik", gövde "Ege İplik verisini gönderdi · KP-2026-0915-A".
   - Sertifikalar: "2 sertifikanın süresi 30 gün içinde doluyor".
4. **Uygulama açıkken gelen bildirim:** üstte uygulamanın kendi banner'ı (v0.8 banner kalıbı, 4 sn), dokununca ilgili ekran.
5. **Profil'de "Bildirimler" satırı:**
   - Açık/kapalı anahtar (switch, 44 pt) ve durum metni: "Açık", "Sistem ayarlarında kapalı" + "Ayarlar'ı aç".
   - Expo Go'da: "Bildirimler yalnızca uygulamanın kurulu sürümünde çalışır" (bilgi, hata değil).

## E. Yükleme kuyruğu (zayıf bağlantı)
1. **Gözden geçir (v0.8 96) çevrimdışı:** "Yükle" yerine **"Sıraya al"**; üstte "Bağlantı yok. Belge kaydedilecek ve bağlantı gelince yüklenecek."
2. **Sıraya alındı:** kısa onay ekranı ya da panel. "Belge sıraya alındı · bağlantı gelince yüklenecek", "Görevlere dön", "Başka belge çek".
3. **Yükleme sırasında bağlantı koptu** (v0.8 97c'nin yeni hali): "Tekrar dene" yanında **"Sıraya al"**.
4. **Görevler'de kuyruk şeridi:** listenin üstünde. "2 belge yüklenmeyi bekliyor · bağlantı yok" / "1 belge yükleniyor %40" / "1 belge yüklenemedi". Dokununca kuyruk ekranı.
5. **Kuyruk ekranı:**
   - Her öğe: ilk sayfanın küçük resmi, belge türü, parti no ve adım, sayfa sayısı ve boyut, zaman.
   - Durumlar: Bekliyor (bağlantı yok) / Yükleniyor %60 / Yüklendi, okunuyor / Yüklenemedi + sebep ("Yayınlanmış partiye belge eklenemez").
   - Eylemler: "Sil" (onayla), "Şimdi dene".
   - Boş durum: "Bekleyen yükleme yok".
6. **Çıkış onayı (v0.8 100b):** "2 belge henüz yüklenmedi; çıkış yaparsanız telefondan silinir".

## F. Kapsam dışı (çizilmesin)
Uygulamayı açmadan bildirimdeki düğmeyle onay, bildirim türü ve sessiz saat ayarları, tedarikçi hesabı, tablet düzeni, herkese açık pasaportun kendisi (web'de var, v0.6).

## Teslim
Çerçeve numaraları **101'den** devam eder. Her çerçeve açık + koyu PNG ve `.dc.html` bileşenleri `docs/design/v0.9/` altına.
