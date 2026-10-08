-- Signatures et échanges de la LNH lus sur ESPN (David, 2026-10-08) — voir
-- app/lib/nhlTransactions.ts. Une ligne par transaction ; la clé primaire sert de verrou contre
-- les notifications en double quand deux pages lancent la détection en même temps.
CREATE TABLE IF NOT EXISTS nhl_transaction_alerts (
  key TEXT PRIMARY KEY,              -- date|équipe|description
  tx_date DATE NOT NULL,
  team TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nhl_transaction_alerts_date_idx ON nhl_transaction_alerts (tx_date DESC);

ALTER TABLE nhl_transaction_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique nhl_transaction_alerts" ON nhl_transaction_alerts FOR SELECT USING (true);
CREATE POLICY "Admin gère nhl_transaction_alerts" ON nhl_transaction_alerts FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
