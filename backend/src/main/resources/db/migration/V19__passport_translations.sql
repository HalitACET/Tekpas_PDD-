-- M11 T1: translations of a batch's free texts, prepared and approved before publishing (docs/m11-plan.md §3).
-- One row per text and language. An AI suggestion (demo companies only) is written unapproved; only approved rows
-- whose source text is still the one they were approved for (source_hash) go into the passport (schemaVersion 3).
CREATE TABLE passport_translation (
    id            UUID PRIMARY KEY,
    company_id    UUID         NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    batch_id      UUID         NOT NULL REFERENCES batch(id) ON DELETE CASCADE,
    -- product.description, product.care.note, step.<step id>.fabricType, step.<step id>.dyeProcessOther
    field         VARCHAR(120) NOT NULL,
    language      VARCHAR(2)   NOT NULL,
    text          VARCHAR(2000) NOT NULL,
    source        VARCHAR(10)  NOT NULL,
    -- SHA-256 (hex) of the source text the row translates; a changed source leaves the row stale
    source_hash   CHAR(64)     NOT NULL,
    approved_by   UUID         REFERENCES app_user(id) ON DELETE SET NULL,
    approved_at   TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_passport_translation UNIQUE (batch_id, field, language),
    CONSTRAINT chk_translation_language CHECK (language IN ('tr', 'en', 'de')),
    -- approved means approved_at is set; approved_by is cleared when the user is deleted
    CONSTRAINT chk_translation_source CHECK (source IN ('AI', 'MANUAL'))
);

CREATE INDEX idx_passport_translation_company_batch ON passport_translation (company_id, batch_id);
