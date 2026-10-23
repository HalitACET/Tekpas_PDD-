# Tanıtım videosu seslendirmesi

Claude Design'ın ürettiği tanıtım animasyonuna arkadan anlatan bir ses eklemek için. Senaryo: `docs/tanitim-animasyonu-brifi.md`.

**Videoyu depoya koymayın.** Video dosyası büyük; git'e değil, kendi bilgisayarınızda ya da Drive'da durmalı.

---

## 1. Hangi yol?

| Yol | Ne gerekir | Artısı | Eksisi |
| --- | --- | --- | --- |
| **A. Yapay ses (Clipchamp)** | Clipchamp, ücretsiz, Microsoft'un video düzenleyicisi | Kayıt yok, tekrar denemesi kolay, ses temiz | Ses yine de biraz makine gibi |
| **B. Kendi sesiniz** | Telefonun ses kaydedicisi + Clipchamp | Daha samimi; "projeyi yapan kişi anlatıyor" etkisi | Sessiz bir oda ve birkaç deneme gerekir |
| **C. ElevenLabs** | ElevenLabs ücretsiz hesabı + Clipchamp | En doğal yapay ses | Ücretsiz planda ticari kullanım yok, ElevenLabs'i anmak gerekir (bkz. §5) |

**Hangisi:**
- **Okul sunumu:** C (en doğal ses; ücretsiz planda ElevenLabs'i anmak yeterli).
- **Arden'e ya da başka bir firmaya tanıtım:** A ya da B. C'yi bu amaçla kullanacaksanız ücretli planı bir ay alın (§5).

**Bilgisayarınızdaki Windows sesi (Microsoft Tolga):** eski ve robotik. Kullanmayın.

---

## 2. Sahne sahne seslendirme metni

**Zamanlama:**
- Süreler briften alındı. Claude Design sahneleri biraz farklı uzatmış olabilir; bu yüzden her satırda o sahnenin **ilk görüntüsü** de yazıyor.
- Sesi saate göre değil, o görüntü ekrana geldiğinde başlatın.
- Her cümle sahnesinin yaklaşık üçte ikisini doldurur; kalan süre izleyicinin ekranı okumasına kalır.

| # | Sahne başlar | Süre | Sahnenin ilk görüntüsü | Okunacak metin |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | 6 sn | Logo ortada belirir | KozaPass: tekstil için dijital ürün pasaportu. |
| 2 | 0:06 | 14 sn | Dağınık firma kartları | Bir tişörtün hikâyesi beş ayrı firmaya dağılmış durumda. Bilgi mesajlarda, e-postalarda ve tablolarda kayboluyor. |
| 3 | 0:20 | 8 sn | Etikette boş karekod | Avrupa Birliği, ürünler için dijital pasaport istiyor. Tekstil ilk sıralarda. |
| 4 | 0:28 | 10 sn | Kartlar tek çizgiye dizilir | KozaPass, bu dağınık hikâyeyi tek bir akışta topluyor. |
| 5 | 0:38 | 12 sn | Parti listesi | Üretici bir üretim partisi açar. Tedarik zinciri soldan sağa kurulur; her adımın rengi, o adımın durumunu gösterir. |
| 6 | 0:50 | 10 sn | Veri talebi, WhatsApp mesajı | Her tedarikçiye WhatsApp'tan tek bir bağlantı gider. Tedarikçinin hesap açmasına gerek yok. |
| 7 | 1:00 | 12 sn | Telefonda tedarikçi karşılama ekranı | Tedarikçi formu telefonundan doldurur. Lif oranları yüzde yüzü tutmuyorsa, form bunu göndermeden önce söyler. |
| 8 | 1:12 | 10 sn | Panelde gelen veri, Onayla düğmesi | Gelen veri panele düşer. Üretici onaylar ya da gerekçesini yazarak düzeltme ister. |
| 9 | 1:22 | 16 sn | Belge inceleme, sarı alan | Yapay zekâ sertifikayı okur ve her değerin belgede nerede yazdığını gösterir. Emin olmadığı alanı sarıyla işaretler. Son kararı her zaman bir insan verir. |
| 10 | 1:38 | 12 sn | Kırmızı LIF-01 uyarısı | Etikette yüzde doksan beş organik pamuk yazıyor, iplikçi yüzde seksen pamuk diyor. KozaPass bu çelişkiyi yakalar ve yayını durdurur. |
| 11 | 1:50 | 8 sn | Turuncu sertifika satırları | Süresi dolmak üzere olan sertifikalar her gün taranır. |
| 12 | 1:58 | 12 sn | Pasaportu yayınla diyaloğu | Her şey onaylanınca pasaport yayınlanır. Yayınlanan sürüm değiştirilemez; her değişiklik yeni bir sürümdür. |
| 13 | 2:10 | 12 sn | Karekod telefona okunur | Müşteri karekodu okutur, pasaport kendi dilinde açılır. Uygulama indirmesine gerek yok. |
| 14 | 2:22 | 10 sn | Kullanıcılar ekranı | Ekip rollerle çalışır. Kim neyi ne zaman değiştirdi, denetim izinde kayıtlı. |
| 15 | 2:32 | 8 sn | Excel içe aktarma sonucu | Ürün listesi Excel'den toplu olarak aktarılır. |
| 16 | 2:40 | 8 sn | Logo ve canlı adres | KozaPass. Bir partinin hikâyesi, tek karekodda. |

**Yazım ve okunuş:**
- Rakamlar yazıyla yazıldı ("yüzde doksan beş"); "QR" yerine "karekod" denildi. Böylece yapay ses yanlış okumaz.
- Yapay ses bir kelimeyi bozarsa yalnızca o kutudaki yazımı değiştirin:

| Kelime | Bozulursa böyle yazın |
| --- | --- |
| KozaPass | Koza Pas |
| WhatsApp | Vatsap |
| Excel | Eksel |
| e-postalarda | epostalarda |

---

## 3. Yol A: Clipchamp ile yapay ses

1. **Clipchamp'i açın:** Microsoft Store'da "Clipchamp"ı aratıp kurun ya da tarayıcıda `app.clipchamp.com` adresini açın. Microsoft hesabıyla giriş yapın; ücretsiz sürüm yeterli.
2. **Yeni video** → videonuzu (MP4) sürükleyip bırakın → zaman çizelgesine (alttaki şerit) sürükleyin.
3. **Ses oluşturma:** sol menüde **Kaydet ve oluştur** (Record & create) → **Metin okuma** (Text to speech).
4. **Ses ayarı:**
   - Dil olarak **Türkçe**'yi seçin, kadın ya da erkek sesini deneyerek seçin.
   - Hız **Normal**, ya da biraz yavaş (0,9×).
   - Seçtiğiniz sesi bütün sahnelerde aynı tutun.
5. **1. sahnenin metnini** kutuya yapıştırın → **Önizle** ile dinleyin → **Kaydet**. Ses parçası zaman çizelgesine eklenir.
6. **Hizalama:** ses parçasını, videoda o sahnenin ilk görüntüsünün başladığı yere sürükleyin (tablodaki "Sahne başlar" sütunu yaklaşık yeri verir).
7. **Kalan sahneler:** 5. ve 6. adımları 2'den 16'ya kadar her sahne için tekrarlayın. Her sahne ayrı parça olunca biri bozulursa yalnızca onu yeniden yaparsınız.
8. **Müzik (isteğe bağlı):**
   - Sol menü → **İçerik kitaplığı** → **Müzik** → sakin, sözsüz bir parça seçip alta ekleyin.
   - Müziğin sesini %10–15'e indirin; anlatımın altında zor duyulmalı.
9. **Baştan sona bir kez izleyin.** Bir cümle bir sonraki sahneye taşıyorsa ya o parçayı biraz öne çekin ya da hızını 1,1× yapın.
10. **Dışa aktarın:** sağ üst **Dışa aktar** → **1080p**. Ücretsiz sürüm 1080p vermezse 720p de yeterli. Dosya bilgisayarınıza iner.

## 4. Yol B: Kendi sesiniz

1. **Ortam:** sessiz, eşyalı bir oda seçin (boş oda yankı yapar). Telefonu ağzınızdan bir karış uzakta tutun; telefonu masaya koymak daha iyi.
2. **Kayıt:** telefonun **Ses Kaydedici** uygulamasıyla her sahneyi ayrı kaydedin (16 kısa kayıt). Hata yaparsanız yalnızca o sahneyi yeniden çekersiniz.
3. **Okuyuş:** yavaş ve sakin okuyun; cümle sonlarında yarım saniye durun. Videoyu yanınızda açıp sahneyi izleyerek okumak zamanlamayı kolaylaştırır.
4. **Aktarma:** kayıtları bilgisayara alın (WhatsApp'ta kendinize göndermek ya da kabloyla).
5. **Birleştirme:** Clipchamp'te videoyu açın, kayıtları **Medyanızı içe aktarın** ile ekleyin.
6. Sonrası Yol A'nın **6–10.** adımlarıyla aynı.

---

## 5. Yol C: ElevenLabs

ElevenLabs, sesi Clipchamp'tan daha doğal üretir. Video düzenleyici değildir: sesleri orada üretip indirirsiniz, videoya yine Clipchamp'te eklersiniz.

**Önce lisansa bakın:**
- **Ücretsiz plan:** ayda 10.000 karakter. Bu senaryonun tamamı 1.390 karakter; bütün metni yaklaşık 7 kez baştan üretmeye yeter.
- **Kısıtlar:** üretilen ses ticari amaçla kullanılamaz ve ElevenLabs'in adı anılmalıdır.
- **Okul sunumu:** ücretsiz plan uygundur; videonun sonuna "Seslendirme: ElevenLabs" yazın (aşağıda 10. adım).
- **Bir firmaya ürün olarak tanıtım (örneğin Arden):** bu ticari kullanım sayılabilir.
  - Ya ElevenLabs'in en ucuz ücretli planını (Starter) bir ay alıp sonra iptal edin,
  - ya da Yol A'yı kullanın.
- **Güncel şartlar:** başlamadan `elevenlabs.io/pricing` sayfasından kontrol edin; bu bilgiler oradan değil, başka sitelerden derlendi.

**Adımlar:**
1. **Hesap:** `elevenlabs.io` → **Sign up** (Google hesabıyla olabilir). Ücretsiz planda (**Free**) kalın; kart bilgisi istenirse ücretsiz planı seçtiğinizden emin olun.
2. **Ses seçimi:** sol menü **Voices** → **Voice Library**.
   - Dil filtresinde **Turkish**'i seçin, birkaç sesi dinleyin.
   - Beğendiğinizi **Add to my voices** ile ekleyin.
   - Anadili Türkçe olan bir ses aksansız okur; varsayılan İngilizce sesler Türkçeyi yabancı aksanıyla okur.
3. **Metin okuma ekranı:** sol menü **Text to Speech**.
   - Ses: 2. adımda eklediğiniz ses.
   - Model: **Eleven Multilingual v2** (Türkçeyi destekleyen model).
4. **Ayarlar** (dişli simgesi):
   - **Stability** %50 civarı: daha düşükse ses dalgalanır, daha yüksekse tekdüzeleşir.
   - **Similarity** %75.
   - **Style** 0.
   - **Speed** 0,95: biraz yavaş, yönetici rahat dinlesin.
   - Bu ayarları 16 sahnede de değiştirmeyin; ses her sahnede aynı kalsın.
5. **1. sahne:** §2'deki tablodan metni yapıştırın → **Generate** → dinleyin.
   - Bir kelime bozuksa §2'deki okunuş tablosundaki yazımı deneyip yeniden üretin.
   - Her üretim kredi harcar.
6. **İndirme:** beğendiğinizi indirme simgesiyle MP3 olarak indirin. Dosya adını sahne numarası yapın: `01.mp3`, `02.mp3` … Sıralama karışmasın.
7. **Kalan sahneler:** 5. ve 6. adımları 2'den 16'ya kadar tekrarlayın. Bütün metni tek parça üretmeyin; ayrı parçalar videoya hizalamayı kolaylaştırır.
8. **Videoya ekleme:** Clipchamp'te videoyu açın, 16 MP3'ü **Medyanızı içe aktarın** ile ekleyin.
9. **Hizalama ve dışa aktarma:** her parçayı kendi sahnesinin ilk görüntüsüne sürükleyin. Müzik, kontrol ve dışa aktarma Yol A'nın **6–10.** adımlarıyla aynı.
10. **Ad anma (ücretsiz planda):** Clipchamp'te son sahneye küçük bir yazı ekleyin: sol menü **Metin** → "Seslendirme: ElevenLabs". Son 3 saniyede, köşede durması yeterli.

## 6. Göstermeden önce kontrol

- [ ] Ses bütün videoda aynı ses seviyesinde mi? Bir sahne çok yüksek ya da alçaksa o parçanın sesini ayarlayın.
- [ ] Her cümle kendi görüntüsünün üstünde mi? Özellikle 9. sahne (yapay zekâ) ve 10. sahne (uyarı) yanlış görüntüde kalmasın.
- [ ] Telefonda da bir kez izleyin; yöneticiye büyük ihtimalle mesajla gidecek.
- [ ] Dosya boyutu: WhatsApp'tan gönderilecekse 100 MB'ın altında olmalı. Değilse Drive bağlantısıyla gönderin.
