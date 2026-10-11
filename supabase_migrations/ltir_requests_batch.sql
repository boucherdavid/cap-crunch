-- Demande de LTIR avec le reste du panier (David, 2026-10-11).
--
-- Un pooler qui met un joueur sur LTIR (avec ou sans signature) peut ajuster son alignement dans
-- le même panier. Avant, seul le LTIR attendait l'approbation et le reste du panier s'appliquait
-- tout de suite, validé sur l'alignement d'avant le LTIR (ex. : activer un réserviste refusé,
-- 13 actifs). Désormais, tout le panier attend l'approbation et s'applique d'un coup, validé sur
-- l'état final (app/lib/ltirRequests.ts).
--
-- new_player_type : statut choisi pour l'agent libre signé (actif ou réserviste). NULL = ancien
--   comportement (même statut que le joueur mis sur LTIR).
-- extra_actions   : autres mouvements du panier, [{ label, action }] — `action` au format
--   BatchActionInput (app/app/gestion-effectifs/actions.ts), `label` pour l'affichage.
--
-- À exécuter une seule fois dans le SQL Editor Supabase (staging d'abord, puis prod).

ALTER TABLE ltir_requests ADD COLUMN IF NOT EXISTS new_player_type VARCHAR(20);
ALTER TABLE ltir_requests ADD COLUMN IF NOT EXISTS extra_actions JSONB;
