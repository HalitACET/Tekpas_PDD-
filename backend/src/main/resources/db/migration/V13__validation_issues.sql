-- =====================================================================
-- V13: Tutarlilik kontrolu uyarilari (M7 T1, docs/m7-plan.md §3)
-- =====================================================================
-- validation_issue V1'den beri var ve bos (hicbir kod yazmadi). Eklenenler: tenant filtresi icin company_id, ayni bulgunun
-- bir kez yazilmasi icin fingerprint, kartin doldurdugu veri (params), cozum notu ve kendiliginden kapanma isareti.

ALTER TABLE validation_issue
    ADD COLUMN company_id      UUID,
    ADD COLUMN fingerprint     VARCHAR(200),
    ADD COLUMN params          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN resolution_note VARCHAR(500),
    ADD COLUMN auto_resolved   BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN last_seen_at    TIMESTAMPTZ;

UPDATE validation_issue v SET company_id = b.company_id, fingerprint = v.id::text, last_seen_at = v.created_at
FROM batch b WHERE b.id = v.batch_id;

ALTER TABLE validation_issue
    ALTER COLUMN company_id  SET NOT NULL,
    ALTER COLUMN fingerprint SET NOT NULL,
    ADD CONSTRAINT fk_issue_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    -- Elle cozulen bir bulgu cozen kisiyi ve zamani, kendiliginden kapanan ise kimseyi tasimaz.
    ADD CONSTRAINT chk_issue_resolution CHECK (
        (resolved OR (resolved_at IS NULL AND resolution_note IS NULL AND NOT auto_resolved))
        AND (NOT auto_resolved OR (resolved AND resolved_by IS NULL))),
    ADD CONSTRAINT chk_issue_note_len CHECK (resolution_note IS NULL OR length(resolution_note) <= 500);

-- Bir bulgunun tek satiri vardir (cozulmus olsa da kalir); veri degisirse ozet degisir, yeni bulgudur.
CREATE UNIQUE INDEX uq_issue_batch_fingerprint ON validation_issue(batch_id, fingerprint);
CREATE INDEX idx_issue_company ON validation_issue(company_id, batch_id);

-- "Son kontrol: 14:32" (tasarim v0.7): kurallar en son ne zaman calisti.
ALTER TABLE batch ADD COLUMN validated_at TIMESTAMPTZ;
