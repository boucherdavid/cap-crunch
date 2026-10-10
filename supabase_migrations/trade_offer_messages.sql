-- Discussion entre les deux poolers d'un échange proposé + contre-offre + retrait (David,
-- 2026-10-10, demande d'un pooler).
--
-- trade_offer_messages : messages courts échangés pendant la vie d'une offre. Le premier peut
-- être le texte joint à la proposition ; author_pooler_id NULL = ligne automatique (ex. « X a
-- fait une contre-offre »). Lecture/écriture permises aux deux poolers tant que l'offre n'est
-- pas réglée, puis lecture seule, et suppression 7 jours après resolved_at (nettoyage paresseux,
-- app/lib/tradeOffers.ts).
--
-- CONFIDENTIALITÉ : RLS activée SANS aucune politique (même règle que watchlists) → aucun accès
-- par l'API publique, admin compris. Tout passe par createAdminClient() filtré sur les deux
-- poolers de l'offre. L'admin ne lit une discussion que si les DEUX poolers l'ont partagée
-- (proposer_shares_chat_at et target_shares_chat_at non nuls) — pour départager un désaccord.
--
-- trade_offers.status gagne la valeur 'withdrawn' (retirée par le proposeur, ou abandonnée par
-- l'un des deux après l'acceptation) — VARCHAR(20) sans CHECK, rien à modifier.
--
-- À exécuter une seule fois dans le SQL Editor Supabase (staging d'abord, puis prod).

CREATE TABLE trade_offer_messages (
  id SERIAL PRIMARY KEY,
  trade_offer_id INTEGER NOT NULL REFERENCES trade_offers(id) ON DELETE CASCADE,
  author_pooler_id UUID REFERENCES poolers(id) ON DELETE SET NULL,
  body VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trade_offer_messages_offer_idx ON trade_offer_messages (trade_offer_id, created_at);

ALTER TABLE trade_offer_messages ENABLE ROW LEVEL SECURITY;

-- Partage de la discussion avec l'admin, par chaque pooler (les deux colonnes sont permutées
-- avec proposer/target lors d'une contre-offre).
ALTER TABLE trade_offers ADD COLUMN IF NOT EXISTS proposer_shares_chat_at TIMESTAMPTZ;
ALTER TABLE trade_offers ADD COLUMN IF NOT EXISTS target_shares_chat_at TIMESTAMPTZ;
-- Dernière contre-offre (affichage « Contre-offre de X »), NULL = offre d'origine.
ALTER TABLE trade_offers ADD COLUMN IF NOT EXISTS countered_at TIMESTAMPTZ;
