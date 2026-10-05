-- Suivi des retours au jeu des joueurs sur LTIR (David, 2026-10-05) — voir app/lib/ltirReturns.ts.
-- À exécuter une seule fois dans le SQL Editor Supabase (staging d'abord, puis prod).
--
-- Une ligne par joueur sur LTIR détecté de retour :
--   reason = 'played'      → il a joué un match de la LNH : le pooler et les admins sont avertis,
--                            deadline_at = date limite pour le remettre dans l'alignement.
--   reason = 'not_injured' → il n'est plus listé blessé par aucune source mais n'a pas encore
--                            joué : admins seulement, pas de date limite. Passe à 'played' au
--                            premier match.
-- resolved_at est rempli dès que le joueur n'est plus sur LTIR chez ce pooler.

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS ltir_return_deadline_days INTEGER NOT NULL DEFAULT 14;

CREATE TABLE IF NOT EXISTS ltir_return_watch (
  id SERIAL PRIMARY KEY,
  pool_season_id INTEGER NOT NULL REFERENCES pool_seasons(id) ON DELETE CASCADE,
  pooler_id UUID NOT NULL REFERENCES poolers(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reason VARCHAR(20) NOT NULL,              -- 'played' | 'not_injured'
  first_game_date DATE,                     -- premier match joué pendant le LTIR
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at TIMESTAMPTZ,                  -- minuit ET après le dernier jour permis
  reminder_sent_at TIMESTAMPTZ,
  overdue_notified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

-- Un seul suivi ouvert par joueur et par pooler : sert aussi de verrou contre les notifications
-- en double quand deux pages lancent la détection en même temps.
CREATE UNIQUE INDEX IF NOT EXISTS ltir_return_watch_open_idx
  ON ltir_return_watch (pool_season_id, pooler_id, player_id) WHERE resolved_at IS NULL;

ALTER TABLE ltir_return_watch ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique ltir_return_watch" ON ltir_return_watch FOR SELECT USING (true);
CREATE POLICY "Admin gère ltir_return_watch" ON ltir_return_watch FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
