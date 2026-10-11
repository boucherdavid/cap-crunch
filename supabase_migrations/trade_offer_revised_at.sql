-- Modifier son offre d'échange sans attendre la réponse (David, 2026-10-11).
--
-- revised_at : date de la dernière modification des éléments d'une offre (révision par le
-- proposeur ou contre-offre). Sert aussi de numéro de version : « Accepter » et « Contre-offre »
-- envoient la version affichée, refusée si l'offre a changé entre-temps (app/lib/tradeOffers.ts).
-- NULL = jamais modifiée.
--
-- À exécuter une seule fois dans le SQL Editor Supabase (staging d'abord, puis prod).

ALTER TABLE trade_offers ADD COLUMN IF NOT EXISTS revised_at TIMESTAMPTZ;
