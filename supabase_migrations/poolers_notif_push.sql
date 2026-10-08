-- Choix « notifications push » mémorisé sur le compte (David, 2026-10-08) — l'abonnement
-- lui-même (push_subscriptions) vit dans le navigateur et se perd lors d'une mise à jour, d'une
-- expiration ou quand les données du navigateur sont vidées. Avec ce choix sur le compte, l'app
-- rétablit l'abonnement toute seule (voir app/components/PushRestore.tsx).
ALTER TABLE poolers ADD COLUMN IF NOT EXISTS notif_push BOOLEAN NOT NULL DEFAULT false;

-- Poolers déjà abonnés sur au moins un appareil : leur choix est « activé ».
UPDATE poolers
SET notif_push = true
WHERE id IN (SELECT DISTINCT user_id FROM push_subscriptions);
