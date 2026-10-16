-- Rappels avant les dates limites (David, 2026-10-16) — chaque rappel n'est envoyé qu'une fois.
-- Le code tolère l'absence de ces colonnes (aucun rappel tant que la migration n'est pas roulée).

-- Ballotage : rappel le dernier jour aux poolers qui n'ont ni réclamé ni refusé.
ALTER TABLE waiver_claims ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
-- Ballotage remporté : rappel au gagnant 24 h avant la fin de son délai de 48 h.
ALTER TABLE waiver_claims ADD COLUMN IF NOT EXISTS completion_reminder_sent_at TIMESTAMPTZ;
-- Échange approuvé : rappel 1 jour avant la fin du délai au pooler qui n'a pas confirmé.
ALTER TABLE trade_offers ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
-- Plafond dépassé après une signature : rappel 2 jours avant la date limite.
ALTER TABLE cap_signing_watch ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
