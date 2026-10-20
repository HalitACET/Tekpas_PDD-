# 06 — Pasaport ve QR

**Kilometre taşı:** M6  ·  **Tarih aralığı:** 19.10 – 20.10.2026  ·  **Canlı link:** https://kozapass.vercel.app (pasaport sayfası `/01/{gtin}/10/{parti}`; canlıda henüz yayınlanmış bir pasaport yok, bkz. Sonraki adım)

## Yapılanlar
- **Uyum skoru (PR #50):** saf hesap sınıfı `ComplianceScore` (onaylı adımlar 50, zorunlu alanlar 30, geçerli sertifikalar 20), `GET /batches/{id}/score`, partilerde `score`. Yayın engelleri (zincir yok, onaysız adım, süresi dolmuş sertifika, eşik altı) skordan bağımsız. Yalnızca onaylı belgeler sayılır.
- **Yayın ve sürümler (PR #51):** V11 (`passport` kolonları + değişmezlik tetikleyicileri), `POST /batches/{id}/passports`, önizleme, sürümler, `passports/draft`, `GET /passports/{id}`, geri çekme. Snapshot izinli alan listesiyle kurulur, SHA-256 özeti ve kısa doğrulama kodu var.
- **Herkese açık uç ve QR (PR #52):** `GET /public/passports/01/{gtin}/10/{batch}` (200 / 404 / 410), `Gs1DigitalLink` (Java ve `packages/shared` ikizi, ortak test vektörleri), QR PNG ve SVG (ZXing).
- **Önbellek yenileme (PR #53):** V12, `PASSPORT_CACHE_REFRESH` işi, web ucu `POST /api/passport-cache`, `REVALIDATE_SECRET`.
- **Public sayfa (PR #54):** `/01/[gtin]/10/[batch]`: ürün, lif, genişleyen tedarik zinciri, sertifika durumları, sürdürülebilirlik, QR doğrulama; tr/en/de, açık/koyu, mobil öncelikli; hazırlanıyor, bulunamadı, geri çekildi durumları.
- **Panel (PR #55):** skor kartı ve kırılım, yayın diyaloğu, QR kartı, yeni sürüm taslağı, geri çekme, Pasaport sürümleri sekmesi, önizleme ve sürüm görüntüleme, listede skor sütunu ve yaşam döngüsü çipi.
- **PR #56:** public veri için 10 dakikalık yenileme güvencesi; e2e testleri yeni parti ayrıntısına uyarlandı.

## Teknik kararlar
- **Snapshot dilden bağımsız ve izinli alan listesiyle kurulur:** kod ve sayı taşır, metni sayfa çevirir. Miktar, telefon, kişi adı, id ve skor girmez. Böylece M6'da AI çevirisi gerekmedi ve sızıntı testle korunuyor.
- **Değişmezlik DB'de:** yalnızca `PUBLISHED → SUPERSEDED/WITHDRAWN` geçişine izin veren tetikleyici; uygulama hatası olsa bile yayınlanmış sürüm değişmez. Dış anahtar eylemleri (kullanıcı silme, firma CASCADE) tetikleyici derinliğiyle geçer.
- **Taslak satırı yok:** "yeni sürüm (taslak)" parti düzeyinde bir durumdur; yayındaki sürüm yayında kalır ve QR onu göstermeye devam eder. Eski sürümler yalnızca panelde görünür.
- **Önbellek:** kök yerleşim dil için başlık okuduğundan sayfa statik olamıyor; veri `unstable_cache` ile etiketle önbelleğe alınır, yayın ve geri çekmede backend işi etiketi düşürür, 10 dakikalık yenileme güvence. QR okutma çoğunlukla backend'i uyandırmaz.
- **Skor tüketiciye görünmez** (snapshot'a girmez, panelde kalır); onaysız adım skordan bağımsız olarak yayını engeller.

## Karşılaşılan sorunlar ve çözümler
- **`proxy.ts` hiç çalışmıyordu:** matcher'daki `.*\..*` bir string içinde `.*..*` oluyor ve her yolu dışlıyordu; `?lang=` ve dil çerezi bu yüzden çalışmıyordu. `\.` ile düzeltildi, pasaport yolunda çerez de yazılmıyor.
- **Önbellek donma riski:** secret girilmezse yayınlanan yeni sürüm sonsuza kadar eski görünürdü; 10 dakikalık `revalidate` eklendi.
- **e2e'de oturum düşüyordu:** adım panelinin belge listesi mock'lanmadığı için gerçek sunucudan 401 geliyor ve panel kendi kendine kapanıyordu (M5'ten kalma). Varsayılan mock eklendi, 10 başarısız test düzeldi.
- **Tailwind sınıfları:** `bg-status-${ton}-muted` gibi birleştirilmiş sınıflar üretilmez; tam sınıf adlarıyla haritaya çevrildi.
- **Türkçe ek:** "Sürüm 3'ü" gibi sayıya bağlı ekler çeviri dosyasında üretilemez; cümleler eksiz kurulacak şekilde değiştirildi.

## Test
- Backend: 549 test (T1: 16 birim + 7 entegrasyon; T2: 15 + 2; T3: 11 + 4 + 4; T4: 6 + web 13). Yayın ve geri çekme, izinli alan testi, SQL ile değişiklik reddi, eşzamanlı iki yayın, tenant 404 her uçta, roller.
- Web: 197 test (görünüm, kartlar, diyaloglar, sürümler sekmesi, rota); `pnpm -r typecheck` ve `lint` yeşil. Yerelde e2e: batch-detail, batches, m4 ve m5 panel (48 test) geçti; `keyboard.spec.ts` içinde 2 odak halkası testi kırmızı (bu işle ilgisiz).
- Tarayıcıda gerçek API ile: yayın, QR, taslak, geri çek doğrulaması, önbellek ve etiketle düşürme.

## Ekran görüntüleri
- `docs/design/impl-v0.6/63a-*`, `63b-*` (public sayfa), `64a-*` … `64g-*` (panel).

## Sonraki adım
- **Canlıda:** `REVALIDATE_SECRET` Render ve Vercel'e girildi; canlıda bir pasaport yayınlayıp 2 saniye ölçümünü yapmak ve Vercel'de önbelleğin deploy sonrası korunduğunu doğrulamak (M10 demo hazırlığıyla birlikte).
- Bakım bilgisi (ISO 3758) M10'a ertelendi (karar 9).
- M7: tutarlılık kontrolü ve sertifika takibi.
