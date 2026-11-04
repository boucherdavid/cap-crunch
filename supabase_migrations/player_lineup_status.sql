-- Migration : joueurs laissés de côté par leur équipe de la LNH (« healthy scratch ») — David, 2026-11-04
--
-- Une ligne par joueur de notre base présent dans l'alignement actuel d'une équipe de la LNH.
-- Écrite une fois par jour par python_script/scrape_ahl_assignments.py (seulement les lignes
-- qui changent) :
--   team_code        équipe de la LNH dont il est dans l'alignement
--   on_roster_since  premier jour où il a été vu dans cet alignement (repart à zéro après un
--                    rappel ou un échange — les matchs d'avant ne comptent pas comme « ratés »)
--   games_missed     matchs consécutifs de son équipe (déjà importés) qu'il n'a pas joués,
--                    depuis son dernier match ou son arrivée
--   last_played      date de son dernier match joué (fenêtre de 45 jours), NULL si aucun
-- L'app applique les seuils (app_settings ci-dessous) et retire les blessés à l'affichage.
--
-- À exécuter dans Supabase SQL Editor (staging puis prod).

CREATE TABLE IF NOT EXISTS player_lineup_status (
  player_id        INTEGER     PRIMARY KEY,
  team_code        TEXT        NOT NULL,
  on_roster_since  DATE        NOT NULL DEFAULT CURRENT_DATE,
  games_missed     INTEGER     NOT NULL DEFAULT 0,
  last_played      DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_lineup_status_missed
  ON player_lineup_status(games_missed) WHERE games_missed > 0;

ALTER TABLE player_lineup_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lecture publique player_lineup_status" ON player_lineup_status;
CREATE POLICY "lecture publique player_lineup_status" ON player_lineup_status FOR SELECT USING (true);

-- Seuils réglables (Configuration → Général) : matchs consécutifs ratés avant le badge.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS scratch_skater_games INTEGER NOT NULL DEFAULT 2;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS scratch_goalie_games INTEGER NOT NULL DEFAULT 5;

-- Version de cache (voir data_versions.sql). app_settings incrémente déjà « injuries ».
INSERT INTO data_versions (key) VALUES ('lineup') ON CONFLICT (key) DO NOTHING;

DROP TRIGGER IF EXISTS trg_data_version ON player_lineup_status;
CREATE TRIGGER trg_data_version AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON player_lineup_status
  FOR EACH STATEMENT EXECUTE FUNCTION bump_data_version('lineup');

-- Vérification : SELECT games_missed, count(*) FROM player_lineup_status GROUP BY 1 ORDER BY 1;
