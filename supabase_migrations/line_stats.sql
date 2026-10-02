-- Migration 2026-10-02 : stats des trios et paires (David) — MoneyPuck lines.csv, 5 contre 5,
-- python_script/import_advanced_stats.py, page /analytique/trios.
-- À exécuter une seule fois dans le SQL Editor Supabase (staging d'abord, puis prod).
--
-- Une ligne par combinaison réellement utilisée dans une saison (année de début). line_id = les
-- nhl_id des joueurs collés bout à bout ; player_ids les donne séparément. kind : line (trio) ou
-- pairing (paire). stats = sous-ensemble de colonnes MoneyPuck (STATS_LIGNES du script).
CREATE TABLE IF NOT EXISTS line_advanced_stats (
  season SMALLINT NOT NULL,
  line_id TEXT NOT NULL,
  kind VARCHAR(8) NOT NULL CHECK (kind IN ('line', 'pairing')),
  team VARCHAR(5),
  name TEXT,
  player_ids INTEGER[] NOT NULL,
  games_played INTEGER NOT NULL DEFAULT 0,
  icetime INTEGER NOT NULL DEFAULT 0,  -- secondes
  stats JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (season, line_id)
);
CREATE INDEX IF NOT EXISTS line_advanced_stats_team_idx ON line_advanced_stats (season, team);
ALTER TABLE line_advanced_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique line_advanced_stats" ON line_advanced_stats;
CREATE POLICY "Lecture publique line_advanced_stats" ON line_advanced_stats FOR SELECT USING (true);
