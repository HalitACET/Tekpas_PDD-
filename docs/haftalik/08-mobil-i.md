# 08 — Mobil I: görevler ve kamerayla belge

**Kilometre taşı:** M8  ·  **Tarih aralığı:** 21.10.2026  ·  **Canlı link:** API Render'da (merge ile canlıya çıkar); uygulama Expo Go ile açılır, mağazada değil

## Yapılanlar
- **Plan ve tasarım (PR #65):** `docs/m8-plan.md` (kapsam, iki yeni uç, mobil yığın, ölçüm), `docs/m8-tasarim-brifi.md` → Claude Design v0.8 (mobil çerçeveler 90–100).
- **Backend (PR #66):**
  - `POST /steps/{id}/documents/photos`: 1–10 JPG/PNG sayfa, toplam 10 MB. Her sayfa yeniden kodlanır (EXIF/GPS düşer) ve uzun kenarı 2000 px'e küçültülür; sayfalar tek A4 PDF olur ve normal belge gibi okunur.
  - `GET /documents/awaiting-review`: firmanın okunmuş ama onaylanmamış belgelerini parti, adım, tedarikçi ve sarı alan sayısıyla verir.
  - Yeni tablo yok.
- **Mobil iskelet (PR #67):** Expo SDK 57 ve Expo Router. Refresh token yalnızca SecureStore'da, access token bellekte; 401'de tek yenileme. TanStack Query, i18next.
  - Mobil metinler `packages/shared/src/i18n/mobile/{tr,en,de}.json`'da; anahtar eşitliği testli.
- **Ekranlar (PR #68, tasarım v0.8):**
  - **Giriş:** hatalı bilgi, bağlantı yok ve uyuyan sunucu ayrı gösterilir. Açılışta oturum geri yüklenir.
  - **Görevler:** onay bekleyen belgeler, web'de onaylanacak veriler, süresi yaklaşan sertifikalar. Sekme rozeti.
  - **Belge çekme:** parti seçimi → adım seçimi → kamera (izin, flaş, kadraj) → gözden geçirme (yeniden çek, sil, sıra, 10 sayfa / 10 MB) → yükleme (yüzde, sonra okuma; 20 sn'de "Elle doldur"; bağlantı koparsa "Tekrar dene").
  - **Belge formu:** her alanın kaynağı ve güveni ("AI okudu · %74"); %80 altı sarı. Tarih seçici, zorunlu alanlar. "Onayla" yalnızca sahip/yöneticide; aynı anda onay (409) ayrıca gösterilir.
  - **Başarı ve profil:** onay özeti; dil ve tema seçimi. Çıkışta telefondaki sayfalar silinir.
- **Kabul ölçümü (bu PR):** geliştirme sürümünde formda "Yükle → dolu form: x sn" satırı. Kök `.env.example`'daki hatalı mobil adres düzeltildi.

## Teknik kararlar
- **Sayfalar sunucuda tek PDF olur:** belge modeli, okuma işi ve önizleme değişmedi; telefon yalnızca küçültülmüş JPEG gönderir. Meta veriyi sunucu atar, telefondaki kütüphaneye güvenilmez.
- **Yükleme fetch ile değil XMLHttpRequest ile:** React Native'de yalnızca XHR gönderim ilerlemesini bildiriyor. Tasarımdaki yüzde göstergesi bunu gerektirdi.
- **Okumayı bekleme:** push yerine saniyede bir yoklama. İş kuyruğu commit sonrası hemen uyanıyor (K9), çoğu okuma ilk yoklamadan önce bitiyor.
- **Roller:** tedarikçi mobile girmiyor, onun için hesapsız bağlantı var (M4). EDITOR ve VIEWER formu kilitli görür.
- **Tasarımdan bilinçli sapmalar:**
  - Sayfa sırası sürüklemeyle değil, basılı tutup dokunarak değişir; sürükleme için ek bir hareket kütüphanesi gerekirdi.
  - Sınır 10 MB (sunucunun sınırı), tasarımda 20 MB yazıyordu.
  - Görevlerden açılan belgede sayfa önizlemesi yok: sunucudaki PDF telefonda görüntü olarak gösterilmiyor.

## Karşılaşılan sorunlar ve çözümler
- **Testte değiştirilen `fetch` görünmüyordu:** openapi-fetch `fetch`'i istemci kurulurken yakalıyordu ve yoklama testi sonsuz döngüye girdi. İstemciye her çağrıda `globalThis.fetch`'e bakan bir sarmalayıcı verildi; yoklamaya 2 dakikalık üst sınır kondu.
- **React Native Testing Library 14:** `render` ve `fireEvent` artık asenkron. İlk denemede hiçbir ekran çizilmedi; testler `await` ile yazıldı.
- **Jest bitmiyordu:** onay testlerinden sonra süreç açık kalıyordu. Sebep, TanStack Query mutation'larının 5 dakikalık temizlik zamanlayıcısıydı; test istemcisinde kapatıldı.
- **CI'da zaman aşımı:** her test dosyasının ilk testi, web testleriyle paralel koşan CI makinesinde soğuk başlangıçta 5 sn'yi aştı (yerelde 0,7 sn). Testler değişmedi; bekleme süresi 20 sn'ye çıkarıldı.
- **İkon paketi Jest'te açılmadı:** `lucide-react-native` yalnızca ESM. İkonlar testte boş bileşenle değiştirildi; ikonlarda metin olmadığı için test kapsamı daralmadı.
- **Lint, effect içinde setState'i yakaladı:** form değerleri state'e kopyalanmak yerine render sırasında türetiliyor (okuma önerisi + kişinin girdikleri). Bunun bir yararı da var: okuma form açıkken biterse kişinin yazdıkları korunuyor.

## Test
- **Backend:** `PhotoDocumentsTest` 8 entegrasyon testi. Kapsam: sayfa sırası, meta verinin depoya ulaşmaması, küçültme, hatalı sayfa alanları, 10 MB üstü 413, tenant 404, VIEWER/SUPPLIER 403, yayınlanmış parti 409, bekleyen belgeler. Toplam 631 test.
- **Mobil:** 36 Jest testi.
  - Oturum 6, belge ve yükleme 8 (XHR ilerleme, ret, kopma, iptal), görüntü 2.
  - Ekran 20: giriş 4, görevler 4, inceleme 3, yükleme 3, form 6 (öneri ve doğrulama kuralları, sarı alan ve onay gövdesi, zorunlu alanlar, 409, roller).
- **Diğer:** shared 97 (çeviri eşitliği dahil), web 228. CI yeşil. `expo export --platform android` paketi sorunsuz üretiyor.
- **Kabul ölçümü (sunucu tarafı, yerel backend):** iki sayfa, ~200 KB, sentetik "ÖRNEK — GEÇERSİZ" sertifika, 5 tur.
  - Yükleme ve PDF'e birleştirme 0,35 sn (ilk istek 0,8 sn). Okuma işi 1 sn'lik ilk yoklamadan önce bitti; toplam 1,4 sn.
  - Yerelde Gemini anahtarı olmadığı için belge `UNREADABLE` döndü, LLM süresi bu sayıya dahil değil. 10 sn hedefinde Gemini çağrısına ve telefonun Wi-Fi yüklemesine ~8,5 sn kalıyor.
  - **Telefonda Gemini ile ölçüm henüz yapılmadı.**

## Ekran görüntüleri
- Telefonda deneme sırasında alınacak: `docs/haftalik/img/08-*.png`. Web kopyası yok; uygulama yalnızca Expo Go'da çalışıyor.

## Sonraki adım
- **Telefonda kabul denemesi:**
  1. Backend'i `LLM_ENABLED=true`, `GEMINI_API_KEY` ve `GEMINI_MODEL` ile başlat.
  2. `mobile/.env`'e bilgisayarın yerel IP'sini yaz.
  3. `pnpm --filter mobile start` → Expo Go.
  4. Demo hesabıyla iki sayfalık sentetik sertifikayı çek ve "Yükle → dolu form" süresini kaydet.
- Ekran görüntülerini README'ye ekle.
- M9: QR okutma, hızlı onay ve red, bildirimler, zayıf bağlantıda yükleme kuyruğu.
