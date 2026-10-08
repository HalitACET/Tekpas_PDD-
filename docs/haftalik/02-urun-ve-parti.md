# 02 — Ürün ve parti

**Kilometre taşı:** M2  ·  **Tarih aralığı:** 03.10 – 06.10.2026  ·  **Canlı link:** https://kozapass.vercel.app (API: https://tekpas-api.onrender.com)

## Yapılanlar
- **Ürün ve parti API'si** (PR #11):
  - `GET/POST /products`, `GET/PATCH/DELETE /products/{id}`.
  - `GET/POST /batches`, `GET/PATCH/DELETE /batches/{id}`, `GET /batches/next-batch-no`.
  - GTIN 8/12/13/14 hane kabul ediliyor, 14 haneye tamamlanıyor, GS1 kontrol hanesi doğrulanıyor. Dünya çapında tekil; çakışmada sahibi firma gizli. Partisi olan ürünün GTIN'i kilitli.
  - Lif bileşimi: tam sayı, toplam tam %100, aynı lif iki kez yok.
  - Parti no önerisi `KP-YYYY-MMDD-A, B…` (firma ve gün bazında). Yetki: VIEWER okur, SUPPLIER 403.
- **Migration V3:** `product.declared_fiber_composition` (JSONB), kategori check'i, `updated_at`, liste index'leri.
- **Demo verisi:** Nilüfer Giyim'e 3 ürün ve 5 parti. GTIN'ler GS1'in kısıtlı dolaşım aralığından (020–029), gerçek bir ürünle çakışmaz.
- **Ekranlar** (Claude Design v0.3, PR #12 ve #15):
  - 01 ürün listesi, 02 boş durum, 03/04 ürün düzenle ve yeni ürün (canlı GTIN ipucu, lif toplamı rozeti), 05/06 ürün silme (engel ve onay).
  - 07 parti listesi (durum chip'i, zincir çubuğu), 08 yeni parti (ürün araması, önerilen parti no).
- **Ortak kurallar:** `@tekpas/shared` Zod şemaları, backend'le aynı hata kodlarını kullanıyor. GTIN test örnekleri tek bir dosyada; Java ve TS testleri aynı dosyayı okuyor.

## Teknik kararlar
- **PATCH üç durumlu:** Alan gönderilmezse değişmez, `null` gelirse temizlenir. Java'da `Optional` ve Jackson'ın `USE_NULL_FOR_MISSING_REFERENCE_VALUES` ayarıyla. Bilinmeyen alanlar yok sayılıyor; global ayar korundu.
- **TanStack Query + react-hook-form:** Liste, filtre ve cache yönetimi ile şemaya bağlı formlar için. Query key'ler tek dosyada.
- **Tasarımda olmayan durumlar tasarım borcuna yazılıyor:** GTIN kilidi, yükleniyor, hata, VIEWER tooltip'i, parti durumları. v0.3.1'de resmileşecek.

## Karşılaşılan sorunlar ve çözümler
- **Ondalık sayılar sessizce kırpılıyordu (#13).** Jackson varsayılan olarak `99.5`'i tam sayı alanına `99` diye yazıyordu; `95.7 + 5` "toplam 100" sayılabilirdi → `ACCEPT_FLOAT_AS_INT` kapatıldı, alan bazında `Integer` hatası dönüyor. Hata cevabında Java sınıf adı veya Jackson mesajı olmadığı testle doğrulandı.
- **API'deki `params` tipi okunamıyordu.** Üretilen client'ta `Record<string, never>` çıkıyordu, yani `total` değeri kullanılamıyordu → OpenAPI şemasında `additionalProperties: true` yapıldı.
- **Türkçe büyük harf.** Arayüzde büyütme dile duyarlı (tr: i → İ). Ama GS1 parti numarası sadece A–Z kabul ediyor; tr kuralıyla "i" → "İ" olunca API reddederdi → parti no `en` kuralıyla büyütülüyor. Testi var.
- **"Yayında" chip'i "Reddedildi"ye benziyordu.** Açık dut zemin kırmızıya yakın duruyordu → dolu brand zemin ve onay ikonu. Kontrast açıkta 7,5:1, koyuda 6,8:1. Koyu temada krem yazı 2,4:1'de kalacağı için `--primary-foreground` kullanıldı; e2e testi iki temada AA'yı ölçüyor.
- **Paralel oturum ve worktree dersi.** Ayrı bir oturum kendi worktree'sinde çalıştı; işler karışmadı ama iki PR aynı test dosyasına ekleme yaptığı için rebase'de çakışma çıktı, worktree klasörü de oturum kapanana kadar kilitli kaldı → kural: yan oturum açılmaz; paralel iş gerekirse ayrı worktree şart (CLAUDE.md).

## Test
- **Backend:** 170 test (M1 sonunda 69). Her uç için mutlu yol, alan hatası, başka firmanın kaydı → 404, SUPPLIER → 403. GTIN'in tek hanesi değiştirilmiş tüm varyantları kontrol hanesinde düşüyor. Eşzamanlı 4 parti isteği A–D harflerini alıyor.
- **Web:** 60 birim testi, 23 Playwright testi (ürün 11, parti 9, klavye 3); shared 49, api-client 9.
- **Mutasyonla doğrulandı:** Arama kutusu genişliği, seed'in ikinci açılışta satıra yazmaması ve hata mesajının iç bilgi sızdırmaması kontrollerinde, düzeltme geri alınınca test kırmızıya dönüyor. CI'ın üç job'u yeşil.

## Ekran görüntüleri
- `docs/design/impl-v0.3/`: 01–08, açık ve koyu; yanlarında tasarımdan `design-NN-*`. Ek durum GTIN kilidi, v0.3.1 tasarımıyla `impl-v0.3.1/18-*` oldu.
- `docs/design/impl-v0.2/` M1'in onaylı karşılaştırması olarak donduruldu.

## Sonraki adım
- **M3:** Tedarikçi ağı, zincir adımları ve `GET /batches/{id}/tree`. 09 parti detayı, zincir ekranıyla birlikte (React Flow).
