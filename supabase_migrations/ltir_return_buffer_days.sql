-- Admissibilité LTIR (David, 2026-11-01) — voir app/lib/ltirEligibility.ts : la règle « retour
-- annoncé » mesure maintenant la durée totale de l'absence prévue, et exige seulement qu'il
-- reste au moins N jours avant la date de retour (tampon anti-abus). À exécuter une seule fois
-- dans le SQL Editor Supabase (staging, puis prod). Sans elle, l'app applique le défaut de 2 jours.

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS ltir_return_buffer_days INTEGER NOT NULL DEFAULT 2;
