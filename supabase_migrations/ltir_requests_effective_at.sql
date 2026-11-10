-- Heure d'effet d'une demande de LTIR (David, 2026-11-10) — calculée à la soumission avec la même
-- règle que Gestion d'effectifs (computeBatchEffectiveDate) : l'heure de la soumission, ou le
-- lendemain à 8 h (heure de l'Est) si un match d'un joueur touché par la demande était déjà
-- commencé. L'approbation applique la demande à cette heure-là. NULL pour les demandes plus
-- anciennes : l'app retombe alors sur l'horaire prévu des matchs (lib/ltirRequests.ts).
-- Staging d'abord, puis prod.

ALTER TABLE ltir_requests ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ;
