# Demo senaryosu (M10 T11)

Arden'e gösterilecek 5 dakikalık akış: her adımda ne gösterileceği, ne söyleneceği ve bir şey ters giderse ne yapılacağı. Veri `DemoScenario`'dan gelir (`docs/m10-plan.md` §3): Nilüfer Giyim, beş parti, dört tedarikçi.

**Giriş:** `admin@nilufergiyim.example` (OWNER). Parola Render'daki `DEMO_PASSWORD`; bu belgeye yazılmaz.

## 1. Akış (5 dk)

| Süre | Ekran | Ne gösterilir | Ne söylenir |
| --- | --- | --- | --- |
| 0:00–0:40 | **Görevler** | Süresi yaklaşan sertifika (Uludağ Boya, OEKO-TEX, 20 gün), onay bekleyen kumaş verisi, tedarikçisi atanmamış adımlar | "Üreticinin sabah açtığı ekran: tedarik zincirinde kimden ne bekleniyor." |
| 0:40–1:50 | **KP-2026-0915-A** (parti 3) → Kumaş adımı → GOTS belgesi | Tedarikçinin linkten gönderdiği veriler; AI'ın okuduğu sertifika: alanlar sarı, güven %60–75. "Doğru" ile alanlar onaylanır, ardından belge ve adım onaylanır; uyum skoru yükselir. | "Tedarikçi giriş yapmaz, WhatsApp'tan gelen linkle doldurur. AI önerir, insan onaylar. Onaylanmadan hiçbir değer asıl alana yazılmaz." |
| 1:50–2:40 | **KP-2026-0929-A** (parti 4) → Uyarılar | LIF-01: kumaşta %95 organik pamuk / %5 elastan, etiket %100. Yayın kilitli. "Düzeltme iste" → hazır gerekçe → WhatsApp mesajı "Merhaba Selin Arslan, …" | "Tutarlılık kontrolü yayından önce yakalar. Düzeltme talebi tedarikçiye adıyla, tek dokunuşla gider." |
| 2:40–3:40 | **KP-2026-0922-A** (parti 2) | Skor %100, "Yayına hazır". Önizle → **Pasaportu yayınla** → QR kodu | "Bütün adımlar ve sertifikalar onaylı. Pasaport GS1 Digital Link ile yayında; yayından sonra değişmez, değişiklik yeni sürüm olur." |
| 3:40–4:30 | **Telefon** | Ekrandaki QR okutulur → herkese açık pasaport; TR/EN/DE geçişi; izlenebilirlik adımları | "Tüketici ya da denetçi uygulama indirmeden açar. AB'nin dijital ürün pasaportu bu biçimde." |
| 4:30–5:00 | **KP-2026-0918-A** (parti 5) | Zincir kurulmuş, boyahane ve dikim için "Tedarikçi ata" | "Yeni partide zincir burada kuruluyor. Ürün listesi ERP'den Excel şablonuyla toplu gelebilir (İçe aktarma)." |
| İsteğe bağlı, +0:30 | **Yönetim → Denetim izi** | "Bugün" altında az önce yapılanlar: belge doğrulama, adım onayı, "Yayınladı · sürüm 1" ve bunları kimin yaptığı | "Kim, neyi, ne zaman değiştirdi; kayıtlar silinmez. Ekip tek kullanımlık bağlantıyla davet edilir, rolü Sahip belirler." |

**Mobil (telefon kabulü geçerse, isteğe bağlı, +1 dk):** uygulamada Tara → parti 3 özeti → kumaş adımı → hızlı onay. Ya da sentetik bir sertifikanın fotoğrafı çekilir → AI okuması formda (M8).

## 2. Yedek yollar

| Ne olursa | Ne yapılır |
| --- | --- |
| Sunucu uyuyor (ilk istek 100–150 sn) | Olmamalı: cron demo günü 7/24 (§4). Olursa web'deki "Sunucu uyanıyor" şeridi görünür; bu sırada pasaport sayfası anlatılır (Vercel'in önbelleğinden gelir). |
| Yayınlama hata verir | **KP-2026-0901-A** (parti 1) zaten yayında: aynı QR ve pasaport onunla gösterilir. |
| Telefon QR'ı okumaz | Pasaport bağlantısı ikinci sekmede açık tutulur: `…/01/02012345000018/10/KP-2026-0901-A`. |
| İnternet yavaş | Her liste ve form yükleniyor durumunu gösterir. Belge önizlemesi PDF'i indirir (1 KB'lık sentetik dosya). Prova Slow 4G ile yapılır (§3). |
| AI okuması (telefon fotoğrafı) gecikir veya kapalıdır | 20 sn sonra "Okuma uzun sürüyor" ve "Alanları elle gir" çıkar. Ya da hazır okunmuş GOTS belgesi (parti 3) gösterilir. |
| WhatsApp açılmaz (bilgisayarda kurulu değil) | "Linki kopyala" ile bağlantı gösterilir; mesaj metni pencerede zaten görünüyor. |

## 3. Prova

- **Yerelde, canlıda değil:** yayınlanan bir pasaport geri alınamaz. Canlıda parti 2 provada yayınlanırsa asıl demoda yayınlanacak parti kalmaz (bkz. §5).
- **Yerelde prova:** `docker compose … up -d`, backend (`local,demo`) ve web. Senaryo ilk açılışta uygulanır. Tekrar prova için `demo_scenario` tablosundan satır silinip backend yeniden başlatılır. Yayınlanmış partiler bu durumda da olduğu gibi kalır; yerel veritabanını sıfırlamak gerekebilir.
- **Yavaş internet:** Chrome DevTools → Network → **Slow 4G**. Akış baştan sona bir kez denenir; her ekranda yükleniyor durumu görünmeli, hiçbir ekran boş kalmamalı.
- **Telefon:** QR okutma ve pasaportun telefonda açılışı en az bir kez denenir.

## 4. Demo günü kontrol listesi

**Bir gün önce:**
- [ ] cron-job.org: uyandırma görevi 7/24 (`docs/DEPLOY.md`).
- [ ] Supabase panelini aç (ücretsiz proje 7 gün etkinliksiz kalırsa duraklıyor).
- [ ] Canlıda giriş yap; beş partinin durumu §1'deki gibi mi? (Parti 2 yayınlanmamış olmalı.)
- [ ] Render loglarında "Demo scenario 1 applied" (ilk deploy'da) ve hata yok.

**30 dakika önce:**
- [ ] Web'i aç, giriş yap; ikinci sekmede pasaport bağlantısı.
- [ ] Telefon: kamera izni verilmiş, ekran parlaklığı yüksek, bildirimler sessiz.
- [ ] İnternet: Wi-Fi'a ek olarak telefonun hotspot'u hazır.
- [ ] Tarayıcıda yalnızca demo sekmeleri; yakınlaştırma %110–125 (salonda okunurluk).

**Demodan sonra:**
- [ ] cron'u eski aralığına (09:00–22:00) al.

## 5. Açık karar: demodan sonra sıfırlama

- **Bugün:** `DemoScenario.VERSION` artırılıp deploy edilirse senaryo yeniden uygulanır. Ama yalnızca **pasaportu olmayan** partilere: parti 2 demoda yayınlandıysa yayınlı kalır.
- **Seçenekler:**
  1. Her demo için yeni bir "yayına hazır" parti. Senaryo sürüm 2, örneğin KP-2026-0922-B. Kod küçük; her gösterim bir deploy ister.
  2. OWNER'ın tetiklediği bir "demo sıfırla" ucu (m10-plan karar 3). Bu da yayınlanmış pasaportu geri alamaz, yalnızca yeni partiyi açar. Arayüz gerekirse tasarım ister.
- **Öneri:** Arden demosu tek seferlik olduğu için şimdilik 1. seçenek; gerek duyulursa sonra 2.
