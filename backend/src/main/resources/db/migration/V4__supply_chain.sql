-- =====================================================================
-- V4: Tedarik zinciri (M3)
-- =====================================================================

-- Tedarikci firmayi hangi uretici olusturdu. Uretici yalnizca kendi olusturdugu ve kullanicisi olmayan
-- firmanin adini, sehrini ve tipini duzenleyebilir; digerlerinde yalnizca bag alanlarini (telefon).
ALTER TABLE company ADD COLUMN created_by_company_id UUID REFERENCES company(id) ON DELETE SET NULL;

-- Ureticiye ozel iletisim telefonu (E.164, or. +902240000000): veri talep baglantisi WhatsApp ile paylasilir.
ALTER TABLE company_supplier ADD COLUMN phone VARCHAR(16);
ALTER TABLE company_supplier ADD CONSTRAINT chk_supplier_phone CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$');

-- Zincir bir agac degil, yonlu dongusuz bir grafik (DAG): bir lif partisi iki iplikciyi besleyebilir,
-- bir kumas iki iplikten yapilabilir. Her satir "step_id adimi, input_step_id adiminin ciktisini kullanir".
-- Ayni partiye ait olma ve dongu yasagi uygulamada (recursive CTE) kontrol edilir.
CREATE TABLE supply_step_input (
    step_id       UUID NOT NULL REFERENCES supply_step(id) ON DELETE CASCADE,
    input_step_id UUID NOT NULL REFERENCES supply_step(id) ON DELETE CASCADE,
    PRIMARY KEY (step_id, input_step_id),
    CONSTRAINT chk_step_input_not_self CHECK (step_id <> input_step_id)
);
CREATE INDEX idx_step_input_input ON supply_step_input(input_step_id);

-- Eski agac baglari (parent = ciktiyi kullanan adim) yeni tabloya tasinir, sonra kolon kaldirilir.
INSERT INTO supply_step_input (step_id, input_step_id)
SELECT parent_step_id, id FROM supply_step WHERE parent_step_id IS NOT NULL;

DROP INDEX idx_step_parent;
ALTER TABLE supply_step DROP CONSTRAINT chk_step_not_self;
ALTER TABLE supply_step DROP COLUMN parent_step_id;

-- Zincir ekranindaki "Guncelleme" ve adim verisinin en son ne zaman degistigi
ALTER TABLE supply_step ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
