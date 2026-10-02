-- Migration 2026-10-02 : trios, paires et unités spéciales actuels (David) — source Daily
-- Faceoff, python_script/scrape_line_combos.py, page /analytique/trios.
-- À exécuter une seule fois dans le SQL Editor Supabase (staging d'abord, puis prod).
--
-- Une ligne par joueur et par groupe (un joueur du 1er trio qui joue aussi en avantage numérique
-- a deux lignes). group_id : f1-f4 (trios), d1-d3 (paires), g (gardiens), pp1-pp2 (avantage
-- numérique), pk1-pk2 (désavantage), ir (blessés). Remplacement complet par équipe à chaque
-- passage du script. player_id NULL = joueur non jumelé à une fiche (nom gardé pour l'affichage).
CREATE TABLE IF NOT EXISTS team_line_combos (
  team_code VARCHAR(5) NOT NULL,
  group_id VARCHAR(8) NOT NULL,
  slot SMALLINT NOT NULL,
  category VARCHAR(4),
  position_id VARCHAR(6),
  player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  player_name TEXT NOT NULL,
  injury_status VARCHAR(20),
  source_name TEXT,
  source_updated_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_code, group_id, slot)
);
CREATE INDEX IF NOT EXISTS team_line_combos_player_idx ON team_line_combos (player_id);
ALTER TABLE team_line_combos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique team_line_combos" ON team_line_combos;
CREATE POLICY "Lecture publique team_line_combos" ON team_line_combos FOR SELECT USING (true);
