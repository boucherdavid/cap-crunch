-- Recherche de joueurs insensible aux accents cote serveur (searchFreeAgentsAction,
-- searchPlayersAction). Complement au fix cote client (app/lib/normalizeSearch.ts,
-- session 2026-08-31) qui ne couvrait pas les recherches passant par ILIKE Postgres.

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION search_players_unaccent(search_term text)
RETURNS SETOF players
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM players
  WHERE unaccent(first_name) ILIKE '%' || unaccent(search_term) || '%'
     OR unaccent(last_name)  ILIKE '%' || unaccent(search_term) || '%'
$$;
