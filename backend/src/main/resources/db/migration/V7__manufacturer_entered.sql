-- =====================================================================
-- V7: Uretici beyani (M4)
-- =====================================================================

-- Lif adiminin menseini uretici panelden girer (tedarikcisi yoktur). Olay tipi verinin kaynagini
-- ayirir: pasaportta "uretici beyani" olarak gosterilebilir. ORIGIN_RECORDED hic kullanilmadi.
ALTER TABLE step_event DROP CONSTRAINT chk_step_event_kind;
ALTER TABLE step_event ADD CONSTRAINT chk_step_event_kind CHECK (kind IN (
    'REQUEST_CREATED', 'REQUEST_OPENED', 'REQUEST_REVOKED', 'SUBMITTED', 'APPROVED', 'REJECTED',
    'MANUFACTURER_ENTERED'
));
