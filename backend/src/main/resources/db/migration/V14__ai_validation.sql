-- =====================================================================
-- V14: AI tutarlilik kontrolleri (M7 T5, docs/m7-plan.md §8)
-- =====================================================================
-- AI kontrolu en son ne zaman cevap verdi ve ne gonderildi (SHA-256): ayni veri tekrar gonderilmez, gunluk
-- LLM siniri bosa harcanmaz. Bulgular validation_issue'da source = 'AI' satirlaridir (V1).
ALTER TABLE batch
    ADD COLUMN ai_validated_at TIMESTAMPTZ,
    ADD COLUMN ai_input_sha256 VARCHAR(64);
