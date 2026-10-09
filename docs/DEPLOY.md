# KozaPass (kod adı: tekpas) — Canlıya çıkış rehberi

Sıfırdan canlı ortam kurulumu. Hepsi ücretsiz katman. **Hiçbir değeri (şifre, bağlantı adresi, secret) bir dosyaya yazma**: her değer ilgili panelin kutusuna girilir.

```
Tarayıcı ──► Vercel (web, Next.js) ──/api/v1/* rewrite (K18)──► Render (backend, Docker, Frankfurt)
                     │                                                   │
                     └── health rozeti: sunucu tarafı ─► /actuator/health └──► Neon (Postgres 16, Frankfurt, doğrudan bağlantı, K19)
cron-job.org ──► Render /actuator/health/liveness (09:00–22:00, 10 dk'da bir; DB'ye dokunmaz)
```

Tarayıcının `/api/health` isteği de Vercel'de `/actuator/health/liveness`'a rewrite edilir. Uyuyan sunucuda Render, servis açılana kadar her yola (`Accept: application/json` olsa da) satır satır akan bir HTML sayfası döner ("Welcome to Render / SERVICE WAKING UP"). Web bu sayfayı JSON gibi okumaz, "uyanıyor" sayar (`packages/api-client` ara katmanı). Giriş ve listeler 3 sn cevapsız kalınca tek bir uzun health isteğini (60 sn) açık tutar, biterse yenisini açar; sunucu `{"status":"UP"}` dönünce asıl isteği bir kez tekrarlar. Sınır 3 dk (tasarım v0.3.2 31–32, `web/lib/server-wake.ts`).

Sıra önemli: **1 → 2 → 3 → 4 → 5 → 6**. Vercel, Render'ın adresine ihtiyaç duyar.

---

## 1. JWT secret'ı üret (yerelde, bir kez)

Git Bash'te:

```bash
openssl rand -base64 48
```

Çıktıyı sadece 3. adımda Render'daki `JWT_SECRET` kutusuna yapıştır. Bir yere kaydetme; kaybolursa yenisini üret (tek etkisi: açık oturumlar düşer).

## 2. Neon (veritabanı)

1. https://console.neon.tech → **New Project**
   - **Name:** `tekpas`
   - **Postgres version:** `16` (local ve testlerle aynı)
   - **Region:** `AWS Europe Central 1 (Frankfurt)` (Render ile aynı bölge)
2. Proje açılınca **Dashboard → Connect** penceresi:
   - **Connection pooling** anahtarını **kapat** (K19: pooler kullanmıyoruz). Adresteki host'ta `-pooler` **olmamalı**.
   - Göreceğin adres şu biçimde: `postgresql://<kullanici>:<sifre>@<host>/<veritabani>?sslmode=require...`
3. Bu adresten üç değer çıkaracaksın (3. adımda gerekecek, not alma, pencereyi açık tut):
   - **DATABASE_URL** (JDBC biçimi, kullanıcı ve şifre **olmadan**):
     ```
     jdbc:postgresql://<host>/<veritabani>?sslmode=require
     ```
     Örnek biçim: `jdbc:postgresql://ep-xxxx-yyyy.eu-central-1.aws.neon.tech/neondb?sslmode=require`
     `sslmode=require` zorunlu: yoksa uygulama açılmaz (`DatabaseSslGuard`).
   - **DATABASE_USERNAME:** adresteki `<kullanici>` (genelde `neondb_owner`)
   - **DATABASE_PASSWORD:** adresteki `<sifre>`

> **Neden pooler yok (K19):** Neon'un pooler'ı PgBouncer transaction modunda çalışır. pgjdbc/Hibernate'in prepared statement kullanımıyla bu mod arasında sadece canlıda ortaya çıkan hata riski var. Tek uygulama ve en fazla 5 bağlantı (Hikari) için pooler'a ihtiyaç yok. Uygulama ve Flyway aynı doğrudan bağlantıyı kullanır.

## 3. Render (backend)

1. https://dashboard.render.com → workspace'i seç → **New → Blueprint**
2. GitHub repo'su `HalitACET/Tekpas_PDD-`'yi bağla, branch `main`. Render kökteki `render.yaml`'ı okur ve `tekpas-api` servisini gösterir (Docker, Free, Frankfurt, health check `/actuator/health/liveness`).
3. Değer isteyen kutular (`sync: false`) çıkar. Şunları gir:

   | Kutu | Değer |
   | --- | --- |
   | `DATABASE_URL` | 2. adımdaki JDBC adresi |
   | `DATABASE_USERNAME` | 2. adımdaki kullanıcı |
   | `DATABASE_PASSWORD` | 2. adımdaki şifre |
   | `JWT_SECRET` | 1. adımın çıktısı |
   | `DEMO_PASSWORD` | Demo kullanıcılarının şifresi (sen belirle). Boş bırakırsan demo kullanıcıları oluşmaz. |

   `SPRING_PROFILES_ACTIVE=prod,demo` Blueprint'ten otomatik gelir. `PUBLIC_BASE_URL` (QR adresleri, K13) M6'da eklenecek; değeri `https://kozapass.vercel.app` olacak. `CORS_ALLOWED_ORIGINS` yok: web kendi origin'i üzerinden eriştiği için (K18) gerekmez, boşsa CORS kapalıdır.
4. **Apply**. İlk build 3–5 dk sürer (Maven bağımlılıkları + CDS arşivi).
5. **Logs** sekmesinde şu iki satırı bekle:
   - `Started TekpasApplication in … seconds`
   - `Startup report: ready in … ms, heap used … MB / max … MB, …, RSS … MB, container limit 512 MB`
6. Servisin adresini kopyala (`https://tekpas-api-xxxx.onrender.com`). Tarayıcıda `…/actuator/health` → `{"status":"UP"}`.

**Otomatik deploy:** `autoDeployTrigger: checksPass` ile `main`'e gelen commit, GitHub'daki CI kontrolleri yeşil olunca deploy edilir. `buildFilter` sayesinde sadece `backend/**` veya `render.yaml` değişince build tetiklenir.

## 4. Neon'da migration'ları doğrula

Neon → **SQL Editor**:

```sql
select installed_rank, version, description, success from flyway_schema_history order by installed_rank;
```

Beklenen: `1 init` ve `2 auth and jobs`, ikisi de `success = true`.

## 5. Vercel (web)

1. https://vercel.com/new → **Import Git Repository** → `HalitACET/Tekpas_PDD-`
2. **Configure Project**:
   - **Root Directory:** `web` (Edit → `web`)
   - **Framework Preset:** Next.js (otomatik)
   - Build ve Install komutlarına dokunma (pnpm workspace kökteki lockfile'dan algılanır, `packages/*` build'e dahildir).
   - **Node.js Version:** `22.x` (Vercel'in varsayılanı Node 24; repo Node 22 istiyor). `web/package.json`'daki `engines.node: "22.x"` bunu zaten seçer, panelde de 22.x olduğundan emin ol.
3. **Environment Variables** (Production ve Preview için):

   | Name | Value |
   | --- | --- |
   | `BACKEND_URL` | 3. adımdaki Render adresi, sonda `/` olmadan |
   | `ENABLE_EXPERIMENTAL_COREPACK` | `1` |

   Corepack açık olmazsa Vercel pnpm 10 kullanır; repo pnpm 11 istediği için (`engineStrict`) kurulum düşer. `BACKEND_URL` yoksa build bilerek hata verir.
4. **Deploy**. Sonra **Settings → Build and Deployment**:
   - **Root Directory → Skip deployment:** açık (sadece web'i etkileyen commit'ler build eder; yeni projelerde varsayılan).
5. Canlı adresi aç (production: `https://kozapass.vercel.app`; Vercel → Settings → Domains): "KozaPass" başlığı ve **Sunucu: Çalışıyor (UP)** rozeti.
   Render uyuyorsa rozet ilk açılışta "Erişilemiyor" der; 1–2 dk sonra yenile.

**Otomatik deploy:** `main`'e her push production deploy'u, her PR bir preview deploy'u üretir.

## 6. cron-job.org (uyanık tutma)

Render ücretsiz servis 15 dk trafiksizlikte uyur. Uyanması konteyner dahil 1,5–2,5 dk sürer (Render log'u: "Started TekpasApplication in" 75–83 sn, Ekim 2026). Sadece gün içinde uyanık tutuyoruz.

1. https://console.cron-job.org → **Create cronjob**
   - **Title:** `tekpas-api keep-awake`
   - **URL:** `<Render adresi>/actuator/health/liveness` (DB'ye dokunmaz, Neon uyuyabilir)
   - **Schedule:** Custom
     - Minutes: `0,10,20,30,40,50`
     - Hours: `9-21`
     - Days / Months / Weekdays: hepsi
     - **Time zone:** `Europe/Istanbul`
   - Son ping 21:50, servis ~22:05'te uyur. Böylece 09:00–22:00 uyanık.
   - **Notifications:** "on failure" açık (servis yanıt vermezse e-posta).
2. **Create**. Birkaç dakika sonra **History**'de 200 yanıtları görünmeli.

**History'yi düzenli kontrol et.** Servis uyurken cron-job.org'un isteğine Render'ın uyanma sayfası döner: büyük, akan bir HTML. cron-job.org bunu "output too large" hatası sayar ve art arda hatalardan sonra işi kendiliğinden kapatır (27 Eylül 2026'da böyle oldu). İş kapanmışsa **Enable** ile aç; History'de son çalışmaların 200 olduğunu gör.

**Demo günlerinde 7/24:** aynı işi düzenle → Hours: `*` (her saat). Demodan sonra `9-21`'e geri al. Demodan ~5 dk önce Vercel adresini bir kez aç: Render ve Neon ısınmış olur.

**Bütçe:** 09:00–22:00 penceresi ayda ~410 Render saati. Workspace başına 750 saat var ve diğer servisler uyanık tutulmuyor (Eylül 2026: toplam 7,9 saat), yani 7/24 demo günleri de sığar. Neon tarafında uyanık tutma DB'ye dokunmadığı için sadece gerçek kullanım CU-saat harcar.

## 7. Canlı doğrulama

Production adresi: **https://kozapass.vercel.app** (deploy'a özel `web-xxxx-….vercel.app` adresleri Vercel Deployment Protection arkasındadır, onları kullanma).

Kısa yol: depo kökünde, `DEMO_PASSWORD` tanımlamadan çalıştır. Betik şifreyi `DEMO_PASSWORD: ` diye sorar; yazdığın karakterler ekranda görünmez, Enter'la gönderilir. Şifre ortam değişkenine, dosyaya veya komut geçmişine yazılmaz; çıktıda token ve cookie değeri de gösterilmez. Windows'ta (PowerShell veya Git Bash) da aynı komut:

```bash
node scripts/live-check.mjs https://kozapass.vercel.app
```

(`DEMO_PASSWORD` ortam değişkeni zaten tanımlıysa betik sormadan onu kullanır; bunun için ayrıca değişken tanımlamak gerekmez.)

Beklenen çıktı: login sayfası `200` (başlık `Giriş yap · KozaPass`), login `200` ve cookie bayrakları `HttpOnly ✓ Secure ✓ SameSite=Strict ✓ Path=/api/v1/auth ✓`, `/me` → `Nilüfer Giyim A.Ş. (MANUFACTURER)`, ürünler `200` ve 3 demo ürünü (parti sayılarıyla), partiler `200` ve 5 demo partisi (`DRAFT`), refresh `200` ve cookie döndürüldü. Elle eklenmiş ürün veya parti varsa sayılar daha yüksek olur. Betik istekleri tarayıcı gibi `Origin` başlığıyla gönderir; login `403` dönerse backend proxy'nin ilettiği Origin'i CORS olarak reddediyordur.

`DEPLOYMENT_NOT_FOUND` (404) görürsen alan adı bir deploy'a bağlı değildir: Vercel → proje → **Settings → Domains**'te `kozapass.vercel.app`'in listelendiğini ve **Deployments**'ta en son `main` deploy'unun **Production** olduğunu kontrol et.

**Tarayıcıda elle (giriş ekranı):**

1. `https://kozapass.vercel.app` → `/login`'e yönlenir. Demo kullanıcıyla giriş yap → Partiler açılır, üst barda firma adı ve rol görünür.
2. Sayfayı yenile → oturum kalır (kısa bir iskelet görünebilir, içerik görünmez).
3. Kullanıcı menüsü → **Çıkış yap** → `/login`. Adres çubuğundan `/batches` aç → tekrar `/login?next=%2Fbatches`.
4. "Beni hatırla" **işaretsiz** giriş yap, tarayıcıyı tamamen kapatıp aç → oturum düşmüş olmalı.

> **Not (4. adım):** Chrome ve Edge'de "Kaldığın yerden devam et" (Başlangıçta → önceki oturumu geri yükle) açıksa tarayıcı kapanıp açıldığında oturum cookie'lerini de geri yükler; bu durumda oturum düşmez. Bu tarayıcının davranışıdır, uygulamanın değil. Testi bu ayar kapalıyken (ya da gizli pencerede, tüm gizli pencereler kapatılarak) yap.

Elle curl ile: `W` yerine Vercel adresini, şifre yerine `DEMO_PASSWORD`'ü yaz. İstekler Vercel üzerinden gider (proxy).

```bash
W=https://kozapass.vercel.app
curl -s -c jar.txt -D - -H "Content-Type: application/json" \
  -d '{"email":"admin@nilufergiyim.example","password":"<DEMO_PASSWORD>","client":"WEB"}' \
  $W/api/v1/auth/login -o login.json | grep -i set-cookie   # Secure; HttpOnly; SameSite=Strict
curl -s -H "Authorization: Bearer $(grep -o '"accessToken":"[^"]*"' login.json | cut -d'"' -f4)" $W/api/v1/auth/me
curl -s -b jar.txt -c jar.txt -X POST -o /dev/null -w "%{http_code}\n" $W/api/v1/auth/refresh   # 200
rm jar.txt login.json
```

## 8. Render pipeline bütçesi

Render workspace'inde ayda **500 pipeline dakikası** var; Docker build süresi buradan düşer.

- Bağımlılık katmanı ayrı: sadece kod değişince `dependency:go-offline` tekrar çalışmaz (yerelde: soğuk build 192 sn, kod değişikliği sonrası 18 sn).
- `buildFilter`: web, mobil, doküman ve test değişiklikleri Render build'i tetiklemez.
- `checksPass`: CI kırmızıysa build de yapılmaz.

**Ölçüm (25.09.2026, ilk canlı build, cache yok):** ~2 dk. Adımlar: imaj çekme ~15 sn, `dependency:go-offline` 24 sn, `package` 5 sn, CDS eğitim koşusu 10 sn, imaj ve cache push ~20 sn, klonlama/hazırlık. Render build cache'ini registry'e yazıyor; sonraki build'lerde bağımlılık katmanı cache'ten gelir, kod değişikliğinde build'in ~1–1,5 dk sürmesi beklenir.

**Otomatik deploy ölçümü (27.09.2026, PR #9, `checksPass`):** `main` CI'ı 21:30:40'ta yeşil bitti, yeni backend 21:33:01'de yanıt verdi → CI'dan canlıya **2 dk 21 sn**. Buna build, imaj push'u ve ~60 sn'lik açılış dahil; build'in kendisi bundan kısa (kesin build süresi Render → Events'te).

| | Build başına | 500 dk ile aylık deploy |
| --- | --- | --- |
| Kötü durum (cache yok / `pom.xml` değişti) | ~2,5 dk | ~200 |
| Normal (sadece kod değişti) | ~1,5 dk | ~330 |

Bir ayda backend'e 200 deploy yapılmayacağı için bütçe rahat. Web, mobil ve doküman değişiklikleri Render build'i hiç tetiklemez.

**Sınıra yaklaşınca** (Render → Workspace → Billing → Pipeline minutes, ~400 dk):
1. Küçük backend değişikliklerini tek PR'da topla (her `main` merge'i bir build).
2. Geçici olarak `autoDeployTrigger: off` yapıp elle deploy et (Render → **Manual Deploy**), sadece gerektiğinde.
3. CDS eğitim koşusu her build'e ~10 sn ekler; son çare olarak Dockerfile'dan çıkarılabilir (açılış ~60 sn → ~130 sn olur).

## Sorun giderme

| Belirti | Sebep / çözüm |
| --- | --- |
| Render log: `DATABASE_URL must require TLS` | Adreste `?sslmode=require` yok. |
| Render log: `Could not resolve placeholder 'JWT_SECRET'` vb. | İlgili env boş. Render → servis → **Environment**. |
| Render log: `must be at least 32 bytes` | `JWT_SECRET` kısa; 1. adımdaki komutla yenisini üret. |
| Render log: bağlantı hatası, host'ta `-pooler` | Pooler adresi girilmiş; Neon Connect'te pooling'i kapatıp adresi yeniden al. |
| Vercel build: `BACKEND_URL is not set` | Vercel env'e `BACKEND_URL` ekle, yeniden deploy et. |
| Vercel build: pnpm sürüm/engine hatası | `ENABLE_EXPERIMENTAL_COREPACK=1` eksik. |
| Vercel build: `Expected version: >=22.13 <23, Got: v24…` | Node.js Version 22.x değil: Settings → Build and Deployment → Node.js Version → `22.x`, sonra Redeploy. |
| Rozet "Erişilemiyor" | Render uyuyor (~1 dk bekle) veya `BACKEND_URL` yanlış. |
| Login 401, doğru şifreyle | `DEMO_PASSWORD` değiştiyse servis yeniden başlayınca yeni şifre geçerli olur (Render → **Manual Deploy → Restart**). |
