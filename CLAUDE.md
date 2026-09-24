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
- Protection recrue : pour un repêché par le pool, les 5 saisons depuis le repêchage sont la
  **seule** limite — la fin de l'ELC ne fait plus perdre la protection avant ces 5 ans (le
  pooler garde l'option de laisser le joueur en banque même avec un ELC terminé) ; pour un
  agent libre, protégé tant que l'ELC est actif, sans fenêtre de 5 ans
  (`isRookieProtectionExpired()`, `app/lib/rookieProtection.ts`). Quand la protection expire
  pour de vrai, la perte du statut recrue est automatique et permanente
  (`rookie_type`/`pool_draft_year` effacés), sans étape de décision séparée : un joueur déjà
  actif/réserviste reste où il est ; une recrue encore en banque (jamais promue) est activée
  automatiquement en Actif. Le pooler gère ensuite lui-même un éventuel surplus (réserve,
  libération, remise en banque tant que la protection n'est pas vraiment expirée) via le
  libre-service de `/repechage-agents-libres`. Détails en section 6.
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

```bash
# Régénère l'outil de backup manuel (David, 2026-09-21, étendu le 2026-09-22) — snapshot HTML
# autonome de la saison active en PROD, éditable à la main dans le navigateur (localStorage)
# sans dépendre de l'app/Supabase — filet de sécurité en cas de pépin, mais aussi un vrai outil
# de gestion manuelle : alignements triés par position/actif/réserviste/recrue comme le site,
# ajout de n'importe quel joueur LNH (pas seulement ceux déjà repêchés), table de contrats de
# tous les joueurs LNH, choix de repêchage par pooler, journal éditable (auto-loggé par les
# ajustements d'alignement + saisie manuelle libre avec sa propre date effective), sélecteur de
# saison active pour les salaires, cap du pool ajustable, conformité 12/6/2 par pooler. Cible
# toujours prod (python_script/.env), comme les autres scripts — utiliser `.env.staging` pour
# prévisualiser sans toucher prod. Régénéré aussi automatiquement chaque dimanche
# (.github/workflows/backup_tool.yml), qui commite/pousse le fichier régénéré directement sur
# la branche par défaut (backup/ n'est PAS dans .gitignore).
cd python_script
python generate_backup_tool.py   # écrit backup/pool_backup.html
```

```bash
# Scrape les blessures LNH (CBS Sports en principal, ESPN en recoupement) et met à jour
# player_injuries (David, 2026-09-23) — aide au suivi du LTIR, voir section 6. Contrairement aux
# projections CBS (collées à la main dans un Excel), ces pages sont directement scrapables (HTML
# rendu côté serveur, y compris le JSON structuré d'ESPN). Cible toujours prod comme les autres
# scripts — utiliser `.env.staging` pour tester sans toucher prod. Vrai upsert (pas un
# remplacement complet) : `first_seen_at` est préservé tant qu'un joueur reste dans la liste CBS,
# pour calculer l'admissibilité LTIR. Régénéré aussi automatiquement chaque jour
# (.github/workflows/injuries.yml, 16h UTC/midi ET — les blessures changent vite, contrairement
# au pipeline hebdomadaire).
cd python_script
python scrape_injuries.py            # dry-run — aucune écriture, affiche le jumelage
python scrape_injuries.py --apply    # exécution réelle, sans confirmation (voir section 4)
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
│       ├── keepalive_staging.yml  ← Ping staging (jeudi 6h UTC) pour éviter pause Supabase
│       ├── backup_tool.yml        ← Régénère backup/pool_backup.html (dimanche 12h UTC + manuel)
│       └── injuries.yml           ← Scrape blessures CBS Sports (quotidien 16h UTC (midi ET) + manuel)
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
│   ├── generate_backup_tool.py ← Génère backup/pool_backup.html (voir section 2)
│   ├── scrape_injuries.py      ← Scrape les blessures LNH, CBS + ESPN (voir section 2)
│   ├── source/                ← CSV générés par le scraping
│   ├── teams_offline/
│   ├── diagnostics/
│   └── archive/
├── backup/                    ← Généré (pool_backup.html) — pas de code source ici
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
- `player_injuries` (suivi des blessures LNH, CBS Sports + ESPN en recoupement — voir section 6,
  une ligne par joueur blessé, upsert quotidien par `python_script/scrape_injuries.py`)
- `ltir_requests` (demandes de mise sur LTIR en attente d'approbation admin — voir section 6)
- `meeting_polls`, `meeting_poll_dates`, `meeting_poll_responses`, `meeting_poll_comments`
  (sondage de planification, `/planification` — le babillard `meeting_poll_comments` est
  propre à ce sondage, distinct de `bulletin_posts`/`bulletin_comments` ci-dessous)
- `bulletin_posts`, `bulletin_comments` (babillard global, `/babillard` — communications de
  l'admin à tout le pool, commentables par les poolers)
- `presaison_draft_state` (file d'attente partagée du repêchage des agents libres pré-saison —
  une ligne par saison régulière, lue par `/admin/init?tab=presaison` et
  `/repechage-agents-libres` — voir section 5)
- `presaison_pooler_ready` (déclaration "mon alignement est prêt" par pooler, une ligne par
  saison+pooler — voir section 5)
- `waiver_claims`/`waiver_claim_requests` (ballotage en cours de saison — une claim par
  libération, une request par pooler l'ayant réclamée — voir section 6)
- `trade_offers`/`trade_offer_items` (transactions proposées entre poolers, approbation admin
  — voir section 6)

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
`/` `/login` `/joueurs` `/statistiques` `/statistiques/ahl` `/statistiques/blessures`
(David, 2026-09-23 — table des blessures LNH en cours, source `player_injuries`/CBS Sports,
voir section 6 ; colonne "Dans le pool" indique qui possède chaque joueur blessé, peu importe
son type de roster, ou "Disponible" si personne) `/repechage` `/repechage-recrues` `/calendrier`
`/poolers` `/poolers/[id]` `/journal-transactions` (historique en lecture seule — pas de
saisie pooler ; distinct de `/admin/transactions`, l'outil admin) `/classement`
`/classement/hebdomadaire` `/classement/mensuel` (David, 2026-09-17 — mêmes données que
`/classement`, `buildStandings()` juste borné à une semaine lundi-dimanche ou un mois civil,
heure de l'Est ; navigation précédent/suivant, voir section 6) `/resultats`
(récap veille)
`/gestion-series` (soumettre ses choix séries) `/classement-series` (classement séries)
`/gestion-effectifs` (3 onglets, David 2026-09-15, **Échanges** ajouté le 2026-09-21 :
**Mouvements**, l'outil existant ; **Ballotage**, réclamer un joueur libéré en cours de
saison ; **Échanges**, proposer/répondre à des transactions entre poolers — voir section 6
pour les trois) `/draft-center` (classement des prospects, vue publique)
`/dashboard` (redirige vers son propre alignement) `/compte` `/signaler` `/aide` `/a-propos`
(David, 2026-09-23 — « tour d'horizon » statique des fonctionnalités consultables/en
libre-service, regroupé par section de menu avec lien direct vers chaque page ; distinct
d'`/aide` (guide pas-à-pas + règlements) — les deux se renvoient l'un vers l'autre. Généré à
partir d'un résumé produit pour recueillir les retours de quelques poolers ; ajouté au menu
Ressources) `/offline`
`/planification` (sondage type Doodle pour une rencontre — vue pooler : ses disponibilités,
le résumé, le babillard propre au sondage ; notifie les admins par push à chaque
soumission/commentaire). Gestion (créer le sondage, ajouter/retirer des dates) sur
`/admin/planification`, pas sur `/planification` elle-même.
`/babillard` (babillard **global** — communications publiées par l'admin pour tout le pool,
commentables par les poolers ; notifie les poolers abonnés aux push à chaque nouvelle
communication, et les admins à chaque commentaire — distinct du babillard de `/planification`
ci-dessus). Publication réservée à l'admin, sur `/admin/communaute?tab=babillard`.
`/repechage-agents-libres` (tableau de bord partagé du repêchage des agents libres pré-saison
— vue de chaque pooler : masse salariale, alignement dépliable de n'importe qui, badge
`isOverLimits`, file d'attente/tour/chronomètre indicatif, "Activité récente" (signatures ET
libérations pré-saison confondues), et un panneau personnel "Mon alignement" à deux onglets :
**Actuel** — libre-service réel depuis le 2026-09-06 (`repechage-agents-libres/actions.ts`,
`submitSelfServiceAction`) : basculer un joueur actif↔réserviste, le libérer, activer/libérer
une recrue de sa propre banque — restreint à ses propres joueurs, désactivé dès que
`season_started=true` (place alors à `/gestion-effectifs`) ; et **Simulation** (ex-"Bac à
sable", renommé le 2026-09-18 pour cohérence avec `/simulation`) — simulation
locale non sauvegardée, pour tester l'ajout d'un agent libre pas encore signé (toujours actif,
peu importe la phase, aucune écriture serveur). La signature réelle d'un agent libre (pendant
son tour) reste admin-only, peu importe où l'admin la déclenche — panneau admin rétractable de
cette page (voir plus bas) ou `/admin/init?tab=presaison` (`ComplianceCard`, redevenu un
suivi en lecture seule le 2026-09-06 — les anciens boutons Libérer/Changer type y faisaient
double emploi avec le libre-service ; `/admin/transactions` reste le filet de sécurité pour
agir au nom d'un pooler). Rafraîchissement automatique — `AutoReload`,
`app/components/AutoReload.tsx`, composant partagé avec `/repechage-recrues`. État "à qui le
tour" persisté dans `presaison_draft_state` (section 4), remplace l'ancien état 100% local de
`PresaisonManager.tsx` — survit à une navigation de l'admin vers `/admin/transactions` (ex:
traiter un échange) et retour.

**Panneau admin rétractable sur `/repechage-agents-libres` (David, 2026-09-08)** — David
trouvait confus de devoir jongler entre cette page et `/admin/init?tab=presaison` pour gérer
son propre alignement (l'admin est aussi un pooler). `AdminPanel.tsx`
(`repechage-agents-libres/AdminPanel.tsx`), visible seulement si `me.isAdmin`, replié par
défaut, porte maintenant tout le contrôle admin directement ici : phase de libération, ordre
du repêchage, tour de repêchage en cours (signature d'agent libre, Passer, chrono), et Zone de
test (Réinitialiser le repêchage) — réutilise les mêmes Server Actions que
`/admin/init?tab=presaison` (`DraftOrderEditor`/`FreeAgentSigner` extraits en composants
partagés, `admin/presaison/DraftOrderEditor.tsx` et `FreeAgentSigner.tsx`), aucune logique
dupliquée. **`/admin/init?tab=presaison` reste pleinement fonctionnelle, inchangée** — filet
de sécurité volontaire (David), et seule option pour préparer une saison pas encore activée
(le panneau de `/repechage-agents-libres` ne lit que la saison régulière active). La carte
"Pré-saison" du hub `/admin/nouvelle-saison` pointe désormais vers `/repechage-agents-libres`
plutôt que vers l'ancienne page.

**Phase "libération de joueurs"** — `presaison_draft_state.release_phase_open`, **fermée par
défaut** (l'admin l'ouvre explicitement, jamais l'inverse — premier bouton visible = "Ouvrir
la libération de joueurs"), distincte du repêchage AL lui-même. Tant qu'ouverte, libérer
n'importe quel joueur signé est permis en libre-service comme décrit plus haut, y compris
depuis la Simulation (voir plus bas). L'admin la ferme (bandeau du panneau admin ci-dessus,
`setReleasePhaseAction`) une fois que tout le monde a ajusté sa masse salariale — à partir de
là, "Libérer des joueurs" (vétérans) disparaît de `/repechage-agents-libres`, mais
actif↔réserviste et activer/libérer une recrue de banque restent toujours permis (jamais
gatés par cette phase), tout comme la Simulation. `submitSelfServiceAction` revalide côté
serveur (le `player_type` réel en base, pas l'état client) : une libération n'est bloquée que
si le joueur visé n'est pas une `recrue`. "Démarrer le repêchage"
(`startPresaisonDraftAction`) reste désactivé — client et serveur — tant que la phase est
ouverte.

**Transition entre les tours du repêchage AL — toujours manuelle** (David, 2026-09-08) :
le chrono est purement indicatif, rien ne se passe automatiquement à 00:00 — l'admin doit
cliquer "Passer" ou attendre une signature réussie. Volontairement manuel : un auto-passage à
0 risquerait de sauter un pooler à cause d'un simple délai réseau. Le panneau admin
(`AdminPanel.tsx`, `repechage-agents-libres`) s'ouvre désormais automatiquement dès qu'un tour
est actif au chargement de la page (`expanded` initialisé à `draftState.is_active`) — avant,
il fallait deviner qu'il fallait le déplier pour trouver le formulaire de signature.

**Comportement de "Passer" — configurable (David, 2026-09-08, ⚠ pas encore commité/migré, voir
SUIVI_PROJET.md session 2026-09-08 suite 11)** — `presaison_draft_state.pass_skip_one`
(BOOLEAN, défaut `false`), choisi par l'admin avant de démarrer le repêchage (sélecteur dans
"Ordre du repêchage", `AdminPanel.tsx` et `PresaisonManager.tsx`) :
- `false` (défaut) : "Passer" remet le pooler courant en fin de file — il attend que tout le
  monde ait joué avant de rejouer.
- `true` : "Passer" le réinsère juste après le pooler suivant (`[next, current, ...rest]`),
  sans attendre tout le monde.
- Une signature réussie va **toujours** en fin de file, peu importe ce réglage — décision
  volontaire (confirmée avec David) : pas de pénalité réduite pour quelqu'un qui vient de
  signer. `advancePresaisonQueueAction(saisonId, isPass)` — `isPass=true` seulement pour un
  vrai clic "Passer", `isPass=false` (ou omis) pour une signature.

**Pause du chrono (David, 2026-09-08)** — `pausePresaisonTimerAction`/
`resumePresaisonTimerAction` (`admin/presaison/actions.ts`), sans nouvelle colonne :
`turn_started_at=null` pendant que `is_active=true` sert de signal "en pause", avec
`turn_duration_seconds` gelé au nombre de secondes qui restaient. Reprendre remet juste
`turn_started_at=now()`. Affiché dans les 3 endroits qui montrent le chrono (`AdminPanel.tsx`,
`AgentsLibresDashboard.tsx` — badge "⏸ En pause" pour tous, pas juste l'admin —, et
`PresaisonManager.tsx`). `adjustPresaisonTimerAction` a aussi un bouton "-30s" en plus de
"+30s" (la fonction acceptait déjà un delta négatif, seul le bouton manquait).

**Déclaration "mon alignement est prêt" (David, 2026-09-08)** — table `presaison_pooler_ready`
(`pool_season_id, pooler_id, ready_at` — absence de ligne ou `ready_at` NULL = pas prêt).
Chaque pooler confirme lui-même, depuis `/repechage-agents-libres` (bouton dans "Mon
alignement", `setReadyAction`), avoir placé ses actifs/réservistes comme il le veut — une
intention, pas un calcul, distincte de la conformité 12/6/2 + cap. Remise à zéro
**automatiquement** dès que `submitSelfServiceAction` s'exécute avec succès (tout changement
réel invalide la déclaration précédente). "Démarrer la saison" (`/admin/nouvelle-saison`,
`checkSeasonConformity`, `app/lib/seasonConformity.ts`) exige maintenant les deux : conformité
ET déclaration "prêt", pour tout le monde — un pooler pas encore prêt apparaît dans la liste
des non-conformes avec le motif "Alignement pas encore déclaré prêt par le pooler". Tant que
"Démarrer la saison" n'est pas cliqué, le libre-service reste réutilisable à volonté, peu
importe la phase.

**Déclarer prêt au nom d'un pooler + délai d'ajustement de 48h (David, 2026-09-21)** — pour
débloquer "Démarrer la saison" sans attendre indéfiniment qu'un pooler se connecte, l'admin
peut cliquer "Déclarer prêt en son nom" (`DemarrerSaisonCard.tsx`, `/admin/nouvelle-saison`, à
côté de chaque motif "pas encore déclaré prêt") — `setPoolerReadyByAdminAction`
(`repechage-agents-libres/actions.ts`) marque `presaison_pooler_ready.declared_by_admin=true`
et notifie le pooler par push. En échange, ce pooler garde 48h après le vrai démarrage
(`pool_seasons.season_started_at`, horodatage réel distinct de `saison_start_date` — la date
calendaire configurée à l'avance) pour ajuster librement actif↔réserviste
(`submitBatchAction`, `gestion-effectifs/actions.ts`) sans la contrainte stricte 12/6/2 ajoutée
le 2026-09-20 — **seulement** pour un lot qui ne contient QUE des `change_status` entre actif
et réserviste (jamais pour une libération, une signature, un LTIR ou une remise en banque, qui
restent soumis aux règles normales dès le démarrage). `declared_by_admin` est remis à `false`
dès que le pooler déclare "prêt" lui-même (`setReadyAction`) — une fois qu'il a vraiment
confirmé, le filet de sécurité n'a plus lieu d'être.

**Simulation soumettable (David, 2026-09-08, onglet renommé "Bac à sable" → "Simulation" le
2026-09-18)** — dans `MonAlignement` (onglet Simulation de `/repechage-agents-libres`), les
retraits testés (`removed`, joueurs déjà possédés) peuvent
être soumis pour vrai via un bouton "Soumettre la libération (N)"
(`handleSubmitSandboxReleases`, nom interne inchangé) — même `action_type='release'` et même
garde-fou de phase que le flux "Libérer des joueurs" de l'onglet Actuel, juste une seconde
porte d'entrée après avoir exploré l'impact salarial dans la Simulation. Les agents libres
ajoutés (`added`) restent en revanche une simulation pure, jamais soumissibles — signer un
agent libre reste réservé à l'admin pendant le tour du pooler ; seul le retrait de joueurs
déjà possédés peut être soumis.
Depuis le 2026-09-08, la Simulation permet aussi d'ajouter une recrue de sa propre banque
(`addedRecrueIds`) pour voir l'impact réel sur la masse (contrairement à un agent libre, une
recrue est déjà signée — son `cap_number` est réellement déduit dans la simulation, pas juste
indicatif) ; reste une simulation, pas soumissible (l'activation réelle passe par "Activer ou
libérer une recrue" dans l'onglet Actuel).

**Libérer au nom d'un pooler, depuis `/repechage-agents-libres` (David, 2026-09-08)** — chaque
ligne de l'alignement déplié (`PoolerCard`, "Voir l'alignement de X") a maintenant un bouton
✕ admin-only qui appelle `submitTransactionAction` (`action_type='release'`,
`from_pooler_id=` ce pooler) — même notes `'Ajustement pré-saison'` que le libre-service, capté
par "Activité récente", jamais annulé par "Réinitialiser le repêchage" (Zone de test). Sert de
filet de sécurité pour les tests et pour un pooler qui ne peut pas se connecter pendant le
pool — contourne volontairement la phase de libération (comme tout `/admin/transactions`,
l'admin n'est jamais bloqué par les garde-fous du libre-service).

Corrige au passage un bug où l'UI affichait "Repêchage terminé" dès le premier clic sur
"Démarrer" si personne n'avait encore d'espace cap (aucun pooler n'avait pourtant eu son
tour) — `startPresaisonDraftAction` ne marque plus `ended_at` dans ce cas, il retourne une
erreur ; et un second où le bloc "Ordre du repêchage" disparaissait complètement dès qu'un
repêchage précédent était marqué terminé (`isDraftDone`), avec un bouton "Recommencer"
redondant dont l'erreur ne s'affichait nulle part — fusionné en un seul bouton
"Démarrer/Relancer le repêchage", toujours visible avec l'éditeur d'ordre tant que le
repêchage n'est pas activement en cours.

**Menu pooler (`Navbar.tsx`) — refonte en sidebar le 2026-09-23 (David, suite à un retour de
pooler : regroupements/libellés horizontaux pas clairs). Historique des menus horizontaux
(2026-08-30 → 2026-09-14) ci-dessous pour mémoire, remplacé par l'arborescence latérale
décrite juste après.**

**Architecture sidebar (David, 2026-09-23)** — barre du haut minimale et fixe (`sticky top-0`,
logo + installer PWA + avatar compte), sidebar de navigation séparée : persistante à gauche en
desktop (`<aside className="hidden md:block fixed top-14 left-0 bottom-0 w-64">`,
`layout.tsx` compense avec `md:pl-64` sur le contenu), tiroir superposé en mobile (glisse
depuis la gauche, backdrop, ouvert par le hamburger de la barre du haut). Les deux réutilisent
le même composant `NavTree`/tableau `NAV_GROUPS` (source unique — l'ancien menu dupliquait une
liste desktop et une liste mobile séparées, source d'oublis). Chaque section est un groupe
repliable (arborescence, pas tout déplié d'un coup) ; le groupe contenant la page courante se
déplie automatiquement au chargement et après chaque navigation, le reste reste replié tant
qu'on ne clique pas dessus.

**Groupes affinés le 2026-09-23 (suite) — David a proposé un principe d'organisation plus
net après avoir vu le premier jet ci-dessus : regrouper par "à qui ça appartient / qui
contrôle quoi" plutôt que par "consultation vs action". Effet secondaire utile : ça sépare
enfin le Repêchage interne (mécanique propre au pool) du Classement pré-repêchage/Repêchage
LNH (référence sur le vrai repêchage LNH), qui étaient mélangés sous "Recrues" alors que ce
sont deux natures de contenu différentes.**

| Section | Contenu |
|---|---|
| Mon équipe (nouveau nom de groupe — le lien "Mon alignement", ex-"Mon équipe", garde son nom de page inchangé depuis le renommage plus haut le même jour) | Mon alignement · Gestion d'effectifs · Simulation — "ce qui m'appartient / que je contrôle" |
| Le pool | Tous les alignements (ex-"Équipes") · Journal des transactions — "ce qui concerne les autres poolers" |
| Classement du pool (ex-"Classement", renommé le 2026-09-23 (suite)) | Saison complète · Hebdomadaire · Mensuel |
| Calendrier LNH (lien autonome, ex-sous-item de "Statistiques", sorti le 2026-09-23 (suite) — entre Classement du pool et Statistiques) | Le résumé personnel "mes joueurs cette semaine" a été extrait dans un onglet séparé sur `/poolers/[id]`, voir ci-dessous — cette page ne garde que la navigation jour par jour |
| Statistiques (ex-partie de "LNH") | LNH · Projections · AHL |
| Blessures | Lien autonome (plus regroupé sous "LNH", qui cachait la page selon le retour du pooler) |
| Contrats LNH | Lien autonome (ex-sous-item de "LNH") |
| Prospects LNH (ex-"Recrues", réduit) | Classement pré-repêchage · Repêchage LNH — référence sur le vrai repêchage LNH, rien de propre au pool |
| Repêchage annuel (nouveau groupe) | Repêchage des recrues (ex-"Repêchage interne", renommé le 2026-09-23 pour cohérence avec le `<h1>` de la page, qui disait déjà "Repêchage des recrues") · Signatures des agents libres — "notre repêchage annuel", regroupe les deux rituels séquentiels de pré-saison (repêcher les recrues, puis signer les agents libres) |
| Communauté (scindé de "Ressources", trop vague) | Babillard · Planification |
| Aide (scindé de "Ressources") | Aide & Règlements · À propos |
| Admin (admin seulement) | Deux sous-groupes inchangés : Opérations courantes · Mise en place saisonnière |

**Historique horizontal (2026-08-30 → 2026-09-14, remplacé) :** dropdowns Alignements ·
Classement · LNH (Statistiques/Calendrier/Contrats regroupés) · Recrues (incluait alors
Repêchage interne) · Ressources (Babillard/Planification/Aide regroupés) — c'est justement ce
regroupement "LNH"/"Ressources"/"Recrues" que le retour du pooler a identifié comme peu clair,
d'où la scission en groupes plus fins ci-dessus.

**"Repêchage agents libres" déplacé d'Recrues vers Alignements, renommé "Signatures des
agents libres" (David, 2026-09-14) — puis vers "Repêchage annuel" le 2026-09-23 (voir
ci-dessus)** — repositionné une première fois une fois `/repechage-agents-libres` devenu, avec
le libre-service pré-saison, un vrai outil de gestion d'alignement plutôt qu'un simple
repêchage. Route (`/repechage-agents-libres`), noms de fonctions et de tables
(`presaison_draft_state`, etc.) inchangés à travers tous ces déplacements — seul le
regroupement/libellé visible (menu, titre de page `<h1>`) a changé, pour éviter un chantier de
renommage profond à faible valeur pour des changements qui ne touchent que l'affichage.

**Onglet "Prochains matchs" sur `/poolers/[id]` (David, 2026-09-23)** — 5ᵉ onglet ajouté
(Alignement/Masse Salariale/Recrues/Historique existants + celui-ci), ex-onglet "Analyse" de
`/calendrier` : combien de matchs jouent les joueurs actif/réserviste/recrue d'un alignement
dans les prochains jours (horizon 2-7J réglable, filtre par type de joueur, code couleur
vert/bleu/gris). Fonctionne pour **n'importe quel pooler affiché**, pas seulement l'utilisateur
connecté — utile pour évaluer l'horaire de quelqu'un avant un échange. Logique extraite dans
deux fichiers partagés pour éviter la duplication :
- `app/lib/nhlWeeklySchedule.ts` — fetch de l'API NHL publique (`fetchWeek`/`fetchSchedule7`,
  fenêtre glissante des 7 prochains jours), `todayET()`/`addDays()`, et
  `fetchOrgPlayersForPooler()` (actif/réserviste/recrue d'un pooler pour une saison, pas les
  LTIR qui ne jouent pas).
- `app/components/UpcomingGamesAnalysis.tsx` — le composant d'affichage (grille de joueurs +
  compteur de matchs), extrait tel quel de l'ex-`AnalyseTab` de `/calendrier`.

`/calendrier` (`CalendrierClient.tsx`) n'a donc plus qu'un seul onglet (Matchs) — la barre
d'onglets y a été retirée en même temps que l'onglet Analyse, devenue inutile pour un seul
onglet. `page.tsx` de `/calendrier` ne calcule plus `schedule7`/`allOrgPlayers` (utilise le
`fetchWeek()` partagé pour sa propre navigation jour par jour, indépendante de la fenêtre
glissante de 7 jours).

**`/transactions` renommé `/journal-transactions` le 2026-09-01** (David) : c'est un historique
en lecture seule (aucune saisie pooler), et le nom "Transactions" était réservé pour un futur
outil où les poolers proposeraient eux-mêmes des transactions (avec approbation admin) — pas
encore construit. Distinct de `/admin/transactions` (outil admin, inchangé).

Pool Séries (`/gestion-series`, `/classement-series`, `/resultats`) retiré de la nav pooler le
même jour — route et code conservés, plus atteignable que par URL directe (le pool ne fait
habituellement pas de séries, même traitement que `/admin/series` le 2026-08-28). La prop
`newPlayoffActive`/`initialNewPlayoffActive` (calculée dans `layout.tsx` à partir de
`pool_seasons.is_playoff`) a été supprimée avec le bloc de nav qui l'utilisait.
Ressources était pensé comme un point de départ ; le babillard global (`/babillard`, section 4
et ci-dessous) y a été ajouté le 2026-09-02. Une vraie documentation des outils/guide
d'utilisateur pourrait encore s'y ajouter plus tard — chantier de contenu séparé, pas encore
construit.

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
| `/admin/communaute` | `communication` Communication (feedback + notifs) · `babillard` Babillard (publier/supprimer des communications, ajouté le 2026-09-02) · `suivi` Suivi (activité) · `planification` Planification (sondage type Doodle, admin) |
| `/admin/init` | `rosters` Rosters initiaux · `recrues` Banque de recrues · `choix` Choix de repêchage (← réassigner le propriétaire d'un pick échangé hors-app) — réglages one-shot déjà en place pour la saison courante |
| `/admin/effectifs` | `mouvements` Mouvements · `transactions` Transactions · `approbation` Approbation (transactions entre poolers en attente, `TradeApprovalManager.tsx` — onglet ajouté le 2026-09-21) · `historique` Historique (saisie historique manuelle) · `conformite` Conformité cap (joueurs sans contrat, cap simulé) |
| `/admin/donnees` | `pipeline` Pipeline salaires/contrats/repêchages (doc, `PlayerMerge`) · `prospects` Classement des prospects |
| `/admin/series` | pas d'onglets — vue unique (avancement des séries), message si aucune saison séries active. Retiré du dropdown Admin le 2026-08-28 (ne servait qu'aux tests, pas d'usage normal du pool des séries) — route et code conservés, toujours atteignable directement par URL. Depuis le 2026-08-30, également retiré du sous-menu "Pool Séries" côté pooler (voir ci-dessous) — plus aucun point d'entrée dans la nav, seulement l'URL directe |

`/admin/pool` et `/admin/communaute` (2026-09-01) : `/admin/pool` regroupait auparavant les 5
onglets Poolers/Configuration/Communication/Suivi/Planification, mais les deux premiers
(structurel — qui est dans le pool, les règles) et les trois derniers (opérationnel — parler
aux poolers, suivre l'activité) n'avaient plus de logique commune, juste de l'historique.
Séparés en deux hubs (David) — le dropdown Admin remonte de 6 à 7 entrées, compromis accepté
délibérément (à l'inverse de la consolidation du 2026-08-28, jugée moins importante ici que la
cohérence du regroupement). Contenu de chaque onglet inchangé, juste déplacé.

**Dropdown Admin réordonné le 2026-09-01** en deux sections (`Navbar.tsx`) : "Opérations
courantes" (Gestion des effectifs · Communauté · Gestion du pool · Mise à jour de données,
utilisés en continu) puis "Mise en place saisonnière" (Nouvelle saison · Initialisation ·
Repêchage recrues, utilisés seulement lors d'une transition). Même principe que le
regroupement consultation/action côté pooler (Alignements).

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

`/admin/planification` (gestion du sondage — créer/réinitialiser, dates candidates) est depuis
le 2026-08-28 une redirection volontaire vers `/admin/communaute?tab=planification` (mise à
jour le 2026-09-01, voir ci-dessus), même pattern que `/admin/joueurs` et `/admin/draft-center`
ci-dessous — la page publique `/planification` (vue pooler) n'est pas affectée.

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

`/admin/communaute?tab=planification` gère le sondage `/planification` — créer/réinitialiser
le sondage, ajouter/retirer des dates candidates. Le toggle "Mode avant-première" qui s'y
trouvait (masquait le reste de la Navbar pour les poolers avant que la rencontre soit
planifiée) a été retiré du code le 2026-09-02, David ayant confirmé ne plus s'en servir —
`app_settings.nav_planification_only` n'existe plus (colonne supprimée). Route à part jusqu'au
2026-08-28 (voir `/admin/planification` ci-dessus, désormais une redirection).

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
- **Joueur libéré sans avoir jamais eu de `added_at` réel** (David, 2026-09-08) — Mode init
  crée les lignes avec `added_at=null` ; il ne devient réel qu'au clic sur "Démarrer la
  saison" (`demarrerSaisonAction`). Un joueur libéré en pré-saison avant ce moment (ex: via le
  libre-service de `/repechage-agents-libres`) n'a donc jamais eu de fenêtre valide —
  `buildStandings()` l'exclut complètement de la liste retournée (`stillRostered=false` et
  `added_at===null` sur sa dernière ligne) plutôt que de l'afficher "PARTI" avec 0 partout.
  Distinct d'un joueur relâché après un vrai début de saison (`added_at` non nul) : celui-là
  garde sa trace normalement, même si `periods` est vide pour une autre raison (ex: jamais
  activé, resté réserviste tout du long).
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
  Paramètre optionnel `minEffectiveTs` (David, 2026-09-21) — plancher, typiquement
  `saison_start_date` : évite de reculer `added_at` jusqu'à aujourd'hui quand une
  activation/désactivation a lieu après "Démarrer la saison" mais avant la vraie date de
  début (ex: saison démarrée le 21 pour un vrai début le 29 — aucun match joué entre les deux,
  reculer n'apporte rien et n'affiche qu'un avertissement trompeur). Branché dans
  `/gestion-effectifs` et `/admin/transactions` ; **pas** dans `/admin/historique`, qui saisit
  délibérément des dates passées et doit garder le comportement d'origine sans plancher.
  Même plancher appliqué directement (sans passer par `computeTypeChangeAddedAt`, pas de ligne
  existante à consulter pour un nouvel ajout) dans `addNewPlayer` (`gestion-effectifs/
  actions.ts`, David 2026-09-21) — une signature (agent libre, ballotage) faite après
  "Démarrer la saison" mais avant la vraie date de début affichait sinon une date de début
  trompeuse dans le popup de périodes, repéré en testant le ballotage dans une fenêtre où
  `season_started=true` mais `saison_start_date` pas encore atteinte.
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

**Classement hebdomadaire/mensuel (`app/lib/dateRanges.ts`) — David, 2026-09-17 :**
- `buildStandings(supabase, seasonId, range?)` accepte maintenant un 3ᵉ paramètre optionnel
  `{ from, to }` (ISO, `from` inclusif/`to` exclusif) — filtre la requête `player_game_logs`
  (au niveau DB, en plus du filtre `season`/`game_type` existant) sans toucher au reste du
  calcul : le statut réel du joueur à chaque match (`statusAt()`/`activeSegments()`) continue
  de se baser sur tout l'historique de la saison, seule la somme des points est bornée à la
  fenêtre demandée. `/classement` (sans `range`) est inchangée, rétrocompatible.
- Semaine = **lundi à dimanche**, heure de l'Est (choix de David — convention la plus
  courante) ; mois = mois civil. `mondayOfWeek()`/`weekRange()`/`monthRange()`
  (`app/lib/dateRanges.ts`) gèrent la bascule heure d'été/hiver via une conversion
  minuit-heure-de-l'Est → UTC dynamique (`localMidnightUTC()`, basée sur `Intl.DateTimeFormat`
  plutôt qu'un décalage fixe -04:00/-05:00) — nécessaire ici (contrairement au `T12:00:00Z`
  utilisé ailleurs dans le projet pour des dates sans heure précise) parce qu'on compare
  contre de vraies heures de match proches de minuit.
- Routes `/classement/hebdomadaire?semaine=YYYY-MM-DD` (n'importe quelle date de la semaine —
  normalisée au lundi) et `/classement/mensuel?mois=YYYY-MM`, chacune avec navigation
  précédent/suivant (`WeekNav.tsx`/`MonthNav.tsx`, même patron que `ResultatsManager.tsx` —
  bouton "suivant" caché quand on est déjà sur la période courante, pas de borne sur "précédent").
  Les deux réutilisent tel quel `ClassementTable` (`app/app/classement/ClassementTable.tsx`,
  qui ne prend que `standings` en prop) — aucune duplication d'affichage, seule la fenêtre de
  calcul change.
- Le détail par période (popup ↩) affiche les dates de la fenêtre d'activation réelle du
  joueur (`added_at`/`removed_at` de la ligne `pooler_rosters`), pas la semaine/le mois
  affiché — cosmétique mineur assumé (le total de points, lui, est bien borné à la période).

**Saisons de contrats sur `/joueurs` (David, 2026-09-08)** — `JoueursTable.tsx` calcule
dynamiquement ses 5 colonnes de saisons à partir de `pool_seasons.season` (saison active,
passée en prop par `page.tsx`) via `buildSeasons()`, plutôt qu'une liste codée en dur — un
ancien `CURRENT_SEASON = '2025-26'` figé se désynchronisait à chaque transition de saison.
Si une page affiche une saison NHL en dur ailleurs, vérifier qu'elle dérive bien de
`pool_seasons.is_active` avant de la reproduire.

**Protection recrue (`app/lib/rookieProtection.ts`) — David, 2026-09-07, règle des 5 ans
revue le 2026-09-14 :**
- `isRookieProtectionExpired(rookieType, poolDraftYear, isElcActive, seasonStartYear)` : pour
  `repeche`, `(seasonStartYear - poolDraftYear) >= 5` **seulement** — la fin de l'ELC ne compte
  plus, contrairement à la version du 2026-09-07 (`!isElcActive || ...`). Trouvé en pratique
  (David, 2026-09-14) : Leo Carlsson et Connor Bedard, repêchés par le pool en 2023, ELC
  terminé et gros nouveau contrat (18M$/15M$) compté au complet contre le cap de leur pooler
  dès la transition de saison, alors qu'ils étaient encore dans leur fenêtre de 5 ans — le
  pooler doit garder l'option de les laisser en banque le temps de décider, sans se sentir
  obligé de payer le plein salaire tout de suite juste parce que l'ELC est fini. Pour
  `agent_libre`, `!isElcActive` seul (inchangé — pas de fenêtre de 5 ans pour un agent libre,
  repêché par le pool seulement).
- checkSeasonConformity, BanqueRecruesManager.tsx et poolers/[id]/page.tsx ont leur propre
  copie divergente de cette règle (pré-existant, hors scope d'unifier) mais implémentaient déjà
  les 5 ans purs pour un repêché — seule cette fonction centrale avait encore le vieux
  comportement, d'où l'incohérence trouvée par David.
- Quand la protection expire, la perte du statut recrue (`rookie_type`/`pool_draft_year`
  effacés) est **automatique et permanente**, sans étape de décision séparée — remplace le
  passage par la banque de recrues + activation manuelle du 2026-09-03 (jugé trop de
  friction : le pooler gère son surplus de salaire lui-même, de A à Z, via le libre-service
  actif↔réserviste/libération déjà en place sur `/repechage-agents-libres`, plutôt que
  d'attendre une action de l'admin). Deux cas selon où se trouve le joueur au moment de
  l'expiration :
  - déjà `actif`/`reserviste` : reste exactement où il est (aucun changement de
    `player_type`, donc pas de transaction ni de `roster_change_log` — simple retrait du tag
    de protection devenu caduc).
  - encore en banque (`player_type='recrue'`, jamais promue) : promotion automatique en
    `actif`, via le même chemin que l'ancien bouton "Activer" manuel
    (`applyTransactionItems`, `action_type='promote'` — hérite gratuitement de sa logique :
    `added_at`, `checkFutureRosterConflict`, effacement des champs recrue), mais avec le
    client admin (`createAdminClient()`) puisque ce cas tourne aussi depuis
    `/repechage-agents-libres` (page pooler, pas admin), où le client de la requête n'a pas
    accès en écriture à `transactions`/`transaction_items` (RLS admin-only).
  Deux points d'entrée : `transitionSeasonAction` (`admin/config/actions.ts`, une fois par an
  à la transition de saison — ne gère que le premier cas ci-dessus, en clair dans la copie de
  roster) et `syncExpiredRookieProtection()` (interne, `admin/presaison/actions.ts`, gère les
  deux cas), appelée en tout début de `loadPresaisonDataAction` — se réapplique à **chaque
  chargement** de `/admin/init?tab=presaison` ou `/repechage-agents-libres`, pour capter les
  cas qui échapperaient à la transition annuelle (ex: un agent libre recrue dont l'ELC se
  termine en cours de pré-saison, ou une recrue de banque jamais promue).
- L'admin garde "Promouvoir recrue" (`/admin/transactions`, `action_type='promote'`) et le
  panneau "Activation obligatoire" de `/admin/init?tab=recrues` (`BanqueRecruesManager.tsx`,
  boutons Activer/Libérer) comme filet de sécurité manuel — rarement déclenché maintenant,
  puisque l'activation auto le devance dans l'immense majorité des cas (seule une erreur
  silencieuse de `syncExpiredRookieProtection`, journalisée en console, y laisserait
  vraiment une recrue expirée).
- Le pooler peut aussi activer ou libérer **n'importe quelle** recrue de sa propre banque à
  tout moment (pas seulement celles à protection expirée) depuis `/repechage-agents-libres`
  ("Activer ou libérer une recrue", `submitSelfServiceAction`, `action_type='promote'` ou
  `'release'`) — tracé comme une vraie transaction, comme le reste du libre-service.
- **Remettre en banque un joueur actif/réserviste encore protégé** (David, 2026-09-09) :
  `submitSelfServiceAction`, `action_type='type_change'` avec `new_player_type='recrue'` —
  même geste que le libre-service admin (`PoolerCard`/`AgentsLibresDashboard.tsx`, marqueur ★
  "banqueEligible"), mais initié par le pooler lui-même. Éligibilité revérifiée côté serveur :
  `rookie_type` doit être non-null sur la ligne actuelle — donc dépend entièrement de
  `isRookieProtectionExpired` ci-dessus pour rester disponible aussi longtemps que la
  protection n'est pas vraiment expirée (c'est le bug trouvé par David le 2026-09-14 : la
  vieille règle effaçait `rookie_type` dès la fin de l'ELC, faisant disparaître le bouton ★
  avant les 5 ans). Comme tout le libre-service pré-saison, disparaît dès que
  `season_started=true` — un joueur qui a déjà commencé la saison comme actif ne peut plus
  être renvoyé en banque par ce chemin (choix délibéré, David).
- L'ancien panneau "Décisions requises — Recrues hors ELC" (résolution manuelle
  garder-actif/remettre-en-banque, `resolveElcDecisionAction`) reste retiré (2026-09-03).

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

**Ballotage en cours de saison (`app/lib/waiverClaims.ts`) — David, 2026-09-15 :**
- Déclencheur : un pooler libère un joueur (`/gestion-effectifs`, action "Libération") ou
  l'admin libère un joueur en son nom (`/admin/transactions`, `action_type='release'`) — dans
  les deux cas **seulement si `pool_seasons.season_started=true`** (`createWaiverClaimForRelease`
  revérifie lui-même ce flag, sans dépendre de l'appelant). Les libérations en rafale de la
  pré-saison (`/repechage-agents-libres`) ne déclenchent jamais de ballotage — hors scope
  (elles tournent de toute façon toujours avant que `season_started` bascule à `true`).
- Priorité : `priority_snapshot` (JSONB, ordre = priorité décroissante) **snapshotté** au
  moment de la libération, pire classé en premier. Ni recalculé, ni mis à jour si le classement
  change avant la résolution. Deux sources selon la date (`computeWaiverPriority`,
  `app/lib/waiverClaims.ts`, David 2026-09-21) : **avant le 1er novembre** de l'année de début
  de saison, utilise `pool_seasons.presaison_draft_order` tel quel (même ordre — pire en
  premier — déjà utilisé pour le repêchage des recrues/agents libres, déjà ajustable
  manuellement via `DraftOrderEditor.tsx`) plutôt que le classement réel, qui n'a pas encore de
  sens en tout début de saison (`buildStandings()` retournerait un tableau vide tant qu'aucun
  match n'est joué). **À partir du 1er novembre**, classement réel de la saison en cours
  (`buildStandings()` inversé) comme avant ; si ce classement est encore vide à ce moment-là
  (cas limite), repli sur `presaison_draft_order` plutôt que de bloquer le ballotage. Coupure du
  1er novembre volontairement approximative (pas d'heure de l'Est à la seconde près).
- **Fenêtre par jour civil, pas par délai roulant (David, 2026-09-21)** — `app_settings.
  waiver_claim_days` (défaut 2, éditable dans `/admin/effectifs?tab=conformite`, même
  formulaire que `unsigned_player_cap_multiplier`/`cap_deadline_days`) : un joueur libéré un
  jour J reste réclamable jusqu'à **23h59 heure de l'Est du jour J+N**, peu importe l'heure
  exacte de la libération (ex: libéré lundi, `waiver_claim_days=2` → réclamable jusqu'à
  mercredi 23h59, attribué le jeudi) — remplace l'ancien délai roulant en heures
  (`waiver_claim_hours`, ex-défaut 72h), dont l'heure limite exacte dépendait de l'heure de la
  libération et prêtait à confusion. `computeWaiverWindow()` (`app/lib/waiverClaims.ts`)
  calcule `expiresAt` = minuit ET du jour **suivant** le dernier jour réclamable (le moment
  exact où `resolveExpiredWaiverClaims()` peut résoudre le claim) ; l'affichage humain
  (notification, `formatExpiry()` dans `BallotageTab.tsx`) recule d'une minute pour montrer
  "23h59" plutôt que "00h00 le lendemain". Snapshotté dans `waiver_claims.window_days` à la
  création (`window_hours`/`waiver_claim_hours` conservés en base pour compat historique, plus
  lus par le code).
- Réclamation : `/gestion-effectifs` → onglet **Ballotage**, ouvert à tous les poolers
  (`submitWaiverClaimAction`, `gestion-effectifs/waiver-actions.ts`) — sauf le pooler qui vient
  de libérer le joueur. Plusieurs réclamations possibles sur la même claim ; seule la priorité
  tranche à la résolution.
- Résolution : **paresseuse**, au chargement de l'onglet Ballotage (`getWaiverClaimsAction`
  appelle `resolveExpiredWaiverClaims()` puis `resolveExpiredAwardedClaims()` — même patron que
  `syncExpiredRookieProtection`, `admin/presaison/actions.ts` — pas de tâche planifiée). Pour
  chaque claim `open` dont `expires_at` est passé : aucune réclamation → `resolved_unclaimed`
  (le joueur reste un agent libre normal) ; sinon le gagnant (premier `pooler_id` de
  `priority_snapshot` parmi les requérants) passe le claim à **`status='awarded'`**
  (`awarded_to_pooler_id`, `awarded_at`) et est notifié par push/courriel.
- **Complétion par le gagnant, pas d'ajout automatique (David, 2026-09-21)** — avant cette date,
  la résolution ajoutait directement le joueur en réserviste au gagnant, ce qui pouvait dépasser
  son cap et finir `status='blocked'`, obligeant l'admin à intervenir à chaque fois. Le gagnant
  complète maintenant lui-même sa transaction depuis `/gestion-effectifs` (onglet Mouvements) :
  tant qu'il a un claim `awarded`, un bandeau ambre y affiche le joueur avec deux boutons
  "Ajouter (Réserviste)"/"Ajouter (Actif)" (`getAwardedWaiverClaimsAction`,
  `handleAddAwardedClaim`, `GestionEffectifsManager.tsx`) qui poussent directement une action
  `type='ballotage'` dans le panier, sans passer par la recherche manuelle — le joueur et le
  `waiverClaimId` viennent du claim, pas d'un choix libre. Le pooler ajoute au besoin une
  libération dans le même lot : `submitBatchAction` revalide tout le panier avec
  `validateRosterLimits` comme n'importe quel autre lot, ce qui force la conformité sans jamais
  bloquer l'admin. Revalidation serveur dans `addNewPlayer` (`gestion-effectifs/actions.ts`) :
  un `type='ballotage'` non-admin exige un `waiverClaimId` pointant vers un claim `awarded` à ce
  pooler pour ce joueur exact, sinon rejeté — empêche d'ajouter n'importe quel joueur sous cette
  étiquette. Une fois l'ajout réussi, le claim passe `resolved_claimed`.
- **Garde-fou contre la signature directe d'un joueur au ballotage (David, 2026-09-21)** — un
  joueur avec un claim `open` ou `awarded` est exclu de la recherche libre-service normale
  (`searchPlayersAction`) et, en profondeur, bloqué dans `addNewPlayer` pour tout signingType
  autre que `'ballotage'` (`isPlayerUnderActiveWaiverClaim()`, `app/lib/waiverClaims.ts`) —
  seul le bandeau ci-dessus peut l'ajouter, tant que la réclamation n'est pas résolue/expirée.
  Ne s'applique pas à l'admin (`/admin/transactions` reste le filet de sécurité, y compris pour
  compléter manuellement un claim `blocked` après le délai ci-dessous).
- **Délai de grâce de 48h pour compléter (`COMPLETION_GRACE_HOURS`, `app/lib/waiverClaims.ts`)**
  — si le gagnant n'a rien fait 48h après `awarded_at`, `resolveExpiredAwardedClaims()` passe le
  claim à `status='blocked'` (`error_message` rempli) : l'admin traite alors manuellement via
  `/admin/transactions`, même philosophie que la protection recrue/`cap_signing_watch`
  ci-dessus. Un claim `awarded` reste visible dans l'historique de l'onglet Ballotage
  (`STATUS_LABEL`/`STATUS_COLOR`, `BallotageTab.tsx`) pendant qu'il attend.
- **Comptes de réclamations/refus jamais exposés aux poolers tant qu'un claim est ouvert
  (David, 2026-09-21)** — `getWaiverClaimsAction` ne renvoie plus `claimCount`/`refusedCount`
  (supprimés de `WaiverClaimView`) et sa requête sur `waiver_claim_requests` est filtrée
  `.eq('pooler_id', user.id)` — un pooler ne voit jamais même via le réseau qui d'autre a
  réclamé/refusé, seulement son propre statut. Repéré par David : ces comptes révélaient de
  l'info stratégique (qui est intéressé) avant que la priorité tranche. Une fois résolu, seul
  le nom du gagnant apparaît dans "Activité récente" (jamais les comptes), inchangé.
- **Lien cliquable dans les courriels/push (David, 2026-09-21)** — même patron que babillard/
  planification (`process.env.NEXT_PUBLIC_SITE_URL` + `<a href>`, "Voir sur Cap Crunch") : la
  notification de libération et le "garanti" pointent vers `/gestion-effectifs?tab=ballotage`
  (`GestionEffectifsManager.tsx` accepte `initialTab`, lu depuis `?tab=` par `page.tsx`) ; la
  notification "tu as remporté" pointe vers `/gestion-effectifs` (onglet Mouvements par défaut,
  où se trouve le bandeau à compléter).
- **Analyser dans le simulateur avant de réclamer (David, 2026-09-21)** — bouton "Analyser" sur
  chaque claim ouvert de `BallotageTab.tsx`, lien vers `/simulation?addPlayer=<playerId>` :
  pré-remplit l'onglet "Mon alignement" avec ce joueur en simulation
  (`loadPlayerByIdAction`, `app/simulation/actions.ts`, `preloadPlayerId` sur
  `SimulationTool.tsx`) pour évaluer l'impact avant de s'engager, sans rien soumettre. Pure
  lecture, aucun lien avec la réclamation elle-même.
- Écriture directe (pas de réutilisation d'`applyTransactionItems`, `admin/transactions/
  actions.ts`) : `waiverClaims.ts` importe `applyTransactionItems` nulle part — un import dans
  l'autre sens (`admin/transactions/actions.ts` appelle `createWaiverClaimForRelease` pour
  brancher sur son propre `action_type='release'`) aurait créé un cycle. La résolution
  duplique donc le strict minimum de la logique 'sign' d'`applyTransactionItems` plutôt que de
  la réutiliser.
- RLS `waiver_claims`/`waiver_claim_requests` : lecture publique + admin seulement en écriture
  (même patron que `presaison_draft_state`/`presaison_pooler_ready`) — toutes les écritures
  (création de claim, réclamation, résolution) passent par `createAdminClient()` depuis des
  Server Actions qui font leur propre vérification d'autorisation.
- **Refuser + notification anticipée "garanti" (David, 2026-09-21)** — `waiver_claim_requests`
  a maintenant une colonne `status` (`'claimed'` | `'refused'`, une seule ligne par
  `(waiver_claim_id, pooler_id)` grâce à la contrainte `UNIQUE` déjà en place) plutôt qu'une
  nouvelle table : refuser (`refuseWaiverClaimAction`) est toujours permis, y compris après
  avoir réclamé (changer d'avis) ; l'inverse (refusé → réclamé) est bloqué de façon permanente,
  pour ne jamais invalider une garantie déjà notifiée à quelqu'un de moins prioritaire.
  `resolveExpiredWaiverClaims` ne considère que `status='claimed'` comme de vraies
  réclamations. `checkGuaranteedWaiverWinner()` (`app/lib/waiverClaims.ts`), appelée après
  chaque réclamation ET chaque refus (pas de tâche planifiée, déclenchée par l'action
  elle-même) : trouve le réclamant le plus prioritaire actuel (`leaderId`, premier de
  `priority_snapshot` présent dans les `status='claimed'`) et vérifie que **tous** les poolers
  plus prioritaires que lui ont un refus explicite enregistré (un silence ne compte jamais
  comme un refus — un pooler qui n'a pas encore répondu pourrait encore réclamer). Si c'est le
  cas, notifie ce réclamant par push/courriel qu'il est garanti de l'obtenir, et marque
  `guaranteed_notified_at` (colonne sur `waiver_claim_requests`) pour ne jamais le notifier deux
  fois pour le même claim. Le pooler le plus prioritaire de toute la liste est déjà "garanti"
  dès sa propre réclamation (aucun refus requis, la liste des poolers plus prioritaires que lui
  est vide) — géré par le même appel après une réclamation, pas seulement après un refus.

**Règles d'alignement consolidées (`app/lib/rosterLimits.ts`) — David, 2026-08-31, exactitude
corrigée le 2026-09-20 :**
- `validateRosterLimits(entries, poolCap)` : **exactement** 12 attaquants / 6 défenseurs /
  2 gardiens actifs (un dépassement ET un sous-effectif sont tous les deux bloquants — corrigé
  le 2026-09-20 : la version d'origine ne bloquait qu'un dépassement, ce qui permettait à tort
  un mouvement d'effectif de laisser un pooler en sous-effectif ; en cours de saison,
  l'alignement doit toujours respecter les minimums après un mouvement soumis — c'est
  justement pour ça que les mouvements groupés existent, pour permettre de libérer et
  d'activer en un seul geste sans jamais passer par un état invalide), minimum 2 réservistes
  (pas de maximum — un pooler peut en garder plus que 2), masse salariale ≤ cap du pool.
  Fonction pure, `capNumber` toujours pré-résolu par l'appelant via `getEffectiveCap()` (jamais
  un `cap_number` brut — corrige un bug où `submitTransactionAction` comptait un joueur non
  signé comme 0$).
- Utilisée par `submitTransactionAction` (admin/transactions), `submitRosterAction`
  (admin/rosters, Mode init désactivé) et `submitBatchAction` (`gestion-effectifs/actions.ts`
  — self-service pooler, qui n'avait *aucune* validation de ce genre avant cette date).
  `submitBatchAction` simule l'état final du roster **avant** d'écrire quoi que ce soit
  (le lot s'applique action par action en écriture directe, contrairement à `submitRosterAction`
  qui construit déjà un état virtuel) — voir le bloc "Validation de l'état final" en tête de
  la fonction. Sautée entièrement quand l'appelant est admin (override délibéré), et de toute
  façon inatteignable pour un pooler avant que `season_started=true` (voir ci-dessus).
- `app/lib/seasonConformity.ts` (`checkSeasonConformity`) reste un validateur **distinct** —
  même règle de comptage par position depuis le 2026-09-20 (les deux exigent 12/6/2 exact), mais
  ajoute la déclaration "prêt" par pooler par-dessus, et reste utilisé uniquement comme
  condition de blocage de "Démarrer la saison", pas à chaque transaction.
- Signer un agent libre pendant la pré-saison (repêchage AL, `submitTransactionAction`) a sa
  propre validation distincte (David, 2026-09-20) — `validateRosterLimits` est sautée en
  pré-saison (`skipEnforcement`, voir plus bas), donc une signature ne peut pas être bloquée
  par elle ; un garde-fou séparé vérifie plutôt qu'il resterait assez d'espace cap pour combler
  les postes encore manquants au salaire minimum LNH après la signature — sinon la saison ne
  pourrait jamais démarrer sans qu'on l'ait vu venir pendant le repêchage. Bug trouvé en
  pratique : une signature à 5M$ acceptée alors qu'il ne restait plus assez d'espace pour le
  dernier réserviste requis.
- Contextes "override" intentionnels, sans validation ni journal, vérifiés et laissés tels
  quels : Mode init/Banque de recrues (`admin/rosters/actions.ts`, voir plus haut — bloqués
  depuis le 2026-08-31 dès que `season_started=true`, garde-fou séparé), `presaison/actions.ts`
  (ELC, retour LTIR), `submitTransactionAction` tant que `season_started=false`,
  `/admin/historique` (reconstruction d'un historique passé, règles potentiellement différentes
  à l'époque).

**Statistiques AHL (`app/lib/ahl-stats.ts`) — David, 2026-09-17 :**
- Source : API HockeyTech/LeagueStat (`https://lscluster.hockeytech.com/feed/index.php`,
  `client_code=ahl`), même fournisseur que theahl.com — pas d'équivalent à l'API LNH publique
  (`api.nhle.com`) déjà utilisée par `/statistiques`. Clé (`key=...`) trouvée dans l'onglet
  Réseau du navigateur sur theahl.com/stats — publique de fait (visible par n'importe quel
  visiteur du site, pas une clé secrète), mais propre à ce client (le même mécanisme existe
  pour la PWHL avec une clé différente, `client_code=pwhl`). Si la clé change côté HockeyTech,
  la retrouver de la même façon (F5 sur theahl.com/stats, onglet Réseau, filtrer `hockeytech`).
- Réponses JSON enveloppées dans des parenthèses même avec `fmt=json` (format JSONP hérité) —
  `parseHockeyTechJson()` les retire avant `JSON.parse`.
- Saison par défaut : la plus récente saison "Regular Season" qui a des matchs joués
  (`resolveSeason()`, `app/app/statistiques/ahl/page.tsx`) — la saison AHL à venir apparaît
  dans la liste avant même son coup d'envoi (ex : 2026-27 visible dès septembre, débute le
  2026-10-02), donc un simple "plus récente saison" afficherait un classement vide en
  pré-saison.
- Page `/statistiques/ahl` volontairement plus simple que `/statistiques` (LNH) : pas de
  recrues ELC, séries ni indicateurs de forme — les joueurs AHL ne sont pas nécessairement
  liés à un `player` de la base (identifiants HockeyTech, pas `nhl_id`). Le badge "R" utilise
  le champ `rookie` propre à l'API AHL (statut recrue au sens de la ligue), pas
  `rookieProtection.ts` (règle du pool, sans rapport).
- **Indicateur de disponibilité (David, 2026-09-17)** — pastille verte/grise comme sur
  `/statistiques`, réutilise `fetchTakenNames()` + `normName()` (`app/lib/nhl-stats.ts`) :
  noms normalisés de tout joueur déjà présent dans un alignement de la saison active
  (`pooler_rosters`, tous `player_type` confondus — donc un prospect en banque de recrues
  compte comme "pris"). Matching sur le nom complet uniquement (les joueurs AHL n'ont pas de
  `nhl_id`/`player.id` fiable pour un matching plus robuste) — un homonyme improbable
  afficherait un faux positif, risque jugé acceptable.

**Saisons passées sur `/statistiques` (LNH) — David, 2026-09-17, corrigé le même jour :**
- Sélecteur de saison (`recentNhlSeasons()`, `app/lib/nhl-stats.ts`) — 15 dernières saisons
  générées par calcul pur (pas d'appel réseau ; l'API stats NHL publique couvre déjà tout
  l'historique). Uniquement en mode "Saison régulière" (`?saisonNhl=20242025`) — le mode
  "Séries" reste lié aux choix réels du pool des séries pour la saison active, pas un
  historique navigable ; le sélecteur est caché dans ce mode.
- Badge recrue ELC et séquences de forme masqués dès qu'une saison autre que l'active est
  sélectionnée (`showTimeSensitiveOverlay` dans `StatsTable.tsx`) — ces deux-là reflètent
  l'état *actuel* (contrat en cours, forme récente), trompeur pour une saison passée.
  `fetchRookieNames()`/`fetchStreaksForStats()` ne sont même pas appelées dans ce cas (évite
  le travail inutile). Message d'avertissement affiché à la place.
- **La pastille de disponibilité, elle, reste toujours affichée** peu importe la saison
  consultée (David a repéré l'incohérence : elle était d'abord masquée elle aussi, alors
  qu'elle répond à "ce joueur est-il pris *aujourd'hui*", une question qui ne dépend pas de la
  saison de stats regardée — contrairement au statut recrue/à la forme récente). Même
  comportement que sur `/statistiques/ahl`, qui n'a jamais masqué sa pastille selon la saison
  choisie. `fetchTakenNames()` est donc appelée sans condition de saison.

**Next.js 16 :**
- Utiliser `proxy.ts`, PAS `middleware.ts`
- Rester compatible avec les conventions Next.js 16

**Supabase :**
- La legacy anon key est plus fiable que `sb_publishable_`
- La logique RLS autour de `is_admin()` est sensible — modifier avec prudence

**Python :**
- `csv_path` doit être relatif à `BASE_DIR` (requis pour GitHub Actions)
- L'environnement virtuel est dans `python_script/venv/` (ne pas committer)

**Courriels (`app/lib/email.ts`) :**
- Envoi via SMTP Gmail (compte personnel de David), pas un service transactionnel — décision du
  2026-09-10 après avoir découvert que Resend en mode sandbox (aucun domaine vérifié) ne livrait
  qu'à l'adresse du propriétaire du compte Resend, et que David ne souhaite ni acheter ni gérer
  un domaine. Variables d'environnement `GMAIL_USER`/`GMAIL_APP_PASSWORD` (mot de passe
  d'application Google, configurées séparément dans les deux projets Vercel).
- Contrainte Gmail : le `from` doit obligatoirement être l'adresse authentifiée — les courriels
  partent visiblement de l'adresse Gmail de David, pas d'une adresse "Cap Crunch" dédiée, et ce
  n'est pas contournable sans un domaine "Send As" vérifié.
- Toujours envoyer une version texte brut en parallèle du HTML (`htmlToText()`) — un courriel
  HTML-only envoyé par script depuis un compte personnel est un signal antispam classique,
  confirmé en pratique par un test tombé dans les pourriels avant ce correctif.
- Limite connue et assumée : le risque de classement en pourriel n'est jamais nul avec un compte
  personnel (contrairement à un domaine vérifié) — compromis accepté sciemment par David.

**Transactions proposées entre poolers (`app/lib/tradeOffers.ts`) — David, 2026-09-21 :**
- Un pooler propose un échange de joueurs (actif/réserviste/recrue) et/ou de choix de
  repêchage à un autre pooler (onglet **Échanges** de `/gestion-effectifs`, à côté de
  Mouvements/Ballotage — visible seulement sur la vraie page pooler, pas dans le hub admin
  `/admin/effectifs?tab=mouvements`, où il n'y a pas de `selfPoolerId` fiable). Flux : pooler
  visé accepte/refuse (pas de contre-offre en v1) → si accepté, l'admin approuve/rejette
  (onglet **Approbation** de `/admin/effectifs`, `TradeApprovalManager.tsx` — onglet dédié
  depuis le 2026-09-21, David ayant trouvé "Conformité cap" pas assez explicite pour ça) → si
  approuvé, **rien n'est encore transféré**.
- **Tout-ou-rien pour les deux (David, 2026-09-21)** : après l'approbation admin, les deux
  poolers ont `app_settings.trade_completion_days` jours (défaut 3) pour confirmer que le
  résultat entre dans leur masse/composition (12/6/2 + cap, via `validateRosterLimits` — les
  recrues et choix ne comptent pas, comme partout ailleurs). Chacun ajuste au besoin via
  Mouvements avant de confirmer. **Rien n'est écrit dans `pooler_rosters`/`pool_draft_picks`
  avant que les DEUX aient confirmé** — l'échange s'exécute d'un coup (`executeTradeOffer()`)
  seulement à ce moment-là. Si le délai passe avant que les deux confirment, l'échange est
  annulé pour les deux (`status='cancelled_expired'`) — aucun rollback nécessaire puisque rien
  n'a jamais été écrit ; à refaire au besoin. Résolution paresseuse
  (`resolveExpiredTradeOffers()`), même patron que le ballotage.
- Une recrue échangée reste une recrue chez le receveur (`rookie_type`/`pool_draft_year`
  transférés tels quels) — aucun choix actif/réserviste à faire, aucun impact cap/composition.
  Un choix de repêchage transfère juste `pool_draft_picks.current_owner_id`. Seuls les joueurs
  actif/réserviste ont un type à choisir à la confirmation (`chosen_type` sur
  `trade_offer_items`) et comptent dans la validation 12/6/2 + cap.
- **Ajustements supplémentaires à la confirmation (David, 2026-09-22)** — Mouvements exige
  TOUJOURS exactement 12/6/2 à la soumission (`validateRosterLimits`), donc un pooler ne peut
  pas y libérer un joueur "pour faire de la place" avant que l'échange ne s'exécute (tomberait
  à 11 attaquants, refusé). La confirmation (`confirmTradeReady`) accepte donc en plus un
  tableau `TradeExtraAction[]` (libération ou changement de statut actif↔réserviste d'un joueur
  du pooler NON impliqué dans l'échange lui-même) — stocké sur `trade_offers.
  proposer_extra_actions`/`target_extra_actions` (JSONB), validé dans le même état final
  simulé que les items de l'échange, et appliqué avec eux à `executeTradeOffer()` seulement une
  fois les deux poolers prêts. UI : section "Si ça ne rentre pas encore, ajuste au besoin" dans
  l'onglet Échanges, pas besoin d'aller dans Mouvements séparément. Couvre aussi
  `demote_to_recrue`/`promote_recrue` (David, 2026-09-22, éligibilité corrigée le même jour) —
  retourner une recrue encore protégée en banque ou en activer une aide souvent à rester
  conforme sans avoir à libérer quelqu'un pour de bon. **Éligibilité au retour en banque =
  même formule "fraîche" que `deactivate()`/`getPoolerRosterAction`
  (`gestion-effectifs/actions.ts`) : `is_rookie`, `draft_year` dans la fenêtre de 5 saisons, ou
  statut ELC** — PAS `rookie_type` déjà posé sur la ligne (piège trouvé par David en testant :
  un joueur signé directement comme actif alors qu'il était encore sur son ELC n'a jamais
  `rookie_type`, mais reste tout à fait éligible à la banque ; `rookie_type IS NOT NULL` est la
  règle du libre-service pré-saison — `repechage-agents-libres/actions.ts`,
  `submitSelfServiceAction` —, pas celle applicable ici). Classement rétroactif en
  `rookie_type='agent_libre'` au retour en banque s'il n'était encore jamais classé (même
  comportement que `deactivate()`). L'activation efface `rookie_type`/`pool_draft_year`
  seulement si `isRookieProtectionExpired()` (`app/lib/rookieProtection.ts`) est vraie à ce
  moment précis, sinon préservés — même règle que la promotion admin/self-service.
- **Salaires visibles à toutes les étapes (David, 2026-09-22)** — proposition (déjà en place),
  liste "Mes transactions" (`TradeOfferItemView.capNumber`, total par côté), confirmation
  (ajustements supplémentaires), et approbation admin (`AdminTradeOfferItemView.capNumber`,
  totaux `proposerCapGiven`/`targetCapGiven` sur `AdminTradeOfferView`). L'onglet Échanges
  affiche aussi en permanence la masse actuelle du pooler et l'espace restant sous le cap
  (`TradeOffersTab.tsx`, à partir de `listTradeableAssetsAction`).
- **Aperçu live avant de confirmer (David, 2026-09-22)** — `computeProjection()`
  (`TradeOffersTab.tsx`, JS pur côté client, aucun aller-retour serveur) recalcule à chaque
  interaction (choix de type, ajustement supplémentaire) l'état final projeté : compte
  attaquants/défenseurs/gardiens/réservistes et le cap total qui en résulterait — les joueurs
  déjà donnés/reçus par l'échange ne comptent PAS encore dans l'alignement réel actuel tant que
  l'échange n'est pas exécuté (rien n'est transféré avant que les deux confirment), donc ce
  sommaire (retire les donnés, ajoute les reçus avec le type choisi, applique les ajustements)
  est nécessaire pour avoir l'heure juste avant de cliquer "Confirmer ma part". Même logique
  que `simulatePostTradeRoster` côté serveur (`app/lib/tradeOffers.ts`), dupliquée en JS pour
  un retour instantané — la validation serveur reste la source de vérité à la soumission.
- Écriture directe à l'exécution (pas de réutilisation d'`applyTransactionItems`,
  `admin/transactions/actions.ts`, même raison de cycle d'import que `waiverClaims.ts`) —
  duplique le strict minimum de la logique `'transfer'` déjà en place là-bas (même vocabulaire
  `roster_change_log`, un seul en-tête `transactions` + un `transaction_items` par item pour
  que `/journal-transactions` affiche l'échange comme un tout).
- Scopé à la saison démarrée (`season_started=true`) — un échange pré-saison passe par le
  filet de sécurité admin existant (`/admin/transactions`, `action_type='transfer'`, déjà
  fonctionnel et sans délai puisque la conformité n'est pas exigée avant le début de saison),
  pas encore couvert par cet outil.
- RLS `trade_offers`/`trade_offer_items` : lecture publique + admin seulement en écriture,
  même patron que `waiver_claims` — toutes les écritures passent par `createAdminClient()`
  depuis des Server Actions qui font leur propre vérification d'autorisation.

**Suivi des blessures LNH + demandes de LTIR (`player_injuries`, `ltir_requests`) — David,
2026-09-23 :**
- **Sources** : CBS Sports (`cbssports.com/nhl/injuries`, principale — détermine qui apparaît
  dans `player_injuries`) recoupée avec ESPN (`espn.com/nhl/injuries`, secondaire — enrichit
  seulement les joueurs déjà trouvés via CBS, ne détermine jamais seule qui est "blessé").
  TSN écarté (React, aucune donnée dans le HTML initial) ; Yahoo validé utilisable mais pas
  branché (David a choisi CBS+ESPN). ESPN embarque un JSON structuré directement dans la page
  (`window['__espnfitt__']`, clé `injuries` trouvée par recherche récursive plutôt qu'un chemin
  fixe codé en dur — la structure n'est pas garantie stable) : statut canonique
  (`type.description`/`statusDesc`), date de retour estimée (`date`), note datée
  (`description`) — plus fiable à parser qu'un texte libre. `python_script/scrape_injuries.py`
  (ex-`scrape_cbs_injuries.py`), jumelage via `projections_common.py` (même logique que les
  imports de projections CBS).
- **Upsert avec suivi de durée** (remplace l'ancien delete+reinsert complet) :
  `player_injuries.first_seen_at` est préservé d'un run à l'autre tant qu'un joueur reste dans
  la liste CBS — nécessaire pour calculer "day-to-day depuis plus de 14 jours". `est_return_date`
  (DATE, parsée par le scraper depuis le texte CBS ou la date ESPN — motif `Mon D` du type
  "Oct 2", année inférée : si la date semble déjà passée de 200+ jours, c'est l'an prochain, la
  saison LNH étant à cheval sur deux années civiles) est aussi stockée. Un joueur qui sort de la
  liste CBS (guéri) est supprimé, pas juste laissé périmé. Cron quotidien
  (`.github/workflows/injuries.yml`, 16h UTC/midi ET), séparé du pipeline hebdomadaire. Cible
  toujours prod comme les autres scripts.
- **Admissibilité LTIR** (`app/lib/ltirEligibility.ts`, `computeLtirEligible()`) — règle de
  David : blessure dont `est_return_date` est à 14+ jours (couvre semaine-à-semaine/mois-à-mois),
  **ou sinon** blessé depuis 14+ jours (`first_seen_at`) sans date de retour claire (couvre le
  "day-to-day" qui traîne). Calculé à la volée à chaque affichage (jamais stocké) pour rester
  exact entre deux scrapes quotidiens — `app/lib/injuries.ts` centralise le fetch +
  calcul (`fetchInjuriesByPlayerId`/`fetchInjuriesByNhlId`, une seule requête réutilisée
  partout plutôt que dupliquée dans les 5 endroits qui affichent le badge).
- **Affichage**, limité aux joueurs `actif`/`reserviste` : badge rouge "Blessé" ou vert
  "Admissible LTIR" selon le calcul (`app/components/InjuryBadge.tsx`, composant partagé) sur
  `/poolers/[id]` (**les deux onglets** qui listent des joueurs — `Masse Salariale`
  (`RosterTable`, indexé par `player_id`) et `Alignement` (`PlayerStatsRow`, indexé par
  `nhl_id` — `PlayerContrib` n'a pas de `player_id` interne). Piège trouvé en corrigeant
  l'absence du badge sur Alignement : la relation embarquée PostgREST `players` sur
  `player_injuries` est un **objet simple**, pas un tableau, pour cette relation many-to-one —
  un premier correctif faisait `[0]?.nhl_id` dessus (toujours `undefined`, aucune erreur), pas
  détecté avant une vérification directe contre Supabase staging (script Python ponctuel) —
  leçon : un cast TypeScript (`as unknown as X`) masque ce genre d'erreur de forme de données,
  seule une vraie requête peut la confirmer. Aussi : étiquette texte dans les `<select>` de
  `/gestion-effectifs`, widget "Blessures dans le pool" sur l'accueil, et page dédiée
  `/statistiques/blessures` (toute la LNH, colonne "LTIR" + filtre "Admissibles seulement").

**Demandes de mise sur LTIR (`ltir_requests`) — David, 2026-09-23 (suite) :**
- Jusqu'ici, `ltir`/`ltir_sign` (mettre un actif sur LTIR, avec ou sans signer un remplaçant)
  étaient marqués `adminOnly` dans `ACTION_DEFS` (`GestionEffectifsManager.tsx`) — un pooler ne
  voyait même pas le bouton, seul l'admin pouvait le faire (en pratique, sur demande hors-app
  du pooler). Rien côté serveur ne vérifiait la blessure de toute façon. David voulait que le
  pooler puisse l'initier lui-même, mais avec l'admin gardant un droit de regard "selon son
  jugement" avant que ça devienne effectif — d'où ce système plutôt qu'une simple ouverture du
  self-service.
- **Flux** : le pooler choisit `ltir`/`ltir_sign` dans Gestion d'effectifs (désormais visibles à
  tous, pas juste l'admin) — au lieu de s'appliquer immédiatement comme les autres actions du
  panier, ces items-là passent par `submitLtirRequestAction` (`gestion-effectifs/ltir-actions.ts`)
  qui crée une ligne `ltir_requests` (`status='pending'`) sans toucher `pooler_rosters`, et
  notifie tous les admins (push/courriel, `sendPushToAdmins`, lien vers
  `/admin/effectifs?tab=approbation`). Le reste du panier (actions non-LTIR) continue de
  s'appliquer immédiatement comme avant. L'admin, lui, garde l'effet immédiat habituel — la
  demande d'approbation ne s'applique qu'aux poolers (`isAdmin` scindé dans `handleSubmit`,
  `GestionEffectifsManager.tsx`).
- **Bandeau "En attente d'approbation"** sur `/gestion-effectifs` (même patron que le bandeau de
  ballotage gagné) avec bouton "Annuler la demande" (`cancelLtirRequestAction`) — le pooler
  reste libre de changer d'avis tant que l'admin n'a pas décidé.
- **Approbation** (`/admin/effectifs?tab=approbation`, nouvelle section sous les transactions
  entre poolers, `LtirApprovalManager.tsx`) : affiche le badge d'admissibilité calculé comme
  aide à la décision. `adminDecideLtirRequestAction` → `decideLtirRequest()`
  (`app/lib/ltirRequests.ts`) réutilise **`submitBatchAction`** (gestion-effectifs/actions.ts)
  plutôt que de dupliquer la logique LTIR/LTIR+signature — tourne avec les droits de l'admin
  connecté (celui qui clique "Approuver"), donc `validateRosterLimits` est sautée comme pour
  toute action admin (l'admin n'est jamais bloqué, même comportement que partout ailleurs).
- **Date effective = la date de SOUMISSION par le pooler, pas celle de l'approbation** (David,
  2026-09-23) — `submitted_at` (tronqué en `YYYY-MM-DD`) passé à `submitBatchAction` via
  `forcedDate`, même mécanisme que les autres dates historiques de l'app (voir plus haut,
  "Convention — date historique d'un mouvement de roster").
- Si le joueur n'est plus dans l'alignement du pooler au moment d'approuver (libéré/échangé
  entretemps), l'approbation échoue avec un message clair plutôt que d'écrire n'importe quoi —
  l'admin n'a qu'à rejeter cette demande-là.
- Écriture directe via `createAdminClient()`, même patron que `waiverClaims.ts`/`tradeOffers.ts`
  — fichier `gestion-effectifs/ltir-actions.ts` séparé de `actions.ts` (comme
  `waiver-actions.ts`/`trade-actions.ts`) pour éviter un cycle d'import : `lib/ltirRequests.ts`
  appelle `submitBatchAction` (`actions.ts`) à l'approbation, donc `actions.ts` ne peut pas
  importer dans l'autre sens. RLS `ltir_requests` : lecture publique + admin seulement en
  écriture, même patron que les autres tables de ce genre.

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

Pages de consultation : `/`, `/joueurs`, `/statistiques`, `/statistiques/ahl`,
`/statistiques/blessures`, `/repechage`,
`/poolers`, `/poolers/[id]`, `/journal-transactions`, `/gestion-series`, `/classement-series`,
`/classement`, `/classement/hebdomadaire`, `/classement/mensuel`, `/aide`, `/a-propos`

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
| `python_script/generate_backup_tool.py` | Génère `backup/pool_backup.html` (backup manuel hors-ligne) |
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
