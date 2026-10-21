-- =====================================================================
-- V15: Mobil yukleme kuyrugunda cift belgeye karsi (M9 T3, docs/m9-plan.md §4.4)
-- =====================================================================
-- Telefon ayni yuklemeyi cevabi kaybedince yeniden gonderir; sunucu PDF'i her seferinde yeniden urettigi icin
-- icerik ozeti (sha256) ayni sayfalari tanimaz. Istemcinin urettigi anahtar (Idempotency-Key) belgede saklanir:
-- ayni firmada ayni anahtar ikinci bir belge acmaz. Anahtarsiz yuklemeler (web, tedarikci) etkilenmez.
ALTER TABLE document ADD COLUMN client_upload_id UUID;

CREATE UNIQUE INDEX uq_document_client_upload ON document(company_id, client_upload_id)
    WHERE client_upload_id IS NOT NULL;
