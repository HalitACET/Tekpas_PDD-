# mobile/ — Expo kuralları

Kök `CLAUDE.md` kuralları burada da geçerli.

## Kimin için ve ne yapar

**Sahadaki kullanıcı:** tedarikçi, fason atölye ustası, üreticinin sahadaki kalite sorumlusu. **Web yönetir, mobil sahada iş görür.** Web'in kopyası değildir.

Sadece şunlar var:
1. **Giriş**
2. **Görevlerim (ana ekran):** Tedarikçi için veri istenen adımlar. Üretici için onay bekleyen adımlar ve belgeler.
3. **Belge fotoğrafı → AI → onay (asıl özellik):** Kamerayla sertifika veya etiket fotoğrafı çekilir (birden fazla sayfa olabilir), yüklenir, AI sonucu gelene kadar ilerleme gösterilir, alanlar düzenlenebilir form olarak gelir, kullanıcı onaylayıp gönderir. Güven skoru düşük alanlar sarı.
4. **QR okut:** Parti etiketi → partinin özeti ve zinciri (sadece görüntüleme). Ürün QR'ı → pasaport (web sayfası uygulama içinde açılır).
5. **Hızlı onayla / reddet:** Üretici rolü, red için gerekçe zorunlu.
6. **Push bildirim:** Yeni veri geldi, sertifika süresi doluyor, düzeltme istendi.

Yapılmayanlar (web'de): ürün ve parti oluşturma, zincir düzenleme, Excel, kullanıcı ve rol yönetimi, pasaport yayınlama.

## Kurallar

- **Yönlendirme:** Expo Router. `app/(auth)/`, `app/(tabs)/` (Görevler, Tara, Profil), `app/document/[id]`, `app/batch/[id]`.
- **Veri:** `@tekpas/api-client` + TanStack Query. Web ile aynı query key yapısı.
- **Token:** Access ve refresh token `expo-secure-store`'da. AsyncStorage'a token yazma. Backend'e `client=MOBILE` ile giriş yapılır.
- **Kamera ve QR:** `expo-camera` (barkod tarama dahil). Fotoğraf yüklemeden önce en fazla 2000 px'e küçültülür ve sıkıştırılır (`expo-image-manipulator`), 10 MB limitini aşmasın.
- **Zayıf bağlantı:** Fason atölyede internet kötü olabilir. Yükleme başarısız olursa kuyrukta tutulur ve tekrar denenir. Kullanıcı durumu görür.
- **Metinler:** i18next, çeviri dosyaları `@tekpas/shared` içinden. Sabit metin yok.
- **UI:** Büyük dokunma alanları (en az 44 pt), tek elle kullanım, eldiven ve kötü ışık düşünülerek yüksek kontrast.
- **Build:** Geliştirmede Expo Go. Demo için EAS ücretsiz build ile Android APK.

## Test

Jest + React Native Testing Library. Kamera ve ağ katmanı mock'lanır.
