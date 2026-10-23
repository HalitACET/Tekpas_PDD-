# Mimari

## 1. Sistem

```mermaid
flowchart LR
  subgraph clients["İstemciler"]
    web["Web paneli<br/>Next.js 16"]
    mobile["Mobil<br/>Expo"]
    supplier["Tedarikçi sayfası<br/>/r#bağlantı, hesapsız"]
    public["Herkese açık pasaport<br/>/01/gtin/10/parti, QR ile"]
  end

  subgraph api["API · Spring Boot 4.1"]
    rest["REST /api/v1<br/>JWT, RFC 7807"]
    jobs["İş kuyruğu<br/>Postgres, SKIP LOCKED"]
  end

  db[("PostgreSQL 16")]
  storage[("Supabase Storage")]
  ai["Google Gemini"]
  fcm["Firebase / Expo push"]

  web -- "aynı origin, /api/v1 proxy" --> rest
  supplier --> web
  public -- "sunucuda render, önbellek" --> web
  mobile --> rest
  rest --> db
  rest --> storage
  rest -- "iş ekler" --> jobs
  jobs --> db
  jobs -- "belge okuma, çeviri, tutarlılık<br/>(yalnızca demo firması)" --> ai
  jobs -- "bildirim" --> fcm
```

## 2. Dağıtım

```mermaid
flowchart LR
  user(["Tarayıcı / telefon"]) --> vercel["Vercel<br/>Next.js, pasaport önbelleği"]
  vercel -- "/api/v1/* rewrite" --> render["Render<br/>Docker, Frankfurt, 0,1 CPU / 512 MB"]
  phone(["Android uygulaması<br/>Expo EAS"]) --> render
  render --> neon[("Neon<br/>PostgreSQL 16")]
  render --> supa[("Supabase Storage<br/>özel bucket")]
  render --> gemini["Gemini API"]
  cron["cron-job.org"] -- "09:00–22:00, 10 dk'da bir" --> render
```

Hepsi ücretsiz katman. Render'ın ücretsiz servisi 15 dakika trafiksizlikte uyur; cron gün içinde uyanık tutar, web "sunucu uyanıyor" durumunu gösterir.

## 3. Tedarikçiden veri toplama

```mermaid
sequenceDiagram
  actor U as Üretici (panel)
  participant API
  participant DB
  actor T as Tedarikçi (telefon)
  U->>API: POST /steps/{id}/requests
  API->>DB: token'ın SHA-256'sı, son tarih
  API-->>U: bağlantı /r#token (bir kez)
  U->>T: WhatsApp ile bağlantı
  T->>API: GET /public/request (X-Request-Token)
  API-->>T: adımın formu
  T->>API: POST /public/request/submit (+ belgeler)
  API->>DB: adım SUBMITTED, olay kaydı
  U->>API: POST /steps/{id}/approve ya da /reject (gerekçe, alanlar)
  API->>DB: adım APPROVED (ya da yeniden açılır), denetim kaydı
```

## 4. Belge okuma (AI önerir, insan onaylar)

```mermaid
sequenceDiagram
  actor K as Kullanıcı
  participant API
  participant Q as İş kuyruğu
  participant AI as Gemini
  K->>API: belge yükle (PDF ya da fotoğraflar → tek PDF)
  API->>Q: AI_EXTRACT_DOCUMENT
  Q->>Q: PDF metni + türe göre kurallar
  alt kurallar okuyamadı ve firma demo
    Q->>AI: metin, rastgele sınırlayıcılar arasında, JSON şeması
    AI-->>Q: alanlar
    Q->>Q: yeniden doğrula, güveni sunucu verir (≤ 0,75)
  end
  Q->>API: document.extraction (öneri)
  K->>API: alanları düzelt, POST /documents/{id}/verify
  API->>API: asıl alanlar yalnızca şimdi yazılır
```

## 5. Yayın

```mermaid
sequenceDiagram
  actor Y as Yönetici
  participant API
  participant DB
  participant W as Web (önbellek)
  Y->>API: POST /batches/{id}/passports
  API->>API: kurallar kilit altında yeniden, skor ve engeller
  alt engel var
    API-->>Y: 409 PUBLISH_BLOCKED (engeller)
  else
    API->>DB: snapshot (izinli alanlar, onaylı çeviriler), SHA-256, doğrulama kodu
    API->>DB: önceki sürüm SUPERSEDED, denetim kaydı
    API->>W: önbellek etiketini düşür (iş)
    API-->>Y: sürüm, QR
  end
```
