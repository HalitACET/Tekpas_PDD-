-- M10 T3: the person a manufacturer talks to at a supplier (data request greeting, design v0.4 46a).
-- Kept on the link like the phone: two manufacturers may know different people at the same supplier.
ALTER TABLE company_supplier ADD COLUMN contact_name VARCHAR(100);
