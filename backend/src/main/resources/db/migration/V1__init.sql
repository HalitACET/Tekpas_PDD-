-- =====================================================================
-- TekPas - Dijital Urun Pasaportu
-- V1: Cekirdek sema (Flyway migration)
-- PostgreSQL 13+ (gen_random_uuid yerlesik)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) FIRMA
-- Ureticiler ve tedarikciler ayni tabloda; ayrim 'type' ile.
-- ---------------------------------------------------------------------
CREATE TABLE company (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(200) NOT NULL,
    type        VARCHAR(30)  NOT NULL,
    tax_no      VARCHAR(20),
    country     CHAR(2)      NOT NULL DEFAULT 'TR',   -- ISO 3166-1 alpha-2
    city        VARCHAR(100),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_company_type CHECK (type IN (
        'MANUFACTURER',   -- pasaportu yayinlayan uretici (musteri)
        'YARN',           -- iplikci
        'FABRIC',         -- kumasci (orme/dokuma)
        'DYEHOUSE',       -- boyahane / terbiye
        'SEWING',         -- fason dikim
        'ACCESSORY',      -- aksesuar (dugme, fermuar, etiket)
        'OTHER'
    ))
);

-- Bir uretici hangi tedarikcilerle calisiyor (tedarikci ag listesi)
CREATE TABLE company_supplier (
    manufacturer_id UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    supplier_id     UUID NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    contact_email   VARCHAR(200),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (manufacturer_id, supplier_id),
    CONSTRAINT chk_not_self CHECK (manufacturer_id <> supplier_id)
);

-- ---------------------------------------------------------------------
-- 2) KULLANICI VE ROLLER
-- ---------------------------------------------------------------------
CREATE TABLE app_user (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID         NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    email         VARCHAR(200) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    full_name     VARCHAR(150) NOT NULL,
    role          VARCHAR(20)  NOT NULL,
    locale        VARCHAR(5)   NOT NULL DEFAULT 'tr',
    active        BOOLEAN      NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_user_role CHECK (role IN (
        'OWNER',    -- firma sahibi: her sey + kullanici yonetimi
        'ADMIN',    -- urun/parti/pasaport yonetimi, yayinlama
        'EDITOR',   -- veri girer, yayinlayamaz
        'SUPPLIER', -- tedarikci kullanicisi: sadece kendisine atanan adimlar
        'VIEWER'    -- sadece okuma (or. AB alicisi / denetci)
    ))
);
CREATE INDEX idx_user_company ON app_user(company_id);

-- ---------------------------------------------------------------------
-- 3) URUN (MODEL) VE PARTI
-- ---------------------------------------------------------------------
CREATE TABLE product (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID         NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    gtin        CHAR(14)     NOT NULL UNIQUE,          -- GS1 GTIN-14 (dunya capinda tekil)
    sku         VARCHAR(60),                           -- firmanin kendi urun kodu (ERP)
    name        VARCHAR(200) NOT NULL,
    category    VARCHAR(50)  NOT NULL,                 -- or. T_SHIRT, TROUSERS, FABRIC
    description TEXT,
    care_info   JSONB,                                 -- yikama/bakim sembolleri
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_gtin_digits CHECK (gtin ~ '^[0-9]{14}$')
);
CREATE INDEX idx_product_company ON product(company_id);

CREATE TABLE batch (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID        NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    company_id          UUID        NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    batch_no            VARCHAR(20) NOT NULL,          -- GS1 AI(10) max 20 karakter
    production_order_no VARCHAR(50),                   -- ERP uretim emri no
    quantity            INTEGER     NOT NULL,
    produced_from       DATE,
    produced_to         DATE,
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, batch_no),
    CONSTRAINT chk_batch_qty    CHECK (quantity > 0),
    CONSTRAINT chk_batch_dates  CHECK (produced_to IS NULL OR produced_from IS NULL OR produced_to >= produced_from),
    CONSTRAINT chk_batch_status CHECK (status IN ('DRAFT', 'COLLECTING', 'READY', 'PUBLISHED'))
);
CREATE INDEX idx_batch_company ON batch(company_id);

-- ---------------------------------------------------------------------
-- 4) TEDARIK ZINCIRI (AGAC)
-- Her parti bir agac: dikim <- boya <- kumas <- iplik
-- parent_step_id: bu adima girdi veren ust adim degil, bu adimin
-- ciktisini kullanan adim (koke = son urun asamasi).
-- Veriler esnek oldugu icin JSONB (AB semasi henuz kesin degil).
-- ---------------------------------------------------------------------
CREATE TABLE supply_step (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id            UUID        NOT NULL REFERENCES batch(id) ON DELETE CASCADE,
    parent_step_id      UUID        REFERENCES supply_step(id) ON DELETE CASCADE,
    step_type           VARCHAR(20) NOT NULL,
    supplier_company_id UUID        REFERENCES company(id),
    sort_order          SMALLINT    NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    data                JSONB       NOT NULL DEFAULT '{}'::jsonb,
    -- or. {"fiberComposition":[{"fiber":"COTTON","percent":95},{"fiber":"ELASTANE","percent":5}],
    --      "recycledPercent":0,"chemicals":[...],"country":"TR","energyKwh":1200}
    submitted_at        TIMESTAMPTZ,
    approved_by         UUID        REFERENCES app_user(id),
    approved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_step_type CHECK (step_type IN (
        'FIBER', 'YARN', 'FABRIC', 'DYEING', 'SEWING', 'ACCESSORY', 'PACKAGING'
    )),
    CONSTRAINT chk_step_status CHECK (status IN (
        'PENDING',    -- tedarikciden veri bekleniyor
        'SUBMITTED',  -- tedarikci gonderdi, uretici onayi bekliyor
        'APPROVED',   -- uretici onayladi
        'REJECTED'    -- duzeltme istendi
    )),
    CONSTRAINT chk_step_not_self CHECK (parent_step_id IS NULL OR parent_step_id <> id)
);
CREATE INDEX idx_step_batch    ON supply_step(batch_id);
CREATE INDEX idx_step_parent   ON supply_step(parent_step_id);
CREATE INDEX idx_step_supplier ON supply_step(supplier_company_id);

-- Tedarikciye giden veri talebi (kayit gerektirmeyen tek kullanimlik link)
CREATE TABLE data_request (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    step_id       UUID         NOT NULL REFERENCES supply_step(id) ON DELETE CASCADE,
    token_hash    CHAR(64)     NOT NULL UNIQUE,        -- SHA-256; ham token DB'de tutulmaz
    sent_to_email VARCHAR(200),
    message       TEXT,
    status        VARCHAR(20)  NOT NULL DEFAULT 'SENT',
    expires_at    TIMESTAMPTZ  NOT NULL,
    opened_at     TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_by    UUID         REFERENCES app_user(id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_request_status CHECK (status IN ('SENT', 'OPENED', 'COMPLETED', 'EXPIRED', 'REVOKED'))
);
CREATE INDEX idx_request_step ON data_request(step_id);

-- ---------------------------------------------------------------------
-- 5) BELGELER + AI CIKARIM
-- Sertifika/rapor dosyasi R2'de, burada meta + AI'in okudugu alanlar.
-- ---------------------------------------------------------------------
CREATE TABLE document (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID         NOT NULL REFERENCES company(id) ON DELETE CASCADE, -- belgenin sahibi firma
    step_id           UUID         REFERENCES supply_step(id) ON DELETE SET NULL,
    doc_type          VARCHAR(30)  NOT NULL,
    file_key          VARCHAR(300) NOT NULL,           -- R2 nesne anahtari
    original_name     VARCHAR(255) NOT NULL,
    mime_type         VARCHAR(100) NOT NULL,
    size_bytes        BIGINT       NOT NULL,
    sha256            CHAR(64)     NOT NULL,           -- ayni dosyanin tekrar yuklenmesini yakalar
    -- Onaylanmis (kullanicinin kabul ettigi) alanlar:
    cert_no           VARCHAR(100),
    issuer            VARCHAR(200),
    holder_name       VARCHAR(200),
    valid_from        DATE,
    valid_until       DATE,
    -- AI cikarim sonucu (ham, onay oncesi):
    extraction_status VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    extraction        JSONB,        -- {"certNo":{"value":"...","confidence":0.97}, ...}
    extraction_model  VARCHAR(100),
    extracted_at      TIMESTAMPTZ,
    verified_by       UUID         REFERENCES app_user(id),
    verified_at       TIMESTAMPTZ,
    uploaded_by       UUID         REFERENCES app_user(id),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_doc_type CHECK (doc_type IN (
        'OEKO_TEX', 'GOTS', 'GRS', 'BCI', 'OCS', 'BLUESIGN',
        'LAB_REPORT', 'SDS', 'INVOICE', 'OTHER'
    )),
    CONSTRAINT chk_extraction_status CHECK (extraction_status IN (
        'PENDING', 'PROCESSING', 'DONE', 'FAILED', 'VERIFIED'
    )),
    CONSTRAINT chk_doc_validity CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);
CREATE INDEX idx_document_company     ON document(company_id);
CREATE INDEX idx_document_step        ON document(step_id);
CREATE INDEX idx_document_valid_until ON document(valid_until) WHERE valid_until IS NOT NULL;

-- ---------------------------------------------------------------------
-- 6) TUTARLILIK KONTROLU (kural + AI)
-- ---------------------------------------------------------------------
CREATE TABLE validation_issue (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id    UUID         NOT NULL REFERENCES batch(id) ON DELETE CASCADE,
    step_id     UUID         REFERENCES supply_step(id) ON DELETE CASCADE,
    document_id UUID         REFERENCES document(id) ON DELETE CASCADE,
    source      VARCHAR(10)  NOT NULL,                 -- RULE veya AI
    severity    VARCHAR(10)  NOT NULL,
    code        VARCHAR(50)  NOT NULL,                 -- or. FIBER_SUM_NOT_100, CERT_EXPIRED, HOLDER_MISMATCH
    message     TEXT         NOT NULL,
    resolved    BOOLEAN      NOT NULL DEFAULT false,
    resolved_by UUID         REFERENCES app_user(id),
    resolved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_issue_source   CHECK (source IN ('RULE', 'AI')),
    CONSTRAINT chk_issue_severity CHECK (severity IN ('INFO', 'WARNING', 'ERROR'))
);
CREATE INDEX idx_issue_batch_open ON validation_issue(batch_id) WHERE resolved = false;

-- ---------------------------------------------------------------------
-- 7) PASAPORT (yayinlanan, dondurulmus surumler)
-- QR = GS1 Digital Link:  https://<alan-adi>/01/{gtin}/10/{batch_no}
-- Cozumleme: gtin + batch_no -> en son PUBLISHED surum.
-- snapshot: yayin anindaki tum veri + ceviriler, sonradan degismez.
-- ---------------------------------------------------------------------
CREATE TABLE passport (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id     UUID        NOT NULL REFERENCES batch(id) ON DELETE CASCADE,
    version      INTEGER     NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
    snapshot     JSONB       NOT NULL,   -- {"tr":{...},"en":{...},"de":{...}, "supplyChain":[...], "documents":[...]}
    completeness SMALLINT    NOT NULL,   -- uyum skoru 0-100 (yayin anindaki)
    published_by UUID        REFERENCES app_user(id),
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (batch_id, version),
    CONSTRAINT chk_passport_version CHECK (version > 0),
    CONSTRAINT chk_passport_status  CHECK (status IN ('PUBLISHED', 'SUPERSEDED', 'WITHDRAWN')),
    CONSTRAINT chk_completeness     CHECK (completeness BETWEEN 0 AND 100)
);
-- Bir partinin ayni anda yalnizca bir yayindaki surumu olabilir
CREATE UNIQUE INDEX uq_passport_one_published ON passport(batch_id) WHERE status = 'PUBLISHED';

-- QR okutma istatistigi (ileride: "kac kez okutuldu, hangi ulkeden")
CREATE TABLE passport_scan (
    id          BIGSERIAL PRIMARY KEY,
    passport_id UUID        NOT NULL REFERENCES passport(id) ON DELETE CASCADE,
    scanned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    country     CHAR(2),
    lang        VARCHAR(5),
    user_agent  VARCHAR(300)
);
CREATE INDEX idx_scan_passport ON passport_scan(passport_id, scanned_at);

-- ---------------------------------------------------------------------
-- 8) EXCEL ICE AKTARMA ISLERI
-- ---------------------------------------------------------------------
CREATE TABLE import_job (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID         NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    kind          VARCHAR(20)  NOT NULL,               -- PRODUCTS veya BATCHES
    file_key      VARCHAR(300) NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    total_rows    INTEGER,
    success_rows  INTEGER,
    errors        JSONB,                               -- [{"row":12,"field":"gtin","message":"..."}]
    created_by    UUID         REFERENCES app_user(id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,
    CONSTRAINT chk_import_kind   CHECK (kind IN ('PRODUCTS', 'BATCHES')),
    CONSTRAINT chk_import_status CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED'))
);

-- ---------------------------------------------------------------------
-- 9) DENETIM IZI (kim neyi ne zaman degistirdi)
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    company_id  UUID        REFERENCES company(id) ON DELETE SET NULL,
    user_id     UUID        REFERENCES app_user(id) ON DELETE SET NULL,
    entity_type VARCHAR(30) NOT NULL,
    entity_id   UUID        NOT NULL,
    action      VARCHAR(30) NOT NULL,                  -- CREATE, UPDATE, SUBMIT, APPROVE, PUBLISH ...
    diff        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
