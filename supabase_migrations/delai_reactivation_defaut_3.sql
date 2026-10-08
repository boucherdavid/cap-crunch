-- Délai de réactivation : 3 jours par défaut (David, 2026-10-08) — c'est la valeur utilisée
-- dans le pool ; l'ancien défaut de 7 obligeait à la corriger à chaque nouvelle saison.
ALTER TABLE pool_seasons ALTER COLUMN delai_reactivation_jours SET DEFAULT 3;

-- Saisons déjà créées à l'avance (pas encore démarrées) et restées à l'ancien défaut.
UPDATE pool_seasons
SET delai_reactivation_jours = 3
WHERE delai_reactivation_jours = 7
  AND COALESCE(season_started, false) = false;
