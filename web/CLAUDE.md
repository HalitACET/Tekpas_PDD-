@AGENTS.md

# web/ — Next.js kuralları

Next 16 yeni; güncel davranış için paketle gelen dokümanı (`AGENTS.md`) esas al.

Kök `CLAUDE.md` kuralları burada da geçerli.

## Kimin için

Üreticinin ofisteki ekibi: **yönetim paneli.** Ayrıca iki girişsiz, herkese açık sayfa var:
1. **Tedarikçi veri giriş sayfası** `/r#<token>` (PLAN K21): Token adresin `#` kısmındadır, sunucuya ve log'lara gitmez; sayfa onu okuyup API'ye `X-Request-Token` başlığıyla gönderir. Telefon tarayıcısında kusursuz çalışmalı, mobil öncelikli tasarlanır. Sayfada `Referrer-Policy: no-referrer`.
2. **Pasaport sayfası** `/01/[gtin]/10/[batch]`: GS1 Digital Link yolu birebir. QR okutulunca açılır. SSR ile render edilir, hızlı ve SEO dostu olmalı, çok dilli (`?lang=` ve `Accept-Language`).

## Yapı

```
app/
├── (auth)/login/
├── (dashboard)/            giriş gerekli, sol menü + üst bar
│   ├── products/  batches/  batches/[id]/  suppliers/  documents/  imports/  users/  settings/
├── r/                      tedarikçi (girişsiz, token `#` kısmında)
└── 01/[gtin]/10/[batch]/   pasaport (girişsiz)
components/ui/              shadcn bileşenleri (CLI ile eklenir)
components/<feature>/       özelliğe özel bileşenler
lib/                        api (üretilen client'ın sarmalayıcısı), auth, i18n, utils
messages/                   tr.json, en.json, de.json
```

## Kurallar

- **Veri çekme:** Sadece `@tekpas/api-client` ve TanStack Query. `fetch`'i elle yazma. Query key'leri `lib/query-keys.ts` içinde tek yerde durur.
- **Auth:** Access token bellekte tutulur, refresh token `httpOnly` + `Secure` + `SameSite=Strict` cookie'de. 401 gelince bir kez refresh denenir, olmazsa `/login`'e yönlendirilir. `localStorage`'a token yazma.
- **Formlar:** react-hook-form + `@tekpas/shared` içindeki Zod şemaları (backend validasyonuyla aynı kurallar).
- **UI:** shadcn/ui + Tailwind. Yeni bileşen için önce shadcn'de var mı bak. Durumlar için tutarlı renkler: PENDING gri, SUBMITTED mavi, APPROVED yeşil, REJECTED kırmızı. AI güven skoru < 0.8 ise sarı.
- **Tedarik zinciri:** React Flow ile çizilir, kökten yaprağa soldan sağa (İplik → Kumaş → Boya → Dikim). Düğüm rengi adımın durumunu gösterir.
- **Metinler:** next-intl. Bileşende sabit metin yok, `t('batches.create.title')` şeklinde anahtar kullanılır.
- **Her liste ekranında:** yükleniyor (skeleton), boş durum (açıklama + eylem butonu), hata durumu.
- **Erişilebilirlik:** Formlarda label, butonlarda anlamlı metin, klavyeyle gezilebilirlik.
- **Tedarikçi linki paylaşımı:** "Linki kopyala" + "WhatsApp'ta paylaş" (`https://wa.me/?text=...`). E-posta gönderimi yok.

## Test

Vitest + Testing Library (bileşen ve hook'lar), Playwright (kritik akışlar: giriş, parti oluştur, tedarikçi linkiyle veri gir, pasaport aç).
