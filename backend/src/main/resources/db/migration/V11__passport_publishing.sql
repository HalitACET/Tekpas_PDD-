-- =====================================================================
-- V11: Pasaport yayini (M6 T2, docs/m6-plan.md §3.1)
-- =====================================================================
-- passport tablosu V1'den beri var ve bos (hicbir kod yazmadi). Eklenenler: tenant filtresi icin company_id, herkese acik
-- arama anahtari (gtin, batch_no), snapshot'in ozeti, sema surumu ve gecis zamanlari. Sonra degismezlik tetikleyicileri
-- (CLAUDE.md kural 6: yayinlanmis pasaport degismez, degisiklik = yeni surum).

ALTER TABLE passport
    ADD COLUMN company_id      UUID,
    ADD COLUMN gtin            CHAR(14),
    ADD COLUMN batch_no        VARCHAR(20),
    ADD COLUMN schema_version  SMALLINT    NOT NULL DEFAULT 1,
    ADD COLUMN snapshot_sha256 CHAR(64),
    ADD COLUMN superseded_at   TIMESTAMPTZ,
    ADD COLUMN withdrawn_at    TIMESTAMPTZ,
    ADD COLUMN withdrawn_by    UUID        REFERENCES app_user(id) ON DELETE SET NULL,
    ADD COLUMN withdraw_reason VARCHAR(500);

-- Eski satir varsa (yok) anahtarlar partiden ve urunden doldurulur.
UPDATE passport p
SET company_id      = b.company_id,
    gtin            = pr.gtin,
    batch_no        = b.batch_no,
    snapshot_sha256 = encode(sha256(convert_to(p.snapshot::text, 'UTF8')), 'hex')
FROM batch b JOIN product pr ON pr.id = b.product_id
WHERE b.id = p.batch_id;

ALTER TABLE passport
    ALTER COLUMN company_id      SET NOT NULL,
    ALTER COLUMN gtin            SET NOT NULL,
    ALTER COLUMN batch_no        SET NOT NULL,
    ALTER COLUMN snapshot_sha256 SET NOT NULL,
    ADD CONSTRAINT fk_passport_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    ADD CONSTRAINT chk_passport_gtin   CHECK (gtin ~ '^[0-9]{14}$'),
    ADD CONSTRAINT chk_passport_hash   CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
    -- Geri cekme gerekcesi zorunlu; durumla alanlar birlikte dolar.
    ADD CONSTRAINT chk_passport_withdrawn CHECK (
        (status = 'WITHDRAWN') = (withdrawn_at IS NOT NULL)
        AND (status = 'WITHDRAWN') = (withdraw_reason IS NOT NULL)),
    ADD CONSTRAINT chk_passport_superseded CHECK ((status = 'SUPERSEDED') = (superseded_at IS NOT NULL));

-- QR okutma: (gtin, parti no) -> en son surum.
CREATE INDEX idx_passport_public ON passport(gtin, batch_no, version DESC);
CREATE INDEX idx_passport_company ON passport(company_id, batch_id);

-- ---------------------------------------------------------------------
-- Degismezlik: snapshot ve kimlik kolonlari hic degismez; yalnizca PUBLISHED -> SUPERSEDED ve PUBLISHED -> WITHDRAWN
-- gecisine (ve o gecisin kolonlarina) izin var. SUPERSEDED ve WITHDRAWN satirlari tamamen dondurulmustur.
-- Dis anahtar eylemleri (kullanici silinince SET NULL, firma silinince CASCADE) tetikleyici derinligi > 1 oldugu icin
-- gecer; dogrudan UPDATE / DELETE derinlik 1'dir ve reddedilir.
-- ---------------------------------------------------------------------
CREATE FUNCTION passport_guard_update() RETURNS trigger AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.gtin IS DISTINCT FROM OLD.gtin
       OR NEW.batch_no IS DISTINCT FROM OLD.batch_no
       OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
       OR NEW.snapshot_sha256 IS DISTINCT FROM OLD.snapshot_sha256
       OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
       OR NEW.completeness IS DISTINCT FROM OLD.completeness
       OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
        RAISE EXCEPTION 'A published passport version cannot change; publish a new version'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.status <> 'PUBLISHED' AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
        RAISE EXCEPTION 'A % passport version is frozen', OLD.status
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('SUPERSEDED', 'WITHDRAWN') THEN
        RAISE EXCEPTION 'A passport version only moves from PUBLISHED to SUPERSEDED or WITHDRAWN'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER passport_guard_update BEFORE UPDATE ON passport
    FOR EACH ROW EXECUTE FUNCTION passport_guard_update();

CREATE FUNCTION passport_guard_delete() RETURNS trigger AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'A passport version cannot be deleted'
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER passport_guard_delete BEFORE DELETE ON passport
    FOR EACH ROW EXECUTE FUNCTION passport_guard_delete();
