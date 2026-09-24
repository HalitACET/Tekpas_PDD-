-- V2 davranis testi: iki isci ayni anda is alirsa ayni isi almamali.
\echo '--- kuyruga 3 is ekle'
INSERT INTO job (type, payload, priority) VALUES
 ('AI_EXTRACT_DOCUMENT', '{"documentId":"a"}', 5),
 ('RULE_VALIDATE_BATCH', '{"batchId":"b"}',   0),
 ('CERT_EXPIRY_SCAN',    '{}',                0);

\echo '--- isci 1 (transaction acik kalir) ve isci 2 ayni anda is alir'
BEGIN;
SELECT id, type FROM job WHERE status='QUEUED' AND run_at <= now()
ORDER BY priority DESC, run_at FOR UPDATE SKIP LOCKED LIMIT 1;
\! psql -h /tmp -p 5433 -U postgres -d tekpas -tA -c "BEGIN; SELECT 'isci2 aldi: ' || type FROM job WHERE status='QUEUED' AND run_at <= now() ORDER BY priority DESC, run_at FOR UPDATE SKIP LOCKED LIMIT 1; COMMIT;"
COMMIT;

\echo '--- BEKLENEN HATA: gecersiz is tipi'
INSERT INTO job (type) VALUES ('BITCOIN_MINE');
\echo '--- BEKLENEN HATA: ayni refresh token hash iki kez'
INSERT INTO refresh_token (user_id, family_id, token_hash, client, expires_at)
VALUES ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), repeat('b',64), 'WEB', now() + interval '30 days');
INSERT INTO refresh_token (user_id, family_id, token_hash, client, expires_at)
VALUES ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), repeat('b',64), 'WEB', now() + interval '30 days');
