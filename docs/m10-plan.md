# M10 planı — Arden demo hazırlığı

**Hedef:** ERP firmasına (Arden) gösterilecek 5 dakikalık demo; baştan sona hatasız, internet yavaşken bile çalışır.

**Kabul (PLAN):** **Demo senaryosu baştan sona hatasız, internet yavaşken bile çalışıyor.**

Bu belge plandır; kod yok. PLAN'daki M10 listesi (demo verisi, cila, demo günü hazırlığı) ve önceki kilometre taşlarından ertelenen işler (M4–M6) burada sıraya konuyor. Kararlar §6'da; kullanıcıya düşenler §5'te.

## 1. Mevcut durum

- **Demo verisi (`DemoDataSeeder`):** 5 firma, 2 kullanıcı, 3 ürün, 5 parti, 4 tedarikçi.
  - Yalnızca ilk partinin zinciri dolu (onaylı, gönderilmiş, bekleyen adımlar). Diğer dört parti boş bekliyor.
  - Belge, sertifika ve yayınlanmış pasaport yok.
  - Demo, verinin elle hazırlanmasına bağlı; her canlı ortamda aynı başlangıç durumu yok.
- **Canlı ortam:** Render (backend, uyur, cron 09:00–22:00 uyanık tutar), Vercel (web), Neon (DB), Supabase (belgeler). Soğuk açılış 100–150 sn.
- **e2e testleri:** Playwright var (mock API, 15+ dosya) ama yalnızca yerelde çalışıyor; CI'da yok.
- **Ertelenen işler:**
  - M4: düzeltme formunda gönderenin adı boş açılıyor; tedarikçiye "ilgili kişi" alanı yok.
  - M4: public istek sınırı istemci IP'sini bilmiyor.
  - M5: depoda kaydı olmayan dosya taraması; tarayıcıda OCR araştırması.
  - M6: bakım bilgisi (ISO 3758).
- **Telefon:** M8/M9 kabul denemeleri kullanıcı kararıyla bu kilometre taşının sonunda (`docs/haftalik/09-mobil-ii.md`).

## 2. Görevler

| # | İş | Tasarım gerekir mi | Kullanıcı gerekir mi |
| --- | --- | --- | --- |
| T1 | **Gerçekçi demo verisi** (§3) | Hayır | Hayır |
| T2 | **Düzeltme formunda gönderen adı ve görevi önceki gönderimden dolsun** (`PublicRequestView`) | Hayır (v0.4 45 var) | Hayır |
| T3 | **Tedarikçiye "ilgili kişi"** (V17 `company_supplier.contact_name`; V16 demo senaryosuna gitti), web 14/15'te alan, WhatsApp mesajında adıyla hitap, mobil düzeltme ekranında alıcı | Hayır (v0.4 46a var) | Hayır |
| T4 | **e2e CI'da:** GitHub Actions'ta Playwright (Chromium, mock API), başarısızlıkta ekran görüntüleri artefakt | Hayır | Hayır |
| T5 | **Açılışı hızlandırma:** yerelde ölç (lazy init, gereksiz auto-config, Flyway). Ölçüm ve öneri yazılır; prod'a yalnızca kullanıcı onayıyla | Hayır | Prod değişikliği için onay |
| T6 | **Depoda kayıtsız dosya taraması:** `docs/` nesneleri ile `document` satırları karşılaştırılır. Varsayılan olarak yalnızca rapor; silme ayrı bir bayrakla | Hayır | Hayır |
| T7 | **Public sınırlar için gerçek istemci IP'si:** Vercel'in başlığı Render'a ulaşıyor mu (canlıda) | Hayır | Canlı doğrulama (§5) |
| T8 | **Bakım bilgisi (ISO 3758):** `product.care_info`, ürün formu, pasaport bölümü, skorun ürün alanı, snapshot `schemaVersion: 2` | **Evet (v1.0)** | Tasarım |
| T9 | **Görsel cila:** web ve mobilde yükleniyor/boş/hata durumlarının taraması ve eksiklerin tamamlanması (mevcut tasarımlara göre) | Hayır | Hayır |
| T10 | **Tarayıcıda OCR araştırması** (tesseract.js): boyut, hız, Türkçe, gizlilik. Yalnızca yazılı rapor, kod yok | Hayır | Hayır |
| T11 | **Demo senaryosu** (5 dk, adım adım, yedek yollarla); "yavaş internet" provası; demo günü kontrol listesi | Hayır | Prova |
| T12 | Kabul, haftalık not, README, PLAN | | |

**Sıra:** T1 (her şeyin zemini) → T2, T3 → T4 → T6, T5 → T9 → T8 (tasarım gelince) → T10 → T11 → T12. T7, kullanıcının canlı kontrolüne bağlı.

## 3. Demo verisi (T1)

**Firma:** Nilüfer Giyim (üretici). **Partiler:** her biri demonun bir anını gösterir; tamamlanma düzeyleri farklı.

| Parti | Durum | Demoda gösterdiği |
| --- | --- | --- |
| 1 | **Yayınlandı** (pasaport v1, skor ≥ eşik) | Herkese açık pasaport, QR, GS1 Digital Link, sürüm |
| 2 | **Yayına hazır** (bütün adımlar onaylı, sertifikalar onaylı) | "Pasaportu yayınla" anı, canlı |
| 3 | **Veri toplanıyor:** iplik onaylı, kumaş **gönderildi** (onay bekliyor), bir GOTS belgesi **okundu, onay bekliyor** | Görevler, hızlı onay (web ve mobil), AI okuması ve sarı alanlar |
| 4 | **Veri toplanıyor:** kumaşta lif oranı etiketten farklı (**LIF-01, engelleyici**) | Tutarlılık kontrolü, yayının neden kilitli olduğu |
| 5 | **Taslak:** zincir kurulmuş, tedarikçi atanmamış | Zincir kurma, tedarikçi atama, veri talebi ve WhatsApp |

**Ek olarak:** bir tedarikçinin GOTS sertifikasının süresi 20 gün içinde dolar → Görevler'de ve günlük taramada görünür.

**Nasıl:**
- **Seeder:** yalnızca `demo` profilinde çalışır, sabit kimlikler kullanır ve idempotenttir (var olanı bozmaz).
- **Belgeler:** sentetik "ÖRNEK — GEÇERSİZ" PDF'ler PDFBox ile üretilip `FileStorage`'a yazılır (gerçek belge yok; Gemini kuralı).
- **Okuma ve onay:** belgelerin okuma sonucu ve onay durumu doğrudan satıra yazılır, AI çağrılmaz.
- **Yayın:** parti 1 seeder'da `PassportService.publish` ile yayınlanır; snapshot gerçek koddan üretilir.
- **Sıfırlama:** bir "demo sıfırla" yolu, demo sonrası canlı veriyi başa döndürmek için (yalnızca demo firması). Kapsam ve tetikleme §6 karar 3.

## 4. Test

- **T1:** seeder entegrasyon testi.
  - Beş partinin durumu, parti 1'in yayınlanmış pasaportu (public uç 200), parti 4'ün `LIF-01`'i, süresi yaklaşan sertifika.
  - İkinci açılışta değişiklik yok (idempotent); demo olmayan firmaya dokunulmuyor.
- **T2, T3:** backend uç testleri (tenant 404 dahil) ve web bileşen testleri.
- **T4:** CI'da Playwright'ın yeşil olması.
- **T6:** sahte depolamada kayıtsız nesnenin raporlanması; bayrak kapalıyken silinmemesi.
- **T8:** tasarımdan sonra planlanır.

## 5. Kullanıcıya düşenler

1. **Bakım bilgisi tasarımı (T8):** `docs/m10-tasarim-brifi.md` → Claude Design v1.0.
2. **Canlı IP kontrolü (T7):** Render loglarında bir isteğin `X-Forwarded-For` zincirine bakmak. Adımları ben yazarım. Gerekirse geçici bir tanı ucu, yalnızca OWNER'a açık.
3. **Prod'a açılış değişikliği (T5):** ölçüm sonucu ve onay.
4. **Demo provası (T11):** senaryoyu bir kez baştan sona denemek; yavaş internet için Chrome'da "Slow 4G".
5. **Demo günü:** cron'u 7/24'e almak (cron-job.org); Supabase panelini açık tutmak (`docs/DEPLOY.md`).
6. **Telefon:** M8 ve M9 kabul denemeleri.

## 6. Kararlar (itiraz edilebilir)

1. **Demo verisi kodda, canlıda da aynı.** Elle hazırlanan veri yerine seeder kullanılıyor; her ortam aynı başlangıçla açılır.
2. **Belgeler sentetik ve okunmuş hâlde gelir.** Demo sırasında AI'ın canlı okuyacağı tek belge, sunucuda değil sahnede, telefonla çekilir (M8 akışı).
3. **Demo sıfırlama** yalnızca demo firmasının verisine dokunur. OWNER'ın bir uçla tetikleyeceği bir iştir; Neon'da elle SQL çalıştırılmaz.
4. **Bakım bilgisi tasarım ister:** ürün formu ve pasaport sayfası değişiyor (CLAUDE.md, onaylı tasarım olmadan ekran yok).
5. **OCR'da kod yok.** Araştırma sonucuna göre M11/M12'de karar verilir.
