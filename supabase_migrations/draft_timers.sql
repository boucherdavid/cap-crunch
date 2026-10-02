-- Migration 2026-10-02 : chronos de repêchage paramétrables (David).
-- À exécuter une seule fois dans le SQL Editor Supabase (staging d'abord, puis prod).

-- Durée d'un tour, en secondes — réglée dans Admin → Gestion du pool → Configuration → Général.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS rookie_draft_turn_seconds INTEGER NOT NULL DEFAULT 120;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS presaison_turn_seconds INTEGER NOT NULL DEFAULT 120;

-- État du chrono du repêchage des recrues, par saison (admin/repechage/actions.ts) : indicatif,
-- rien ne se passe à 00:00. turn_started_at NULL pendant que timer_active = en pause, et
-- turn_seconds tient alors les secondes restantes (même convention que presaison_draft_state).
ALTER TABLE pool_seasons ADD COLUMN IF NOT EXISTS rookie_draft_timer_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pool_seasons ADD COLUMN IF NOT EXISTS rookie_draft_turn_started_at TIMESTAMPTZ;
ALTER TABLE pool_seasons ADD COLUMN IF NOT EXISTS rookie_draft_turn_seconds INTEGER;
