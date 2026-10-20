-- =====================================================================
-- V12: Pasaport onbellegini yenileme isi (M6 T4, docs/m6-plan.md §5.3)
-- =====================================================================
-- Yayin ve geri cekme commit'inden sonra web'in onbellegini gecersiz kilar ve uc dilin sayfasini bir kez ister.
ALTER TABLE job DROP CONSTRAINT chk_job_type;
ALTER TABLE job ADD CONSTRAINT chk_job_type CHECK (type IN (
    'AI_EXTRACT_DOCUMENT', 'AI_VALIDATE_BATCH', 'AI_TRANSLATE_PASSPORT', 'RULE_VALIDATE_BATCH', 'IMPORT_EXCEL',
    'CERT_EXPIRY_SCAN', 'PUSH_NOTIFY', 'DOCUMENT_CLEANUP', 'PASSPORT_CACHE_REFRESH'
));
