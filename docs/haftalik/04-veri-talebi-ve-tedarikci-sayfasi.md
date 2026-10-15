# 04 — Veri talebi ve tedarikçi sayfası

**Kilometre taşı:** M4  ·  **Tarih aralığı:** 10.10 – 15.10.2026  ·  **Canlı link:** https://kozapass.vercel.app (tedarikçi sayfası `/r#<bağlantı>`; canlı kabul PR merge'ünden sonra)

## Yapılanlar
- **Veri talebi API'si (PR #27, #28):**
  - `POST /steps/{id}/requests` (bağlantı oluşturur), `POST /requests/{id}/revoke`, `PATCH /requests/{id}` (açık bağlantının süresi 3, 7 veya 14 gün).
  - `POST /steps/{id}/approve` ve `/reject` (düzeltmede gerekçe ve işaretli alanlar).
  - Girişsiz uçlar: `GET /public/request` (görünüm) ve `POST /public/request/submit` (tek gönderim). Kapalı bağlantı 404 veya 410 döner ve bağlantının kısa bağlamını (`link`) taşır.
- **Görevler ve menşe (PR #29, #30):** `GET /tasks` (onay bekleyenler, takip bekleyen talepler, eksik adımlar); lif menşeini üretici panelden girer (beyan olarak onaylı kaydolur, yayından sonra kilitli). Satır `supplierPhone` taşır.
- **Migration'lar:** V6 (`data_request` alanları, `supply_step` red alanları, `step_event` tablosu), V7 (`MANUFACTURER_ENTERED`), V8 (`REQUEST_DEADLINE_CHANGED`).
- **Panel (PR #30):** 46a/b/c Veri talep et (bağlantı, son tarih, WhatsApp), 47a/b gelen veriyi inceleme, onay ve düzeltme isteme, 48a/b Görevler sayfası ve menü rozeti, lif menşe formu.
- **Tedarikçi sayfası (PR #31):** `/r#<bağlantı>` 39–45: karşılama, adım tipine göre form (İplik, Kumaş, Boya, Konfeksiyon), gönderim özeti, süresi dolmuş / geri alınmış / gönderilmiş / geçersiz bağlantı sayfaları, düzeltme istendiğinde önceki veri dolu açılan form.
- **WhatsApp numarası:** Tedarikçi telefonu `0532 123 45 67`, `+90 532 123 45 67`, `532 123 45 67`, `0(532)123-45-67` gibi her biçimden `905321234567` olur; geçersiz numarada WhatsApp numarasız açılır.

## Teknik kararlar
- **Bağlantının gizli kısmı adresin `#` kısmında:** Sunucuya, log'a ve analitiğe gitmez; sayfa onu okuyup API'ye `X-Request-Token` başlığıyla gönderir. DB'de yalnızca SHA-256 özeti durur, ham bağlantı oluşturulduğu anda bir kez gösterilir. Alternatif yol veya sorgu parametresiydi; bunlar erişim log'una düşerdi.
- **Bir bağlantı çok kez açılır, bir kez gönderilir, taslak yok:** Tedarikçinin yarım kalmış verisi sunucuda birikmez; düzeltmede form önceki veriyle yeniden açılır.
- **Gönderim adımı yeşile döndürmez:** Gönderilen veri adımı `SUBMITTED` yapar; adım üretici onaylayınca (`APPROVED`) yeşile döner, gerekçeyle reddedilirse tedarikçiye yeni bağlantıyla açılır. Onay ve red `step_event`'e yazılır (M12 denetim izi için).
- **Hız sınırı:** Vercel istemcinin kendi `X-Forwarded-For`'unu olduğu gibi geçirdiği için istemci IP'sine güvenilemedi. IP bazlı sınır yerine bağlantı başına ve genel sayaçlar kullanılıyor; IP başlığının doğrulanması M10'da.
- **Form, adım tipinin alanlarından kurulur:** Bölümler (lif, enerji, teslimat, boya…) küçük parçalar; yeni adım tipi yeni bölüm listesi demek. Doğrulama kuralları API'nin kurallarıyla aynı, mesajlar hata koduyla.
- **Tasarımda olmayan her parça PLAN'daki tasarım borcu listesinde:** Kumaş ve Konfeksiyon formları, "İsteğe bağlı" etiketleri, "Hiçbiri" seçeneği, yüklenme ve hata durumları.

## Karşılaşılan sorunlar ve çözümler
- **Parti "Yayına hazır" olmuyordu:** Adım onayı JPA'da değişiyor, durum hesabı ise aynı işlemde JDBC ile okuyordu. Yazılanlar henüz DB'ye gitmediği için eski durumu gördü. Hesap önce `flush` yapıyor.
- **Hibernate şema doğrulaması `token_hash`'te patladı:** Kolon `CHAR(64)`, Hibernate `VARCHAR` bekliyordu. Alana `@JdbcTypeCode(SqlTypes.CHAR)` eklendi.
- **Vercel arkasında istemci IP'si taklit edilebiliyor:** Canlıda sabit kaynaktan 10 deneme sonra 429 doğru çalıştı, ama sahte `X-Forwarded-For` anahtarı değiştirdi. IP bazlı sınır kapatıldı, genel sayaç ve token sayacı geldi; asıl çözüm M10'a yazıldı.
- **Sayfa her açılışta bir kez sayılmalı:** TanStack Query pencereye dönüşte veya ağ yeniden bağlanınca isteği yeniler; açılış sayısı şişerdi. Public sorgu bir kez çekilir, kendiliğinden yenilenmez. Uyuyan sunucu cevabı gelince sayfa tam bir kez daha sorar.
- **Sunucuda bağlantı `useEffect` ile okunursa uyuşmazlık çıkar:** Fragment yalnızca tarayıcıda var. `useSyncExternalStore` sunucuda ve hidrasyonda `null` verir, sonra gerçek değeri; sayfa o sürede iskelet gösterir.

## Test
- **Backend:** 281 test, hepsi yeşil (başka firmanın kaydına erişim her uçta 404; public uçlarda izinli alan listesi testi).
- **Web:** Vitest 105 (form doğrulama ve dönüştürme dahil), shared 75 (telefon normalizasyonu dahil), api-client 12. Lint ve typecheck temiz.
- **e2e (Playwright):** panel (46–48) 11 test; tedarikçi sayfası 15 test: karşılama ve başlıklar, boş form hataları ve ilk hatalı alana odak, gönderilen gövde, Boya formu ve "Hiçbiri" kuralı, 45 düzeltme, 44'ün dört hali, uyuyan sunucu ve 3 dakika sınırı. Tam paket yerelde çalışıyor, CI'da henüz değil (M10).

## Ekran görüntüleri
- `docs/design/impl-v0.4/`: 46a–48b panel, 39–45 tedarikçi sayfası; açık ve koyu tema, her biri tasarımla yan yana (`design-*`).

## Sonraki adım
- M5: tedarikçi sayfasındaki "Belgeler" bölümü açılır; belge yükleme ve AI ile alan okuma (AI önerir, insan onaylar).
