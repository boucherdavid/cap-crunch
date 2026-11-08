-- Migration : règle contournée par un admin, indiquée publiquement (David, 2026-11-08)
--
-- L'admin n'est jamais bloqué par les règles de Gestion d'effectifs (durée minimale sur LTIR,
-- délai de réactivation, composition et plafond, budget de signatures, joueur au ballotage), y
-- compris pour son propre alignement. Par transparence, chaque contournement est maintenant noté
-- (quelle règle, pour quel joueur) et affiché dans l'historique du pooler, le panneau des
-- mouvements et le Journal des activités. NULL = aucune règle contournée.
--
-- À exécuter dans Supabase SQL Editor (staging puis prod) AVANT de déployer le code qui lit ces
-- colonnes (sinon l'historique des alignements et le Journal des activités ne se chargent plus).

ALTER TABLE roster_change_log ADD COLUMN IF NOT EXISTS override_note TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS override_note TEXT;
