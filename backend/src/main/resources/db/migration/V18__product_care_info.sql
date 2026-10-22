-- M10 T8: care instructions of a product (ISO 3758 groups and a free note), design v1.0 120a.
-- The column exists since V1 and was unused until now; typed in code (com.tekpas.product.care.CareInfo) and
-- frozen into passport snapshots from schemaVersion 2.
ALTER TABLE product ADD CONSTRAINT chk_product_care_info CHECK (care_info IS NULL OR jsonb_typeof(care_info) = 'object');
