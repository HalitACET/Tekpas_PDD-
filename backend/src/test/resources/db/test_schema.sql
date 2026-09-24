-- Semanin davranis testleri. Beklenen hatalar SAVEPOINT ile yakalanir.
\set ON_ERROR_STOP 0
\echo '--- 1) Tedarik zinciri agaci (recursive CTE, kokten yapraga)'
WITH RECURSIVE chain AS (
    SELECT s.id, s.step_type, s.supplier_company_id, s.status, 0 AS depth
    FROM supply_step s
    WHERE s.batch_id = '30000000-0000-0000-0000-000000000001' AND s.parent_step_id IS NULL
  UNION ALL
    SELECT c.id, c.step_type, c.supplier_company_id, c.status, p.depth + 1
    FROM supply_step c JOIN chain p ON c.parent_step_id = p.id
)
SELECT repeat('  ', depth) || step_type AS adim, co.name AS tedarikci, ch.status
FROM chain ch JOIN company co ON co.id = ch.supplier_company_id
ORDER BY depth;

\echo '--- 2) Uyum skoru (onayli adim orani)'
SELECT round(100.0 * count(*) FILTER (WHERE status = 'APPROVED') / count(*)) AS skor_yuzde
FROM supply_step WHERE batch_id = '30000000-0000-0000-0000-000000000001';

\echo '--- 3) Lif toplami %100 mu? (kural kontrolu, JSONB)'
SELECT step_type, sum((f->>'percent')::numeric) AS toplam
FROM supply_step, jsonb_array_elements(data->'fiberComposition') f
GROUP BY step_type;

\echo '--- 4) 200 gun icinde suresi dolacak belgeler'
SELECT original_name, valid_until FROM document WHERE valid_until < current_date + 200;

\echo '--- 5) Pasaport v1 yayinla, sonra v2; v1 SUPERSEDED olmali'
BEGIN;
INSERT INTO passport (batch_id, version, snapshot, completeness)
VALUES ('30000000-0000-0000-0000-000000000001', 1, '{"tr":{}}', 50);
UPDATE passport SET status = 'SUPERSEDED' WHERE batch_id = '30000000-0000-0000-0000-000000000001' AND status = 'PUBLISHED';
INSERT INTO passport (batch_id, version, snapshot, completeness)
VALUES ('30000000-0000-0000-0000-000000000001', 2, '{"tr":{}}', 75);
SELECT version, status FROM passport ORDER BY version;
COMMIT;

\echo '--- 6) GS1 Digital Link cozumleme: /01/08690000000017/10/L2611A'
SELECT pa.version, pa.completeness
FROM passport pa JOIN batch b ON b.id = pa.batch_id JOIN product p ON p.id = b.product_id
WHERE p.gtin = '08690000000017' AND b.batch_no = 'L2611A' AND pa.status = 'PUBLISHED';

\echo '--- BEKLENEN HATALAR (hepsi reddedilmeli):'
\echo 'a) ayni partide ikinci PUBLISHED pasaport'
INSERT INTO passport (batch_id, version, snapshot, completeness)
VALUES ('30000000-0000-0000-0000-000000000001', 3, '{}', 80);
\echo 'b) 14 haneli olmayan GTIN'
INSERT INTO product (company_id, gtin, name, category)
VALUES ('00000000-0000-0000-0000-000000000001', '12345ABC000000', 'X', 'T_SHIRT');
\echo 'c) gecersiz rol'
UPDATE app_user SET role = 'SUPERADMIN' WHERE email = 'admin@nilufergiyim.example';
\echo 'd) negatif parti miktari'
UPDATE batch SET quantity = -5;
\echo 'e) uretici kendi kendinin tedarikcisi'
INSERT INTO company_supplier VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
\echo 'f) uyum skoru 100 ustu'
UPDATE passport SET completeness = 120;
