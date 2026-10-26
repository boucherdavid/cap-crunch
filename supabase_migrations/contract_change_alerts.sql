-- Salaires modifiés d'un import à l'autre (David, 2026-10-26) — filet de sécurité après
-- Duchene (rachat NSH additionné à son contrat DAL). import_supabase.py y inscrit chaque cap
-- d'une saison active ou future qui change de valeur (ou passe à vide) ; l'app avise les admins
-- (push + courriel, une fois par lot) et les liste sur /admin/donnees jusqu'à ce qu'ils soient vus.
CREATE TABLE IF NOT EXISTS contract_change_alerts (
  id BIGSERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  old_cap NUMERIC,
  new_cap NUMERIC,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  seen_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS contract_change_alerts_unseen_idx
  ON contract_change_alerts (detected_at DESC) WHERE seen_at IS NULL;
CREATE INDEX IF NOT EXISTS contract_change_alerts_unnotified_idx
  ON contract_change_alerts (id) WHERE notified_at IS NULL;

-- Écritures et lectures par le client admin (service role) seulement.
ALTER TABLE contract_change_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin lit contract_change_alerts" ON contract_change_alerts FOR SELECT
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
