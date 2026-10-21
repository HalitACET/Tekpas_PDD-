-- =====================================================================
-- V16: Demo senaryosunun hangi surumu uygulandi (M10 T1, docs/m10-plan.md §3)
-- =====================================================================
-- Demo verisi kodda (DemoScenario): bes parti, her biri demonun bir anini gosterir. Canlidaki eski demo partilerine
-- bir kez uygulanir; bu tablo hangi surumun uygulandigini tutar, boylece sonraki acilislar elle yapilan degisikligi
-- bozmaz. Yalnizca demo profilinde yazilir.
CREATE TABLE demo_scenario (
    version    INT         PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
