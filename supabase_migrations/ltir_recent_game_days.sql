-- Règle 0 d'admissibilité LTIR (David, 2026-10-05) — voir app/lib/ltirEligibility.ts : un joueur
-- qui a joué un match de la LNH depuis moins de N jours n'est pas admissible, même s'il est encore
-- listé blessé. À exécuter une seule fois dans le SQL Editor Supabase (staging, puis prod).

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS ltir_recent_game_days INTEGER NOT NULL DEFAULT 7;
