-- =====================================================================
-- V10: LLM gunluk cagri sayaci (M5 T5, docs/m5-plan.md §3)
-- =====================================================================

-- Gun basina LLM cagrisi (basarili ya da basarisiz, her deneme sayilir). Gun, saglayicinin kotasinin sifirlandigi
-- saat diliminde (Pasifik) sayilir. Ust sinir yapilandirmadan gelir (tekpas.ai.llm.daily-limit); sayac sunucu
-- yeniden baslasa da kalir (Render ucretsiz paketi sik uyur).
CREATE TABLE llm_usage (
    day   DATE    PRIMARY KEY,
    calls INTEGER NOT NULL CHECK (calls >= 0)
);
