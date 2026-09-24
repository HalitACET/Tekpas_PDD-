-- =====================================================================
-- TekPas - Demo verisi (sadece gelistirme / demo ortami icin)
-- Senaryo: "Mavi Basic Tisort", Kasim 2026 partisi
--   Dikim (fason) <- Boya <- Kumas <- Iplik
-- =====================================================================

INSERT INTO company (id, name, type, city) VALUES
 ('00000000-0000-0000-0000-000000000001', 'Nilufer Giyim A.S.',       'MANUFACTURER', 'Bursa'),
 ('00000000-0000-0000-0000-000000000002', 'Ege Iplik San. Ltd.',      'YARN',         'Denizli'),
 ('00000000-0000-0000-0000-000000000003', 'Demirtas Orme Kumas A.S.', 'FABRIC',       'Bursa'),
 ('00000000-0000-0000-0000-000000000004', 'Uludag Boya Terbiye',      'DYEHOUSE',     'Bursa'),
 ('00000000-0000-0000-0000-000000000005', 'Inegol Fason Dikim',       'SEWING',       'Bursa');

INSERT INTO company_supplier (manufacturer_id, supplier_id, contact_email) VALUES
 ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'kalite@egeiplik.example'),
 ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'uretim@demirtasorme.example'),
 ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'lab@uludagboya.example'),
 ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'usta@inegolfason.example');

-- DIKKAT: password_hash yer tutucudur, gercek bir sifreye karsilik gelmez.
-- Backend ayaga kalkinca demo kullanicilarinin hash'ini BCryptPasswordEncoder ile uretip guncelle.
INSERT INTO app_user (id, company_id, email, password_hash, full_name, role) VALUES
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  'admin@nilufergiyim.example', '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5BWX4Z6ZlF6yF6oGqI0Kc1s9u8Z9e', 'Demo Yonetici', 'OWNER'),
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004',
  'lab@uludagboya.example',     '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5BWX4Z6ZlF6yF6oGqI0Kc1s9u8Z9e', 'Boyahane Lab',  'SUPPLIER');

INSERT INTO product (id, company_id, gtin, sku, name, category) VALUES
 ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  '08690000000017', 'NG-TS-001-BLU', 'Mavi Basic Tisort', 'T_SHIRT');

INSERT INTO batch (id, product_id, company_id, batch_no, production_order_no, quantity, produced_from, produced_to, status) VALUES
 ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  'L2611A', 'UE-2026-1142', 5000, '2026-11-02', '2026-11-20', 'COLLECTING');

-- Tedarik zinciri agaci (kok = dikim)
INSERT INTO supply_step (id, batch_id, parent_step_id, step_type, supplier_company_id, sort_order, status, data) VALUES
 ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', NULL,
  'SEWING', '00000000-0000-0000-0000-000000000005', 4, 'APPROVED', '{"country":"TR"}'),
 ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004',
  'DYEING', '00000000-0000-0000-0000-000000000004', 3, 'PENDING', '{}'),
 ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003',
  'FABRIC', '00000000-0000-0000-0000-000000000003', 2, 'SUBMITTED', '{"country":"TR","construction":"SINGLE_JERSEY","gsm":160}'),
 ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
  'YARN', '00000000-0000-0000-0000-000000000002', 1, 'APPROVED',
  '{"country":"TR","fiberComposition":[{"fiber":"COTTON","percent":95},{"fiber":"ELASTANE","percent":5}],"recycledPercent":0}');

-- AI'in okudugu bir OEKO-TEX sertifikasi (onay bekliyor)
INSERT INTO document (company_id, step_id, doc_type, file_key, original_name, mime_type, size_bytes, sha256,
                      extraction_status, extraction, extraction_model, extracted_at, valid_until) VALUES
 ('00000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'OEKO_TEX',
  'docs/ege-iplik/oeko-tex-2026.pdf', 'OEKO-TEX_Standard100_2026.pdf', 'application/pdf', 284113,
  repeat('a', 64), 'DONE',
  '{"certNo":{"value":"SH025 123456","confidence":0.98},
    "holderName":{"value":"Ege Iplik San. Ltd.","confidence":0.95},
    "validUntil":{"value":"2027-03-31","confidence":0.97}}',
  'claude-sonnet-5', now(), '2027-03-31');
