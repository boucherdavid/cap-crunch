-- Repère « Marqueur est à jour » (David, 2026-11-16) — onglet Marqueur de Gestion des effectifs :
-- la section « À saisir depuis ta dernière mise à jour » montre les transactions dont l'id dépasse
-- ce repère (l'id suit l'ordre de saisie, donc un mouvement saisi après coup avec une date passée
-- y paraît quand même). À exécuter une seule fois dans le SQL Editor Supabase (staging, puis prod).
-- Sans elle, la section affiche les 7 derniers jours et le bouton répond par une erreur claire.

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS marqueur_synced_tx_id INTEGER;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS marqueur_synced_at TIMESTAMPTZ;
