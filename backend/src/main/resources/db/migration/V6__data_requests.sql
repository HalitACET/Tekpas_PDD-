-- =====================================================================
-- V6: Veri talebi ve tedarikci sayfasi (M4)
-- =====================================================================

-- E-posta gonderimi yok (K14): talep baglantisi WhatsApp veya kopyala ile paylasilir.
ALTER TABLE data_request DROP COLUMN sent_to_email;

-- Geri alma, acilma sayisi (48a "3 kez acildi") ve formu gonderen kisi (44, 47a). Gonderen bir kullanici
-- degil, tedarikcinin formda yazdigi ad ve gorev.
ALTER TABLE data_request ADD COLUMN revoked_at     TIMESTAMPTZ;
ALTER TABLE data_request ADD COLUMN revoked_by     UUID REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE data_request ADD COLUMN open_count     INT NOT NULL DEFAULT 0;
ALTER TABLE data_request ADD COLUMN submitter_name VARCHAR(100);
ALTER TABLE data_request ADD COLUMN submitter_role VARCHAR(100);
ALTER TABLE data_request ADD CONSTRAINT chk_request_open_count CHECK (open_count >= 0);

-- Bir adimin ayni anda en fazla bir acik baglantisi olur; yeni baglanti eskisini geri alir.
CREATE UNIQUE INDEX uq_request_open_per_step ON data_request(step_id) WHERE status IN ('SENT', 'OPENED');

-- Duzeltme istendi: gerekce, isaretli alanlar (adim tipinin alan adlari) ve kim, ne zaman.
ALTER TABLE supply_step ADD COLUMN rejection_reason TEXT;
ALTER TABLE supply_step ADD COLUMN rejection_fields JSONB;
ALTER TABLE supply_step ADD COLUMN rejected_at      TIMESTAMPTZ;
ALTER TABLE supply_step ADD COLUMN rejected_by      UUID REFERENCES app_user(id) ON DELETE SET NULL;

-- Boya adiminin eski serbest metin alanlari tasarim v0.4 41'deki secimlere tasindi (dyeProcess,
-- chemicalStandards); eski anahtarlar veriden silinir.
UPDATE supply_step SET data = data - 'process' - 'chemicalCompliance'
WHERE data ?| ARRAY['process', 'chemicalCompliance'];

-- Adim gecmisi (47a "Selin A. · 17 Eyl", M12 denetim izi). actor_user_id panel kullanicisi; tedarikcinin
-- islemlerinde bos, adi actor_name'de (formda yazdigi ad).
CREATE TABLE step_event (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    step_id       UUID         NOT NULL REFERENCES supply_step(id) ON DELETE CASCADE,
    request_id    UUID         REFERENCES data_request(id) ON DELETE SET NULL,
    kind          VARCHAR(30)  NOT NULL,
    actor_user_id UUID         REFERENCES app_user(id) ON DELETE SET NULL,
    actor_name    VARCHAR(100),
    detail        JSONB,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_step_event_kind CHECK (kind IN (
        'REQUEST_CREATED', 'REQUEST_OPENED', 'REQUEST_REVOKED', 'SUBMITTED', 'APPROVED', 'REJECTED',
        'ORIGIN_RECORDED'
    ))
);
CREATE INDEX idx_step_event_step ON step_event(step_id, created_at);
