# Cap Crunch — Référence Projet

Ce fichier sert de référence stable pour Claude Code.
Le suivi des changements, des décisions récentes et de l'état courant va dans `SUIVI_PROJET.md`.

---

## 1. Contexte du projet

Application web pour gérer un pool de hockey long terme, en remplacement d'un fichier Excel.

**Règles métier de base :**
- 8 poolers
- Alignement par pooler et par saison : 12 attaquants, 6 défenseurs, 2 gardiens (actifs) + minimum 2 réservistes
- Cap du pool = cap NHL × facteur (configurable, typiquement 1.24–1.25), arrondi au million supérieur
- La banque de recrues et les joueurs LTIR ne comptent pas dans la masse salariale
- Transactions gérées côté admin
- Historique conservé dans `transactions` et `transaction_items`
- Protection recrue : 5 saisons pour les repêchages, durée ELC pour les agents libres
- Calcul des points (`buildStandings()`) : seules les fenêtres où le joueur est réellement
  `actif` comptent — `recrue`/`reserviste`/`ltir` ne rapportent aucun point. Un joueur peut
  être actif plusieurs fois non consécutives dans une même saison (ex: réserve puis rappelé) ;
  chaque fenêtre active compte ses propres points, additionnés au total. Détails techniques
  (dates, `added_at`/`removed_at`, `roster_change_log`) en section 6.

**Stack :**
- Frontend : Next.js 16, React 19, TypeScript, Tailwind CSS 4
- Backend : Supabase (PostgreSQL, Auth, RLS)
- Hébergement : Vercel (`https://cap-crunch.vercel.app/`)
- Environnement staging distant (Vercel, branche `staging`, base Supabase staging, accessible
  aux poolers sans compte Vercel — SSO déploiement désactivé) :
  `https://cap-crunch-staging.vercel.app/`. Utile pour tester
  des fonctionnalités qui nécessitent une vraie participation à distance des poolers (ex: draft
  en direct, réponse au ballotage) — impossible à tester avec `npm run dev` local. Projets
  Vercel : `cap-crunch` (prod) et `cap-crunch-staging` (staging), tous deux liés au même repo
  GitHub `boucherdavid/cap-crunch`, `rootDirectory=app`. Repo GitHub renommé `cap-crunch`
  le 2026-07-27 (ex `DB_Hockey_Manager`) pour cohérence avec le nom de l'app.
- Différenciation visuelle local / staging / prod (raccourcis PWA installés) : `getAppEnv()`
  (`app/lib/appEnv.ts`) détecte l'environnement via `VERCEL_GIT_COMMIT_REF` (pas `VERCEL_ENV`,
  qui vaut `production` dans les deux projets Vercel) et pas de `process.env.VERCEL` en local.
  Utilisé par `manifest.ts` et `layout.tsx` pour ajouter un suffixe au nom (` (Local)` /
  ` (Staging)`) et pointer vers un jeu d'icônes distinct (`public/icons/local/`,
  `public/icons/staging/` — même pictogramme que `public/icons/` en prod, avec un badge de
  couleur "L"/"S" ajouté). Régénérer les 3 jeux d'icônes ensemble si le logo change (script
  ponctuel, pas de commande dédiée — voir session 2026-08-24 dans `SUIVI_PROJET.md`).

---

## 2. Commandes essentielles

```powershell
# Démarrer l'application en local (depuis la racine)
# Toujours contre staging — la prod réelle tourne sur Vercel, jamais démarrée/arrêtée localement.
./start_app.ps1

# Ou manuellement (utilise le contenu courant de app/.env.local, pas de bascule staging)
cd app && npm run dev

# Arrêter l'application
./stop_app.ps1
```

```powershell
# Pipeline complet (depuis la racine) — cible staging ou prod selon le script
./run_pipeline_staging.ps1   # SUPABASE_URL/SUPABASE_SERVICE_KEY pris dans python_script/.env.staging
./run_pipeline_prod.ps1      # SUPABASE_URL/SUPABASE_SERVICE_KEY pris dans python_script/.env — demande confirmation

# Passer des arguments au pipeline (ex: sans scraping)
./run_pipeline_staging.ps1 --no-scrape
```

**Convention** : après avoir validé un log `run_pipeline_staging_*.log` sans erreur, committer
et pousser les CSV modifiés (`python_script/PuckPedia_*.csv`, `python_script/teams_offline/*.csv`)
sur `main` — sans attendre la demande. Ça déclenche automatiquement
`.github/workflows/import.yml` (trigger sur push de `teams_offline/**.csv`), qui réimporte
vers **prod**. Le scraping est indépendant de la cible DB (même CSV peu importe staging/prod),
donc valider en staging avant de pousser suffit — pas besoin de rouler `run_pipeline_prod.ps1`
séparément pour les salaires/contrats/repêchage.

```bash
# Pipeline Python complet (manuel — cible toujours prod via python_script/.env,
# sauf si SUPABASE_URL/SUPABASE_SERVICE_KEY sont déjà définis dans la session)
cd python_script
python run_pipeline.py

# Sans scraping (import seul)
python run_pipeline.py --no-scrape

# Étapes individuelles
python scrape_puckpedia.py     # 1. Scraping PuckPedia → CSV
python import_supabase.py      # 2. Import joueurs/contrats → Supabase
python import_drafts.py        # 3. Import repêchages NHL (5 dernières saisons)
```

```bash
# Synchroniser l'historique de roster (pooler_rosters, roster_change_log, ownership des
# picks) de la saison régulière active, de staging vers prod — évite de ressaisir
# manuellement en prod une reconstruction d'historique déjà validée en staging.
# Portée limitée : PAS les joueurs/contrats (pipeline PuckPedia), PAS les comptes
# poolers, PAS la config de saison. Remplacement complet (delete + reinsert), jamais
# incrémental. Voir python_script/sync_staging_to_prod.py pour le détail du mapping
# joueurs (players.id peut diverger entre les deux bases — mappé par nhl_id puis nom).
cd python_script
python sync_staging_to_prod.py           # dry-run — aucune écriture, affiche le rapport
python sync_staging_to_prod.py --apply   # exécution réelle — demande confirmation "oui"
```

---

## 3. Structure du projet

```text
Hockey_Pool_App/
├── CLAUDE.md                  ← Ce fichier (référence stable)
├── SUIVI_PROJET.md            ← Journal de bord actif (à mettre à jour chaque session)
├── schema.sql                 ← Schéma de référence de la base de données
├── start_app.ps1              ← Démarrer l'app localement (toujours contre staging)
├── stop_app.ps1               ← Arrêter l'app localement
├── .mcp.json                  ← Configuration MCP pour Claude Code
├── .gitignore
├── .claude/
│   ├── settings.json
│   └── settings.local.json
├── .github/
│   └── workflows/
│       ├── import.yml             ← Pipeline auto (lundi 6h UTC + manuel)
│       └── keepalive_staging.yml  ← Ping staging (jeudi 6h UTC) pour éviter pause Supabase
├── app/                       ← Application Next.js
│   ├── CLAUDE.md              ← Règles spécifiques Next.js/TypeScript
│   ├── AGENTS.md
│   ├── proxy.ts               ← Auth middleware (PAS middleware.ts)
│   ├── next.config.ts
│   ├── app/                   ← Pages et composants
│   │   ├── components/
│   │   └── lib/
│   └── ...
├── python_script/             ← Pipeline de données
│   ├── run_pipeline.py        ← Point d'entrée principal
│   ├── scrape_puckpedia.py
│   ├── import_supabase.py
│   ├── import_drafts.py
│   ├── source/                ← CSV générés par le scraping
│   ├── teams_offline/
│   ├── diagnostics/
│   └── archive/
└── supabase_migrations/       ← Migrations SQL historiques
```

---

## 4. Base de données

**Tables principales :**
- `teams`, `players`, `player_contracts`
- `pool_seasons`, `poolers`, `pooler_rosters`
- `roster_change_log` (utilisée par `statusAt()`/`buildStandings()`, voir section 6 — PAS
  `roster_changes`, table legacy distincte, jamais réellement utilisée), `pool_draft_picks`
- `transactions`, `transaction_items`
- `scoring_config`
- `push_subscriptions` (notifications push)
- `player_stat_snapshots` (snapshots pour classements)
- `playoff_pool_rosters`, `playoff_participating_teams`, `playoff_eliminations`,
  `playoff_pool_standings_cache` (pool des séries — PAS `series_round_rosters`, qui
  n'existe pas malgré une ancienne mention ici)
- `cap_signing_watch` (conformité cap continue, voir section 6)

**Conventions :**
- Statuts joueurs : `ELC`, `RFA`, `UFA`
- Types de roster : `actif`, `reserviste`, `recrue`, `ltir`
- Types de recrue (`rookie_type`) : `repeche`, `agent_libre`
- `pool_seasons.is_playoff = true` → saison des séries active

---

## 5. Routes applicatives

Vérifié par lecture du code le 2026-07-17 (build `next build` + grep des liens réels) —
mettre à jour cette section dès qu'une route ou un onglet admin change (voir section 11).

**Utilisateur :**
`/` `/login` `/joueurs` `/statistiques` `/repechage` `/repechage-recrues` `/calendrier`
`/poolers` `/poolers/[id]` `/transactions` `/classement` `/resultats` (récap veille)
`/gestion-series` (soumettre ses choix séries) `/classement-series` (classement séries)
`/gestion-effectifs` `/draft-center` (classement des prospects, vue publique)
`/dashboard` (redirige vers son propre alignement) `/compte` `/signaler` `/aide` `/offline`
`/planification` (sondage type Doodle pour une rencontre — vue pooler : ses disponibilités,
le résumé, le babillard ; notifie les admins par push à chaque soumission/commentaire).
Gestion (créer le sondage, ajouter/retirer des dates, toggle "Mode avant-première") sur
`/admin/planification`, pas sur `/planification` elle-même.

**Menu pooler (`Navbar.tsx`) — réorganisé le 2026-08-30 :**

| Dropdown | Contenu |
|---|---|
| Alignements (ex-Pool Saison) | Mon équipe · Équipes · Transactions · Gestion d'effectifs |
| Classement | Saison complète · Hebdomadaire (à venir) · Mensuel (à venir) — sorti d'Alignements pour son propre menu |
| LNH | 3 sections : Statistiques (LNH, AHL à venir) · Calendrier · Contrats (ex-"Contrats LNH", ex-item à plat) |
| Repêchage | Classement des prospects · Repêchage LNH · Repêchage recrues — inchangé |
| Ressources (nouveau) | Planification · Aide & Règlements (déplacé du menu Compte/avatar) |

Pool Séries (`/gestion-series`, `/classement-series`, `/resultats`) retiré de la nav pooler le
même jour — route et code conservés, plus atteignable que par URL directe (le pool ne fait
habituellement pas de séries, même traitement que `/admin/series` le 2026-08-28). La prop
`newPlayoffActive`/`initialNewPlayoffActive` (calculée dans `layout.tsx` à partir de
`pool_seasons.is_playoff`) a été supprimée avec le bloc de nav qui l'utilisait.
Ressources est pensé comme un point de départ — le babillard (aujourd'hui propre au sondage
de planification) et une vraie documentation des outils/guide d'utilisateur pourraient s'y
ajouter plus tard, mais ce sont des chantiers de contenu séparés, pas encore construits.

Dans la même veine, les onglets `Pool Séries` et `Pointage Séries` de
`/admin/pool?tab=config` (`ConfigTabsClient.tsx`) sont masqués depuis le 2026-08-31 —
formulaires (`PlayoffConfigForm`, `ScoringConfigSeries`) et logique conservés dans le code,
simplement retirés de la liste `TABS` affichée. Pas de route séparée ici (état local du
composant, pas de `?subtab=`), donc pas d'accès par URL directe comme pour `/admin/series` —
à réintroduire dans `TABS` le jour où une saison séries est de nouveau préparée.

**Admin — pages hub avec onglets (`?tab=`), pas de routes à plat :**

| Hub | Onglets (`?tab=id` → label) |
|---|---|
| `/admin/pool` | `poolers` Poolers · `config` Configuration (sous-onglets `Saisons` / `Général` / `Pointage Saison` — `Général` = ex-"Pool Saison", renommé le 2026-09-01) |
| `/admin/communaute` | `communication` Communication (feedback + notifs) · `suivi` Suivi (activité) · `planification` Planification (sondage type Doodle, admin) |
| `/admin/init` | `rosters` Rosters initiaux · `recrues` Banque de recrues · `choix` Choix de repêchage (← réassigner le propriétaire d'un pick échangé hors-app) — réglages one-shot déjà en place pour la saison courante |
| `/admin/effectifs` | `mouvements` Mouvements · `transactions` Transactions · `historique` Historique (saisie historique manuelle) · `conformite` Conformité cap (joueurs sans contrat, cap simulé) |
| `/admin/donnees` | `pipeline` Pipeline salaires/contrats/repêchages (doc, `PlayerMerge`) · `prospects` Classement des prospects |
| `/admin/series` | pas d'onglets — vue unique (avancement des séries), message si aucune saison séries active. Retiré du dropdown Admin le 2026-08-28 (ne servait qu'aux tests, pas d'usage normal du pool des séries) — route et code conservés, toujours atteignable directement par URL. Depuis le 2026-08-30, également retiré du sous-menu "Pool Séries" côté pooler (voir ci-dessous) — plus aucun point d'entrée dans la nav, seulement l'URL directe |

`/admin/pool` et `/admin/communaute` (2026-09-01) : `/admin/pool` regroupait auparavant les 5
onglets Poolers/Configuration/Communication/Suivi/Planification, mais les deux premiers
(structurel — qui est dans le pool, les règles) et les trois derniers (opérationnel — parler
aux poolers, suivre l'activité) n'avaient plus de logique commune, juste de l'historique.
Séparés en deux hubs (David) — le dropdown Admin remonte de 6 à 7 entrées, compromis accepté
délibérément (à l'inverse de la consolidation du 2026-08-28, jugée moins importante ici que la
cohérence du regroupement). Contenu de chaque onglet inchangé, juste déplacé.

`/admin/init` a un 4ᵉ onglet valide non affiché dans sa barre d'onglets : `presaison`
(Pré-saison — ELC, libérations, repêchage des agents libres). Ce n'est plus un réglage
"déjà fait" pour la saison courante mais une étape récurrente à chaque transition — reste
accessible uniquement via `/admin/init?tab=presaison&saisonId=...`, lien fourni par le hub
`/admin/nouvelle-saison`.

Les onglets de `/admin/init` (y compris `presaison`) acceptent tous un `&saisonId=`
(sélecteur `SaisonSelectNav`, `app/app/admin/init/SaisonSelectNav.tsx`, même composant que
`/admin/repechage`) — pas limités à la saison active, pour permettre de préparer une saison
à l'avance avant de l'activer. Quand `/admin/init` ou `/admin/repechage` sont ouverts avec un
`saisonId` valide (donc depuis le hub), un lien "← Retour à Nouvelle saison"
(`app/components/AdminHubBackLink.tsx`) s'affiche en haut de page pour revenir choisir
l'étape suivante sans repasser par le menu Admin.

`/admin/planification` (gestion du sondage — créer/réinitialiser, dates candidates, toggle
"Mode avant-première") est depuis le 2026-08-28 une redirection volontaire vers
`/admin/communaute?tab=planification` (mise à jour le 2026-09-01, voir ci-dessus), même
pattern que `/admin/joueurs` et `/admin/draft-center` ci-dessous — la page publique
`/planification` (vue pooler) n'est pas affectée.

Repêchage annuel en direct (tableau de sélection) : route à part `/admin/repechage`
(pas un onglet — lien direct dans la Navbar), distinct de l'onglet `/admin/init?tab=choix`
qui ne sert qu'à réassigner un pick déjà existant.

`/admin/nouvelle-saison` : route à part (lien dans le dropdown Admin), hub orchestrateur qui
séquence dans l'ordre recommandé les étapes de préparation d'une saison à venir — transition
des rosters (`/admin/pool?tab=config`) → **activer la saison** → choix de repêchage →
repêchage des recrues → banque de recrues → pré-saison (ELC, libérations, repêchage des
agents libres, tout déjà intégré dans `PresaisonManager`) → **démarrer la saison** (dernière
étape). Chaque carte affiche un résumé en lecture seule (compteurs) et un lien qui
pré-sélectionne la saison choisie via `?saisonId=` sur l'outil existant — aucune logique
métier dupliquée, juste une orchestration/navigation, sauf la dernière carte (voir ci-dessous).
Remplace le contenu détaillé du panneau "Guide admin" (`AdminGuidePanel.tsx`), qui pointe
maintenant simplement vers ce hub.

**Activer vs démarrer — deux bascules distinctes** (David, 2026-08-31, voir aussi section 6) :
`is_active` (`activateSeasonAction`, `admin/config/actions.ts`) rend la saison consultable par
tous les poolers (alignements, classement, calendrier, banque de recrues) — déplacé tôt dans
la séquence pour que ce soit possible pendant que l'admin finit la pré-saison.
`pool_seasons.season_started` (nouvelle colonne) ne bascule qu'au clic sur "Démarrer la
saison" (dernière carte du hub, `DemarrerSaisonCard.tsx` + `nouvelle-saison/actions.ts` →
`demarrerSaisonAction`) — bloque si un pooler n'est pas conforme (12/6/2 actifs exactement,
min. 2 réservistes, cap — `app/lib/seasonConformity.ts`), sinon assigne `added_at` = date
réelle de début de saison à tous les actifs d'un coup et bascule `season_started=true`. Tant
que `season_started=false` : `/gestion-effectifs` reste fermé aux poolers (admins non
affectés), et les mutations pré-saison (`submitTransactionAction`, `PresaisonManager`) ne
valident ni ne journalisent rien — même philosophie "sans historique" que Mode init/Banque de
recrues (voir section 6).

`/admin/pool?tab=planification` gère le sondage `/planification` — créer/réinitialiser le
sondage, ajouter/retirer des dates candidates, toggle "Mode avant-première" (table
`app_settings.nav_planification_only` — masque le reste de la Navbar pour tous les poolers,
sauf l'admin lui-même, tant qu'actif). Route à part jusqu'au 2026-08-28 (voir
`/admin/planification` ci-dessus, désormais une redirection).

`/admin/joueurs`, `/admin/draft-center` et `/admin/planification` sont des redirections
volontaires vers les onglets équivalents de `/admin/pool` ou `/admin/donnees` (compat liens
existants) — pas des pages à part entière.

---

## 6. Contraintes techniques

**Convention — date historique d'un mouvement de roster :**
- Plusieurs interfaces permettent de saisir un mouvement (ajout/retrait/échange) à une date
  passée plutôt qu'à `now()` : `/gestion-effectifs` (admin, checkbox "Forcer une date
  effective" → `forcedDate`), `/admin/transactions` (`transactionDate`), `/admin/historique`,
  `adminInitRosterAction` (mode init, basé sur `saison_start_date`).
- **Règle obligatoire** : la date choisie doit être propagée à `pooler_rosters.added_at` /
  `removed_at` (et `roster_change_log.changed_at` si applicable) — PAS seulement à un champ
  d'affichage comme `transactions.created_at`. `buildStandings()` calcule les points en
  sommant les game-logs dans la fenêtre `added_at → removed_at` ; si cette fenêtre ne reflète
  pas la vraie date du mouvement, les points sont mal attribués.
- Avant de "corriger" ou d'ajouter une saisie de date historique quelque part : vérifier
  d'abord si un mécanisme de surcharge existe déjà (chercher `forcedDate`, `transactionDate`,
  `changedAt`, `txTs`) avant de supposer qu'il faut le construire.
- Bug corrigé le 2026-06-20 dans `/admin/transactions` (`submitTransactionAction`) : la date
  historique n'était appliquée qu'à `transactions.created_at`, pas aux mutations réelles sur
  `pooler_rosters`. Voir `SUIVI_PROJET.md` (session 2026-06-20).

**Mécanique de `buildStandings()` (`app/lib/standings.ts`) :**
- Fenêtre de base par ligne `pooler_rosters` : `added_at → removed_at` (`null` = toujours actif).
  Aucun match hors de cette fenêtre n'est considéré, peu importe `roster_change_log`.
- À l'intérieur de la fenêtre, `statusAt()` détermine le statut réel du joueur à l'heure de
  chaque match à partir de `roster_change_log` (événements avec `new_type` non nul, triés par
  `changed_at` — la date **effective**, pas la date de saisie). Seuls les matchs où le statut
  résolu est `'actif'` comptent des points.
- **Avant le tout premier événement connu** pour ce `(pooler, joueur)` : le statut retenu est
  `old_type` de cet événement (pas le `player_type` courant de la ligne). Piège : un ajout en
  direct (`addPlayerAction`, hors Historique) journalise un événement à l'horodatage réel de
  l'action ; si une correction Historique ultérieure (ex: Changement de type) porte une date
  effective **antérieure**, elle devient le nouvel événement le plus ancien chronologiquement
  — mais le tout premier événement "réel" (l'ajout) reste dans la liste avec une date plus
  tardive. Bug corrigé le 2026-07-17 (`statusAt` retombait sur le type courant au lieu de
  `old_type` pour cette fenêtre) — voir `SUIVI_PROJET.md`.
- **Changement de type et `added_at`** : quand une date effective précède `added_at` de la
  ligne visée, `added_at` est automatiquement reculé à cette date (avec avertissement non
  bloquant) — la date effective saisie fait toujours foi comme date de début pour le joueur
  concerné. Logique partagée dans `computeTypeChangeAddedAt()` (`app/lib/rosterTypeChange.ts`),
  utilisée par les interfaces qui modifient `player_type` sur une ligne existante sans
  jamais toucher `added_at` : `/admin/historique` (Changement de type, et depuis le
  2026-07-25 la branche Échange même pooler quand le joueur retiré change de statut au lieu
  de quitter le pool — les deux passent par la même fonction interne `applyTypeChange`),
  `/gestion-effectifs` (`activate`/`deactivate`, checkbox admin "Forcer une date effective"),
  `/admin/transactions` (`type_change`/`promote`/`reactivate`, `transactionDate`). Toute
  nouvelle action qui modifie `player_type` sur une ligne existante avec une date
  potentiellement passée doit passer par cette même fonction plutôt que de dupliquer la logique.
- **Périodes affichées** (`PlayerContrib.periods`, popup ↩ dans `/classement` et
  `/poolers/[id]`) : une entrée par fenêtre **active** contiguë (via `activeSegments()`), pas
  une entrée par ligne `pooler_rosters`. Un joueur réactivé plusieurs fois sans jamais quitter
  le pool (recrue/réserve↔actif sur la même ligne continue) affiche donc une période par
  fenêtre active, pas une seule période couvrant toute la ligne.
- **Piège — ligne `roster_change_log` non-historique plus récente qu'une correction
  Historique** : il existe en base des lignes `roster_change_log` sans préfixe `hist_`
  (`activation`/`ajout_recrue`/`retrait`/`ajout_reserviste`/`deactivation`,
  `is_admin_override=false`) qui ne viennent pas de `/admin/historique` — un instantané de
  l'état courant à un moment donné. Si on saisit ensuite une correction `/admin/historique`
  avec une date effective **antérieure** à une telle ligne existante pour le même joueur,
  `statusAt()` (trie uniquement par date effective, pas par date de saisie) applique cette
  vieille ligne *après* la correction et fait réapparaître le statut d'avant-correction à
  partir de sa date — un faux "Période 2" dans le popup. `submitHistChangeAction` ne
  détecte ni ne nettoie ces lignes en conflit. Repéré et corrigé manuellement en staging le
  2026-07-20 (21 lignes supprimées sur 365 candidates, voir `SUIVI_PROJET.md`).
  **Garde-fou ajouté** le même jour : `checkFutureRosterConflict()`
  (`app/lib/rosterTypeChange.ts`) bloque (au lieu de nettoyer automatiquement — impossible
  de distinguer un artefact obsolète d'un vrai événement futur réel sans risquer d'effacer
  une donnée réelle) toute saisie qui créerait ce conflit. Câblé dans `submitHistChangeAction`
  (`/admin/historique`, type_change, et depuis le 2026-07-25 la branche Échange même pooler
  quand le joueur retiré change de statut plutôt que de quitter le pool — voir plus haut),
  `deactivate`/`activate`/`addNewPlayer` (`/gestion-effectifs`), et `submitTransactionAction`
  (`/admin/transactions` — `transfer` arrivée, `promote`/`reactivate`/`type_change`, `sign`).
  Toujours pas câblé dans les chemins `trade`/`ajout`/`retrait` de `/admin/historique`, ni
  dans le retrait complet (sortie du pool) d'Échange même pooler — scope volontairement
  limité, risque de collatéral jugé plus élevé pour un gain plus faible.
- **Gap distinct comblé le 2026-07-20** : `/admin/transactions` (`submitTransactionAction`)
  mettait à jour `pooler_rosters.player_type` mais n'écrivait **aucune** ligne
  `roster_change_log` — `statusAt()` ne voyait donc jamais ces transitions et retombait sur
  le type courant pour toute la fenêtre, avec un vrai risque de fausser des points de la
  saison en cours (contrairement au bug des périodes fantômes, sans impact réel car daté
  après la fin de saison). Toutes les branches (`transfer`/`ballotage`/`promote`/
  `reactivate`/`sign`/`release`/`type_change`) journalisent désormais dans
  `roster_change_log`, avec le même vocabulaire `change_type` que `/gestion-effectifs` et
  `/admin/rosters` (`activation`/`deactivation`/`ajout_reserviste`/`ajout_recrue`/`retrait`/
  `ltir`/`retour_ltir`/`changement_type`).

**Cap simulé pour joueur sans contrat (`app/lib/capUtils.ts`) :**
- `getEffectiveCap(contracts, season, unsignedMultiplier)` : sans contrat réel pour la
  saison, simule un cap = contrat de la saison précédente × `app_settings.
  unsigned_player_cap_multiplier` (défaut 1.20) — évite qu'un joueur non signé compte 0$
  (avantage caché). Branché dans `/admin/presaison`, `/gestion-effectifs`, `/poolers/[id]`
  (badge "≈ estimé"), et depuis le 2026-08-31 aussi dans `submitRosterAction`
  (`admin/rosters/actions.ts`) et `submitTransactionAction` (`admin/transactions/actions.ts`,
  via `app/lib/rosterLimits.ts` — voir plus bas) — pas encore dans `poolers/page.tsx` (liste).
- Suivi de conformité continue : `/admin/effectifs?tab=conformite` — bouton "Vérifier les
  signatures" (vérification manuelle, pas de lien automatique avec le pipeline Python)
  détecte quand un joueur surveillé obtient un vrai contrat, notifie le pooler par push
  s'il dépasse alors le plafond (`app_settings.cap_deadline_days`, défaut 7 jours) via la
  table `cap_signing_watch`. Le pooler peut réagir comme il veut (libérer, échanger,
  ajuster) ; passé le délai, seul l'admin peut libérer le joueur manuellement — jamais
  automatique.

**Règles d'alignement consolidées (`app/lib/rosterLimits.ts`) — David, 2026-08-31 :**
- `validateRosterLimits(entries, poolCap)` : 12 attaquants / 6 défenseurs / 2 gardiens actifs
  **maximum** (pas exactement — un pooler peut être en sous-effectif temporaire en cours de
  saison), minimum 2 réservistes, masse salariale ≤ cap du pool. Fonction pure, `capNumber`
  toujours pré-résolu par l'appelant via `getEffectiveCap()` (jamais un `cap_number` brut —
  corrige un bug où `submitTransactionAction` comptait un joueur non signé comme 0$).
- Utilisée par `submitTransactionAction` (admin/transactions), `submitRosterAction`
  (admin/rosters, Mode init désactivé) et `submitBatchAction` (`gestion-effectifs/actions.ts`
  — self-service pooler, qui n'avait *aucune* validation de ce genre avant cette date).
  `submitBatchAction` simule l'état final du roster **avant** d'écrire quoi que ce soit
  (le lot s'applique action par action en écriture directe, contrairement à `submitRosterAction`
  qui construit déjà un état virtuel) — voir le bloc "Validation de l'état final" en tête de
  la fonction. Sautée entièrement quand l'appelant est admin (override délibéré), et de toute
  façon inatteignable pour un pooler avant que `season_started=true` (voir ci-dessus).
- `app/lib/seasonConformity.ts` (`checkSeasonConformity`) est un validateur **distinct**, plus
  strict (== 12/6/2 exactement) — utilisé uniquement par "Démarrer la saison" comme condition
  de blocage un moment donné, pas une contrainte permanente comme `validateRosterLimits`.
- Contextes "override" intentionnels, sans validation ni journal, vérifiés et laissés tels
  quels : Mode init/Banque de recrues (`admin/rosters/actions.ts`, voir plus haut — bloqués
  depuis le 2026-08-31 dès que `season_started=true`, garde-fou séparé), `presaison/actions.ts`
  (ELC, retour LTIR), `submitTransactionAction` tant que `season_started=false`,
  `/admin/historique` (reconstruction d'un historique passé, règles potentiellement différentes
  à l'époque).

**Next.js 16 :**
- Utiliser `proxy.ts`, PAS `middleware.ts`
- Rester compatible avec les conventions Next.js 16

**Supabase :**
- La legacy anon key est plus fiable que `sb_publishable_`
- La logique RLS autour de `is_admin()` est sensible — modifier avec prudence

**Python :**
- `csv_path` doit être relatif à `BASE_DIR` (requis pour GitHub Actions)
- L'environnement virtuel est dans `python_script/venv/` (ne pas committer)

---

## 7. Standards de code

- TypeScript strict — pas de `any` sans justification
- Tailwind CSS uniquement pour le style (pas de CSS inline)
- Composants Server par défaut; `"use client"` seulement si nécessaire
- `async/await` — pas de `.then()` chaîné
- Nommage : composants en PascalCase, fonctions/variables en camelCase, fichiers en kebab-case

---

## 8. Responsive (mobile)

Les pages **admin** sont desktop-only — pas de responsive requis.

Les pages de **consultation publique** doivent être utilisables sur mobile.
Règle : quand on touche une page de consultation, on la rend responsive en même temps.

- `overflow-x-auto` sur tous les conteneurs de `<table>`
- Masquer les colonnes secondaires sur mobile : `hidden sm:table-cell`
- Pas de layout en colonnes côte à côte sur mobile (`flex-wrap` ou `grid-cols-1`)

Pages de consultation : `/`, `/joueurs`, `/statistiques`, `/repechage`,
`/poolers`, `/poolers/[id]`, `/transactions`, `/gestion-series`, `/classement-series`, `/aide`

---

## 9. Page Aide (`/aide`)

`app/app/aide/page.tsx` contient trois sections :
- **Installation** : instructions PWA (ordinateur, iPhone, Android)
- **Guide d'utilisation** : instructions par fonctionnalité (à compléter au fil des livraisons)
- **Règlements** : règles métier du pool visibles par les poolers

**Règle :** lors de l'ajout ou modification d'une fonctionnalité accessible aux poolers,
évaluer si `/aide` (Guide ou Règlements) doit être mis à jour.

---

## 10. Workflow Git (automatique)

**Règle de branche : toujours `staging` avant `main`.** `main` déploie directement en
prod (`cap-crunch.vercel.app`) — jamais `staging` en second. Sauf exception déjà
documentée (le pipeline CSV, section 2, qui pousse directement sur `main` par convention
distincte propre aux données), tout changement de code atterrit d'abord sur `staging`.
Règle ajoutée le 2026-08-28 après un déploiement direct sur `main` par erreur (voir
`SUIVI_PROJET.md`).

Après chaque tâche complétée, exécuter **sans demander confirmation** :

```bash
# 1. Mettre à jour SUIVI_PROJET.md (voir section 11)
# 2. Stager tous les changements
git add -A
# 3. Committer avec message conventionnel
git commit -m "type(scope): description en français"
# 4. Pousser sur staging (jamais directement sur main)
git checkout staging   # si pas déjà dessus
git push origin staging
```

**Promotion vers prod (`main`)** : seulement après validation explicite de David sur
staging (« c'est bon », « ça marche », etc.) — jamais automatique, jamais juste parce que
le build/typecheck passe. Une fois confirmé :

```bash
git checkout main
git merge staging --no-edit
git push origin main
git checkout staging   # revenir sur staging pour la suite du travail
```

**Format des commits :**
```
type(scope): description courte en français

Types : feat | fix | docs | refactor | style | chore | test
Exemples :
  feat(rosters): ajout filtre par saison
  fix(admin): correction calcul du cap
  docs(aide): mise à jour guide notifications
  refactor(standings): extraction buildStandings vers lib/standings.ts
```

**Exceptions** (demander confirmation avant de committer) :
- Conflit Git détecté
- Changements dans `schema.sql` ou migrations Supabase
- Modifications de `.env.local` ou variables d'environnement

---

## 11. Documentation automatique

À chaque fin de tâche, mettre à jour `SUIVI_PROJET.md` avec :

```markdown
### AAAA-MM-JJ

**[Type] — description courte** (`fichier/modifie.tsx`, `autre/fichier.ts`) :
- Ce qui a été fait et pourquoi
- Décisions importantes ou compromis
- Commit : `[hash]`
```

**Règles :**
- Ne jamais laisser une session se terminer sans mettre à jour `SUIVI_PROJET.md`
- Si une route, composant ou règle métier change → évaluer si `CLAUDE.md` doit aussi être mis à jour
- `CLAUDE.md` ne change que si une information de **référence stable** change (architecture, stack, conventions, règles métier)

---

## 12. Fichiers importants à connaître

| Fichier | Rôle |
|---|---|
| `app/app/layout.tsx` | Layout global + Navbar |
| `app/app/page.tsx` | Page d'accueil (classement + matchs du jour) |
| `app/components/Navbar.tsx` | Navigation principale (dropdowns) |
| `app/lib/supabase/server.ts` | Client Supabase côté serveur |
| `app/lib/supabase/client.ts` | Client Supabase côté client |
| `app/lib/standings.ts` | Logique classement (`buildStandings`) |
| `app/lib/streaks.ts` | Indicateurs de séquence (badges 🔥✅🧊) |
| `app/lib/appEnv.ts` | Détection local/staging/prod (nom + icônes PWA distincts) |
| `app/app/admin/layout.tsx` | Layout partagé `/admin/*` — injecte le panneau Guide admin |
| `app/components/AdminGuidePanel.tsx` | Panneau Guide admin (bouton flottant, checklist transition de saison) |
| `app/proxy.ts` | Auth + redirections (remplace middleware.ts) |
| `python_script/run_pipeline.py` | Point d'entrée pipeline de données |
| `python_script/sync_staging_to_prod.py` | Synchronise l'historique de roster staging → prod |
| `schema.sql` | Schéma de référence BD |
| `supabase_migrations/` | Migrations SQL historiques |
| `credentials/` | Identifiants poolers générés (staging/prod) — gitignored, jamais commité |

<!-- cce-block-version: 3 -->
## Context Engine (CCE)

This project uses Code Context Engine for intelligent code retrieval and
cross-session memory.

### Searching the codebase

**You MUST use `context_search` instead of reading files directly** when
exploring the codebase, answering questions about code, or understanding how
things work. This is a hard requirement, not a suggestion. `context_search`
returns the most relevant code chunks with confidence scores instead of whole
files, and tracks token savings automatically.

When to use `context_search`:
- Answering questions about the codebase ("how does X work?", "where is Y?")
- Exploring structure or architecture
- Finding related code, functions, or patterns
- Any time you would otherwise read a file just to understand it

When to use `Read` instead:
- You need to edit a specific file (read before editing)
- You need the exact, complete content of a known file path

Other search tools:
- `expand_chunk` — get full source for a compressed result
- `related_context` — find what calls/imports a function

### Cross-session memory — use it actively

This project has persistent memory across Claude Code sessions. **You must
use it both ways: recall before answering, record after deciding.** Memory
that is not recorded is lost; memory that is not recalled does nothing.

**Before answering a non-trivial question, call `session_recall`.**
Especially when:
- The question touches architecture, design, or naming choices
- The user asks "what / why / how did we ..."
- You are about to recommend an approach the team may have already chosen
  or already rejected

Pass a topic phrase, not a single word — e.g. `session_recall("auth flow")`,
not `session_recall("auth")`. Recall is vector-similarity-based, so paraphrases
match. If recall returns relevant entries, lead with them ("Per a prior
decision: ...") instead of re-deriving the answer.

**After making a non-obvious decision, call `record_decision`.** Especially:
- Choosing one library / pattern / approach over another
- Resolving an ambiguity in the spec or requirements
- Establishing a convention the project should follow going forward
- Anything you would not want to re-litigate next session

Format: `record_decision(decision="...", reason="...")`. Keep both fields
short and specific — they are surfaced verbatim at the start of future
sessions.

**After meaningful work in a file, call `record_code_area`.** Especially when:
- You added or substantially modified a function/class
- You traced through a non-obvious flow and want future-you to find it fast

Format: `record_code_area(file_path="...", description="...")`.

Skip recording for trivial reads, formatting changes, or one-off lookups —
the goal is durable signal, not an event log.

### Drilling deeper from a recall hit

`session_recall` results are tagged with the source session id, e.g.
`[turn sid:abc123|n:5]`. To drill in:

- `session_timeline(session_id="abc123")` — walk the per-turn summaries of
  that session in order. Use this when the user asks "what was the
  reasoning?" or "how did we get there?".
- `session_event(event_id=N)` — fetch a specific tool event's raw input
  and output (capped at 4 KB at read time). Use this when a turn summary
  references a tool result you actually need to inspect.

Both are read-only and cheap. Prefer them over re-running tool calls or
asking the user to re-paste context.

## Output Style

Be concise. Lead with the answer or action, not reasoning. Skip filler words,
preamble, and phrases like "I'll help you with that" or "Certainly!". Prefer
fragments over full sentences in explanations. No trailing summaries of what
you just did. One sentence if it fits.

Code blocks, file paths, commands, and error messages are always written in full.
<!-- /cce-block -->
