-- SKU: the company's own product code (ERP), free text up to 64 characters (design v0.3.2 38: no format rule).
ALTER TABLE product ALTER COLUMN sku TYPE VARCHAR(64);
