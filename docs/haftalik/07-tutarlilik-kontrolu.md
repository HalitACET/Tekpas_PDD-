# 07 — Tutarlılık kontrolü ve sertifika takibi

**Kilometre taşı:** M7  ·  **Tarih aralığı:** 20.10 – 21.10.2026  ·  **Canlı link:** https://kozapass.vercel.app (panel) · API: Render (kurallar canlıya merge ile çıkar; AI kontrolleri henüz yok, bkz. Sonraki adım)

## Yapılanlar
- **Plan ve tasarım (PR #58):** `docs/m7-plan.md` (kural tablosu, V13, eşitleme, API, tetikleyiciler) ve Claude Design v0.7 için brif.
- **Kural motoru (PR #59):** `ConsistencyRules` saf fonksiyonu; dokuz sabit kod: `LIF-01/02` (lif), `SER-01..04` (sertifika), `EKS-01/02` (eksik alan), `BEL-01` (onay bekleyen belge). V13 (`validation_issue`: firma, parmak izi, `params`, not, kendiliğinden kapanma; `batch.validated_at`). `POST /batches/{id}/validate`, `GET /batches/{id}/issues`, `POST /issues/{id}/resolve` ve `/reopen`.
- **Skor ve yayın (PR #60):** skora `ISSUES_OPEN` engeli ve `ISSUE_WARNINGS` bilgisi; yayın, kilit altında önce kuralları çalıştırır; `BatchResponse.openIssues`.
- **Tetikleyiciler ve takip (PR #61):** zincir/talep, belge, etiket lifi ve tarih değişince `RULE_VALIDATE_BATCH`; günlük `CERT_EXPIRY_SCAN`; `GET /documents/expiring`.
- **Web (PR #62, tasarım v0.7):** Uyarılar sekmesi (Açık/Çözülen, kartlar, çözme formu, geri aç, durumlar, 10+ grup, roller), başlık düğmesi ve sekme rozeti, zincir düğümlerinde kodlar, skor kartı ve yayın diyaloğu satırları, listede nokta, Görevler'de "Süresi yaklaşan sertifikalar" ve menü sayısı. tr/en/de.

## Teknik kararlar
- **ERROR elle çözülmez, yayını engeller; WARNING/INFO çözülebilir.** Engelleyici, veri düzelince kendiliğinden kapanır (`auto_resolved`); böylece "çözüldü" demek yayın kapısını aşmanın yolu olmaz.
- **Bulgu kalıcıdır:** parmak izi (`kod:adım:belge:veri özeti`) ve `(batch_id, fingerprint)` benzersiz indeksi; çözülmüş satır kalır, denetim izi (M12) onu okuyacak. Veri değişince özet değişir, yeni bulgu olur.
- **Metin veritabanında değil:** yalnızca kod ve yapılandırılmış `params`; kartın cümlesini çeviri dosyası kurar (M11'de EN/DE ek iş gerektirmedi).
- **Yayın kontrolü eşzamanlı:** arka plan işi panel sayaçları içindir; yayın anında kurallar aynı kilit altında yeniden çalışır. Reddedilen yayın bulguları kaydeder (`noRollbackFor`).
- **LIF-01 karşılaştırması:** etiketin anlattığı kumaş esas alınır; kumaş adımı yoksa tek bir iplik adımı. Birden çok ipliğin karışımı tek bileşime karşılaştırılamaz.

## Karşılaşılan sorunlar ve çözümler
- **Yerelde geçen test CI'da kırıldı:** gün sayımı İstanbul'a göre, test ise veritabanının tarihine göre yazılmıştı; CI UTC'de çalışıyor. Test tarihleri uygulamayla aynı saat dilimiyle üretiliyor.
- **Tür çakışması:** `JobWorkerTest` sahte işleyici için `RULE_VALIDATE_BATCH` kullanıyordu; gerçek işleyici gelince "iki işleyici" hatası verdi. Kukla tür `AI_TRANSLATE_PASSPORT`'a taşındı.
- **Tasarım örnekleriyle kural anlamı ayrıştı:** tasarımdaki bazı örnekler (LIF-02, SER-04, EKS-01, BEL-01, 422) plandaki kurallarla örtüşmüyordu. Kart düzeni tasarımdan alındı, metinler kural anlamına göre yazıldı, hata 409 `ISSUE_BLOCKING` olarak bırakıldı.
- **Playwright'ta `route.fetch()`** önceki mock'ları atlayıp gerçek sunucuya gidiyordu; uyarı verisi katalog mock'una taşındı.

## Test
- Backend: 605 test (kural tablosu 20, eşitleme 9, uyarı API'si 14, skor/yayın kabul testi 3+3, tetikleyici ve tarama 7). Kabul: etiket %95+%5, kumaş %80+%20 → `LIF-01`, yayın 409 `ISSUES_OPEN`, düzeltince kendiliğinden kapanır ve yayın geçer. Eşzamanlı iki çalıştırma tek satır; tenant 404 her uçta.
- Web: 226 test; ilgili e2e dosyalarında (parti detayı, partiler, M4 paneli, yeni M7) 40 senaryo yeşil; `lint` ve `typecheck` yeşil.

## Ekran görüntüleri
- `docs/design/impl-v0.7/` (78 Uyarılar, 80 çözme, 81 çözülenler, 86a başlık ve skor, 89a görevler).

## Sonraki adım
- **AI kontrolleri (T5):** `AI-01` sertifika kapsamı, `AI-02` çelişkili beyanlar; yalnızca `LlmGate` açıkken, öneri olarak (asla engelleyici değil). Bu iş tasarım ve güvenlik ağırlıklı olduğu için Opus oturumunda yapılacak.
- Sonra M8 (mobil I).
