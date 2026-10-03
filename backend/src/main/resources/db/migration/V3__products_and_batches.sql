-- =====================================================================
-- V3: Urun ve parti API'si (M2)
-- =====================================================================

-- Uretici beyanli lif bilesimi, or. [{"fiber":"COTTON","percent":95},{"fiber":"ELASTANE","percent":5}].
-- Lif kodlari, tam sayi oranlar, toplam = 100 ve tekrar yasagi uygulamada (ve packages/shared) dogrulanir.
ALTER TABLE product ADD COLUMN declared_fiber_composition JSONB;
ALTER TABLE product ADD CONSTRAINT chk_product_fibers_array CHECK (
    declared_fiber_composition IS NULL OR jsonb_typeof(declared_fiber_composition) = 'array');

ALTER TABLE product ADD CONSTRAINT chk_product_category CHECK (category IN (
    'T_SHIRT', 'SHIRT', 'TROUSERS', 'DRESS', 'KNITWEAR', 'SWEATSHIRT', 'OUTERWEAR', 'BABY',
    'HOME_TEXTILE', 'FABRIC', 'OTHER'
));

-- Listelerdeki "Guncelleme" sutunu
ALTER TABLE product ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE batch   ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Urun listesindeki parti sayisi, urun silme kontrolu ve tarihe gore siralanan listeler
CREATE INDEX idx_batch_product         ON batch(product_id);
CREATE INDEX idx_batch_company_created ON batch(company_id, created_at DESC);
CREATE INDEX idx_product_company_created ON product(company_id, created_at DESC);
