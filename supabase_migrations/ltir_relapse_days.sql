-- Rechute d'un joueur sur LTIR (David, 2026-10-09) — voir app/lib/ltirReturns.ts : un joueur qui
-- a rejoué puis se blesse de nouveau avant d'être réintégré doit rester blessé N jours sans
-- rejouer pour que le retour obligatoire soit annulé. À exécuter une seule fois dans le SQL Editor
-- Supabase (staging, puis prod). Sans elle, l'app applique le défaut de 3 jours.

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS ltir_relapse_days INTEGER NOT NULL DEFAULT 3;
