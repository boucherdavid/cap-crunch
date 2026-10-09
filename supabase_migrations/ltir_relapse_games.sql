-- Rechute d'un joueur sur LTIR (David, 2026-10-09) — voir app/lib/ltirReturns.ts : un joueur qui
-- a rejoué puis se blesse de nouveau avant d'être réintégré doit manquer N matchs consécutifs de
-- son équipe pour que le retour obligatoire soit annulé. À exécuter une seule fois dans le SQL
-- Editor Supabase (staging, puis prod). Sans elle, l'app applique le défaut de 2 matchs.

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS ltir_relapse_games INTEGER NOT NULL DEFAULT 2;
