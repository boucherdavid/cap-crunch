-- Listes de joueurs à surveiller (« Mes listes »), David 2026-09-27 — aide-mémoire privé de
-- chaque pooler : joueurs disponibles qui l'intéressent (agents libres) ou recrues du dernier
-- repêchage LNH, à consulter pendant la saison et surtout le soir du pool. Un joueur déjà pris
-- n'est pas supprimé de la liste : il est masqué à l'affichage (calculé à la volée).
--
-- CONFIDENTIALITÉ : RLS activée SANS aucune politique → aucun accès par l'API publique, même
-- pour un admin (l'admin est aussi un pooler et ne doit pas voir les listes des autres). Tout
-- accès passe par createAdminClient() dans app/app/listes/actions.ts, filtré sur
-- l'utilisateur authentifié.

CREATE TABLE watchlists (
  id SERIAL PRIMARY KEY,
  pooler_id UUID NOT NULL REFERENCES poolers(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('joueurs', 'recrues')),
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pooler_id, kind, name)
);

CREATE TABLE watchlist_items (
  id SERIAL PRIMARY KEY,
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL DEFAULT 0,
  note VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (watchlist_id, player_id)
);

CREATE INDEX watchlist_items_watchlist_idx ON watchlist_items (watchlist_id, rank);

ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;

-- Même règle pour les scénarios de /simulation : la politique d'origine donnait à l'admin la
-- lecture de TOUS les scénarios via l'API. L'app n'en a jamais eu besoin (service role partout,
-- voir app/app/simulation/actions.ts) — retirée pour que personne, admin compris, ne puisse lire
-- les scénarios d'un autre pooler.
DROP POLICY IF EXISTS "Admin gère simulation_scenarios" ON simulation_scenarios;
