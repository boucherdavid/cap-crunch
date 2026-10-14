-- Migration : numéros de version des données mises en cache par l'app (David, 2026-10-14)
--
-- Le classement (buildStandings) et les blessures étaient recalculés à chaque visite alors
-- qu'ils ne changent qu'à un import ou à un mouvement (CPU de la prod saturé le 2026-10-14).
-- L'app les met maintenant en cache avec ce numéro de version dans la clé
-- (app/lib/dataVersion.ts) : toute écriture dans une table source incrémente la version,
-- y compris depuis les imports Python ou le SQL Editor — aucun écrivain ne peut être oublié.
--
-- Triggers « par requête » (FOR EACH STATEMENT) : une seule mise à jour par écriture, peu
-- importe le nombre de lignes touchées.
--
-- À exécuter dans Supabase SQL Editor (staging puis prod).

CREATE TABLE IF NOT EXISTS data_versions (
  key         TEXT        PRIMARY KEY,
  version     BIGINT      NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO data_versions (key) VALUES ('standings'), ('injuries')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE data_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lecture publique data_versions" ON data_versions;
CREATE POLICY "lecture publique data_versions" ON data_versions FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION bump_data_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE data_versions SET version = version + 1, updated_at = now() WHERE key = ANY (TG_ARGV);
  RETURN NULL;
END $$;

-- Classement : alignements, historique des statuts, matchs, pointage, saisons, noms/équipes
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pooler_rosters', 'roster_change_log', 'scoring_config', 'pool_seasons', 'poolers', 'teams'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_data_version ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_data_version AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I
                    FOR EACH STATEMENT EXECUTE FUNCTION bump_data_version(''standings'')', t);
  END LOOP;
END $$;

-- Matchs et fiches des joueurs : classement ET blessures (« a rejoué récemment », nhl_id)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['player_game_logs', 'players'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_data_version ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_data_version AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I
                    FOR EACH STATEMENT EXECUTE FUNCTION bump_data_version(''standings'', ''injuries'')', t);
  END LOOP;
END $$;

-- Blessures : liste des blessés et seuils LTIR
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['player_injuries', 'app_settings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_data_version ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_data_version AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I
                    FOR EACH STATEMENT EXECUTE FUNCTION bump_data_version(''injuries'')', t);
  END LOOP;
END $$;

-- Vérification : SELECT * FROM data_versions;  (la version monte à chaque écriture)
