-- Migration : joueurs actuellement dans la Ligue américaine (David, 2026-11-04)
--
-- Une ligne par joueur de notre base présent dans l'alignement actuel d'un club de l'AHL et
-- absent de tout alignement de la LNH. Écrite une fois par jour par
-- python_script/scrape_ahl_assignments.py (seulement les lignes qui changent, voir db_diff.py).
-- Lue par l'app (app/lib/ahlAssignments.ts) pour le badge « AHL », en cache tant que la version
-- `ahl` de data_versions ne bouge pas.
--
-- À exécuter dans Supabase SQL Editor (staging puis prod).

CREATE TABLE IF NOT EXISTS player_ahl_assignments (
  player_id      INTEGER     PRIMARY KEY,
  ahl_team_code  TEXT        NOT NULL,
  ahl_team_name  TEXT        NOT NULL,
  since          DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE player_ahl_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lecture publique player_ahl_assignments" ON player_ahl_assignments;
CREATE POLICY "lecture publique player_ahl_assignments" ON player_ahl_assignments FOR SELECT USING (true);

-- Version de cache (voir data_versions.sql)
INSERT INTO data_versions (key) VALUES ('ahl') ON CONFLICT (key) DO NOTHING;

DROP TRIGGER IF EXISTS trg_data_version ON player_ahl_assignments;
CREATE TRIGGER trg_data_version AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON player_ahl_assignments
  FOR EACH STATEMENT EXECUTE FUNCTION bump_data_version('ahl');

-- Vérification : SELECT count(*) FROM player_ahl_assignments;
