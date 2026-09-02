-- =============================================
-- HOCKEY POOL - Schéma de base de données
-- À exécuter dans Supabase SQL Editor
-- =============================================

-- Équipes LNH
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  code VARCHAR(3) UNIQUE NOT NULL,  -- ANA, BOS, MTL, etc.
  name VARCHAR(100) NOT NULL,
  city VARCHAR(100)
);

-- Joueurs LNH
CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  nhl_id INTEGER UNIQUE,            -- identifiant NHL officiel (api-web.nhle.com)
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  team_id INTEGER REFERENCES teams(id),
  position VARCHAR(20),             -- C, LW, RW, LD, RD, G
  age DECIMAL(4,1),
  status VARCHAR(10),               -- ELC, UFA, RFA
  is_available BOOLEAN DEFAULT true,
  is_rookie BOOLEAN DEFAULT false,
  draft_year INTEGER,
  draft_round INTEGER,
  draft_overall INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contrats multi-saisons par joueur
CREATE TABLE player_contracts (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  season VARCHAR(10) NOT NULL,      -- '2025-26', '2026-27', etc.
  cap_number DECIMAL(12,2),
  contract_status VARCHAR(10),      -- ELC, UFA, RFA
  years_remaining INTEGER,
  UNIQUE(player_id, season)
);

-- Saisons du pool
CREATE TABLE pool_seasons (
  id SERIAL PRIMARY KEY,
  season VARCHAR(10) UNIQUE NOT NULL,  -- '2025-26'
  nhl_cap DECIMAL(12,2) NOT NULL,      -- plafond réel NHL (ex: 95500000)
  cap_multiplier DECIMAL(5,4) NOT NULL DEFAULT 1.24,  -- facteur configurable (ex: 1.24 = 124%)
  pool_cap DECIMAL(12,2) GENERATED ALWAYS AS (CEIL(nhl_cap * cap_multiplier / 1000000) * 1000000) STORED,
  is_active BOOLEAN DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT true,  -- masque une saison inactive des sélecteurs publics (transactions, repêchage recrues) — n'affecte jamais la saison active elle-même
  saison_start_date DATE,                -- début du comptage; NULL = saison déjà démarrée
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 2026-08-23 : is_public sur pool_seasons
-- À exécuter une seule fois dans le SQL Editor Supabase si la table existe déjà :
--
-- ALTER TABLE pool_seasons ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

-- Poolers (liés aux comptes Supabase Auth)
CREATE TABLE poolers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alignements des poolers
CREATE TABLE pooler_rosters (
  id SERIAL PRIMARY KEY,
  pooler_id UUID REFERENCES poolers(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  pool_season_id INTEGER REFERENCES pool_seasons(id) ON DELETE CASCADE,
  player_type VARCHAR(20) NOT NULL CHECK (player_type IN ('actif', 'recrue', 'reserviste')),
  is_active BOOLEAN DEFAULT true,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  UNIQUE(pooler_id, player_id, pool_season_id)
);

-- Choix de repêchage du pool (actifs échangeables)
CREATE TABLE pool_draft_picks (
  id SERIAL PRIMARY KEY,
  pool_season_id INTEGER REFERENCES pool_seasons(id) ON DELETE CASCADE,
  original_owner_id UUID REFERENCES poolers(id) ON DELETE SET NULL,
  current_owner_id UUID REFERENCES poolers(id) ON DELETE SET NULL,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 4),
  is_used BOOLEAN DEFAULT false,
  UNIQUE(pool_season_id, original_owner_id, round)
);

-- Trigger : auto-créer les 4 choix pour tout nouveau pooler sur les saisons actives
CREATE OR REPLACE FUNCTION create_picks_for_new_pooler()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO pool_draft_picks (pool_season_id, original_owner_id, current_owner_id, round)
  SELECT s.id, NEW.id, NEW.id, r.round
  FROM pool_seasons s
  CROSS JOIN (VALUES (1),(2),(3),(4)) AS r(round)
  WHERE s.is_active = true
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_picks_on_new_pooler
  AFTER INSERT ON poolers
  FOR EACH ROW EXECUTE FUNCTION create_picks_for_new_pooler();

-- Historique des changements d'alignement
CREATE TABLE roster_changes (
  id SERIAL PRIMARY KEY,
  pooler_id UUID REFERENCES poolers(id),
  pool_season_id INTEGER REFERENCES pool_seasons(id),
  player_in_id INTEGER REFERENCES players(id),
  player_out_id INTEGER REFERENCES players(id),
  change_type VARCHAR(30) NOT NULL CHECK (
    change_type IN ('echange', 'agent_libre', 'recrue', 'remplacement_blessure', 'activation', 'desactivation')
  ),
  notes TEXT,
  changed_by UUID REFERENCES poolers(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- roster_change_log et player_stat_snapshots existent déjà en staging ET prod, créées
-- directement à un moment donné, jamais ajoutées ici avant le 2026-08-27 — documentées après
-- coup en reconstruisant la structure depuis les colonnes observées en base (types/contraintes
-- exactes non garanties byte-exact, juste ce qui est nécessaire pour comprendre le schéma).
--
-- roster_change_log est la vraie table utilisée par statusAt()/buildStandings()
-- (app/lib/standings.ts) — PAS roster_changes ci-dessus (colonnes différentes,
-- player_in_id/player_out_id vs player_id/old_type/new_type ; roster_changes a 0 lignes en
-- staging, semble être une table legacy jamais réellement utilisée). Voir CLAUDE.md section 6
-- pour la mécanique complète (statusAt, fenêtres actives, changement de type).
CREATE TABLE roster_change_log (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  pooler_id UUID REFERENCES poolers(id),
  pool_season_id INTEGER REFERENCES pool_seasons(id),
  change_type VARCHAR(30),
  old_type VARCHAR(20),
  new_type VARCHAR(20),
  changed_by UUID REFERENCES poolers(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  is_admin_override BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  pick_id INTEGER REFERENCES pool_draft_picks(id)
);

-- Snapshots de stats pris à l'activation/désactivation d'un joueur (surtout pool des séries —
-- app/app/gestion-series/playoff-pool-actions.ts) ; sert de référence pour calculer les points
-- gagnés durant une fenêtre active sans reparcourir tout l'historique de matchs.
CREATE TABLE player_stat_snapshots (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  pooler_id UUID REFERENCES poolers(id),
  pool_season_id INTEGER REFERENCES pool_seasons(id),
  snapshot_type VARCHAR(20),
  taken_at TIMESTAMPTZ DEFAULT NOW(),
  goals INTEGER,
  assists INTEGER,
  goalie_wins INTEGER,
  goalie_otl INTEGER,
  goalie_shutouts INTEGER
);

-- Tables du pool des séries (app/app/gestion-series/playoff-pool-actions.ts). Existent déjà
-- en staging ET prod, jamais documentées ici avant le 2026-08-27 — même situation que
-- roster_change_log/player_stat_snapshots. CLAUDE.md mentionnait par erreur
-- "series_round_rosters", qui n'existe pas — la vraie table est playoff_pool_rosters.
CREATE TABLE playoff_pool_rosters (
  id SERIAL PRIMARY KEY,
  pooler_id UUID REFERENCES poolers(id),
  player_id INTEGER REFERENCES players(id),
  pool_season_id INTEGER REFERENCES pool_seasons(id),
  position_slot VARCHAR(10),
  is_active BOOLEAN DEFAULT true,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  removal_reason VARCHAR(20)
);

CREATE TABLE playoff_participating_teams (
  id SERIAL PRIMARY KEY,
  pool_season_id INTEGER REFERENCES pool_seasons(id),
  team_id INTEGER REFERENCES teams(id)
);

CREATE TABLE playoff_eliminations (
  id SERIAL PRIMARY KEY,
  pool_season_id INTEGER REFERENCES pool_seasons(id),
  team_id INTEGER REFERENCES teams(id)
);

-- Pas de colonne id — clé primaire composite (pool_season_id, pooler_id), voir l'upsert
-- onConflict correspondant dans playoff-pool-actions.ts.
CREATE TABLE playoff_pool_standings_cache (
  pool_season_id INTEGER REFERENCES pool_seasons(id),
  pooler_id UUID REFERENCES poolers(id),
  total_pts NUMERIC(6,1),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pool_season_id, pooler_id)
);

-- Configuration du pointage (saison régulière et séries)
CREATE TABLE scoring_config (
  id              SERIAL PRIMARY KEY,
  stat_key        TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  points          NUMERIC(4,1) NOT NULL DEFAULT 1,
  points_playoffs NUMERIC(4,1) DEFAULT NULL,
  scope           TEXT NOT NULL DEFAULT 'both' CHECK (scope IN ('regular', 'playoffs', 'both'))
);

-- Transactions entre poolers
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  pool_season_id INTEGER REFERENCES pool_seasons(id),
  notes TEXT,
  created_by UUID REFERENCES poolers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE transaction_items (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
  action_type VARCHAR(20) NOT NULL CHECK (action_type IN (
    'transfer', 'promote', 'sign', 'reactivate', 'release', 'type_change'
  )),
  from_pooler_id UUID REFERENCES poolers(id),
  to_pooler_id UUID REFERENCES poolers(id),
  player_id INTEGER REFERENCES players(id),
  pick_id INTEGER REFERENCES pool_draft_picks(id),
  old_player_type VARCHAR(20),
  new_player_type VARCHAR(20)
);

-- =============================================
-- MIGRATIONS
-- =============================================

-- Migration 2026-04-03 (session 3) : ajout des colonnes de repêchage sur players
-- À exécuter une seule fois dans le SQL Editor Supabase si la table existe déjà :
--
-- ALTER TABLE players ADD COLUMN IF NOT EXISTS draft_year INTEGER;
-- ALTER TABLE players ADD COLUMN IF NOT EXISTS draft_round INTEGER;
-- ALTER TABLE players ADD COLUMN IF NOT EXISTS draft_overall INTEGER;

-- Migration 2026-04-07 : is_elc par année de contrat sur player_contracts
-- À exécuter une seule fois dans le SQL Editor Supabase :
--
-- ALTER TABLE player_contracts ADD COLUMN IF NOT EXISTS is_elc BOOLEAN NOT NULL DEFAULT false;

-- Migration 2026-04-07 : ajout du type 'ltir' (liste de blessés long terme)
-- À exécuter une seule fois dans le SQL Editor Supabase :
--
-- ALTER TABLE pooler_rosters DROP CONSTRAINT pooler_rosters_player_type_check;
-- ALTER TABLE pooler_rosters ADD CONSTRAINT pooler_rosters_player_type_check
--   CHECK (player_type IN ('actif', 'reserviste', 'recrue', 'ltir'));

-- Migration 2026-04-06 : rookie_type + pool_draft_year sur pooler_rosters
-- À exécuter une seule fois dans le SQL Editor Supabase :
--
-- ALTER TABLE pooler_rosters
--   ADD COLUMN IF NOT EXISTS rookie_type VARCHAR(20)
--     CHECK (rookie_type IN ('repeche', 'agent_libre'));
-- ALTER TABLE pooler_rosters
--   ADD COLUMN IF NOT EXISTS pool_draft_year INTEGER;

-- Migration 2026-04-06 : cap_multiplier + formule pool_cap arrondie au million supérieur
-- À exécuter une seule fois dans le SQL Editor Supabase :
--
-- ALTER TABLE pool_seasons ADD COLUMN IF NOT EXISTS cap_multiplier DECIMAL(5,4) NOT NULL DEFAULT 1.24;
-- ALTER TABLE pool_seasons DROP COLUMN pool_cap;
-- ALTER TABLE pool_seasons ADD COLUMN pool_cap DECIMAL(12,2)
--   GENERATED ALWAYS AS (CEIL(nhl_cap * cap_multiplier / 1000000) * 1000000) STORED;
-- -- Corriger le nhl_cap de la saison 2025-26 (95.5M) et vérifier le pool_cap résultant :
-- UPDATE pool_seasons SET nhl_cap = 95500000 WHERE season = '2025-26';

-- Migration 2026-04-12 : tables transactions et transaction_items
-- À exécuter une seule fois dans le SQL Editor Supabase :
--
-- CREATE TABLE transactions (
--   id SERIAL PRIMARY KEY,
--   pool_season_id INTEGER REFERENCES pool_seasons(id),
--   notes TEXT,
--   created_by UUID REFERENCES poolers(id),
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );
-- CREATE TABLE transaction_items (
--   id SERIAL PRIMARY KEY,
--   transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
--   action_type VARCHAR(20) NOT NULL CHECK (action_type IN (
--     'transfer', 'promote', 'sign', 'reactivate', 'release', 'type_change'
--   )),
--   from_pooler_id UUID REFERENCES poolers(id),
--   to_pooler_id UUID REFERENCES poolers(id),
--   player_id INTEGER REFERENCES players(id),
--   pick_id INTEGER REFERENCES pool_draft_picks(id),
--   old_player_type VARCHAR(20),
--   new_player_type VARCHAR(20)
-- );
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Lecture publique transactions" ON transactions FOR SELECT USING (true);
-- CREATE POLICY "Lecture publique transaction_items" ON transaction_items FOR SELECT USING (true);
-- CREATE POLICY "Admin modifie transactions" ON transactions FOR ALL
--   USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
-- CREATE POLICY "Admin modifie transaction_items" ON transaction_items FOR ALL
--   USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Migration 2026-04-09 : draft_pick_id sur pooler_rosters (lien explicite pick <-> recrue)
-- À exécuter une seule fois dans le SQL Editor Supabase :
--
-- ALTER TABLE pooler_rosters
--   ADD COLUMN IF NOT EXISTS draft_pick_id INTEGER REFERENCES pool_draft_picks(id) ON DELETE SET NULL;

-- Migration 2026-04-09 : table pool_draft_picks (choix de repêchage échangeables)
-- À exécuter une seule fois dans le SQL Editor Supabase :
--
-- CREATE TABLE pool_draft_picks (
--   id SERIAL PRIMARY KEY,
--   pool_season_id INTEGER REFERENCES pool_seasons(id) ON DELETE CASCADE,
--   original_owner_id UUID REFERENCES poolers(id) ON DELETE SET NULL,
--   current_owner_id UUID REFERENCES poolers(id) ON DELETE SET NULL,
--   round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 4),
--   is_used BOOLEAN DEFAULT false,
--   UNIQUE(pool_season_id, original_owner_id, round)
-- );
-- ALTER TABLE pool_draft_picks ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Lecture publique picks" ON pool_draft_picks FOR SELECT USING (true);
-- CREATE POLICY "Admin modifie picks" ON pool_draft_picks FOR ALL
--   USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
--
-- Trigger : auto-créer les 4 choix pour tout nouveau pooler
-- CREATE OR REPLACE FUNCTION create_picks_for_new_pooler()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   INSERT INTO pool_draft_picks (pool_season_id, original_owner_id, current_owner_id, round)
--   SELECT s.id, NEW.id, NEW.id, r.round
--   FROM pool_seasons s
--   CROSS JOIN (VALUES (1),(2),(3),(4)) AS r(round)
--   WHERE s.is_active = true
--   ON CONFLICT DO NOTHING;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;
-- CREATE TRIGGER trigger_picks_on_new_pooler
--   AFTER INSERT ON poolers
--   FOR EACH ROW EXECUTE FUNCTION create_picks_for_new_pooler();
--
-- Seed initial : choix pour les poolers déjà existants (à n'exécuter qu'une fois)
-- INSERT INTO pool_draft_picks (pool_season_id, original_owner_id, current_owner_id, round)
-- SELECT s.id, p.id, p.id, r.round
-- FROM pool_seasons s
-- CROSS JOIN poolers p
-- CROSS JOIN (VALUES (1),(2),(3),(4)) AS r(round)
-- WHERE s.is_active = true
-- ON CONFLICT DO NOTHING;

-- Migration 2026-04-03 : remplacement de 'agent_libre' par 'reserviste'
-- À exécuter une seule fois dans le SQL Editor Supabase si la table existe déjà :
--
-- UPDATE pooler_rosters SET player_type = 'reserviste' WHERE player_type = 'agent_libre';
-- ALTER TABLE pooler_rosters DROP CONSTRAINT pooler_rosters_player_type_check;
-- ALTER TABLE pooler_rosters ADD CONSTRAINT pooler_rosters_player_type_check
--   CHECK (player_type IN ('actif', 'recrue', 'reserviste'));

-- Migration 2026-08-25 : tables meeting_polls / meeting_poll_dates / meeting_poll_responses
-- (sondage de planification, /planification) — à exécuter une seule fois dans le SQL Editor
-- Supabase (staging d'abord, puis prod une fois validé) :
--
-- CREATE TABLE meeting_polls (
--   id SERIAL PRIMARY KEY,
--   title VARCHAR(200) NOT NULL,
--   is_active BOOLEAN NOT NULL DEFAULT true,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );
-- CREATE TABLE meeting_poll_dates (
--   id SERIAL PRIMARY KEY,
--   poll_id INTEGER REFERENCES meeting_polls(id) ON DELETE CASCADE,
--   candidate_date DATE NOT NULL,
--   UNIQUE(poll_id, candidate_date)
-- );
-- CREATE TABLE meeting_poll_responses (
--   id SERIAL PRIMARY KEY,
--   poll_id INTEGER REFERENCES meeting_polls(id) ON DELETE CASCADE,
--   pooler_id UUID REFERENCES poolers(id) ON DELETE CASCADE,
--   candidate_date DATE NOT NULL,
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   UNIQUE(poll_id, pooler_id, candidate_date)
-- );
-- ALTER TABLE meeting_polls ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE meeting_poll_dates ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE meeting_poll_responses ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Lecture publique meeting_polls" ON meeting_polls FOR SELECT USING (true);
-- CREATE POLICY "Admin gère meeting_polls" ON meeting_polls FOR ALL
--   USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
-- CREATE POLICY "Lecture publique meeting_poll_dates" ON meeting_poll_dates FOR SELECT USING (true);
-- CREATE POLICY "Admin gère meeting_poll_dates" ON meeting_poll_dates FOR ALL
--   USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
-- CREATE POLICY "Lecture publique meeting_poll_responses" ON meeting_poll_responses FOR SELECT USING (true);
-- CREATE POLICY "Pooler gère ses réponses" ON meeting_poll_responses FOR ALL
--   USING (pooler_id = auth.uid() OR EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Migration 2026-08-25 (suite) : table app_settings (toggle Navbar "avant-première
-- Planification") — à exécuter une seule fois dans le SQL Editor Supabase (staging d'abord) :
--
-- CREATE TABLE app_settings (
--   id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
--   nav_planification_only BOOLEAN NOT NULL DEFAULT false
-- );
-- INSERT INTO app_settings (id) VALUES (1);
-- ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Lecture publique app_settings" ON app_settings FOR SELECT USING (true);
-- CREATE POLICY "Admin modifie app_settings" ON app_settings FOR ALL
--   USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Migration 2026-09-02 : retrait du "Mode avant-première" (toggle Navbar, code retiré) —
-- exécutée dans le SQL Editor Supabase (staging puis prod) :
--
-- ALTER TABLE app_settings DROP COLUMN nav_planification_only;

-- Migration 2026-09-02 (suite) : babillard global (communications admin → poolers) —
-- distinct du babillard de /planification (meeting_poll_comments, propre au sondage de
-- rencontre) — exécutée dans le SQL Editor Supabase (staging puis prod) :
--
-- CREATE TABLE bulletin_posts (
--   id BIGSERIAL PRIMARY KEY,
--   author_id UUID NOT NULL REFERENCES poolers(id),
--   title TEXT NOT NULL,
--   body TEXT NOT NULL,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
-- CREATE TABLE bulletin_comments (
--   id BIGSERIAL PRIMARY KEY,
--   post_id BIGINT NOT NULL REFERENCES bulletin_posts(id) ON DELETE CASCADE,
--   pooler_id UUID NOT NULL REFERENCES poolers(id),
--   body TEXT NOT NULL,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
-- ALTER TABLE bulletin_posts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bulletin_comments ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Lecture publique bulletin_posts" ON bulletin_posts FOR SELECT USING (true);
-- CREATE POLICY "Admin gère bulletin_posts" ON bulletin_posts FOR ALL
--   USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
-- CREATE POLICY "Lecture publique bulletin_comments" ON bulletin_comments FOR SELECT USING (true);
-- CREATE POLICY "Pooler ajoute ses commentaires" ON bulletin_comments FOR INSERT
--   WITH CHECK (pooler_id = auth.uid());
-- CREATE POLICY "Auteur supprime son commentaire" ON bulletin_comments FOR DELETE
--   USING (pooler_id = auth.uid());
-- CREATE POLICY "Admin gère bulletin_comments" ON bulletin_comments FOR ALL
--   USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Migration 2026-08-25 (suite) : tables push_subscriptions et notification_log — existaient
-- déjà en prod (créées directement, jamais documentées) mais absentes en staging, cause de
-- l'erreur "Could not find the table 'public.push_subscriptions'" en cliquant "Activer les
-- notifications" sur /compte en staging. À exécuter une seule fois dans le SQL Editor
-- Supabase — STAGING SEULEMENT, prod les a déjà :
--
-- CREATE TABLE push_subscriptions (
--   id SERIAL PRIMARY KEY,
--   user_id UUID REFERENCES poolers(id) ON DELETE CASCADE,
--   endpoint TEXT NOT NULL,
--   p256dh TEXT NOT NULL,
--   auth TEXT NOT NULL,
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   UNIQUE(user_id, endpoint)
-- );
-- ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Admin gère push_subscriptions" ON push_subscriptions FOR ALL
--   USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
--
-- notification_log existe déjà en staging (vérifié) — rien à faire pour celle-ci, incluse
-- ici seulement par souci de complétude du schéma de référence :
-- CREATE TABLE notification_log (
--   id SERIAL PRIMARY KEY,
--   title TEXT NOT NULL,
--   body TEXT NOT NULL,
--   url TEXT,
--   sent_at TIMESTAMPTZ DEFAULT NOW(),
--   read_at TIMESTAMPTZ
-- );
-- ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Admin gère notification_log" ON notification_log FOR ALL
--   USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Migration 2026-08-27 : conformité cap continue (unsigned_player_cap_multiplier,
-- cap_deadline_days sur app_settings + table cap_signing_watch) — à exécuter une seule fois
-- dans le SQL Editor Supabase (staging d'abord) :
--
-- ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS unsigned_player_cap_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.20;
-- ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS cap_deadline_days INTEGER NOT NULL DEFAULT 7;
--
-- CREATE TABLE cap_signing_watch (
--   id SERIAL PRIMARY KEY,
--   pooler_id UUID REFERENCES poolers(id) ON DELETE CASCADE,
--   player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
--   pool_season_id INTEGER REFERENCES pool_seasons(id) ON DELETE CASCADE,
--   status VARCHAR(20) NOT NULL DEFAULT 'watching'
--     CHECK (status IN ('watching', 'flagged', 'resolved', 'admin_released')),
--   estimated_cap NUMERIC(12,2),
--   real_cap NUMERIC(12,2),
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   flagged_at TIMESTAMPTZ,
--   deadline_at TIMESTAMPTZ,
--   resolved_at TIMESTAMPTZ,
--   released_by UUID REFERENCES poolers(id),
--   UNIQUE(pooler_id, player_id, pool_season_id)
-- );
-- ALTER TABLE cap_signing_watch ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Lecture publique cap_signing_watch" ON cap_signing_watch FOR SELECT USING (true);
-- CREATE POLICY "Admin gère cap_signing_watch" ON cap_signing_watch FOR ALL
--   USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Migration 2026-08-25 (suite) : table meeting_poll_comments (babillard de la planification)
-- — à exécuter une seule fois dans le SQL Editor Supabase (staging d'abord) :
--
-- CREATE TABLE meeting_poll_comments (
--   id SERIAL PRIMARY KEY,
--   poll_id INTEGER REFERENCES meeting_polls(id) ON DELETE CASCADE,
--   pooler_id UUID REFERENCES poolers(id) ON DELETE CASCADE,
--   body TEXT NOT NULL,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );
-- ALTER TABLE meeting_poll_comments ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Lecture publique meeting_poll_comments" ON meeting_poll_comments FOR SELECT USING (true);
-- CREATE POLICY "Pooler ajoute ses commentaires" ON meeting_poll_comments FOR INSERT
--   WITH CHECK (pooler_id = auth.uid());
-- CREATE POLICY "Auteur supprime son commentaire" ON meeting_poll_comments FOR DELETE
--   USING (pooler_id = auth.uid());
-- CREATE POLICY "Admin gère meeting_poll_comments" ON meeting_poll_comments FOR ALL
--   USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
--
-- Si le schema cache de PostgREST ne voit pas les nouvelles tables tout de suite après
-- exécution (erreur "Could not find the table 'public.xxx' in the schema cache") :
-- NOTIFY pgrst, 'reload schema';

-- =============================================
-- DONNÉES INITIALES
-- =============================================

-- Saison active
INSERT INTO pool_seasons (season, nhl_cap, is_active)
VALUES ('2025-26', 88000000, true);

-- Pointage par défaut
INSERT INTO scoring_config (stat_key, label, points, points_playoffs, scope) VALUES
  ('goal',           'But',                                    1.0, NULL, 'both'),
  ('assist',         'Passe',                                  1.0, NULL, 'both'),
  ('goalie_win',     'Victoire (gardien)',                     2.0, NULL, 'both'),
  ('goalie_otl',     'Défaite en prol./fusillade (gardien)',   1.0, NULL, 'both'),
  ('goalie_shutout', 'Blanchissage (gardien)',                 2.0, NULL, 'both'),
  ('gwg',            'But gagnant (attaquant)',                0.0, 1.0, 'both');

-- Quelques équipes LNH pour commencer
INSERT INTO teams (code, name, city) VALUES
  ('ANA', 'Ducks', 'Anaheim'),
  ('BOS', 'Bruins', 'Boston'),
  ('BUF', 'Sabres', 'Buffalo'),
  ('CGY', 'Flames', 'Calgary'),
  ('CAR', 'Hurricanes', 'Carolina'),
  ('CHI', 'Blackhawks', 'Chicago'),
  ('COL', 'Avalanche', 'Colorado'),
  ('CBJ', 'Blue Jackets', 'Columbus'),
  ('DAL', 'Stars', 'Dallas'),
  ('DET', 'Red Wings', 'Detroit'),
  ('EDM', 'Oilers', 'Edmonton'),
  ('FLA', 'Panthers', 'Florida'),
  ('LAK', 'Kings', 'Los Angeles'),
  ('MIN', 'Wild', 'Minnesota'),
  ('MTL', 'Canadiens', 'Montreal'),
  ('NSH', 'Predators', 'Nashville'),
  ('NJD', 'Devils', 'New Jersey'),
  ('NYI', 'Islanders', 'New York'),
  ('NYR', 'Rangers', 'New York'),
  ('OTT', 'Senators', 'Ottawa'),
  ('PHI', 'Flyers', 'Philadelphia'),
  ('PIT', 'Penguins', 'Pittsburgh'),
  ('SEA', 'Kraken', 'Seattle'),
  ('SJS', 'Sharks', 'San Jose'),
  ('STL', 'Blues', 'St. Louis'),
  ('TBL', 'Lightning', 'Tampa Bay'),
  ('TOR', 'Maple Leafs', 'Toronto'),
  ('UTA', 'Hockey Club', 'Utah'),
  ('VAN', 'Canucks', 'Vancouver'),
  ('VGK', 'Golden Knights', 'Vegas'),
  ('WSH', 'Capitals', 'Washington'),
  ('WPG', 'Jets', 'Winnipeg');

-- =============================================
-- SÉCURITÉ (Row Level Security)
-- =============================================

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE poolers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pooler_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_changes ENABLE ROW LEVEL SECURITY;

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique transactions" ON transactions FOR SELECT USING (true);
CREATE POLICY "Lecture publique transaction_items" ON transaction_items FOR SELECT USING (true);
CREATE POLICY "Admin modifie transactions" ON transactions FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admin modifie transaction_items" ON transaction_items FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE pool_draft_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique picks" ON pool_draft_picks FOR SELECT USING (true);
CREATE POLICY "Admin modifie picks" ON pool_draft_picks FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

ALTER TABLE scoring_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique scoring" ON scoring_config FOR SELECT USING (true);
CREATE POLICY "Admin modifie scoring" ON scoring_config FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Tout le monde peut lire les équipes et joueurs
CREATE POLICY "Lecture publique teams" ON teams FOR SELECT USING (true);
CREATE POLICY "Lecture publique players" ON players FOR SELECT USING (true);
CREATE POLICY "Lecture publique contracts" ON player_contracts FOR SELECT USING (true);
CREATE POLICY "Lecture publique saisons" ON pool_seasons FOR SELECT USING (true);

-- Tout le monde peut voir les poolers et alignements
CREATE POLICY "Lecture publique poolers" ON poolers FOR SELECT USING (true);
CREATE POLICY "Lecture publique rosters" ON pooler_rosters FOR SELECT USING (true);
CREATE POLICY "Lecture publique changements" ON roster_changes FOR SELECT USING (true);

-- Seuls les admins peuvent modifier les joueurs/équipes/contrats
CREATE POLICY "Admin modifie players" ON players FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admin modifie teams" ON teams FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admin modifie contracts" ON player_contracts FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admin modifie saisons" ON pool_seasons FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Un pooler peut modifier son propre alignement
CREATE POLICY "Pooler modifie son roster" ON pooler_rosters FOR ALL
  USING (pooler_id = auth.uid() OR EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Pooler ajoute changements" ON roster_changes FOR INSERT
  WITH CHECK (changed_by = auth.uid());
CREATE POLICY "Lecture changements propres" ON roster_changes FOR SELECT USING (true);

-- Un pooler peut voir et modifier son propre profil
CREATE POLICY "Pooler gère son profil" ON poolers FOR ALL
  USING (id = auth.uid() OR EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Retours des poolers (bugs, suggestions)
CREATE TABLE feedback (
  id SERIAL PRIMARY KEY,
  pooler_id UUID REFERENCES poolers(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('bug', 'suggestion', 'autre')),
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau', 'lu', 'résolu')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Un pooler peut soumettre et voir ses propres retours
CREATE POLICY "Pooler soumet feedback" ON feedback FOR INSERT
  WITH CHECK (pooler_id = auth.uid());
CREATE POLICY "Pooler voit son feedback" ON feedback FOR SELECT
  USING (pooler_id = auth.uid() OR EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Seul l'admin peut tout voir et modifier
CREATE POLICY "Admin gère feedback" ON feedback FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Sondage de planification (ex: rencontre annuelle) — /planification, hors Navbar
CREATE TABLE meeting_polls (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE meeting_poll_dates (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER REFERENCES meeting_polls(id) ON DELETE CASCADE,
  candidate_date DATE NOT NULL,
  UNIQUE(poll_id, candidate_date)
);

CREATE TABLE meeting_poll_responses (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER REFERENCES meeting_polls(id) ON DELETE CASCADE,
  pooler_id UUID REFERENCES poolers(id) ON DELETE CASCADE,
  candidate_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, pooler_id, candidate_date)
);

ALTER TABLE meeting_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_poll_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_poll_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture publique meeting_polls" ON meeting_polls FOR SELECT USING (true);
CREATE POLICY "Admin gère meeting_polls" ON meeting_polls FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Lecture publique meeting_poll_dates" ON meeting_poll_dates FOR SELECT USING (true);
CREATE POLICY "Admin gère meeting_poll_dates" ON meeting_poll_dates FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Lecture publique : le tableau récapitulatif (qui est dispo quand) est visible à tous les
-- poolers, pas juste l'admin — comme un vrai Doodle.
CREATE POLICY "Lecture publique meeting_poll_responses" ON meeting_poll_responses FOR SELECT USING (true);
CREATE POLICY "Pooler gère ses réponses" ON meeting_poll_responses FOR ALL
  USING (pooler_id = auth.uid() OR EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Réglages globaux de l'app (une seule ligne, id=1).
-- unsigned_player_cap_multiplier/cap_deadline_days : voir "Conformité cap" plus bas.
CREATE TABLE app_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  unsigned_player_cap_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.20,
  cap_deadline_days INTEGER NOT NULL DEFAULT 7
);
INSERT INTO app_settings (id) VALUES (1);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique app_settings" ON app_settings FOR SELECT USING (true);
CREATE POLICY "Admin modifie app_settings" ON app_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Abonnements aux notifications push (un par appareil/navigateur). Créée directement en prod
-- à un moment donné, jamais ajoutée ici avant le 2026-08-25 — documentée après coup en
-- reconstruisant la structure depuis le code (app/app/compte/push-actions.ts, app/lib/push.ts).
-- RLS admin-only : tout accès applicatif passe par le client admin (service role, contourne
-- RLS) dans les Server Actions, jamais directement par le client anon/authenticated.
CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES poolers(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gère push_subscriptions" ON push_subscriptions FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Journal des notifications push envoyées aux admins (affiché sous Admin → Messages →
-- Notifications). Même situation que push_subscriptions — jamais documentée avant le
-- 2026-08-25 malgré une utilisation existante en prod.
CREATE TABLE notification_log (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gère notification_log" ON notification_log FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Conformité cap continue : un joueur actif sans contrat pour la saison affiche un cap simulé
-- (app_settings.unsigned_player_cap_multiplier × cap de la saison précédente, voir
-- app/lib/capUtils.ts). Cette table suit chaque (pooler, joueur, saison) surveillé, du moment
-- où le cap est simulé jusqu'à la résolution une fois le vrai contrat connu — vérification
-- manuelle admin (bouton "Vérifier les signatures", /admin/effectifs?tab=conformite), jamais
-- de libération automatique.
CREATE TABLE cap_signing_watch (
  id SERIAL PRIMARY KEY,
  pooler_id UUID REFERENCES poolers(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  pool_season_id INTEGER REFERENCES pool_seasons(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'watching'
    CHECK (status IN ('watching', 'flagged', 'resolved', 'admin_released')),
  estimated_cap NUMERIC(12,2),
  real_cap NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  flagged_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  released_by UUID REFERENCES poolers(id),
  UNIQUE(pooler_id, player_id, pool_season_id)
);

ALTER TABLE cap_signing_watch ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique cap_signing_watch" ON cap_signing_watch FOR SELECT USING (true);
CREATE POLICY "Admin gère cap_signing_watch" ON cap_signing_watch FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Babillard de commentaires sur le sondage de planification — /planification
CREATE TABLE meeting_poll_comments (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER REFERENCES meeting_polls(id) ON DELETE CASCADE,
  pooler_id UUID REFERENCES poolers(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE meeting_poll_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique meeting_poll_comments" ON meeting_poll_comments FOR SELECT USING (true);
CREATE POLICY "Pooler ajoute ses commentaires" ON meeting_poll_comments FOR INSERT
  WITH CHECK (pooler_id = auth.uid());
CREATE POLICY "Auteur supprime son commentaire" ON meeting_poll_comments FOR DELETE
  USING (pooler_id = auth.uid());
CREATE POLICY "Admin gère meeting_poll_comments" ON meeting_poll_comments FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

-- Babillard global — communications de l'admin à tout le pool, commentables par les
-- poolers. Distinct du babillard ci-dessus (propre au sondage de planification). /babillard
CREATE TABLE bulletin_posts (
  id BIGSERIAL PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES poolers(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bulletin_comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES bulletin_posts(id) ON DELETE CASCADE,
  pooler_id UUID NOT NULL REFERENCES poolers(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bulletin_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture publique bulletin_posts" ON bulletin_posts FOR SELECT USING (true);
CREATE POLICY "Admin gère bulletin_posts" ON bulletin_posts FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Lecture publique bulletin_comments" ON bulletin_comments FOR SELECT USING (true);
CREATE POLICY "Pooler ajoute ses commentaires" ON bulletin_comments FOR INSERT
  WITH CHECK (pooler_id = auth.uid());
CREATE POLICY "Auteur supprime son commentaire" ON bulletin_comments FOR DELETE
  USING (pooler_id = auth.uid());
CREATE POLICY "Admin gère bulletin_comments" ON bulletin_comments FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
