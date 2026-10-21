# M7 planı — Tutarlılık kontrolü ve sertifika takibi

**Hedef:** Parti için kural tabanlı kontroller çalışır, bulduğu tutarsızlıkları sabit kodlu **uyarılar** olarak panelde gösterir, yayından önce engeller ve sertifika sürelerini her gün izler. Kabul (PLAN): lif toplamı %95 girilen partide kırmızı uyarı çıkar, pasaport yayınlanmadan önce gösterilir. AI tabanlı kontroller bu plandaki ikinci aşamadır (§8). Bu belge plandır; kod yok. Kararlar §9'da (kullanıcı "sen karar ver" dedi, itiraz edilebilir).

Dayandığı kurallar: kural 1 (tenant), kural 4 ve 5 (AI yalnızca öneri, LLM kapısı), kural 7 (RFC 7807), kural 8 (kullanıcıya görünen metin çeviri dosyasından).

## 1. Mevcut durum

- `validation_issue` tablosu V1'den beri var ve boş: `batch_id`, `step_id`, `document_id`, `source` (`RULE | AI`), `severity` (`INFO | WARNING | ERROR`), `code`, `message`, `resolved`, `resolved_by`, `resolved_at`. Hiçbir kod kullanmıyor.
- `JobType.RULE_VALIDATE_BATCH` ve `CERT_EXPIRY_SCAN` iş türleri tanımlı (`chk_job_type`'ta da var); işleyicileri yok.
- Skor (M6) `STEP_NOT_APPROVED`, `CERTIFICATE_EXPIRED`, `SCORE_BELOW_THRESHOLD` engellerini zaten üretiyor; `ISSUES_OPEN` yeri ayrılmıştı (`docs/m6-plan.md` §2).
- Tasarım v0.3 paneli "Uyarılar" sekmesini ve uyarı kartını çizmişti (önem rozeti, kod, başlık, kaynak adım, karşılaştırma kutuları, "Adıma git" / "Düzeltme iste"); çözme, boş durum, yükleme, çözülenler ve yayın diyaloğu entegrasyonu çizilmemişti: `docs/m7-tasarim-brifi.md`.
- PLAN §4: `POST /batches/{id}/validate`, `GET /batches/{id}/issues`, `POST /issues/{id}/resolve`, `GET /documents/expiring?days=30` (M7).

## 2. Kurallar ve kodlar

Her kontrolün **sabit kodu** vardır (`LIF-01`…); kod, önem ve kural metni çeviri dosyalarında durur, veritabanında yalnızca kod ve yapılandırılmış `params` saklanır (metin dilden bağımsız, M11'de EN/DE hazır olur).

| Kod | Önem | Kural | Üretildiği yer |
| --- | --- | --- | --- |
| `LIF-01` | ERROR | **Etiket beyanı ile iplik/kumaş beyanı uyuşmuyor.** Ürünün etiket lif bileşimi ile onaylı veya gönderilmiş YARN ve FABRIC adımlarının `fiberComposition`'ı lif bazında karşılaştırılır; fark **3 puandan fazlaysa** (AB tekstil tüzüğündeki izin) veya etikette olmayan bir lif ya da etikette olup adımda hiç olmayan bir lif varsa uyarı. Adım başına bir uyarı. **Hangi adımlar:** gönderilmiş veya onaylı, lif bileşimi dolu FABRIC adımları (etiketin anlattığı kumaştır); kumaş adımı yoksa tek bir YARN adımı (birden çok iplik karışımı tek bir bileşime karşılaştırılamaz). Etiket ya da adımın toplamı 100 değilse karşılaştırma yapılmaz, `LIF-02` söyler. | adım |
| `LIF-02` | ERROR | Bir lif bileşiminin toplamı 100 değil (etiket veya adım). API bunu yazarken engelliyor; eski veya elle değiştirilmiş veri için güvence. | ürün / adım |
| `SER-01` | ERROR | Onaylı sertifikanın süresi dolmuş ve **aynı adımda aynı türden geçerli sertifika yok** (skordaki `CERTIFICATE_EXPIRED` ile aynı kural, tek yerde tanımlı). | adım + belge |
| `SER-02` | WARNING | Onaylı sertifika 30 gün içinde doluyor. | adım + belge |
| `SER-03` | WARNING | Sertifikanın sahibi adımın tedarikçisinden farklı (ad büyük/küçük harf, noktalama ve "A.Ş./Ltd. Şti./San./Tic./Sanayi/Anonim Şirketi" gibi hukuki biçim sözcükleri yok sayılarak sözcük kümeleri eşit mi diye karşılaştırılır; Türkçe `Folding`). "Ege İplik San. A.Ş." = "EGE IPLIK"; "Ege Iplik Tekstil" ayrı bir addır (uyarı). | adım + belge |
| `SER-04` | WARNING | Adım tipi için beklenen sertifikası yok (YARN, FABRIC, DYEING; skorun ölçütüyle aynı küme) ve adım onaylı. | adım |
| `EKS-01` | WARNING | Ürünün etiket lif bileşimi girilmemiş. | ürün |
| `EKS-02` | INFO | Partinin üretim tarihlerinden biri boş. | parti |
| `BEL-01` | INFO | Onay bekleyen belge var (pasaporta girmez). Skordaki `UNREVIEWED_DOCUMENTS` uyarısının uyarı listesindeki karşılığı. | adım + belge |

Önem anlamı: **ERROR yayını engeller** ve elle "çözüldü" yapılamaz (veri düzelince kendiliğinden kapanır); WARNING ve INFO yayını durdurmaz, bilgilenmiş biri "çözüldü" diyebilir (not isteğe bağlı).

Sayısal toleranslar ve eşikler (`LIF_TOLERANCE = 3`, `EXPIRING_DAYS = 30`) tek sınıfta sabit; M10'da yapılandırılabilir.

## 3. Veri modeli (V13)

`validation_issue` genişler (tablo boş, geri doldurma yok):
- `company_id UUID NOT NULL` (tenant filtresi doğrudan tabloda, kural 1) ve `fingerprint VARCHAR(200) NOT NULL`: `kod:adım:belge:veri özeti`; aynı bulgu iki kez yazılmaz.
- `params JSONB NOT NULL DEFAULT '{}'`: kartın doldurduğu veri (ör. LIF-01'de `{ "label": [...], "declared": [...] }`, SER-02'de `{ "validUntil": "...", "days": 12 }`). `message` kalkmaz ama İngilizce kısa özet olarak kalır (günlük ve API için), arayüz çeviriden okur.
- `resolution_note VARCHAR(500)`, `auto_resolved BOOLEAN NOT NULL DEFAULT false`, `last_seen_at TIMESTAMPTZ`.
- `CREATE UNIQUE INDEX ... ON validation_issue (batch_id, fingerprint)`: bir bulgunun tek satırı vardır; çözülmüş olsa da satır kalır. Veri değişirse özet değişir, bu yeni bir bulgudur.
- `idx_issue_batch_open` var. Tablo `ON DELETE CASCADE` ile partiye bağlı; **yayınlanmış pasaport satırına dokunmaz**.

**Eşitleme (sync) kuralı:** Bir partinin kontrolü çalışınca bulunanlar kümesi hesaplanır ve tabloyla eşitlenir:
- Yeni bulgu → eklenir (`OPEN`).
- Zaten açık ve hâlâ bulunuyor → `last_seen_at` güncellenir.
- Açık ama artık bulunmuyor → kendiliğinden kapanır (`resolved = true`, `auto_resolved = true`, `resolved_by` boş).
- Elle çözülmüş ve aynı özetle hâlâ bulunuyor → çözülmüş kalır (kimse aynı şeyi tekrar çözmek zorunda değil).
- Elle çözülmüş ve özet değişti (veri değişti) → yeni bulgu açılır.
- Kendiliğinden kapanmış ve aynı özetle yeniden bulunuyor → aynı satır yeniden açılır (benzersiz indeks yeni satıra izin vermez; veri yine bozulmuştur).
- Elle çözülmüş ve artık bulunmuyor → olduğu gibi kalır (kararın kaydı).
Eşitleme tek transaction'da partinin satırı kilitlenerek yapılır (iki eşzamanlı çalıştırma iki satır yazamaz: benzersiz indeks son savunma).

## 4. API

Hepsi `/api/v1`, tenant JWT'den, başka firmanın kaydı 404, SUPPLIER 403.
- `POST /batches/{id}/validate` (OWNER, ADMIN, EDITOR): kuralları çalıştırır ve eşitler; cevap `IssueList` (açık sayısı, önem kırılımı, `ranAt`).
- `GET /batches/{id}/issues?status=OPEN|RESOLVED|ALL` (okuyan herkes): bulgular, önem sırasıyla (ERROR, WARNING, INFO), sonra yeni olan üstte. Her bulgu: `id`, `code`, `severity`, `source`, `stepId`/`stepType`, `documentId`/`docType`, `params`, `createdAt`, çözüldüyse `resolvedAt`, `resolvedByName`, `autoResolved`, `note`.
- `POST /issues/{id}/resolve` `{ note? }` (OWNER, ADMIN; yalnızca WARNING ve INFO; ERROR için 409 `ISSUE_BLOCKING`; zaten çözülmüş 409 `ALREADY_RESOLVED`).
- `POST /issues/{id}/reopen` (OWNER, ADMIN): elle çözüleni geri açar (yanlışlıkla çözmeye karşı); açık olana 409 `NOT_RESOLVED`, kendiliğinden kapanana 409 `AUTO_RESOLVED` (o, kontroller yeniden bulursa kendisi açılır).
- `GET /documents/expiring?days=30` (okuyan herkes): onaylı sertifikalar, süresi bitmesine en yakın önce; firma bazlı, görevler sayfası ve tedarikçi listesi için.
- Skor: `ScoreIssueCode.ISSUES_OPEN` engeli (açık ERROR sayısı `count` ile) eklenir; `ISSUE_WARNINGS` uyarısı açık WARNING sayısını taşır. Yayın uç noktası **yayından önce kontrolü eşzamanlı çalıştırır** (bayat bulgu yayını kaçırmasın) ve açık ERROR varsa 409 `PUBLISH_BLOCKED` döner (blockers listesinde `ISSUES_OPEN`).
- `BatchResponse`'a `openIssues { errors, warnings, infos }` eklenir (listede ve başlıkta rozet için; tek sorgu).

## 5. Tetikleyiciler ve işler

- **Anlık değişiklikte:** adım gönderme/onay/red, belge onayı/silme, ürün lif bileşimi güncellemesi, zincir değişikliği sonrası `RULE_VALIDATE_BATCH` işi kuyruğa girer (`enqueueUnlessQueued`: aynı partinin başlamamış bir işi sırada bekliyorsa yenisi eklenmez, o iş en yeni veriyi görür; çalışmakta olan sayılmaz). İş commit sonrası çalışır; panel sekme sayacını bir sonraki okumada görür.
- **Günlük `CERT_EXPIRY_SCAN`** (`DocumentCleanupSchedule` gibi `JobWorker.every`: açılıştan 15 dk sonra, sonra 24 saatte bir; Neon uyuması için ek yoklama yok, K9): süresi 30 gün içinde dolacak veya dolmuş onaylı sertifikası olan **tüm** partileri (yayınlanmış dahil) kontrol eder (`RULE_VALIDATE_BATCH` işlerini sıraya koyar). Yayınlanmış pasaportun snapshot'ına dokunmaz; yalnızca panelde SER-01/02 çıkar ("yayındaki sürümde süresi dolmuş sertifika" bilgisi M10'da tasarlanır).
- **Yayın sırasında:** eşzamanlı çalıştırma (§4).

## 6. Web (tasarım v0.7 gelince)

- Parti ayrıntısında "Uyarılar" sekmesi açılır (sayaç rozeti), uyarı kartları (v0.3 kartı + çözme), "Kontrolleri çalıştır" düğmesi, Açık / Çözülen süzgeci.
- Başlıktaki "N uyuşmazlık · Uyarılar" düğmesi (v0.3 09), skor kartında `ISSUES_OPEN` engeli, yayın diyaloğunda açık uyarılar.
- Görevler sayfasında "Süresi yaklaşan sertifikalar" grubu (v0.4 48a'da "Sertifika süresi M7" diye ayrılmıştı), tedarikçi listesinde sertifika çipleri zaten var (M5).
- Uyarı metinleri `issues.*` çeviri anahtarlarında (tr/en/de, kod başına başlık ve gövde).

## 7. Test

- **Birim:** her kural için tablo testleri (LIF-01 toleransın iki yanı, eksik/fazla lif, çok adımlı; SER-03 ad normalizasyonu: "Ege İplik San. A.Ş." = "EGE IPLIK"; SER-01 yenileme; SER-02 sınır günü), eşitleme kuralı (yeni, tekrar, kendiliğinden kapanma, çözülmüş kalan, özet değişince yeni).
- **Entegrasyon:** `POST /validate` mutlu yol, tenant 404 her uçta, roller (EDITOR çalıştırır ama çözemez, VIEWER okur, SUPPLIER 403), ERROR çözme 409, çözülmüşü tekrar açma, **kabul testi:** ürün etiketi %95 pamuk + %5 elastan, iplik adımı %80 pamuk + %20 polyester → `LIF-01` ERROR, yayın 409 `ISSUES_OPEN`, düzeltilince kendiliğinden kapanır ve yayın geçer. Eşzamanlı iki `validate` bir satır.
- **İş:** `CERT_EXPIRY_SCAN` (sahte saat: 30 gün sınırı), `RULE_VALIDATE_BATCH` tetikleyicileri (yalnızca ilgili değişiklikte, 10 sn tekilleştirme).
- **Web:** kart durumları, çözme, süzgeç (tasarımdan sonra).

## 8. AI tabanlı kontroller (ikinci aşama)

Yalnızca `LlmGate` izin verirse (bayrak + anahtar + demo firması, kural 4) ve yalnızca öneri olarak (`source = AI`, kural 5): `AI-01` sertifika kapsamı ürün kategorisini kapsıyor mu, `AI-02` çelişkili beyanlar. Kural kontrolleri çalıştıktan sonra `AI_VALIDATE_BATCH` işi (mevcut tür); sonuç `INFO`/`WARNING`, asla ERROR (AI yayını engelleyemez), güven skoru sunucuda atanır. Kural yolu tek başına demoyu taşır (M5'teki ilke). Bu aşama kural altyapısı merge edildikten sonra ayrı PR'lardadır.

**Uygulama (T5):**
- **Veri sayfası:** ürün (`P`), adımlar zincir sırasıyla (`S1`…, tedarikçinin beyanı JSON olarak) ve onaylı belgeler (`D1`…, alanları ve PDF metin katmanının ilk 6000 karakteri; en fazla 8 belge). Onaylanmamış belge gönderilmez (kural 5). Sayfa, her çağrıda rastgele değer taşıyan işaretler arasında kullanıcı mesajı olarak gider; talimat `prompts/consistency-check.md`, araç yok, cevap şemaya bağlı.
- **Cevap güvenilmez girdi:** yalnızca `AI-01`/`AI-02`, yalnızca sayfadaki referanslar; her bulgu "kanıt" alıntılarına dayanır ve **her alıntı adı verilen kaynakta aranır**, bulunamayan bulgu atılır. `AI-01` en az bir belge alıntısı, `AI-02` iki farklı kaynaktan alıntı ister. En fazla 5 bulgu.
- **Güven sunucunun:** alıntılar olduğu gibi bulunduysa 0,7, ancak büyük/küçük harf ve Türkçe noktalar yok sayılarak bulunduysa 0,6 (her zaman 0,8'in altında). Önem sabit `WARNING`; modelin önem ya da güven alanları okunmaz.
- **Kartta modelin cümlesi yok:** başlık çeviri dosyasından, kutular sunucunun bulduğu alıntılar ve kaynaklarıdır.
- **Kimlik:** `AI-01` belge + ürün kategorisi, `AI-02` iki kaynağın kimliği; aynı çelişkinin başka sözlerle tekrarı yeni bulgu olmaz.
- **Ne zaman:** her kural kontrolünden sonra, kapı açıksa `AI_VALIDATE_BATCH` kuyruğa girer (bekleyen varsa yenisi eklenmez). İş, gönderilecek sayfanın özetini (model + sayfa, SHA-256) partide saklananla karşılaştırır: değişmediyse çağrı yapılmaz (V14 `batch.ai_input_sha256`). Hiç beyan ve onaylı belge yoksa da çağrı yapılmaz. Günlük sınır (`LlmBudget`) dolduysa atlanır; ağ hatası yeniden denenir, ret ve kota vazgeçer, kural sonucu geçerli kalır.

## 9. Kararlar (onay bekleyen yok; itiraz edilebilir)

1. **ERROR elle çözülmez**, yayını engeller; WARNING/INFO çözülebilir. (Tasarım v0.3 "Engelleyici / Uyarı / Kontrol" üçlüsüyle uyumlu.)
2. **LIF-01 toleransı 3 puan** (AB 1007/2011'deki üretim toleransı). Sert eşik istenirse tek sabit.
3. **Bulgu satırı kalıcıdır**, silinmez (denetim izi M12 bunu okur); kendiliğinden kapanma `auto_resolved` ile ayrılır.
4. **Metin veritabanında değil çeviri dosyasında**; DB'de kod + `params`.
5. **Yayın kontrolü eşzamanlı çalıştırır**; arka plan işi yalnızca panel sayaçlarını güncel tutar.
6. **Günlük tarama yayınlanmış partileri de kapsar** ama snapshot'a dokunmaz.
7. **AI kontrolleri ikinci aşama** ve hiçbir zaman engelleyici değil.

## 10. Görevler ve sıra

| # | İş | Bağımlılık |
| --- | --- | --- |
| T0 | Tasarım brifi → Claude Design v0.7 (UI işleri bunu bekler) | |
| T1 | V13 + kural motoru (`validation` paketi) + eşitleme + `POST /validate`, `GET /issues`, resolve/reopen + birim ve entegrasyon testleri | |
| T2 | Skor ve yayın entegrasyonu (`ISSUES_OPEN`, yayın öncesi eşzamanlı kontrol), `BatchResponse.openIssues`, kabul testi | T1 |
| T3 | Tetikleyiciler (`RULE_VALIDATE_BATCH`) + günlük `CERT_EXPIRY_SCAN` + `GET /documents/expiring` + görevler grubu (backend) | T1 |
| T4 | Web: Uyarılar sekmesi, rozetler, skor/yayın entegrasyonu, görevler grubu | T0, T2, T3 |
| T5 | AI kontrolleri (§8) | T1 |
| T6 | Çeviriler en/de, haftalık not, README, PLAN | hepsi |
