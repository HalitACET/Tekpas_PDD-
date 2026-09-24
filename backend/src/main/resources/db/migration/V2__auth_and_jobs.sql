-- =====================================================================
-- TekPas - V2: Refresh token + Postgres tabanli is kuyrugu + push token
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) REFRESH TOKEN
-- Access token kisa omurlu (15 dk) ve DB'de tutulmaz.
-- Refresh token uzun omurlu (30 gun), hash'i burada; her kullanimda
-- dondurulur (rotation). Ayni aileden eski bir token tekrar gelirse
-- = calinmis token -> butun aile iptal edilir.
-- ---------------------------------------------------------------------
CREATE TABLE refresh_token (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    family_id   UUID        NOT NULL,                  -- ayni oturumdan donen tokenlar
    token_hash  CHAR(64)    NOT NULL UNIQUE,           -- SHA-256
    client      VARCHAR(10) NOT NULL,                  -- WEB veya MOBILE
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,                           -- rotation'da doldurulur
    revoked_at  TIMESTAMPTZ,
    user_agent  VARCHAR(300),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_rt_client CHECK (client IN ('WEB', 'MOBILE'))
);
CREATE INDEX idx_rt_user   ON refresh_token(user_id);
CREATE INDEX idx_rt_family ON refresh_token(family_id);

-- ---------------------------------------------------------------------
-- 2) IS KUYRUGU
-- Isciler (worker) isi soyle alir:
--   SELECT ... FROM job
--   WHERE status = 'QUEUED' AND run_at <= now()
--   ORDER BY priority DESC, run_at
--   FOR UPDATE SKIP LOCKED LIMIT 1;
-- Hata alirsa attempts++ ve run_at = now() + (2^attempts) dakika (backoff).
-- ---------------------------------------------------------------------
CREATE TABLE job (
    id           BIGSERIAL PRIMARY KEY,
    type         VARCHAR(40) NOT NULL,
    payload      JSONB       NOT NULL DEFAULT '{}'::jsonb,   -- or. {"documentId":"..."}
    status       VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    priority     SMALLINT    NOT NULL DEFAULT 0,
    attempts     SMALLINT    NOT NULL DEFAULT 0,
    max_attempts SMALLINT    NOT NULL DEFAULT 5,
    run_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at    TIMESTAMPTZ,
    locked_by    VARCHAR(100),
    last_error   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    CONSTRAINT chk_job_type CHECK (type IN (
        'AI_EXTRACT_DOCUMENT',    -- belgeden veri cikarma
        'AI_VALIDATE_BATCH',      -- AI tutarlilik kontrolu
        'AI_TRANSLATE_PASSPORT',  -- EN/DE ceviri
        'RULE_VALIDATE_BATCH',    -- kural tabanli kontrol
        'IMPORT_EXCEL',           -- Excel ice aktarma
        'CERT_EXPIRY_SCAN',       -- suresi dolacak sertifikalar (gunluk)
        'PUSH_NOTIFY'             -- mobil bildirim
    )),
    CONSTRAINT chk_job_status   CHECK (status IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'DEAD')),
    CONSTRAINT chk_job_attempts CHECK (attempts >= 0 AND attempts <= max_attempts)
);
CREATE INDEX idx_job_pick ON job(priority DESC, run_at) WHERE status = 'QUEUED';

-- ---------------------------------------------------------------------
-- 3) MOBIL PUSH TOKEN (Expo)
-- ---------------------------------------------------------------------
CREATE TABLE push_token (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    expo_token  VARCHAR(200) NOT NULL UNIQUE,
    platform    VARCHAR(10)  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_push_platform CHECK (platform IN ('ANDROID', 'IOS'))
);
CREATE INDEX idx_push_user ON push_token(user_id);
