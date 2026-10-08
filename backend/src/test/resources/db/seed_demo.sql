-- =====================================================================
-- TekPas - Demo verisi (sadece gelistirme / demo ortami icin)
-- Senaryo: "Mavi Basic Tisort", Kasim 2026 partisi
--   Lif -> Iplik -> Kumas -> Boya -> Dikim (fason)
-- =====================================================================

INSERT INTO company (id, name, type, city) VALUES
 ('00000000-0000-0000-0000-000000000001', 'Nilüfer Giyim A.Ş.',       'MANUFACTURER', 'Bursa');

-- Tedarikciler ureticinin agina eklenir; olusturan firma created_by_company_id'de durur.
INSERT INTO company (id, name, type, city, created_by_company_id) VALUES
 ('00000000-0000-0000-0000-000000000002', 'Ege İplik San. Ltd.',      'YARN',     'Denizli', '00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000003', 'Demirtaş Örme Kumaş A.Ş.', 'FABRIC',   'Bursa',   '00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000004', 'Uludağ Boya Terbiye',      'DYEHOUSE', 'Bursa',   '00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000005', 'İnegöl Fason Dikim',       'SEWING',   'Bursa',   '00000000-0000-0000-0000-000000000001');

INSERT INTO company_supplier (manufacturer_id, supplier_id, contact_email, phone) VALUES
 ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'kalite@egeiplik.example',     '+902580000001'),
 ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'uretim@demirtasorme.example', '+902240000002'),
 ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'lab@uludagboya.example',      '+902240000003'),
 ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'usta@inegolfason.example',    '+902240000004');

-- password_hash yer tutucudur: gercek hash DemoDataSeeder'da DEMO_PASSWORD'dan uretilir.
INSERT INTO app_user (id, company_id, email, password_hash, full_name, role) VALUES
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  'admin@nilufergiyim.example', '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5BWX4Z6ZlF6yF6oGqI0Kc1s9u8Z9e', 'Demo Yönetici', 'OWNER'),
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004',
  'lab@uludagboya.example',     '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5BWX4Z6ZlF6yF6oGqI0Kc1s9u8Z9e', 'Boyahane Lab',  'SUPPLIER');

INSERT INTO product (id, company_id, gtin, sku, name, category) VALUES
 ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  '02012345000018', 'NG-TS-001-BLU', 'Mavi Basic Tisort', 'T_SHIRT');

INSERT INTO batch (id, product_id, company_id, batch_no, production_order_no, quantity, produced_from, produced_to, status) VALUES
 ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  'L2611A', 'UE-2026-1142', 5000, '2026-11-02', '2026-11-20', 'COLLECTING');

-- Tedarik zinciri (DAG): her adim, ciktisini kullandigi adimlari supply_step_input'ta listeler.
--   Lif -> Iplik -> Kumas -> Boya -> Dikim
INSERT INTO supply_step (id, batch_id, step_type, supplier_company_id, sort_order, status, data) VALUES
 ('40000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000001',
  'FIBER', NULL, 0, 'APPROVED',
  '{"fiberType":"COTTON","originCountry":"TR","originRegion":"Harran, Şanlıurfa","harvestYear":2025,"quantityKg":1210}'),
 ('40000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000001',
  'YARN', '00000000-0000-0000-0000-000000000002', 0, 'APPROVED',
  '{"fiberComposition":[{"fiber":"COTTON","percent":100}],"originCountry":"TR",
    "energySources":[{"source":"GRID","percent":70},{"source":"SOLAR","percent":30}],
    "energyKwhPerKg":2.9,"deliveredKg":1180,"yarnCount":"Ne 30/1","yarnProcess":"COMBED"}'),
 ('40000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000001',
  'FABRIC', '00000000-0000-0000-0000-000000000003', 0, 'SUBMITTED',
  '{"fabricType":"Süprem","gsm":180,"fiberComposition":[{"fiber":"COTTON","percent":95},{"fiber":"ELASTANE","percent":5}],
    "originCountry":"TR","energySources":[{"source":"GRID","percent":100}],"energyKwhPerKg":1.8}'),
 ('40000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000001',
  'DYEING', '00000000-0000-0000-0000-000000000004', 0, 'PENDING', '{}'),
 ('40000000-0000-0000-0000-000000000015', '30000000-0000-0000-0000-000000000001',
  'SEWING', '00000000-0000-0000-0000-000000000005', 0, 'PENDING', '{}');

INSERT INTO supply_step_input (step_id, input_step_id) VALUES
 ('40000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000011'),
 ('40000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000012'),
 ('40000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000013'),
 ('40000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000014');

-- AI'in okudugu bir OEKO-TEX sertifikasi (onay bekliyor)
INSERT INTO document (company_id, step_id, doc_type, file_key, original_name, mime_type, size_bytes, sha256,
                      extraction_status, extraction, extraction_model, extracted_at, valid_until) VALUES
 ('00000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000012', 'OEKO_TEX',
  'docs/ege-iplik/oeko-tex-2026.pdf', 'OEKO-TEX_Standard100_2026.pdf', 'application/pdf', 284113,
  repeat('a', 64), 'DONE',
  '{"certNo":{"value":"SH025 123456","confidence":0.98},
    "holderName":{"value":"Ege İplik San. Ltd.","confidence":0.95},
    "validUntil":{"value":"2027-03-31","confidence":0.97}}',
  'claude-sonnet-5', now(), '2027-03-31');
