# Tanıtım videosu (kodla üretilen)

KozaPass'i anlatan yaklaşık 2,5 dakikalık, Türkçe seslendirmeli bir MP4 (1920 × 1080, 30 kare/sn). Görüntüler uygulamanın kendi ekran görüntüleri; senaryo `docs/tanitim-animasyonu-brifi.md`, seslendirme metni `docs/tanitim-seslendirme.md`.

Her şey koddan üretilir; metni ya da sesi değiştirip tek komutla videoyu yeniden alırsınız.

| Dosya | Ne |
| --- | --- |
| `scenes.mjs` | 16 sahne: ekrandaki metin, seslendirme cümlesi, hangi ekran görüntüsü, nereye yakınlaşılacağı, neyin vurgulanacağı |
| `video.html`, `video.css`, `video.js` | Animasyon. Her kare zamanın fonksiyonu: `renderAt(saniye)` |
| `make.mjs` | Sesi üretir, sahne sürelerini sese göre ayarlar, kareleri Chrome'da çizer, ffmpeg ile MP4 yapar |

## Kurulum (bir kez)

Gerekenler: Node 22, Python 3, Google Chrome ve web bağımlılıkları (`pnpm install`; Playwright ve ikonlar oradan gelir).

```bash
cd tools/tanitim-video
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

`.venv` içine üç paket kurulur:
- `piper-tts`: çevrimdışı Türkçe ses.
- `imageio-ffmpeg`: video kodlayıcı.
- `segno`: kapanıştaki QR kod.

İlk çalıştırmada Türkçe ses modeli (~60 MB) ve yazı tipleri indirilir.

## Üretmek

Depo kökünden:

```bash
node tools/tanitim-video/make.mjs
```

Sonuç: `tools/tanitim-video/out/kozapass-tanitim-piper.mp4`. `out/` git'e girmez. Videoyu depoya koymayın, Drive'da ya da bilgisayarınızda tutun.

Seçenekler:
- `--voice=piper|gemini|files`: sesin kaynağı (aşağıda).
- `--stills=12,40.5`: video yerine o saniyelerin PNG'lerini `out/stills/` klasörüne yazar. Görüntüyü hızlıca kontrol etmek için.
- `--voice-only`: yalnızca sesleri ve zaman çizelgesini üretir (`out/timeline.json`).
- `--range=95-105`: videonun yalnızca o saniyeler arasını üretir. Bir sahneyi hızlıca kontrol etmek için.
- `--frame-format=jpeg`: kareleri JPEG olarak alır. Daha hızlıdır ama renkleri biraz koyulaştırır; varsayılan PNG.
- `--fps=30`: kare hızı.
- `--out=yol.mp4`: çıktı dosyası.

**Metni değiştirmek:** `scenes.mjs` içinde değiştirip komutu yeniden çalıştırın. Değişmeyen cümlelerin sesi önbellekten gelir; sahne süreleri yeni sese göre kendiliğinden ayarlanır.

## Ses seçenekleri

| `--voice` | Ne | Lisans |
| --- | --- | --- |
| `piper` (varsayılan) | Çevrimdışı açık kaynak ses; anahtar ve hesap gerekmez | Ses modeli (DFKI, Türkçe) **CC BY-NC-SA 4.0**: ticari olmayan kullanım. Okul sunumu için uygun; bir firmaya ürün tanıtımında ticari kullanım sayılabilir. Video sonunda kaynak yazılır. |
| `gemini` | Google Gemini'nin metinden sese modelleri; daha doğal | Projenin zaten kullandığı servis. Gönderilen tek şey seslendirme metni (gerçek veri yok). Bu yol henüz denenmedi. |
| `files` | Kendi sesiniz ya da başka bir yerde ürettiğiniz sesler (ElevenLabs gibi) | Sizin |

**Gemini:** anahtarı ve model adını `tools/tanitim-video/.env` dosyasına yazın. Dosya git'e girmez.
- Model adı koda yazılmaz. AI Studio'da metinden sese (TTS) modellerinden birini seçin, örneğin `gemini-2.5-flash-preview-tts`.
- Dosyanın içeriği:

```
GEMINI_API_KEY=anahtarınız
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
```

Sonra:

```bash
node tools/tanitim-video/make.mjs --voice=gemini
```

İsterseniz `GEMINI_TTS_VOICE` ile ses seçin (varsayılan `Charon`). Ücretsiz katmanın dakikalık sınırına takılırsa betik bekleyip yeniden dener.

**Kendi kayıtlarınız:** her sahne için bir dosya, sahne sırasıyla numaralı.
- Klasör ve adlar: `tools/tanitim-video/recordings/01.m4a` … `16.m4a`. wav, mp3 ve m4a olur.
- Okunacak cümleler `scenes.mjs` içindeki `voice` alanlarında; aynıları `docs/tanitim-seslendirme.md` tablosunda.
- Baştaki ve sondaki sessizlik kendiliğinden kırpılır.

```bash
node tools/tanitim-video/make.mjs --voice=files
```

## Kaynaklar

| Ne | Lisans |
| --- | --- |
| Geist, Geist Mono, Newsreader yazı tipleri | OFL (Google Fonts) |
| İkonlar | lucide (ISC); web uygulamasının `lucide-react` paketinden okunur |
| Piper | GPL |
| ffmpeg | `imageio-ffmpeg` derlemesi |

Bunlar yalnızca videoyu üretmek için çalışır; uygulamaya eklenmez.
