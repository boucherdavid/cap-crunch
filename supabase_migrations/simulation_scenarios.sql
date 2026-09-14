-- Scénarios sauvegardés de la page /simulation (David, 2026-09-14) — un pooler peut y tester
-- librement des ajouts/retraits sans toucher son alignement réel, et garder plusieurs scénarios
-- nommés en parallèle (ex: "Idée échange Steve", "Test si je coupe X").
--
-- RLS admin-only, même patron que push_subscriptions/transactions (voir schema.sql) : tout
-- accès applicatif passe par le client service role (createAdminClient()) dans les Server
-- Actions de app/app/simulation/actions.ts, après vérification que pooler_id correspond bien à
-- l'utilisateur authentifié — jamais directement par le client anon/authenticated.
CREATE TABLE simulation_scenarios (
  id SERIAL PRIMARY KEY,
  pooler_id UUID REFERENCES poolers(id) ON DELETE CASCADE,
  pool_season_id INTEGER REFERENCES pool_seasons(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pooler_id, pool_season_id, name)
);

ALTER TABLE simulation_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gère simulation_scenarios" ON simulation_scenarios FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
