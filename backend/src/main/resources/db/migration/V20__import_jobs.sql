-- M11 T6: Excel imports (docs/m11-plan.md §4). import_job exists since V1 and was never used; it is shaped for the
-- import here. The uploaded file waits in the row (at most 1 MB) until the IMPORT_EXCEL job has read it and is cleared
-- then; the result stays: counts and the rows that could not be imported. (The table is empty everywhere: nothing ever
-- wrote to it, and the NOT NULL columns added below would fail loudly otherwise.)
ALTER TABLE import_job DROP COLUMN file_key;
ALTER TABLE import_job RENAME COLUMN success_rows TO created_rows;
ALTER TABLE import_job
    ADD COLUMN file_name    VARCHAR(200) NOT NULL,
    ADD COLUMN file         BYTEA,
    ADD COLUMN failed_rows  INTEGER      NOT NULL DEFAULT 0,
    -- why the whole file was refused: TEMPLATE_UNKNOWN, TOO_MANY_ROWS, UNREADABLE
    ADD COLUMN failure_code VARCHAR(40);
ALTER TABLE import_job
    ALTER COLUMN total_rows SET DEFAULT 0,
    ALTER COLUMN total_rows SET NOT NULL,
    ALTER COLUMN created_rows SET DEFAULT 0,
    ALTER COLUMN created_rows SET NOT NULL,
    -- [{"row": 7, "column": "gtin", "code": "GtinCheckDigit", "value": "8690…"}], at most 200 entries
    ALTER COLUMN errors SET DEFAULT '[]'::jsonb,
    ALTER COLUMN errors SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'QUEUED';
ALTER TABLE import_job DROP CONSTRAINT chk_import_status;
ALTER TABLE import_job ADD CONSTRAINT chk_import_status CHECK (status IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED'));
ALTER TABLE import_job ADD CONSTRAINT chk_import_file_size CHECK (file IS NULL OR octet_length(file) <= 1048576);
-- A deleted user leaves their imports behind.
ALTER TABLE import_job DROP CONSTRAINT import_job_created_by_fkey;
ALTER TABLE import_job ADD CONSTRAINT import_job_created_by_fkey FOREIGN KEY (created_by) REFERENCES app_user(id)
    ON DELETE SET NULL;

CREATE INDEX idx_import_job_company_created ON import_job (company_id, created_at DESC);
