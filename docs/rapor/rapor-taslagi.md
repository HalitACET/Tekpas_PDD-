# KozaPass: Tekstil Üreticileri için Dijital Ürün Pasaportu Platformu

*Bitirme projesi raporu: taslak.* Bu taslak `docs/haftalik/` notlarından derlendi. Okulun şablonuna aktarılırken kapak, onay sayfası, içindekiler ve kaynakça biçimi eklenecek. `[kaynak]` işaretli yerlere kaynak gösterilmeli (bkz. `docs/kullanici-isleri.md` F).

---

## Özet

KozaPass, tekstil üreticilerinin her üretim partisi için bir Dijital Ürün Pasaportu (DPP) yayınlamasını sağlayan bir web ve mobil platformdur. Üretici bir parti açar ve tedarik zincirini (lif, iplik, kumaş, boya, konfeksiyon) kurar. Zincirdeki firmalardan hesap açmalarını istemeden, tek kullanımlık bir bağlantıyla veri ve sertifika toplar. Yüklenen sertifikaları sistem önce kurallarla, gerekirse bir büyük dil modeliyle okur. Okunan değerler bir öneri olarak sunulur ve yetkili kişi onaylamadan kayda geçmez. Tutarlılık kuralları etiket beyanıyla tedarikçi beyanlarını ve sertifika sürelerini karşılaştırır. Yayınlanan pasaport GS1 Digital Link biçiminde bir QR koduyla açılır, okuyanın dilinde (Türkçe, İngilizce, Almanca) gösterilir ve değiştirilemez: her değişiklik yeni bir sürümdür.

Sistem Spring Boot 4.1 (Java 21), Next.js 16 ve Expo (React Native) ile geliştirildi. PostgreSQL'de çalışır ve yalnızca ücretsiz bulut katmanlarında (Render, Vercel, Neon, Supabase) canlıdır. Geliştirme 13 kilometre taşında, 113'ü aşkın küçük ve gözden geçirilmiş değişiklikle (pull request) yapıldı. Proje sonunda backend'de 696, web'de 265'i aşkın otomatik test vardır; ayrıca uçtan uca tarayıcı testleri sürekli entegrasyonda koşar.

**Anahtar kelimeler:** dijital ürün pasaportu, tekstil, tedarik zinciri izlenebilirliği, GS1 Digital Link, belge okuma, büyük dil modeli

## Abstract

KozaPass is a web and mobile platform with which textile manufacturers publish a Digital Product Passport (DPP) for each production batch. The manufacturer builds the batch's supply chain and collects data and certificates from the companies in it through one-time links, without accounts. Certificates are read by rules first and by a large language model when the rules fail; every value read is only a proposal until an authorised person approves it. Consistency rules compare label declarations with supplier declarations and certificate validity. A published passport opens from a GS1 Digital Link QR code in the reader's language and is immutable: every change is a new version. The system is built with Spring Boot 4.1, Next.js 16 and Expo, runs on PostgreSQL and is live on free cloud tiers only.

---

## 1. Giriş

### 1.1 Problem

- **Mevzuat:** Avrupa Birliği'nin Sürdürülebilir Ürünler için Ekotasarım Tüzüğü (ESPR), ürünler için dijital pasaport zorunluluğunu getiriyor; tekstil öncelikli ürün gruplarından biri `[kaynak]`.
- **Türk üreticisinin durumu:** AB'ye ihraç eden bir Türk konfeksiyon üreticisi, ürününün hangi lifden, hangi iplikçi, kumaşçı ve boyahaneden geçtiğini belgelemek zorunda kalacak.
- **Bugünkü pratik:** Bu bilgi tedarik zincirinde e-posta, WhatsApp ve Excel ile dağınık biçimde dolaşıyor. Sertifikalar (OEKO-TEX, GOTS, GRS) PDF olarak geliyor, süreleri takip edilmiyor.

### 1.2 Amaç

Bir üretim partisinin tedarik zinciri verisini ve belgelerini toplayan, tutarlılığını kontrol eden ve tüketiciye doğrulanabilir bir pasaport olarak sunan, çalışan bir sistem geliştirmek. Sistem aynı zamanda bir ERP firmasına gösterilecek bir demo olarak tasarlandı.

### 1.3 Kapsam

- **Kapsamda:**
  - Ürün ve parti yönetimi.
  - Tedarik zinciri (yönlü, çevrimsiz çizge).
  - Tedarikçiden hesapsız veri toplama.
  - Belge yükleme, AI ile okuma ve insan onayı.
  - Tutarlılık kontrolü, uyum skoru, pasaport yayını.
  - QR, çok dil, Excel içe aktarma, mobil uygulama.
  - Roller ve denetim izi.
- **Kapsam dışı:** gerçek firma verisiyle pilot, ödeme, blokzincir, e-posta altyapısı.

---

## 2. Arka plan

- **Dijital Ürün Pasaportu:** ürünün yaşam döngüsü bilgisinin makine tarafından okunabilir, ürünle ilişkilendirilmiş bir kaydı `[kaynak: ESPR]`.
- **GS1 Digital Link:** GTIN ve parti numarası gibi GS1 anahtarlarını bir web adresine yerleştiren standart (`/01/{gtin}/10/{parti}`). Aynı QR hem perakendede barkod gibi hem de tüketici için web sayfası olarak çalışır `[kaynak: GS1]`. KozaPass'te pasaport adresi bu yolu birebir kullanır.
- **GTIN:** 8, 12, 13 ya da 14 haneli, son hanesi kontrol hanesi olan ürün numarası. Sistem her biçimi 14 haneye tamamlar ve kontrol hanesini doğrular.
- **Tekstil sertifikaları:** OEKO-TEX Standard 100 (zararlı madde), GOTS (organik lif), GRS (geri dönüştürülmüş içerik) `[kaynak]`.
- **Benzer çalışmalar:** `[eklenecek: piyasadaki DPP çözümleri ve akademik çalışmalar]`.

---

## 3. Gereksinimler

### 3.1 Aktörler

| Aktör | Ne yapar |
| --- | --- |
| Üretici (OWNER, ADMIN, EDITOR, VIEWER) | Ürün, parti, zincir kurar; veri ister, onaylar, yayınlar |
| Tedarikçi | Hesapsız bağlantıyla kendi adımının verisini ve belgelerini gönderir |
| Tüketici / alıcı | QR'ı okutup pasaportu kendi dilinde görür |
| Sahadaki kalite sorumlusu | Mobil uygulamayla belge çeker, onaylar, QR okutur |

### 3.2 Rol matrisi

| Yetki | OWNER | ADMIN | EDITOR | VIEWER |
| --- | :-: | :-: | :-: | :-: |
| Kullanıcı ve rol yönetimi | ✓ | | | |
| Tedarikçi ağı yönetimi | ✓ | ✓ | | |
| Ürün / parti / zincir / veri talebi / Excel | ✓ | ✓ | ✓ | |
| Onay, red, yayın, geri çekme | ✓ | ✓ | | |
| Görüntüleme (kendi firması) | ✓ | ✓ | ✓ | ✓ |

Matris kodda bir testle korunur (bkz. 7.10).

### 3.3 İşlevsel olmayan gereksinimler

- **Çok kiracılık:**
  - Firma kimliği yalnızca oturumdaki kullanıcıdan gelir, istekten asla.
  - Başka firmanın kaydına erişim 404 döner; 403 dönseydi kaydın var olduğu sızardı.
- **Değişmezlik:** yayınlanmış pasaport hiçbir yoldan değişmez.
- **Gizlilik:** ücretsiz AI katmanına yalnızca sentetik demo verisi gider.
- **Erişilebilirlik ve dil:** arayüz metinlerinin tamamı çeviri dosyalarından gelir (tr/en/de). Formlar klavyeyle kullanılabilir.
- **Maliyet:** tüm altyapı ücretsiz katmanlarda çalışır.

---

## 4. Mimari ve teknoloji

Diyagramlar: `docs/rapor/mimari.md`.

| Parça | Teknoloji | Gerekçe |
| --- | --- | --- |
| API | Java 21, Spring Boot 4.1, Spring Security (JWT), JPA, Flyway | Olgun ekosistem; 3.x serisinin desteği bitmişti |
| Web | Next.js 16 (App Router), TypeScript, Tailwind, shadcn/ui, TanStack Query, next-intl | Pasaport sayfası sunucuda render edilir (hızlı, SEO); panel istemci tarafında |
| Mobil | Expo (React Native), Expo Router | Kamera, güvenli depo, bildirim; tek kod tabanı |
| Sözleşme | OpenAPI → `openapi-typescript` istemcisi | Backend'deki her değişiklik TS tiplerine yansır; CI uyuşmazlığı yakalar |
| Veritabanı | PostgreSQL 16 | JSONB, recursive CTE, `FOR UPDATE SKIP LOCKED` iş kuyruğu |
| Dosya | Supabase Storage (REST) | Kredi kartı istemeyen ücretsiz katman |
| AI | Google Gemini (REST, SDK yok) | Yapılandırılmış JSON çıktısı; ücretsiz katman |

**Önemli mimari kararlar:**
- **Web API'ye kendi adresi üzerinden, proxy ile erişir:** yenileme çerezi birinci taraf olur, CORS gerekmez.
- **İş kuyruğu Postgres'te:** ayrı bir kuyruk servisi yok. Sabit aralıklı yoklama da yok: ücretsiz Neon veritabanı boştayken uyuyabilsin diye iş, commit sonrası uyandırılır.
- **Monorepo:** pnpm çalışma alanları (web, mobil, paylaşılan paketler) ve ayrı Maven projesi. Ortak doğrulama şemaları (Zod) backend'le aynı hata kodlarını kullanır.

---

## 5. Veri modeli

Ayrıntı ve ER diyagramı: `docs/rapor/veri-modeli.md`. 22 tablo, 23 Flyway migration'ı.

- **Tedarik zinciri bir DAG'dir:** bir lif partisi iki iplikçiye gidebilir, iki iplik tek kumaşta birleşebilir. Döngü recursive CTE ile reddedilir.
- **Yarı yapılandırılmış veri JSONB'de:** adım verisi, AI çıkarımı ve pasaport anı JSONB'de tutulur; Java'da tipli kayıtlara okunur.
- **Pasaportun değişmezliği veritabanında da korunur:** bir tetikleyici yalnızca `PUBLISHED → SUPERSEDED/WITHDRAWN` geçişine izin verir.

---

## 6. Geliştirme yöntemi

- **Kilometre taşları:** 13 kilometre taşı (M1–M13), her birinin kabul kriteri `docs/PLAN.md`'de.
- **Her değişiklik bir PR:**
  - Değişiklik ayrı bir dalda yapılır ve kısa, anlamlı commit'lerle (Conventional Commits) kaydedilir.
  - PR'da otomatik testler koşar (backend, web/mobil, sözleşme, uçtan uca); hepsi yeşilse squash merge edilir.
- **Tasarım önce:**
  - Ekranlar Claude Design ile tasarlandı (v0.2–v1.1).
  - Onaylı tasarım olmadan ekran kodlanmadı. Uygulama, tasarım çerçeveleriyle yan yana ekran görüntüsü alınarak karşılaştırıldı (`docs/design/impl-*`).
- **Yapay zekâ destekli geliştirme:**
  - Kodun büyük kısmı bir kodlama ajanıyla (Claude Code) yazıldı. Proje sahibi ürün kararlarını verdi, tasarımı onayladı, telefon ve canlı denemeleri yaptı.
  - Ajanın uyduğu kurallar `CLAUDE.md` dosyalarında yazılıdır (kiracılık, migration, gizli değerler, AI verisi, hata biçimi, sözleşme).
- **Belgeleme:** her kilometre taşı sonunda Türkçe bir not (`docs/haftalik/`); raporun hammaddesi bu notlardır.

---

## 7. Uygulama

### 7.1 Temel altyapı (M1)
- **Kimlik doğrulama:**
  - Access token 15 dakika ve yalnızca bellekte tutulur.
  - Yenileme token'ı 30 gün geçerlidir ve her kullanımda yenilenir (rotation). Çalınıp yeniden kullanılırsa bütün aile iptal edilir.
- **Hatalar:** RFC 7807 biçiminde.
- **Canlıya çıkış:** Render (Docker), Neon, Vercel. Ücretsiz Render servisi 15 dakika trafiksizlikte uyuduğu için bir cron servisi gün içinde uyanık tutar.

### 7.2 Ürün ve parti (M2)
- GTIN'in her biçimi kabul edilir, kontrol hanesi doğrulanır, dünya çapında tekildir. Partisi olan ürünün GTIN'i kilitlenir.
- Lif bileşimi tam sayı olmalı, toplamı %100 olmalıdır.
- Parti numarası önerisi firma ve gün bazındadır (`KP-2026-0915-A`).

### 7.3 Tedarik zinciri (M3)
- Yeni parti, ürünün son partisinin zincirini kopyalar. Zincir React Flow ile sabit beş sütunda çizilir.
- Tedarikçi ağı firmalar arasında paylaşılır, ama "son durum" yalnızca kendi partilerinden hesaplanır.

### 7.4 Tedarikçiden veri toplama (M4)
- **Hesapsız bağlantı:**
  - Tedarikçi telefonundan, hesap açmadan bir bağlantıyla formu doldurur.
  - Bağlantının gizli kısmı adresin `#` bölümündedir; sunucuya, log'lara ve analitiğe gitmez. Sayfa onu okuyup başlıkla gönderir. Veritabanında yalnızca SHA-256 özeti durur.
  - Bağlantı WhatsApp ile paylaşılır.
- **Onay akışı:** gönderilen veri adımı "gönderildi" yapar; üretici onaylar ya da işaretli alanlarla düzeltme ister.

### 7.5 Belge ve AI (M5, M8)
- **Hibrit okuma:**
  1. PDF metin katmanı ve belge türüne özgü kurallar.
  2. Kurallar okuyamazsa dil modeli.
  3. O da olmazsa elle giriş.
  
  OCR, sunucunun 0,1 CPU / 512 MB sınırına sığmadığı için kullanılmadı (M10'da tarayıcıda OCR araştırıldı).
- **AI önerir, insan onaylar:** okuma sonucu ayrı bir alana yazılır; asıl alanlar yalnızca onayla değişir.
- **Güven skoru:** skoru model değil sunucu verir. Değer belge metninde geçiyorsa 0,75, geçmiyorsa 0,4; modelin kendi beyan ettiği güvene güvenilmez.
- **Belge metni güvenilmeyen veridir:** rastgele sınırlayıcılar arasında, talimattan ayrı gönderilir. Bir test, belgeye gizlenmiş "talimatları yok say" metninin etkisiz kaldığını doğrular.
- **Mobil:** sertifika kamerayla çok sayfalı çekilir. Sunucu sayfaları yeniden kodlar (konum bilgisi düşer) ve tek PDF yapar. Telefonda "fotoğraftan dolu forma" 4,0 saniye ölçüldü.

### 7.6 Pasaport ve QR (M6)
- **Uyum skoru:** onaylı adımlar 50, zorunlu alanlar 30, geçerli sertifikalar 20 puan.
- **Yayın engelleri skordan bağımsızdır:** zincir yok, onaysız adım, süresi dolmuş sertifika.
- **Snapshot:** yayında bir izinli alan listesiyle kurulur. Miktar, telefon, kişi adı ve iç kimlikler girmez; bir test bunu korur. SHA-256 özetinden kısa bir doğrulama kodu üretilir.
- **Pasaport sayfası:** sunucuda render edilir ve önbellekte tutulur. QR okutmak çoğunlukla uyuyan sunucuyu uyandırmaz; yayın ve geri çekme önbelleği etiketle düşürür.

### 7.7 Tutarlılık kontrolü (M7)
- **Kural kodları:** dokuz sabit kural kodu (`LIF-01`, `SER-02` …).
- **Engelleyici bulgular:** engelleyici bulgu yayını durdurur ve elle "çözülemez"; veri düzelince kendiliğinden kapanır.
- **AI önerileri (yalnızca demo firmasında):**
  - Model her öneri için veriden alıntı vermek zorundadır; sunucu alıntıyı kaynakta bulamazsa öneriyi atar.
  - Uydurma öneri ya da belgeye gizlenmiş komut bu yüzden panele ulaşmaz.

### 7.8 Mobil uygulama (M8, M9)
- Görevler, kamerayla belge çekme, okuma ve onay.
- QR okutma: kendi firmasının partisi açılır, başka bir kod herkese açık pasaportu açar.
- Tedarikçi verisini telefondan hızlı onay ya da gerekçeli düzeltme.
- Veri gelince bildirim (Firebase Cloud Messaging).
- Zayıf bağlantıda yükleme kuyruğu: çekilen belge telefonda bekler, bağlantı gelince kendiliğinden yüklenir, iki kez gitmez.

### 7.9 Çok dil ve Excel (M11)
- **Serbest metin çevirisi:**
  - Çevrilen metinler: ürün açıklaması, bakım notu, kumaş tipi.
  - Demo firmasında AI önerir, insan onaylar. Onay, kaynak metnin o anki hâline (hash) bağlıdır; kaynak değişince onay düşer.
  - Çevirisi olmayan metin pasaportta kendi dilinde, "in Turkish" etiketiyle görünür.
- **Excel içe aktarma:**
  - Panelin dilinde, açılır listeli bir şablon indirilir.
  - Her satır API'nin kurallarından geçer ve tek başına kaydedilir. Hatalı satırlar satır, sütun ve çözüm ipucuyla listelenir.

### 7.10 Roller ve denetim izi (M12)
- **Rol matrisi testi:**
  - Bir test, bütün API uçlarının erişim seviyesini bir tabloyla karşılaştırır; tabloya yazılmamış yeni uç testi düşürür.
  - Test bir sapma buldu: tedarikçi ağı yönetimi EDITOR'e açıktı. Düzeltildi.
- **Kullanıcı daveti:** e-postasız, tek kullanımlık bağlantıyla. Rol değişikliği ve pasifleştirme yalnızca Sahip'e açıktır; pasifleştirilen kişinin bütün oturumları kapanır.
  - Davet edilen kişi bağlantıyı telefonda açar, şifresini belirler; giriş ekranı e-postasıyla dolu açılır. Süresi dolmuş bağlantı kimden yenisinin isteneceğini söyler (Şekil: `docs/haftalik/img/12-davet-telefon-light.png`).
- **Denetim izi:** önemli her eylem (kim, ne, hangi kayıt, ne zaman) kaydedilir. Metin, şifre ve token yazılmaz.
  - Ekranda güne göre gruplu, tür / kişi / tarih filtreli bir tabloda okunur (Şekil: `docs/haftalik/img/12-denetim-izi-light.png`).
- **Giriş deneme sınırı:** e-posta başına 15 dakikada 5 hatalı deneme. Var olmayan e-posta da aynı sayaçtan düşer, hangi hesabın var olduğu sızmaz.

---

## 8. Güvenlik ve gizlilik

- **Kiracılık:** her sorgu firmayla süzülür; her yeni uç için "başka firmanın kaydı → 404" testi yazılır.
- **Token'lar:** yenileme, tedarikçi ve davet token'ları 32 bayt rastgele değerdir, yalnızca SHA-256'larıyla saklanır. Ham değer bir kez gösterilir.
- **Log'lar:** sorgu dizesi, başlık ve gövde yazılmaz; yoldaki token'lar maskelenir.
- **Dosyalar:** özel depoda, 60 saniyelik imzalı bağlantıyla indirilir. Makro, zip bombası ve tür kontrolleri yapılır.
- **AI:** gerçek firma verisi hiçbir yapılandırmayla modele gitmez. Model çıktısı güvenilmeyen girdi olarak yeniden doğrulanır.
- **Hız sınırları:** herkese açık uçlarda ve girişte. Vercel arkasında istemci IP'si taklit edilebildiği için IP'ye dayanmayan sayaçlar kullanılır.

---

## 9. Test ve kalite

| Kilometre taşı | Backend test sayısı |
| --- | ---: |
| M1 | 69 |
| M2 | 170 |
| M3 | 237 |
| M4 | 281 |
| M6 | 549 |
| M7 | 623 |
| M8 | 631 |
| M10 | 663 |
| M11 | 680 |
| M12 | 696 |

- **Backend:** JUnit 5. Entegrasyon testleri Testcontainers ile gerçek PostgreSQL'e karşı koşar; AI her zaman sahte istemciyle değiştirilir.
- **Web:** Vitest + Testing Library (265+). Playwright uçtan uca testleri (140+) sahte API'ye karşı CI'da koşar.
- **Mobil:** Jest (55+).
- **CI job'ları:** `backend`, `js`, `contract` (API sözleşmesi ile üretilen istemcinin uyumu), `e2e`.
- **Testin değeri:** birçok hata canlıya çıkmadan testlerde yakalandı. Örneğin Jackson'ın ondalık sayıyı sessizce tam sayıya kırpması, Türkçe büyük harf (i → İ) ile parti numarasının bozulması, CI'ın UTC saat dilimi.

---

## 10. Dağıtım ve işletim

- **Altyapı:** Render (API, Docker, Frankfurt), Vercel (web), Neon (PostgreSQL), Supabase (dosya), Expo EAS (Android sürümü).
- **Soğuk başlangıç:** ücretsiz Render servisinin soğuk başlangıcı 100–150 saniye.
  - CDS arşivi ve sorgu ayrıştırıcısı değişikliğiyle kısaltıldı.
  - Web, "sunucu uyanıyor" durumunu tanır ve kullanıcıya gösterir.
- **Ayrıntı:** `docs/DEPLOY.md`.

---

## 11. Sonuç ve gelecek çalışmalar

- **Sonuç:** KozaPass, bir tekstil partisinin tedarik zinciri verisini dağınık kanallar yerine tek bir akışta toplayıp doğrulanabilir bir pasaporta dönüştüren, çalışan bir sistemdir.
- **Gelecek çalışmalar:**
  - Gerçek pilot: ücretli AI katmanı, alan adı, KVKK metni.
  - Tarayıcıda OCR ile taranmış belge okuma.
  - Parti ve zincir için Excel içe aktarma.
  - İki adımlı doğrulama, e-postayla davet.
  - Tüzük ayrıntıları netleştikçe pasaport alanlarının resmî veri modeliyle eşlenmesi `[kaynak]`.

---

## Ekler

- **Ekran görüntüleri:** `docs/design/impl-*` (tasarımla yan yana), `docs/haftalik/img/`.
- **Haftalık notlar:** `docs/haftalik/01–12`.
- **Planlar ve tasarım brifleri:** `docs/m5-plan.md` … `docs/m12-plan.md`.
