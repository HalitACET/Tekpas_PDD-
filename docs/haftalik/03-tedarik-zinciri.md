# 03 — Tedarik zinciri

**Kilometre taşı:** M3  ·  **Tarih aralığı:** 07.10 – 10.10.2026  ·  **Canlı link:** https://kozapass.vercel.app

## Yapılanlar
- **Tedarikçi ağı ve zincir API'si (PR #18):**
  - Tedarikçi uçları: `GET/POST /suppliers`, `GET/PATCH/DELETE /suppliers/{id}`.
  - Zincir uçları: `GET/POST /batches/{id}/chain`, `POST /batches/{id}/steps`, `PATCH/DELETE /steps/{id}`, `GET /products/{id}/chain-preview`.
  - Yeni parti, ürünün son partisinin zincirini kopyalar; ilk partide varsayılan Lif → İplik → Kumaş → Boya → Konfeksiyon zinciri kurulur.
  - Adım verisi tipli (`StepData`); adım tipine ait olmayan alan `NotApplicable` hatası verir.
- **Migration V4:** Zincir ağaç değil **DAG**: `supply_step_input(step_id, input_step_id)` tablosu eklendi ve `parent_step_id` kaldırıldı. Tedarikçi telefonu E.164 biçiminde tutuluyor. **V5:** SKU alanı 64 karaktere çıktı.
- **Tedarikçiler ekranı (PR #20):**
  - 14 liste, 15 ekleme/düzenleme, v0.3.1 27/28 kaldırma.
  - Şehir 81 il arasından aranarak seçiliyor; liste tek kaynaktan geliyor ve backend aynı listeyle doğruluyor.
  - Partiler listesine `?supplierId=` filtresi eklendi.
- **Tasarım hizalamaları:** v0.3.1 (17–24, PR #19) ve v0.3.2 (31–38, PR #22) uygulandı. Kapsam: yükleniyor, hata ve filtreli boş durumları, hata toast'ı, X-Request-Id ve parti aşama sekmeleri.
- **Erişim log'u (PR #21):** Her istek için tek satır yazılıyor. Token geçen yollar maskeleniyor; query string, header ve gövde hiç yazılmıyor; health kontrolleri log'a girmiyor.
- **Uyuyan sunucu (PR #22–#24):**
  - Giriş, listeler ve panel açılışı uyanmayı bekliyor; sınır 3 dk.
  - Panel açılırken oturum yenileme isteği yalnızca sunucu uyandıktan sonra ve tek kez gönderiliyor.
  - Render'ın HTML uyanma sayfası "uyanıyor" olarak tanınıyor.
- **Parti detayı ve zincir (PR #25, #26):**
  - Ekranlar: 09 detay, 26 zinciri olmayan parti, 29 reddedilen adım, 10/30 adım paneli, 25 Tedarikçi ata.
  - Zincir React Flow ile, sabit 5 sütunda çiziliyor.
  - Listedeki zincir çubuğu adım adım renkleniyor; yeni parti diyaloğu "N adım kopyalanacak" satırını gösteriyor.
- **Yeni alanlar:**
  - `SupplierResponse.latestStepAt`: son durumun tarihi; yalnızca kendi partilerinden hesaplanıyor.
  - `ChainSummary.stepStatuses`: adım durumları zincir sırasıyla.

## Teknik kararlar
- **DAG, ağaç değil:** Bir lif partisi iki iplikçiye gidebiliyor. Döngü kontrolü servisteki recursive CTE ile yapılıyor; kendine bağlantıyı CHECK kısıtı engelliyor.
- **Sabit yerleşim:** Zincirin şekli belli olduğu için (5 sütun) yerleşim kütüphanesi kullanılmadı. Konumları `chain-layout.ts` hesaplıyor; saf fonksiyon olduğu için testi kolay. React Flow'da yalnızca çizim yapılıyor; sürükleme ve zoom kapalı.
- **Kiracı kuralı tedarikçide de geçerli:** Bir tedarikçi birden çok üreticiyle çalışabiliyor. "Son durum" ve tarihi yalnızca JWT'deki firmanın partilerinden hesaplanıyor; başka üreticinin daha yeni adımı görünmüyor. Bunun testi var.
- **Lif adımının tedarikçisi yok:** Lif adımı bir firmayı değil menşeyi (lif türü, bölge) kaydediyor. Boş Lif düğümü bu yüzden "Tedarikçi ata" yerine "Menşe girilmedi" diyor. Tasarımla API'nin çeliştiği bu noktada karar kullanıcıya soruldu.
- **Henüz gelmeyen özellikler gizli:** Belgeler (M5), skor (M6) ve M4 aksiyonları görünür ama kilitli ya da gizli. Düğme "Bir sonraki sürümde" diyor; tasarım değişmeden ileride açılabiliyor.

## Karşılaşılan sorunlar ve çözümler
- **Render uyurken JSON yerine HTML dönüyor.**
  - Kök neden: Uyuyan servis her isteğe, `Accept: application/json` olsa da, satır satır akan bir "SERVICE WAKING UP" sayfası döndürüyor. cron-job.org bunu "output too large" sayıp 27 Eylül'de işi kendiliğinden kapatmış.
  - Çözüm: API istemcisi HTML cevabı parse etmeden sonuna kadar okuyor ve "uyanıyor" diye işaretli bir 503'e çeviriyor. Kısa yoklamaların yerine tek bir uzun health isteği kullanılıyor. DEPLOY.md'ye cron'un düzenli kontrol edilmesi notu eklendi.
- **Uyuyan sunucuda oturum yenileme riski.**
  - Kök neden: Refresh token tek kullanımlık. Tarayıcının vazgeçtiği bir istek sunucuya yine de ulaşırsa, ikinci deneme "yeniden kullanım" sayılıp oturum ailesini düşürüyor.
  - Çözüm: Önce sunucunun uyanık olduğu kontrol ediliyor, refresh sonra tek kez gönderiliyor. Testte istek sayısı tam 1.
- **React Flow düğümlerine tıklanamıyordu.** Kök neden: Sürüklenmeyen ve seçilmeyen düğümlere `pointer-events: none` veriliyor. Çözüm: Düğüm stilinde `pointerEvents: "all"` ayarlandı; düğümün kendisi bir buton olarak çiziliyor.
- **Uyanırken liste yeniden çekilmiyordu.** Kök neden: TanStack, henüz veri yokken refetch'i bekleyen isteğe bağlıyor. Çözüm: Önce `cancelQueries`, sonra yeniden çekme.
- **Yeni parti formu tarihsiz kaydetmiyordu.** Kök neden: Paylaşılan şema boş metni (`""`) geçersiz tarih sayıyordu; API ise tarihsiz partiyi kabul ediyor. Çözüm: Boş alan "tarih yok" sayılıyor; iki tarih doluyken sıra kontrolü sürüyor.
- **Dalgalanan test:** `keyboard.spec`'teki mobil çekmece testi tam takım çalışırken ara sıra düşüyor, tek başına hep geçiyor. PLAN'a "flaky" olarak not edildi, ayrı ele alınacak.

## Test
- **Backend:** 237 test (M2 sonunda 170). Yeni uçların her biri için kiracı testi var (başka firmanın kaydı → 404). Tedarikçi son durumu için iki üreticili test eklendi.
- **Web:** 84 birim testi ve 58 Playwright testi (ekran görüntüleri hariç). Kapsamdaki senaryolar: parti detayı, zincir yerleşimi, adım paneli, tedarikçi atama, uyuyan sunucu.
- **Paylaşılan paketler:** shared 57, api-client 12 test.
- **CI:** backend, contract ve js job'ları yeşil.

## Ekran görüntüleri
- `docs/design/impl-v0.3/` 09, 10, 14, 15 ve 08b; `impl-v0.3.1/` 17–30; `impl-v0.3.2/` 31–38.
- Hepsi açık ve koyu temada, tasarımdan alınan `design-NN-*` görüntüleriyle yan yana.

## Sonraki adım
- **M4:** Veri talebi bağlantısı (token hash), girişsiz `/r/[token]` sayfası, "Veri talep et", "Düzeltme iste" ve "Adımı onayla" aksiyonlarının açılması. Açılışı hızlandırma (Render'da önce ve sonra ölçüm) M10 listesinde.
