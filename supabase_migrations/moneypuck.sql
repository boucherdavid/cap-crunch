-- Migration 2026-10-01 : MoneyPuck (David) — 3e source de blessures + stats avancées.
-- À exécuter une seule fois dans le SQL Editor Supabase (staging d'abord, puis prod).

-- 1. Blessures : recoupement MoneyPuck par nhl_id (python_script/scrape_injuries.py).
--    mp_status = statut officiel de la liste des blessés de l'équipe : IR, IR-LT (LTIR LNH),
--    IR-NR, DTD, O, DD — IR* rend le joueur admissible au LTIR (app/lib/ltirEligibility.ts).
ALTER TABLE player_injuries ADD COLUMN IF NOT EXISTS mp_status VARCHAR(10);
ALTER TABLE player_injuries ADD COLUMN IF NOT EXISTS mp_return_date DATE;
ALTER TABLE player_injuries ADD COLUMN IF NOT EXISTS mp_games_missed INTEGER;
ALTER TABLE player_injuries ADD COLUMN IF NOT EXISTS mp_games_to_miss INTEGER;
ALTER TABLE player_injuries ADD COLUMN IF NOT EXISTS mp_description VARCHAR(100);

-- 2. Stats avancées (python_script/import_advanced_stats.py, page /admin/stats-avancees).
--    Une ligne par saison (année de début, 2025 = 2025-26), situation et joueur ; `stats` =
--    sous-ensemble de colonnes MoneyPuck (voir STATS_PATINEURS / STATS_GARDIENS du script).
CREATE TABLE IF NOT EXISTS player_advanced_stats (
  season SMALLINT NOT NULL,
  nhl_id INTEGER NOT NULL,
  situation VARCHAR(10) NOT NULL CHECK (situation IN ('all', '5on5', '5on4', '4on5')),
  kind VARCHAR(6) NOT NULL CHECK (kind IN ('skater', 'goalie')),
  name TEXT,
  team VARCHAR(5),
  position VARCHAR(3),
  games_played INTEGER NOT NULL DEFAULT 0,
  icetime INTEGER NOT NULL DEFAULT 0,  -- secondes
  stats JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (season, situation, nhl_id)
);
CREATE INDEX IF NOT EXISTS player_advanced_stats_kind_idx ON player_advanced_stats (season, situation, kind);
ALTER TABLE player_advanced_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique player_advanced_stats" ON player_advanced_stats;
CREATE POLICY "Lecture publique player_advanced_stats" ON player_advanced_stats FOR SELECT USING (true);
