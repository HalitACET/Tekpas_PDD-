# Sizin işleriniz (kullanıcıya düşenler)

Projede benim yapamadığım, sizin yapmanız ya da karar vermeniz gereken her şey burada. Her kilometre taşında güncellenir. Biten işi `[x]` yapın ya da bana söyleyin, ben işaretlerim.

Sıra önerisi: önce **A** (tasarım; M12 ekranları buna bağlı), sonra **C** (canlı kontroller, 10 dakika), sonra telefon (**B**) ve dil (**D**). Demo (**E**) demo tarihine göre.

Son güncelleme: 23.10.2026 (M11 sonu).

---

## A. Claude Design ile tasarım

Onaylı tasarım olmadan ekran kodlamıyorum (CLAUDE.md). Brifi verdiğimde Claude Design'a yapıştırıp çıkan dosyaları `docs/design/vX.Y/` klasörüne koymanız yeterli.

- [ ] **M12 ekranları (Claude Design v1.2):** kullanıcı yönetimi, denetim izi. Brif `docs/m12-tasarim-brifi.md` dosyasında olacak. Backend tasarım beklemeden yapılıyor; ekranlar tasarım gelince.
- [ ] **Eski tasarım borçları (acil değil, tek seferde bir brifle istenebilir):**
  - Mobil web liste (768 px altı): masaüstü tablo şimdilik yana kayıyor; tasarım 16'nın web uyarlaması gerekiyor (PLAN §6).
  - "Belgeler" sayfasının tamamı: firma çapında belge listesi ve "Tedarikçiden iste". Bugün yalnızca "Belge yükle" diyaloğu var (PLAN §6).
  - Login altbilgisindeki "KVKK · Gizlilik · Durum" bağlantıları: sayfaları yok, bu yüzden gösterilmiyor. Gerçek kullanım olursa metinleri de sizin vermeniz gerekir (bkz. G).

## B. Telefon (Android) kabul denemeleri

Kod ve Android geliştirme sürümü (APK) hazır; denemeyi siz telefonda yapacaksınız. Kurulum adımları: `docs/mobil-push-kurulumu.md`.

- [ ] **M8: canlı API ile belge okuma.**
  - Sentetik iki sayfalık sertifikayı telefonla çekip Render'daki API'ye yükleyin; form dolu gelmeli. Hedef 10 sn'nin altı; yerelde 4,0 sn ölçülmüştü.
  - Gerekenler: sunucu uyanık; Render'da `LLM_ENABLED=true` yalnızca deneme süresince (`docs/DEPLOY.md` §LLM).
  - Bittikten sonra `LLM_ENABLED=false`.
- [ ] **M9: bildirim ve bildirimden onay** (PLAN kabulü: "Tedarikçi veri gönderince üreticinin telefonuna bildirim gelir, bildirimden onaylanır").
  1. Telefona KozaPass geliştirme sürümünü kurun (`docs/mobil-push-kurulumu.md` §6).
  2. Backend'i `PUSH_ENABLED=true` ile açın (§7).
  3. Bilgisayardan bir adım için tedarikçi bağlantısı oluşturup formu gönderin.
  4. Telefona bildirim gelmeli; bildirime dokunun, açılan ekrandan "Onayla" deyin.
  5. Ekran görüntülerini alın; bana verin, `docs/haftalik/img/09-*.png` olarak eklerim.

## C. Canlıda kontroller

Bu bilgisayardan Vercel ve Render'a TLS bağlantısı kurulamıyor (curl, PowerShell ve tarayıcı aynı hatayı veriyor), bu yüzden canlıyı ben göremiyorum.

- [ ] **M11: pasaport Almanca açılıyor mu?** Canlı sitede yayındaki bir pasaportu açın, adresin sonuna `?lang=de` ekleyin. Başlıklar Almanca olmalı; çevirisi olmayan serbest metinlerin yanında "auf Türkisch" yazmalı.
- [ ] **M10 T7: gerçek istemci IP'si.** Herkese açık uçlardaki IP sınırları şimdilik kapalı; yerine genel sayaç ve bağlantı başına sayaç var.
  - **Sorun:** Vercel istemcinin kendi gönderdiği `X-Forwarded-For` başlığını olduğu gibi aktarıyor, ilk adres sahte olabilir.
  - **Yapılacak:** Vercel'in kendi başlığının (`x-real-ip` ya da `x-vercel-forwarded-for`) Render'a ulaşıp ulaşmadığına bakmak. Log artık bu başlıkların **var/yok** bilgisini yazıyor (adres değil). Bu belgeyle aynı PR'da; canlıya çıkınca:
    1. Telefondan pasaport sayfasını bir kez açın.
    2. Render → servis → **Logs**'ta `GET /api/v1/public/...` satırına bakın.
    3. Satırın sonu şöyle görünür: `xff=2 vercel=x-real-ip,x-vercel-forwarded-for` ya da `xff=2 vercel=none`. Bu kısmı bana iletin.
  - **Sonuç:** başlık varsa IP başına sınırları geri açarım (PLAN M10, iki madde).
- [ ] **Uyuyan sunucuda erken kesilen istek** (M10 T5'ten): sunucu uyurken sayfayı açıp birkaç saniyede kapatın, sonra yeniden açın. Uyanma devam etmiş mi, yoksa baştan mı başladı? Render log'undaki "Started TekpasApplication" saatine bakmak yeterli.
- [ ] **Gemini model adı:** AI Studio'da kullandığınız modelin kimliği hâlâ geçerli mi; Render'daki `GEMINI_MODEL` ile karşılaştırın (PLAN §7). Demo öncesi bir kez.

## D. Dil kontrolü (M11 T8)

- [ ] **İngilizce ve Almanca metinler:** arayüz ve pasaport cümlelerini anadili İngilizce ve Almanca olan birine okutun.
  - **Dosyalar:** `web/messages/en.json` ve `web/messages/de.json`. En önemlisi pasaport bölümü (`"passport"`), sonra `"translations"` ve `"imports"`.
  - **Pratik yol:** canlı pasaportu `?lang=en` ve `?lang=de` ile açıp okumaları; panel için dil düğmesi sağ üstte.
  - **Bana dönüş:** düzeltmeleri "eski → yeni" listesiyle verin, ben işlerim (`web/messages/README.md`).

## E. Demo (Arden)

Senaryo ve kontrol listesi: `docs/m10-demo-senaryosu.md`.

- [ ] **Prova:** senaryoyu yerelde bir kez baştan sona deneyin. Chrome geliştirici araçlarında Network → "Slow 4G" ile de bir kez. Prova yerelde, çünkü canlıda yayınlanan pasaport geri alınamaz (§3).
- [ ] **Demo günü, bir gün önce:**
  - cron-job.org'daki uyandırma görevini 7/24'e alın (`docs/DEPLOY.md` §6).
  - Supabase panelini açın; ücretsiz proje 7 gün etkinliksiz kalırsa duraklıyor.
  - Canlıda giriş yapıp beş partinin durumuna bakın (§4).
- [ ] **Demodan sonra:** cron'u 09:00–22:00'ye geri alın.
- [ ] **Karar: demodan sonra sıfırlama** (§5). Yayınlanan pasaport geri alınamadığı için ikinci bir gösterimde "yayına hazır" yeni bir parti gerekir. Öneri: her gösterim için senaryo sürümünü artırıp yeni parti açmak; ben yaparım, siz "yeni gösterim var" demeniz yeterli.
- [ ] **Sentetik belgeler:** demoda telefonla çekilecek "ÖRNEK — GEÇERSİZ" sertifikayı yazdırın. Gerçek firma adı ve numarası olmamalı (PLAN §7).

## F. M13 teslim

Rapor taslağını, diyagramları ve ekran görüntülerini ben hazırlarım. Şunlar sizde:

- [ ] Raporun okul şablonuna geçirilmesi, kapak, imza sayfaları.
- [ ] Sunum: taslağı ben çıkarırım; okulun biçimi ve süresi sizde.
- [ ] Teslim: APK'nın, canlı linkin ve kaynak kodun teslim edilmesi (okulun istediği yol: e-posta, sistem, CD…).

## G. Gerçek kullanım olursa (şimdilik değil)

- [ ] Ücretli Gemini katmanı. Ücretsiz katmanda gönderilen veri Google tarafından kullanılabiliyor; gerçek firma verisi gitmesin diye AI şimdilik yalnızca demo firmasında açık.
- [ ] Alan adı (`kozapass.vercel.app` yerine).
- [ ] KVKK aydınlatma metni ve gizlilik sayfası (A'daki altbilgi bağlantıları bunlara gider).

---

## Biten işler

- [x] Claude Design v0.2–v1.1 tasarımları (M1–M11).
- [x] Firebase (FCM) ve EAS kurulumu, `google-services.json` EAS'ta (M9).
- [x] Prod açılış değişikliği onayı: regex sorgu işleyicisi (M10 T5, PR #94).
- [x] Excel kütüphanesi onayı: fastexcel (M11).
