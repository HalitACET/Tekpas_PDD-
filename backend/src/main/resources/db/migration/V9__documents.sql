-- =====================================================================
-- V9: Belge yukleme (M5 T2, docs/m5-plan.md)
-- =====================================================================

-- Tedarikci linkiyle yuklenen belge hangi talebe ait (55'te "Onceki gonderim"), yukleyenin adi (panel
-- kullanicisi veya tedarikci firma), sayfa sayisi (PDF 1..20, gorsel 1) ve okuma hattinin (T3-T6) alanlari.
-- document.company_id her zaman partinin sahibi ureticidir (tedarikcinin firmasi degil).
ALTER TABLE document ADD COLUMN request_id        UUID REFERENCES data_request(id) ON DELETE SET NULL;
ALTER TABLE document ADD COLUMN uploaded_by_name  VARCHAR(200);
ALTER TABLE document ADD COLUMN page_count        INTEGER;
ALTER TABLE document ADD COLUMN extraction_method VARCHAR(20);
ALTER TABLE document ADD COLUMN failure_code      VARCHAR(40);
ALTER TABLE document ADD COLUMN review_status     VARCHAR(20) NOT NULL DEFAULT 'UNREVIEWED';
ALTER TABLE document ADD COLUMN verification      JSONB;   -- alan basina ACCEPTED | EDITED | ADDED (T6)

ALTER TABLE document ADD CONSTRAINT chk_document_page_count CHECK (page_count IS NULL OR page_count >= 1);
ALTER TABLE document ADD CONSTRAINT chk_document_review CHECK (review_status IN ('UNREVIEWED', 'VERIFIED'));
ALTER TABLE document ADD CONSTRAINT chk_document_method
    CHECK (extraction_method IS NULL OR extraction_method IN ('TEXT_RULES', 'LLM', 'NONE'));

-- Okuma durumu: onay artik ayri (review_status). Eski degerler tasinir (tablo bugune kadar kullanilmadi).
ALTER TABLE document DROP CONSTRAINT chk_extraction_status;
UPDATE document SET review_status = 'VERIFIED' WHERE extraction_status = 'VERIFIED';
UPDATE document SET extraction_status = CASE extraction_status
    WHEN 'PENDING' THEN 'QUEUED'
    WHEN 'PROCESSING' THEN 'RUNNING'
    WHEN 'DONE' THEN 'READ'
    WHEN 'VERIFIED' THEN 'READ'
    ELSE extraction_status END;
ALTER TABLE document ALTER COLUMN extraction_status SET DEFAULT 'QUEUED';
ALTER TABLE document ADD CONSTRAINT chk_extraction_status CHECK (extraction_status IN (
    'QUEUED', 'RUNNING', 'READ', 'PARTIAL', 'UNREADABLE', 'FAILED'
));

-- Tedarikci turu bilmeyebilir (UNKNOWN, siniflandirici onerir); teknik foy sertifika degildir.
ALTER TABLE document DROP CONSTRAINT chk_doc_type;
ALTER TABLE document ADD CONSTRAINT chk_doc_type CHECK (doc_type IN (
    'OEKO_TEX', 'GOTS', 'GRS', 'BCI', 'OCS', 'BLUESIGN',
    'LAB_REPORT', 'SDS', 'INVOICE', 'TECH_SHEET', 'OTHER', 'UNKNOWN'
));

-- Ayni dosya ayni adima iki kez yuklenmez; silinen belgenin satiri da silindigi icin yeniden yuklenebilir.
CREATE UNIQUE INDEX uq_document_step_sha ON document(step_id, sha256) WHERE step_id IS NOT NULL;
CREATE INDEX idx_document_request ON document(request_id) WHERE request_id IS NOT NULL;

-- Adim gecmisi: belge yuklendi / kaldirildi / onaylandi (47a, M12 denetim izi).
ALTER TABLE step_event DROP CONSTRAINT chk_step_event_kind;
ALTER TABLE step_event ADD CONSTRAINT chk_step_event_kind CHECK (kind IN (
    'REQUEST_CREATED', 'REQUEST_OPENED', 'REQUEST_REVOKED', 'REQUEST_DEADLINE_CHANGED', 'SUBMITTED', 'APPROVED',
    'REJECTED', 'MANUFACTURER_ENTERED', 'DOCUMENT_UPLOADED', 'DOCUMENT_REMOVED', 'DOCUMENT_VERIFIED'
));

-- Gonderilmeden kapanan linkin belgelerini silen is (T3).
ALTER TABLE job DROP CONSTRAINT chk_job_type;
ALTER TABLE job ADD CONSTRAINT chk_job_type CHECK (type IN (
    'AI_EXTRACT_DOCUMENT', 'AI_VALIDATE_BATCH', 'AI_TRANSLATE_PASSPORT', 'RULE_VALIDATE_BATCH', 'IMPORT_EXCEL',
    'CERT_EXPIRY_SCAN', 'PUSH_NOTIFY', 'DOCUMENT_CLEANUP'
));

-- Demo firmasi: yalnizca sahte veriyle calisan seed firmalari. LLM kapisi (T5) bunu okur; gercek firma false.
ALTER TABLE company ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
