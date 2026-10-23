# Sunum taslağı (~15 dakika + canlı demo)

Slaytlar için kısa metin ve gösterilecek görsel. Okulun süresi ve şablonu farklıysa kısaltılabilir. Canlı demo akışı: `docs/m10-demo-senaryosu.md`.

| # | Başlık | Söylenecek | Görsel |
| --- | --- | --- | --- |
| 1 | KozaPass | Tekstil için Dijital Ürün Pasaportu; bir üretim partisinin hikâyesi, tek QR'da | Logo, `docs/brand/` |
| 2 | Problem | AB tüzüğüyle ürün pasaportu geliyor `[kaynak]`; tekstilde zincir bilgisi WhatsApp, e-posta ve Excel'de dağınık; sertifika süreleri takip edilmiyor | Dağınık kanallar şeması |
| 3 | Çözüm | Üretici partiyi açar → tedarikçiler bağlantıyla veri gönderir → AI belgeyi okur, insan onaylar → kurallar tutarlılığı denetler → QR'lı pasaport | Akış (mimari.md §3–5) |
| 4 | Kimler kullanır | Üretici ekibi (rollerle), tedarikçi (hesapsız), tüketici (QR), sahadaki kalite sorumlusu (mobil) | Rol matrisi |
| 5 | Canlı demo 1 | Parti, zincir, tedarikçiden gelen veri, onay | Panel |
| 6 | Canlı demo 2 | Telefonla sertifika çekme → AI'ın doldurduğu form (4 sn) → onay | Telefon ekranı |
| 7 | Canlı demo 3 | Yayın → QR → pasaport, İngilizce ve Almanca | Pasaport sayfası |
| 8 | Mimari | Spring Boot API, Next.js web, Expo mobil, PostgreSQL; ücretsiz bulut | `mimari.md` §1–2 |
| 9 | Güven ve güvenlik | Kiracılık (404), değişmez pasaport, hash'li bağlantılar, AI'a yalnızca demo verisi, sunucunun verdiği güven skoru, alıntıyla doğrulanan AI önerisi | Örnek: injection belgesi testi |
| 10 | Kalite | 696 backend testi, web ve mobil testler, tarayıcı testleri CI'da; rol matrisi testi; tasarımla yan yana ekran karşılaştırması | Test tablosu, `impl-*` örneği |
| 11 | Yöntem | 13 kilometre taşı, 100+ PR, her biri testli; tasarım önce (Claude Design); kod yapay zekâ ajanıyla, kararlar insanda | Kilometre taşı tablosu |
| 12 | Zorluklar | Uyuyan ücretsiz sunucu, Vercel arkasında istemci IP'si, Türkçe büyük harf, dil modelinin güvenilmezliği | Haftalık notlardan 3–4 örnek |
| 13 | Gelecek | Gerçek pilot, tarayıcıda OCR, e-postayla davet, resmî DPP veri modeline eşleme | |
| 14 | Teşekkür ve sorular | Canlı link, QR | Canlı linkin QR'ı |

**Yedek planlar:** sunucu uyursa "uyanıyor" şeridi görünür, bu sırada pasaport anlatılır (önbellekten gelir). İnternet yoksa ekran kaydı. Ayrıntı: demo senaryosu §2.
