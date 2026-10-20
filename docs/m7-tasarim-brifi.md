# M7 tasarım brifi — Claude Design v0.7

Tutarlılık kontrolü ve sertifika takibi. v0.6'nın dili, token'ları ve bileşenleri korunur (renkler, Geist + Geist Mono + serif başlık, durum çipleri `--status-*`, `--brand` yalnızca yayınlama gibi tekil eylemlerde). **Yalnızca panel, masaüstü 1440 px**, her çerçeve açık ve koyu temada. Bağlam: `docs/m7-plan.md`. **v0.3 paneldeki "Uyarılar" sekmesi ve uyarı kartı (tasarım v0.3, `KozaPassPanel`) başlangıç noktasıdır**; onu bozmadan eksik durumları ekleyin.

**Sabit kurallar:**
- Her uyarının **sabit bir kodu** vardır ve kartta gösterilir: `LIF-01`, `LIF-02`, `SER-01`, `SER-02`, `SER-03`, `SER-04`, `EKS-01`, `EKS-02`, `BEL-01` (AI sonrası `AI-01`, `AI-02`, rozetle "AI önerisi").
- Önem üçlüsü: **Engelleyici** (ERROR, kırmızı, yayını engeller, elle çözülemez), **Uyarı** (WARNING, turuncu/sarı, çözülebilir), **Bilgi** (INFO, nötr/mavi, çözülebilir). Kaynak etiketi: Kural / AI.
- "Çözüldü" yalnızca Uyarı ve Bilgi içindir; isteğe bağlı kısa not (en fazla 500 karakter). Engelleyici uyarı düzeltilince kendiliğinden kapanır ("Kendiliğinden kapandı").
- Roller: OWNER ve ADMIN çözer / geri açar; EDITOR kontrolleri çalıştırır ama çözemez; VIEWER okur. Yetkisiz düğmeler "Bu işlem için yetkiniz yok" tooltip'iyle kapalı (v0.3.1 21 kalıbı).
- Örnek veri: parti `KP-2026-0915-A`, Organik Pamuk Polo, etiket %95 organik pamuk + %5 elastan; iplikçi Ege İplik; kumaşçı Demirtaş Örme Kumaş; boyahane Uludağ Boya Terbiye; sertifikalar GOTS, OEKO-TEX Standard 100.

## A. "Uyarılar" sekmesi (parti ayrıntısı, v0.6 Yayın düzeni: sol sekmeler, sağda skor kartı)

1. **Sekme ve sayaç:** sekme başlığında rozet; en yüksek önem renginde (engelleyici varsa kırmızı, yoksa turuncu, yoksa nötr), sayı açık uyarı sayısı. Boşsa "0" nötr.
2. **Üst çubuk:** süzgeç segmenti **Açık · Çözülen** (sayılarıyla), sağda **"Kontrolleri çalıştır"** düğmesi (EDITOR ve üstü), altında küçük "Son kontrol: 14:32" satırı. Çalışırken düğme dönen ikon + "Kontrol ediliyor…" ve kart listesi yerinde kalır.
3. **Uyarı kartı** (v0.3 kartının genişletilmiş hali): solda önem ikonu kutusu, rozet + kod (mono) + kural adı, başlık cümlesi, kaynak satırı (firma · adım · tarih), isteğe bağlı **karşılaştırma kutuları**, sağda eylemler. Çerçeveler:
   - `LIF-01` Engelleyici: iki kutu "Etiket beyanı %95 pamuk · %5 elastan" / "Ege İplik beyanı %80 pamuk · %20 polyester" (uyuşmayan değer kırmızı); eylemler "Adıma git", "Düzeltme iste". **"Çözüldü" yok**, yerine "Düzeltilene kadar yayını engeller" notu.
   - `LIF-02` Engelleyici (lif toplamı 100 değil).
   - `SER-01` Engelleyici: "GOTS sertifikasının süresi 12 Eki'de doldu", eylemler "Adıma git", "Yenisini talep et".
   - `SER-02` Uyarı: "OEKO-TEX sertifikası 12 gün içinde doluyor" + bitiş tarihi, **"Çözüldü"** ve "Yenisini talep et".
   - `SER-03` Uyarı: sertifika sahibi ≠ tedarikçi, iki kutu "Sertifika sahibi: Ege Iplik Tekstil" / "Tedarikçi: Ege İplik San. A.Ş.".
   - `SER-04` Uyarı (sertifikası olmayan onaylı adım), `EKS-01` Uyarı, `EKS-02` Bilgi, `BEL-01` Bilgi ("Belgeyi aç").
   - `AI-01` Bilgi/Uyarı, kaynak "AI önerisi" rozeti, güven yüzdesi ve "AI önerir, siz karar verirsiniz" notu (yalnızca LLM açıkken; AI kapalıyken görünmez).
4. **Çözme:** kartta "Çözüldü" → satır içi küçük form (not alanı, 0/500 sayaç, "Çözüldü işaretle" / "Vazgeç"); başarıda kart "Çözülenler"e geçer. Yanlışlıkla çözmeye karşı çözülenlerde "Geri aç".
5. **Çözülen görünümü:** kart soluk; "Çözdü: Elif Yılmaz · 15 Eki 2026 — "not"" ya da "Kendiliğinden kapandı · veri düzeltildi · 15 Eki 2026"; "Geri aç" (yalnızca elle çözülenlerde).
6. **Durumlar:** yükleniyor (3 kart iskeleti), **boş "Açık uyarı yok"** (serif başlık + "Tüm kontroller geçti, son kontrol …" + "Kontrolleri çalıştır"), çözülen boş, hata ("Uyarılar yüklenemedi", HTTP + istek no, "Tekrar dene"), çok uyarı (10+, önem gruplarına başlık: Engelleyici, Uyarı, Bilgi).
7. **Çözme hatası ve çakışma:** engelleyiciyi çözmeye çalışınca (başka sekmeden) satır içi "Engelleyici uyarılar elle çözülemez; veriyi düzeltin" (409 `ISSUE_BLOCKING`); başkası çözmüşse "Bu uyarı zaten çözülmüş".

## B. Parti ayrıntısı, başlık ve skor kartı

1. **Başlıktaki özet düğme** (v0.3 09'daki "1 uyuşmazlık · Uyarılar"): açık engelleyici varsa kırmızı "N engelleyici uyarı · Uyarılar", yoksa açık uyarı varsa turuncu "N uyarı", yoksa görünmez. Tıklayınca sekmeye gider.
2. **Skor kartının "Yayın engelleri" listesi** yeni satır: "2 engelleyici uyarı açık" (kırmızı üçgen) → Uyarılar sekmesine bağlantı. Uyarı sayısı için "3 uyarı açık, yayını durdurmaz" (turuncu, bilgi satırı).
3. **Partiler listesi:** durum çipinin yanında küçük kırmızı/turuncu nokta + sayı (açık engelleyici / uyarı); tooltip "2 engelleyici uyarı".

## C. Pasaportu yayınla diyaloğu

1. **Engellenmiş durum** (yayın sırasında yeni engelleyici çıktı; 409 `PUBLISH_BLOCKED` + `ISSUES_OPEN`): mevcut kırmızı kutuda yeni satır "2 engelleyici uyarı açık: LIF-01, SER-01" + "Uyarılar'a git" düğmesi.
2. **Uyarılar bölümü** ("Uyarılar · yayını durdurmaz"): açık WARNING'ler kodlarıyla listelenir ("SER-02 · OEKO-TEX 12 gün içinde doluyor"), en fazla 3 satır + "ve 2 uyarı daha".

## D. Görevler sayfası (v0.4 48a) yeni grup

**"Süresi yaklaşan sertifikalar"** grubu: satır = firma adı, sertifika türü rozeti, "12 gün içinde doluyor" / "Süresi doldu" (kırmızı), hangi parti(ler)de kullanıldığı, eylemler "Yenisini talep et" (veri talebi akışını o adım için açar) ve "Adıma git". Boş durumda grup görünmez. Menüdeki görev rozeti bu satırları sayar.

## E. Kapsam dışı (M7'de çizilmesin)

Mobil ekranlar (M8–M9), AI kontrol ayarları sayfası (M10), kural eşiklerini yapılandırma (M10), denetim izi ekranı (M12), tedarikçi tarafı (tedarikçi uyarıları görmez), e-posta/push bildirimi.

## Teslim

Çerçeve numaraları 65'ten devam eder. Her çerçeve açık + koyu PNG ve `.dc.html` bileşenleri `docs/design/v0.7/` altına.
