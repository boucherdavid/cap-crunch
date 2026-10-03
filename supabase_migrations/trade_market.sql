-- Marché des échanges (David, 2026-10-03) — page /marche-echanges.
--
-- trade_market_listings : un joueur (actif, réserviste ou recrue) ou un choix de repêchage mis
-- sur le marché par son propriétaire, avec une note facultative et une date d'expiration choisie
-- par lui (dernier jour où l'élément est affiché). Retrait à la main, ou automatique au chargement
-- (date passée, joueur échangé/libéré, choix échangé/utilisé) — voir app/lib/tradeMarket.ts.
--
-- trade_market_requests : « Je cherche » — un besoin publié sans joueur précis (ex : un
-- défenseur droitier sous 3 M$), même expiration.
--
-- RLS « lecture publique + admin gère », même patron que trade_offers/waiver_claims : toutes les
-- écritures passent par createAdminClient() depuis des Server Actions qui vérifient elles-mêmes
-- que l'utilisateur est bien le propriétaire. À exécuter une seule fois dans le SQL Editor
-- Supabase (staging d'abord, puis prod).

CREATE TABLE IF NOT EXISTS trade_market_listings (
  id SERIAL PRIMARY KEY,
  pool_season_id INTEGER NOT NULL REFERENCES pool_seasons(id) ON DELETE CASCADE,
  pooler_id UUID NOT NULL REFERENCES poolers(id) ON DELETE CASCADE,
  item_type VARCHAR(10) NOT NULL CHECK (item_type IN ('player', 'pick')),
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  pick_id INTEGER REFERENCES pool_draft_picks(id) ON DELETE CASCADE,
  note VARCHAR(300),
  expires_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((item_type = 'player' AND player_id IS NOT NULL AND pick_id IS NULL)
      OR (item_type = 'pick' AND pick_id IS NOT NULL AND player_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_market_listings_player_uq
  ON trade_market_listings (pool_season_id, pooler_id, player_id) WHERE player_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trade_market_listings_pick_uq
  ON trade_market_listings (pool_season_id, pooler_id, pick_id) WHERE pick_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS trade_market_requests (
  id SERIAL PRIMARY KEY,
  pool_season_id INTEGER NOT NULL REFERENCES pool_seasons(id) ON DELETE CASCADE,
  pooler_id UUID NOT NULL REFERENCES poolers(id) ON DELETE CASCADE,
  -- 'attaquant' | 'defenseur' | 'gardien' | 'recrue' | 'choix' | NULL (autre)
  category VARCHAR(12),
  description VARCHAR(300) NOT NULL,
  expires_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE trade_market_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique trade_market_listings" ON trade_market_listings;
CREATE POLICY "Lecture publique trade_market_listings" ON trade_market_listings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin gère trade_market_listings" ON trade_market_listings;
CREATE POLICY "Admin gère trade_market_listings" ON trade_market_listings FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE trade_market_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique trade_market_requests" ON trade_market_requests;
CREATE POLICY "Lecture publique trade_market_requests" ON trade_market_requests FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin gère trade_market_requests" ON trade_market_requests;
CREATE POLICY "Admin gère trade_market_requests" ON trade_market_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
