-- Nouveau cycle de vie pré-saison / saison active (David, 2026-08-31).
-- season_started = true une fois que l'admin clique "Démarrer la saison" (/admin/nouvelle-saison).
-- Contrôle la validation+journalisation dans submitTransactionAction et
-- gestion-effectifs/submitBatchAction, et bloque l'auto-gestion des poolers avant.
-- Distinct de is_active (consultation, peut être activé tôt) et gestion_effectifs_ouvert
-- (gel indépendant, existant).
--
-- IMPORTANT : le DEFAULT true backfill automatiquement toutes les saisons déjà en base
-- (dont la saison active en cours) à true, pour ne pas leur retirer instantanément toute
-- validation/journalisation au déploiement. Le défaut est ensuite changé à false pour que
-- seules les saisons créées après ce point démarrent "non démarrées".

alter table pool_seasons
  add column season_started boolean not null default true;

alter table pool_seasons
  alter column season_started set default false;

comment on column pool_seasons.season_started is
  'True une fois que l''admin clique "Démarrer la saison" (/admin/nouvelle-saison). '
  'Contrôle la validation+journalisation dans submitTransactionAction et '
  'gestion-effectifs/submitBatchAction, et bloque l''auto-gestion des poolers avant. '
  'Distinct de is_active (consultation) et gestion_effectifs_ouvert (gel indépendant).';
