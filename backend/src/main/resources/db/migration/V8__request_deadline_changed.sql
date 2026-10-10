-- =====================================================================
-- V8: Veri talebinin son tarihi degistirilebilir (tasarim v0.4 46a: 3 / 7 / 14 gun)
-- =====================================================================

ALTER TABLE step_event DROP CONSTRAINT chk_step_event_kind;
ALTER TABLE step_event ADD CONSTRAINT chk_step_event_kind CHECK (kind IN (
    'REQUEST_CREATED', 'REQUEST_OPENED', 'REQUEST_REVOKED', 'REQUEST_DEADLINE_CHANGED', 'SUBMITTED', 'APPROVED',
    'REJECTED', 'MANUFACTURER_ENTERED'
));
