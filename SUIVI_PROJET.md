# Suivi du projet Cap Crunch

Derniere mise a jour: 2026-08-30

## Role du fichier

Ce fichier sert de memoire de travail entre nos sessions.
Je l'utiliserai pour:
- resumer l'etat courant du projet;
- noter les decisions importantes;
- consigner les modifications effectuees;
- lister les prochains chantiers et les points en suspens.

## Instantane actuel

Structure du projet, stack, routes applicatives (utilisateur + admin) et contraintes
techniques : voir `CLAUDE.md` (sections 1 à 6) — c'est la référence maintenue, pour éviter
qu'un second inventaire dérive silencieusement de la réalité comme celui qui était ici
jusqu'au 2026-07-17 (encore `/admin/joueurs`, `/admin/poolers`, `/admin/rosters` comme pages
admin courantes, alors que ces routes avaient été consolidées en pages hub à onglets).

## Journal des sessions

### 2026-08-31

**[Chore] — Reset complet de la saison active 2025-26 en staging + masquage config Séries**
(`app/app/admin/config/ConfigTabsClient.tsx`, `CLAUDE.md`, script ponctuel) :
- Suite à la session précédente : David avait testé les mécaniques d'échange via
  `/admin/effectifs?tab=historique` sur 2025-26 (staging), laissant des résidus dans
  `pooler_rosters` (Mode init ne touche que les joueurs explicitement resoumis, pas de wipe
  complet) — confirmé par diagnostic (379 `pooler_rosters`, 75 `roster_change_log`, 5
  `transactions`, tout via `/admin/historique`).
- Reset appliqué en staging (script ponctuel, service key) : suppression complète de
  `transaction_items`/`transactions`/`roster_change_log`/`pooler_rosters` pour la saison
  2025-26 (id=1). Exécution bloquée une première fois par le classificateur du mode auto
  (action destructive) — débloqué après confirmation explicite de David ; au moment de la
  relance, les compteurs étaient déjà à 0 (probablement roulé par David entre-temps en
  parallèle). État final vérifié : les 4 tables à 0 ligne pour cette saison.
- David repart sur `/admin/init?tab=rosters` (Mode init) pour redonner les alignements de
  départ proprement, puis ressaisira l'historique réel via `/admin/historique`.
- **Config Pool Séries masquée** : sur demande de David (cohérence avec le retrait de Pool
  Séries de la nav le 2026-08-30), les onglets `Pool Séries` et `Pointage Séries` de
  `/admin/pool?tab=config` sont retirés du tableau `TABS` affiché dans `ConfigTabsClient.tsx`
  — formulaires et logique conservés, juste plus dans la barre d'onglets. Pas de route/URL
  séparée ici (onglets = état local du composant), donc pas d'accès direct par URL comme pour
  `/admin/series` ; à remettre dans `TABS` si une saison séries redevient active.
- Validé avec `tsc --noEmit` (0 erreur).

### 2026-08-30 (suite)

**[Feature] — Plage de dates personnalisée dans Suivi de l'activité**
(`app/app/admin/suivi/SuiviTable.tsx`) :
- David testait les mécaniques d'échange via `/admin/effectifs?tab=historique` sur la saison
  active 2025-26 (staging) et voulait consulter le journal (`/admin/pool?tab=suivi`) sur une
  période en dehors des presets existants (7j/30j/Tout) — ses entrées de test sont datées à
  travers toute la saison, pas dans les 30 derniers jours.
- Ajout d'une option "Plage personnalisée…" au filtre date existant — affiche deux champs
  `<input type="date">` (du/au) quand sélectionnée. Filtrage 100% client (les événements sont
  déjà tous chargés côté client, pas de nouveau fetch).
- Note pour plus tard : la requête qui alimente ce tableau (`admin/pool/page.tsx`) n'est pas
  filtrée par saison et limitée à 100 `roster_change_log` / 50 `transactions` les plus
  récents (toutes saisons confondues) — pas un problème avec le volume actuel (75+5 pour
  2025-26), à surveiller si le volume grossit.

### 2026-08-30

**[Refactor] — Réorganisation du menu pooler : Alignements, Classement, LNH, Repêchage,
Ressources, Pool Séries retiré**
(`app/components/Navbar.tsx`, `app/app/layout.tsx`, `CLAUDE.md`) :
- Même exercice que la réorg du menu Admin du 2026-08-28 : sitemap visuel (Artifact, actuel vs
  proposé) itéré avec David sur plusieurs tours avant de toucher au code.
- **Pool Saison → Alignements** : ne garde plus que Mon équipe, Équipes, Transactions, Gestion
  d'effectifs — Classement en est sorti. Nom choisi par David (terme hockey déjà utilisé dans
  le projet — « Alignement par pooler et par saison »).
- **Classement** promu en dropdown de premier niveau (Saison complète, Hebdomadaire/Mensuel à
  venir) — sortait auparavant en bas d'un dropdown déjà chargé.
- **LNH** (nouveau) : fusion de Statistiques + Calendrier + Contrats LNH (ex-item à plat), en
  3 sections dans un seul dropdown.
- **Repêchage** : inchangé.
- **Ressources** (nouveau) : Planification (déplacée telle quelle) + Aide & Règlements
  (déplacé du menu Compte/avatar, qui ne garde plus que Mon compte/Signaler/Déconnexion).
  Nom choisi par David. Babillard (aujourd'hui propre au sondage de planification, pourrait
  devenir global) et une vraie documentation des outils/guide d'utilisateur ont été identifiés
  comme candidats naturels pour cette section, mais ce sont des chantiers de contenu/fonctionnalité
  séparés — pas construits dans cette passe, juste prévus dans le sitemap.
- **Pool Séries retiré de la nav pooler** (David : le pool ne fait habituellement pas de
  séries) — routes et code entièrement conservés (`/gestion-series`, `/classement-series`,
  `/resultats`), plus atteignables que par URL directe, même traitement que `/admin/series`
  le 2026-08-28. La prop `newPlayoffActive`/`initialNewPlayoffActive` (calculée dans
  `layout.tsx` via une requête sur `pool_seasons.is_playoff`) a été supprimée avec le bloc de
  nav qui l'utilisait — plus aucun usage ailleurs dans le code.
- Menu mobile restructuré en parallèle avec les mêmes sections (`MobileSection`).
- `CLAUDE.md` section 5 mise à jour : nouvelle table du menu pooler, note sur `/admin/series`
  qui n'a désormais plus aucun point d'entrée dans la nav (accessible par URL directe
  seulement, comme documenté depuis le 2026-08-28 côté admin).
- Validé avec `tsc --noEmit` (0 erreur) et `npm run build` (succès, toutes les routes
  existantes présentes dans la liste générée, y compris `/admin/series`, `/gestion-series`,
  `/classement-series`, `/resultats`, `/aide`, `/planification`) — pas de test manuel dans le
  navigateur cette session.
- Sitemap de travail (Artifact) mis à jour en fin de session pour refléter l'implémentation
  finale : https://claude.ai/code/artifact/9da045f1-e649-4948-a3fe-b782470d196f

### 2026-08-28

**[Refactor] — Réorganisation du menu Admin : moins d'entrées, section Mise à jour de données,
Pool des séries retiré**
(`components/Navbar.tsx`, `components/AdminHubBackLink.tsx` [nouveau],
`app/admin/pool/page.tsx`, `app/admin/effectifs/page.tsx`, `app/admin/init/page.tsx`,
`app/admin/repechage/page.tsx`, `app/admin/donnees/page.tsx` [nouveau],
`app/admin/planification/page.tsx`, `app/admin/joueurs/page.tsx`,
`app/admin/joueurs/[id]/page.tsx`, `app/admin/joueurs/nouveau/page.tsx`,
`app/admin/draft-center/page.tsx`, `app/admin/draft-center/[id]/page.tsx`,
`app/admin/draft-center/AdminDraftYearSelect.tsx`, `app/admin/page.tsx`,
`app/planification/PlanificationManager.tsx`, `CLAUDE.md`) :
- Discussion en deux temps avec David : d'abord un sitemap visuel (Artifact, arbre du menu
  Admin actuel vs proposé) pour itérer sur le regroupement avant de toucher au code, puis
  deux ajustements décidés en cours de route (retrait de Pool des séries, regroupement de
  Planification avec Communication/Suivi).
- **Dropdown Admin** simplifié de 9 à 6 entrées : Gestion du pool, Nouvelle saison,
  Initialisation, Repêchage recrues, Gestion des effectifs, Mise à jour de données.
- **`/admin/pool`** : les onglets Joueurs (doc pipeline) et Prospects sortent (→ nouvelle
  page `/admin/donnees`) ; Communication et Suivi perdent leur raccourci séparé dans le
  dropdown (ils restaient déjà des onglets de cette page — juste le raccourci en moins) ;
  Planification y entre comme nouvel onglet (données déplacées depuis l'ancienne page
  `/admin/planification`, composant `AdminPlanificationManager` réutilisé tel quel).
- **Nouvelle page `/admin/donnees`** ("Mise à jour de données") : 2 onglets — `pipeline`
  (fusion du contenu quasi identique qui existait en double dans l'onglet Joueurs de
  `/admin/pool` et l'onglet Données de `/admin/effectifs`, augmenté d'un paragraphe sur
  `import_drafts.py`) et `prospects` (Classement des prospects, déplacé tel quel).
- **`/admin/effectifs`** : onglet Données retiré (contenu dupliqué, voir ci-dessus).
- **`/admin/init`** : l'onglet Pré-saison n'apparaît plus dans la barre d'onglets (ce n'est
  plus un réglage "déjà fait" pour la saison courante) mais reste un `tab` valide, accessible
  uniquement via le lien fourni par `/admin/nouvelle-saison?...&tab=presaison`.
- **Mécanisme "retour au hub"** : nouveau composant `AdminHubBackLink` — affiche un lien
  "← Retour à Nouvelle saison" en haut de `/admin/init` et `/admin/repechage` quand la page
  est ouverte avec un `saisonId` valide (donc depuis le hub `/admin/nouvelle-saison`), pour
  naviguer d'étape en étape sans repasser par le menu Admin.
- **Pool des séries** : retiré du dropdown Admin (David : ne servait qu'aux tests, le pool ne
  fait habituellement pas de séries) — route `/admin/series` et code entièrement conservés,
  toujours atteignable par URL directe et toujours listé dans le sous-menu "Pool Séries"
  côté pooler (`newPlayoffActive`) quand une saison séries est active.
- Redirections mises à jour en cascade pour rester cohérentes : `/admin/joueurs`,
  `/admin/joueurs/[id]`, `/admin/joueurs/nouveau` → `/admin/donnees?tab=pipeline` ;
  `/admin/draft-center`, lien retour dans `/admin/draft-center/[id]`, sélecteur d'année →
  `/admin/donnees?tab=prospects` ; `/admin/planification` → `/admin/pool?tab=planification` ;
  liens admin dans `PlanificationManager.tsx` (vue pooler) mis à jour vers la nouvelle URL
  directe plutôt que de passer par la redirection.
- `CLAUDE.md` section 5 (routes) mise à jour pour refléter la nouvelle structure.
- Validé avec `tsc --noEmit` (0 erreur) et `npm run build` (succès, `/admin/donnees` présent
  dans la liste des routes générées) — pas de test manuel dans le navigateur cette session.
- Commit : `0a4d8b5`

### 2026-08-28 (suite)

**[Process] — Déploiement direct sur `main` par erreur → nouvelle règle "staging avant main"**
(`CLAUDE.md`) :
- La réorg du menu Admin ci-dessus a été poussée directement sur `main`, qui déploie
  automatiquement en prod (`cap-crunch.vercel.app`). David est allé tester sur staging
  (son réflexe habituel) et n'y a rien vu, puisque `staging` est une branche séparée,
  synchronisée depuis `main` seulement par merges ponctuels — le changement était donc déjà
  en prod, non validé, avant même d'être visible en staging. Ordre inverse de ce qui était
  voulu.
- Corrigé dans l'immédiat : `git checkout staging && git merge main && git push` (commit
  `6625ae6`) pour que staging reflète enfin le changement.
- Nouvelle règle ajoutée dans `CLAUDE.md` section 10 : tout changement de code passe
  désormais par `staging` en premier (push automatique, sans confirmation, comme avant) ;
  la fusion vers `main`/prod attend une validation explicite de David sur staging — plus
  jamais automatique. Exception inchangée : le pipeline CSV (section 2) continue de pousser
  directement sur `main`, convention distincte propre aux données.
- Commit de la règle elle-même poussé sur `staging` d'abord (`8029ea8`), en application
  immédiate de ce qu'elle dit — pas encore fusionné vers `main`, en attente de validation.
- Commit : `8029ea8`

### 2026-08-27 (suite 7)

**[Chore] — Reset de 2026-27 en staging pour retester la transition via le nouveau hub**
(aucun fichier modifié, script ponctuel) :
- David veut retester la séquence de transition en repartant de zéro sur 2026-27 (plutôt que
  d'utiliser 2027-28, encore vierge, que j'avais proposé) — pour valider le nouveau hub
  `/admin/nouvelle-saison` (suite 6) sur le cas réel déjà expérimenté cette session.
- Vérifié avant toute suppression ce qui était réellement rattaché à `pool_season_id=4`
  (2026-27) en staging : `pooler_rosters` 329 lignes (la copie faite en suite 3-4),
  `pool_draft_picks` 32 lignes (auto-créées à la création de la saison, indépendant du test
  de transition), `roster_change_log`/`transactions`/`cap_signing_watch` 0 — rien d'autre à
  préserver ou nettoyer.
- Reset appliqué directement en base (clé de service, staging) : suppression des 329 lignes
  `pooler_rosters` de 2026-27, `is_active=false` sur 2026-27, `is_active=true` sur 2025-26.
  Les 32 `pool_draft_picks` de 2026-27 sont restés intacts (pas liés à la transition testée).
- **État actuel en staging** : 2025-26 de nouveau active, 2026-27 vide et inactive, prête à
  être retransitionnée via `/admin/nouvelle-saison` à la prochaine session. 2027-28/2028-29
  toujours vierges si un test alternatif est préféré.

### 2026-08-27 (suite 6)

**[Feature] — Hub orchestrateur `/admin/nouvelle-saison` + déblocage de la préparation à l'avance**
(`app/app/admin/init/page.tsx`, `app/app/admin/init/SaisonSelectNav.tsx`,
`app/app/admin/presaison/PicksManager.tsx`, `app/app/admin/repechage/page.tsx`,
`app/app/admin/nouvelle-saison/page.tsx`, `app/components/AdminGuidePanel.tsx`,
`app/components/Navbar.tsx`, `CLAUDE.md`) :
- David a demandé de revoir le UI de la séquence "nouvelle saison" : le flux réel (validé
  cette session) doit être Transition des rosters → Choix de repêchage → Repêchage des
  recrues → Banque de recrues → Pré-saison (ELC, libérations, agents libres) → **Activer** en
  tout dernier, avec l'activation clairement distincte de la préparation. Planifié via
  `EnterPlanMode` (2 agents Explore en parallèle sur les hubs `/admin/pool?tab=config` et
  `/admin/init`+`/admin/repechage`+`AdminGuidePanel` avant d'écrire du code.
- Constat clé de l'exploration : presque tous les outils existaient déjà et fonctionnaient
  (transition, choix de repêchage, repêchage annuel, pré-saison — y compris un repêchage
  guidé d'agents libres déjà intégré dans `PresaisonManager`, pas une nouvelle fonctionnalité
  à construire). Le vrai blocage : **`Rosters initiaux` et `Banque de recrues`** étaient
  câblés en dur sur `is_active=true` (`admin/init/page.tsx`), donc impossible de préparer une
  saison avant de l'activer — contraire à l'ordre demandé. `Pré-saison`/`Choix de repêchage`
  acceptaient déjà n'importe quelle saison. Pas de nouveau statut de saison en base —
  `is_active` reste la seule bascule, la séparation demandée vient du fait que la préparation
  est maintenant possible sur une saison encore inactive.
- `admin/init/page.tsx` : les 4 onglets acceptent maintenant `&saisonId=` (réutilise
  `SaisonSelectNav`, déjà utilisé par `/admin/repechage` — pas de nouveau composant) ;
  `rosters`/`recrues` récupèrent désormais toutes les saisons régulières au lieu d'une seule
  ligne active ; `presaison`/`choix` respectent `saisonId` s'il est fourni (`choix` via un
  nouveau prop `initialSaisonId` sur `PicksManager`, pour permettre le lien profond depuis le
  nouveau hub sans changer sa logique interne).
- Bug trouvé en cours de route (avant déploiement) : `SaisonSelectNav` faisait toujours
  `${baseHref}&saisonId=...`, cassant si `baseHref` n'a pas déjà de `?` — `/admin/repechage`
  contournait ça avec un `baseHref="/admin/repechage?saisonId"` (placeholder sans valeur).
  Corrigé le composant partagé pour détecter le bon séparateur (`?` vs `&`) et retiré le
  contournement dans `/admin/repechage/page.tsx`.
- Nouveau `/admin/nouvelle-saison` (route à part, comme `/admin/repechage`/`/admin/planification`
  — pas un 6e sous-onglet de Configuration) : sélecteur de saison unique en haut, 6 cartes
  dans l'ordre demandé, chacune avec un résumé en lecture seule (comptages simples, pas de
  logique métier dupliquée — évite de reproduire la logique de protection recrue déjà
  dupliquée ailleurs, voir session sur `previewTransitionAction`) et un lien vers l'outil
  existant avec la saison pré-sélectionnée. La carte "Activer la saison" est visuellement
  distincte (bordure/bouton émeraude) et en dernière position.
- `AdminGuidePanel.tsx` : les 3 étapes détaillées (transition/pré-saison/repêchage) remplacées
  par un seul lien vers `/admin/nouvelle-saison`, pour ne plus maintenir la séquence à deux
  endroits — cause déjà d'une correction en session précédente (2026-08-24 suite 8).
- Lien ajouté au dropdown Admin de `Navbar.tsx` (desktop + mobile).
- Hors scope (mentionné à David, pas fait) : `RookieOverrideManager.tsx`/`PresaisonTabs.tsx`
  sont du code mort (jamais importés), doublon de `BanqueRecruesManager.tsx` — à supprimer
  séparément si confirmé. Renommer `/admin/init` en "Démarrage du pool" dans la Navbar —
  cosmétique, pas fait.
- `npx tsc --noEmit` + `npm run build` propres après chaque lot de fichiers.

### 2026-08-27 (suite 5)

**[Validation] — Outil de transition de saison validé de bout en bout (staging)**
(aucun fichier modifié) :
- Après les fix `previewTransitionAction`/`transitionSeasonAction` de cette session, David a
  confirmé : "Transitionner les rosters" (2025-26 → 2026-27) puis "Activer" fonctionnent
  correctement en staging — la bascule de saison active est effective.
- Séquence complète maintenant validée : aperçu (avertissement sans-contrat correct,
  recrues protégées exclues) → copie des rosters → activation. Prochaine étape logique :
  rejouer la même séquence côté **prod** quand David sera prêt (voir décision confirmée le
  2026-08-24, [[project_historique_excel_import]] — copier les alignements finaux, pas
  l'historique complet, pour prod).

### 2026-08-27 (suite 4)

**[Fix] — `transitionSeasonAction` échouait : contrainte unique manquante en base**
(`app/app/admin/config/actions.ts`) :
- David a cliqué "Confirmer la transition" (2025-26 → 2026-27, staging) — erreur Postgres
  `there is no unique or exclusion constraint matching the ON CONFLICT specification`.
- Cause : l'upsert utilisait `onConflict: 'pooler_id,player_id,pool_season_id'`, en supposant
  la contrainte `UNIQUE(pooler_id, player_id, pool_season_id)` documentée dans `schema.sql`
  (ligne 80) — absente en réalité sur la base staging (dérive schéma/doc, pas de migration
  trouvée qui l'aurait supprimée volontairement). Vérifié que la saison cible était restée
  vide (0 ligne) après l'échec — insertion atomique, rien à nettoyer.
- Plutôt que de dépendre d'une contrainte dont l'existence réelle n'est pas fiable (et sans
  accès DDL direct pour la recréer sans passer par David), `transitionSeasonAction` filtre
  maintenant lui-même les entrées déjà copiées (requête `select` sur la saison cible avant
  l'insert) puis fait un `insert` simple au lieu d'un `upsert` — idempotent sans dépendre
  d'`ON CONFLICT`.
- `npx tsc --noEmit` + `npm run build` propres.

### 2026-08-27 (suite 3)

**[Fix] — Avertissement "sans contrat" de la transition incluait les recrues protégées**
(`app/app/admin/config/actions.ts`, `SeasonsManager.tsx`) :
- David a rouvert l'aperçu de transition (`previewTransitionAction`) — la liste "27 joueurs
  sans contrat" incluait des recrues encore protégées (ex: Zharovsky, `recrue`), alors que
  l'absence de contrat NHL est normale et attendue pour un prospect protégé (5 saisons
  repêchage ou ELC actif) — contrairement à un vétéran actif/réserviste non resigné, seul
  cas visé par le mécanisme de cap simulé de la session précédente (suite).
- Vérifié que le mécanisme lui-même (`checkSigningsAction`, pré-saison, gestion d'effectifs,
  `/poolers/[id]`) excluait déjà correctement les recrues protégées (filtre `player_type in
  ('actif','reserviste')` ou `continue` avant calcul de cap) — seul l'aperçu de transition,
  antérieur à ce chantier et indépendant, ne faisait pas la distinction.
- `previewTransitionAction` calcule maintenant la même logique de protection que
  `loadPresaisonDataAction` (repêché : `seasonStartYear - draftYear >= 5` ; agent libre :
  ELC actif ou non) et exclut les recrues encore protégées de `noContract`. Reste inclus :
  vétérans non signés, LTIR, et recrues dont la protection est expirée.
- Texte d'avertissement corrigé ("cap = $0" → cap simulé/estimé, suivi via l'onglet
  Conformité) — obsolète depuis l'introduction de `getEffectiveCap`.
- `npx tsc --noEmit` + `npm run build` propres.

### 2026-08-27 (suite 2)

**[Fix] — Suppression de 2026-PO bloquée à nouveau, 4 tables du pool des séries manquantes**
(`app/app/admin/config/actions.ts`, `schema.sql`, `CLAUDE.md`) :
- Après le premier correctif de `deleteSeasonAction` (player_stat_snapshots/
  roster_change_log), David a réessayé de supprimer 2026-PO — la saison restait affichée
  malgré le clic. Vérifié en base : `player_stat_snapshots`/`roster_change_log` étaient bien
  vides pour cette saison (le clic avait donc réussi jusque-là), mais **4 tables du pool des
  séries** n'étaient toujours pas nettoyées : `playoff_pool_rosters` (123 lignes bloquantes),
  `playoff_participating_teams` (2 lignes bloquantes), `playoff_eliminations` et
  `playoff_pool_standings_cache` (vides actuellement, mais pas nettoyées non plus — ajoutées
  par prudence pour la prochaine saison de séries).
- Trouvé en cherchant tous les `.from(...)` de `gestion-series/playoff-pool-actions.ts` —
  même angle mort que la session précédente (tables créées directement, jamais ajoutées à
  `schema.sql`). Bonus : `CLAUDE.md` citait par erreur `series_round_rosters` (n'existe pas
  du tout) au lieu de `playoff_pool_rosters` — corrigé.
- `deleteSeasonAction` nettoie maintenant ces 4 tables (par `pool_season_id`, avant la
  suppression finale) en plus des 2 déjà gérées. Toujours 100% applicatif, aucune nouvelle
  migration requise (les 4 tables existent déjà partout) — documentées dans `schema.sql`
  pour combler le trou historique.
- Vaut la peine de retenir : ce pool a maintenant sa propre famille de tables `playoff_*`
  jamais documentée en un seul endroit — si un futur `deleteSeasonAction`-like bloque encore,
  regarder d'abord du côté de `gestion-series/` avant de chercher ailleurs.

### 2026-08-27 (suite)

**[Feature] — Cap simulé pour joueurs sans contrat + conformité continue**
(`schema.sql`, `app/lib/capUtils.ts`, `app/app/admin/presaison/actions.ts`,
`PresaisonManager.tsx`, `types.ts`, `app/app/gestion-effectifs/actions.ts`,
`GestionEffectifsManager.tsx`, `app/app/poolers/[id]/page.tsx`,
`app/app/admin/effectifs/cap-watch-actions.ts`, `CapWatchManager.tsx`, `page.tsx`,
`CLAUDE.md`) :
- En testant la transition de saison en staging, l'aperçu a montré 27 joueurs actifs sans
  contrat pour 2026-27 (UFA pas encore resignés) — comptaient 0$ au cap, un avantage caché.
  David a demandé : cap simulé (% configurable du salaire précédent) avec badge, notification
  au pooler quand le vrai contrat atterrit (surtout si ça dépasse le plafond), liberté totale
  de réaction (libérer/échanger/ajuster), et une date limite au-delà de laquelle seul l'admin
  peut libérer le joueur manuellement (jamais automatique). Décisions prises via
  AskUserQuestion : vérification manuelle admin (pas de lien pipeline Python→notifications),
  multiplicateur en réglage global (pas par saison), transition mise en pause jusqu'à ce que
  le mécanisme existe. Planifié avec `EnterPlanMode` (2 agents Explore en parallèle) avant
  d'écrire du code, vu l'ampleur (6 sites de calcul de cap trouvés, tous dupliqués
  indépendamment — aucune fonction centrale n'existait).
- `app/lib/capUtils.ts` (nouveau) : `getEffectiveCap(contracts, season, multiplier)` —
  fonction pure, cap réel si un contrat existe pour la saison, sinon contrat de la saison
  précédente × multiplicateur. Les contrats de toutes les saisons sont déjà chargés partout
  (pas de requête additionnelle nécessaire) — juste un lookup plus intelligent.
- Branché dans 3 sites prioritaires (pas les 6 — portée volontairement limitée pour ce
  chantier, voir plan) : pré-saison (badge "≈ estimé" par joueur), gestion d'effectifs
  (note récapitulative sur le panier projeté), `/poolers/[id]` (badge par ligne + note sur
  la masse salariale totale). `RosterManager.tsx`/`TransactionBuilder.tsx`/`poolers/page.tsx`
  restent sur l'ancien calcul pour l'instant, à étendre si le besoin se confirme.
- Nouvelle table `cap_signing_watch` (statuts `watching`/`flagged`/`resolved`/
  `admin_released`) + 2 colonnes `app_settings` (`unsigned_player_cap_multiplier`,
  `cap_deadline_days`). **Migration pas encore appliquée** — bloc SQL fourni à David pour
  staging d'abord.
- Nouvel onglet `/admin/effectifs?tab=conformite` (`CapWatchManager.tsx`, patron de cartes
  repris de `FeedbackAdminView.tsx`) : réglages (multiplicateur, délai), bouton "Vérifier les
  signatures" (`checkSigningsAction` — détecte les contrats fraîchement réels, notifie via
  `sendPushToUser` en réutilisant le patron déjà vu dans `gestion-effectifs/actions.ts`,
  auto-résout les cas réglés d'eux-mêmes), et un bouton "Libérer ce joueur" par cas en retard
  de délai (réutilise `submitTransactionAction(..., 'release', ...)` déjà utilisé par
  `PresaisonManager.handleRelease` — pas de nouvelle logique de libération dupliquée).
- `npx tsc --noEmit` + `npm run build` propres après chaque lot de fichiers.

### 2026-08-27

**[Fix] — Suppression d'une saison bloquée par `player_stat_snapshots` (FK sans CASCADE)**
(`app/app/admin/config/actions.ts`, `schema.sql`) :
- David a tenté de supprimer la saison de séries 2026-PO en staging (avant de commencer les
  tests de transition d'alignement) — erreur `violates foreign key constraint
  "player_stat_snapshots_pool_season_id_fkey"`. `deleteSeasonAction` nettoyait déjà
  `transactions`/`transaction_items` manuellement (pas de CASCADE sur `pool_season_id`) mais
  pas `player_stat_snapshots` — 249 lignes bloquantes pour cette saison en staging.
- Découverte en creusant : **`roster_change_log`** — la vraie table utilisée par
  `statusAt()`/`buildStandings()` (CLAUDE.md section 6) — et **`player_stat_snapshots`**
  n'étaient documentées nulle part dans `schema.sql`, malgré une utilisation active en
  staging et prod (même angle mort que `push_subscriptions`/`notification_log` trouvé le
  2026-08-25). `roster_changes` (avec un s, déjà dans `schema.sql`) est une table différente,
  legacy, colonnes différentes (`player_in_id`/`player_out_id` vs `player_id`/`old_type`/
  `new_type`) et 0 lignes en staging — jamais réellement utilisée, à ne pas confondre.
  Structure des deux tables ajoutée à `schema.sql` (reconstruite depuis les colonnes
  observées en base, pas garantie byte-exacte).
- `deleteSeasonAction` nettoie maintenant aussi `player_stat_snapshots` et
  `roster_change_log` (scope `pool_season_id`) avant de supprimer la saison — même
  patron que le nettoyage `transactions`/`transaction_items` déjà en place. Aucune migration
  requise (les deux tables existent déjà partout) — correctif 100% applicatif.

### 2026-08-25 (suite 13)

**[Fix] — Vrai calendrier cliquable pour sélectionner plusieurs dates candidates**
(`app/app/admin/planification/AdminPlanificationManager.tsx`) :
- David voulait sélectionner plusieurs dates d'un coup sur `/admin/planification` — pas
  possible avec `<input type="date">` : c'est une limite du composant natif du navigateur
  (un seul jour par ouverture du sélecteur), pas un bug de l'implémentation précédente
  (liste en attente + bouton "Enregistrer N dates" de la session précédente).
- Remplacé par `CalendarPicker`, une grille de mois maison (navigation ‹ mois précédent /
  suivant ›, semaines lundi-dimanche) où chaque clic sur un jour bascule directement son
  appartenance à la liste en attente (bleu = en attente, vert/désactivé = déjà proposée,
  clic à nouveau pour retirer). La liste de puces "À enregistrer" en dessous reste utile
  comme résumé compact quand les dates choisies s'étalent sur plusieurs mois (le calendrier
  n'affiche qu'un mois à la fois). Le bouton "Enregistrer N dates" et
  `addCandidateDatesAction` (session précédente) n'ont pas changé.

### 2026-08-25 (suite 12)

**[Feature] — Ajout de plusieurs dates candidates à la fois sur `/admin/planification`**
(`app/app/planification/actions.ts`, `app/app/admin/planification/AdminPlanificationManager.tsx`) :
- David gérait ses dates une par une (un aller-retour serveur par date). Nouveau flux : le
  sélecteur de date ajoute maintenant à une **liste en attente locale** (aucun appel serveur),
  affichée avec un style pointillé distinct des dates déjà enregistrées ; un seul bouton
  "Enregistrer N dates" envoie tout le lot d'un coup.
- `addCandidateDateAction` (singulier) remplacée par `addCandidateDatesAction` (pluriel,
  `dates: string[]`) — utilise `upsert(..., { onConflict: 'poll_id,candidate_date',
  ignoreDuplicates: true })` plutôt qu'un `insert` simple, pour qu'un doublon dans le lot (ou
  avec une date déjà enregistrée) n'échoue pas l'insertion complète.

### 2026-08-25 (suite 11)

**[Deploy] — Planification déployée en prod, mots de passe des vrais poolers réinitialisés**
(aucun fichier applicatif — DB prod + `credentials/poolers-prod.md`, non versionné) :
- Test complet validé en staging par David (login pooler réel, soumission de disponibilités,
  babillard, notifications push reçues des deux côtés) — passage en prod autorisé.
- Code déjà déployé (le push `main` de chaque session précédente s'applique automatiquement à
  prod) — confirmé via `gh api .../commits/.../status` (déploiement Vercel "success").
- Vérifié dans prod : `push_subscriptions`/`notification_log` existaient déjà (comme
  découvert plus tôt), mais `meeting_polls`/`meeting_poll_dates`/`meeting_poll_responses`/
  `app_settings`/`meeting_poll_comments` manquaient — migration combinée fournie à David pour
  le SQL Editor prod (même contenu que les migrations staging de cette session).
- Mots de passe réinitialisés pour les 8 vrais comptes prod (vrais courriels, pas des
  placeholders comme en staging) via `auth.admin.update_user_by_id`, mêmes principes que la
  session du reset staging. Écrits dans `credentials/poolers-prod.md` (dossier gitignored,
  jamais commité). Contrairement à staging, pas de vérification de connexion réelle possible
  ici — aucune clé anon prod disponible localement dans ce repo (prod ne tourne jamais en
  local, voir CLAUDE.md section 1).
- **Reste à faire par David** : exécuter la migration en prod, puis distribuer les
  identifiants de `credentials/poolers-prod.md` aux vrais poolers.

### 2026-08-25 (suite 10)

**[Refactor] — Sépare la gestion admin de `/planification` vers `/admin/planification`**
(`app/app/admin/planification/page.tsx`, `app/app/admin/planification/AdminPlanificationManager.tsx`,
`app/app/planification/page.tsx`, `app/app/planification/PlanificationManager.tsx`,
`app/components/Navbar.tsx`, `CLAUDE.md`) :
- David a demandé que `/planification` (vue pooler) ne montre plus que ce qui concerne un
  pooler — ses disponibilités, le résumé, le babillard — et que la gestion (créer/réinitialiser
  le sondage, dates candidates, toggle "Mode avant-première") déménage dans un vrai menu admin.
- Nouvelle route `/admin/planification` (à part, pas un onglet d'un des 4 hubs — même patron
  que `/admin/repechage`), lien ajouté dans le dropdown Admin (desktop + mobile) de la Navbar.
  Réutilise telles quelles les server actions déjà en place (`createPollAction`,
  `addCandidateDateAction`, `removeCandidateDateAction`, `resetPollAction`,
  `setNavPlanificationOnlyAction` — importées via `@/app/planification/actions`, aucune
  duplication de logique).
- `/planification` simplifiée : logo + titre, "Mes disponibilités" (si des dates existent),
  Résumé, Babillard. Les messages "aucun sondage"/"aucune date" pointent maintenant vers
  `/admin/planification` pour l'admin plutôt que d'afficher les formulaires inline.
- Comportement inchangé pour le toggle avant-première lui-même (déjà corrigé plus tôt pour
  ne pas restreindre l'admin) — seul son emplacement dans l'UI a changé.

### 2026-08-25 (suite 9)

**[Fix] — Icône de notification push blanche/vide (badge Android)**
(`app/public/sw.js`, `app/public/icons/badge-192x192.png`) :
- David a remarqué que l'icône dans la notification push était juste blanche. Cause : `sw.js`
  utilisait `icon-192x192.png` (icône pleine, opaque, fond crème) à la fois pour `icon`
  (grande icône couleur, correcte) ET pour `badge` (petite icône de la barre de statut
  Android). Android traite toujours `badge` comme un pochoir monochrome basé sur le canal
  alpha de l'image — avec une icône 100% opaque sans transparence, il n'y a aucune forme à
  découper, donc Android affiche un carré/disque blanc plein.
- Généré `badge-192x192.png` : silhouette blanche sur fond **transparent**, extraite de
  l'icône existante par flood-fill depuis les coins (pas un seuil de couleur global — un
  seuil global confondait le fond crème avec les propres blancs du dessin — casquette,
  ampoule, sourcils — créant des "trous" dans la silhouette là où c'était blanc sur blanc;
  le flood-fill ne remplit que la région de fond réellement connectée aux bords, laissant les
  blancs "enclavés" du motif intacts et opaques).
- `sw.js` : `badge` pointe maintenant vers ce nouveau fichier, `icon` reste inchangé (déjà
  correct en couleur pleine). Pas de variante par environnement nécessaire — contrairement
  aux icônes d'app/PWA, ce badge est toujours monochromé par l'OS de toute façon.

### 2026-08-25 (suite 8)

**[Fix] — `push_subscriptions` n'existait pas en staging (jamais documentée dans schema.sql)**
(`schema.sql`) :
- Après la config VAPID, David a eu "public.push_subscriptions n'est pas trouvé" en cliquant
  "Activer les notifications" sur mobile. Vérifié directement dans les deux bases : la table
  existe en **prod** (2 abonnements réels, créée directement à un moment donné sans jamais
  être ajoutée à `schema.sql`) mais n'a **jamais existé en staging**. `notification_log`, elle,
  existe déjà dans les deux (staging vide, prod avec 32 entrées).
- Structure de `push_subscriptions` reconstruite depuis le code (pas d'accès SQL direct pour
  inspecter le schéma réel de prod) : `app/app/compte/push-actions.ts` révèle les colonnes
  (`user_id`, `endpoint`, `p256dh`, `auth`) et la contrainte `UNIQUE(user_id, endpoint)`
  (`onConflict: 'user_id,endpoint'` dans l'upsert). Les deux tables ajoutées à `schema.sql`
  (corps principal + bloc migration) pour combler ce trou de documentation historique.
- **Migration à exécuter en STAGING seulement** (prod a déjà la table) — bloc SQL dans
  `schema.sql`, section migrations.

### 2026-08-25 (suite 7)

**[Fix] — Variables VAPID jamais configurées dans Vercel (staging ET prod)**
(aucun fichier applicatif — configuration Vercel uniquement) :
- David ne pouvait pas activer les notifications push sur son téléphone en staging (bouton
  "Activer les notifications" → erreur générique après clic, PWA installée sur Android donc
  pas une histoire de permission navigateur). Vérifié directement dans Vercel : le projet
  `cap-crunch-staging` n'avait **aucune** variable VAPID (seulement les 3 Supabase) — cohérent
  avec la correction de doc de la session précédente (noms `VAPID_PUBLIC_KEY`/`VAPID_SUBJECT`
  documentés mais jamais réellement configurés nulle part, dans aucun des deux projets).
- Généré deux paires de clés VAPID distinctes (`npx web-push generate-vapid-keys`, package
  déjà installé) — une par projet Vercel, pas de partage entre staging et prod, cohérent avec
  le reste de l'isolation par environnement du projet (bases Supabase séparées, icônes
  distinctes). Clés **stockées uniquement dans Vercel** (Environment Variables des deux
  projets), pas dans ce repo ni dans `credentials/` — la private key ne devrait jamais
  transiter ailleurs que le champ "Secret" de Vercel.
  - `cap-crunch-staging` : `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_MAILTO`,
    scope "Production" (le projet n'a pas de flux de preview dans ce projet).
  - `cap-crunch` (prod) : même trio, sa propre paire de clés, scope "Production" seul —
    "Preview" pas nécessaire, aucune URL de preview Vercel n'est utilisée dans le flux de
    travail (toujours `main`→prod, `staging`→projet staging séparé).
- Redéployé les deux projets après ajout (`NEXT_PUBLIC_*` est figé au build, ne suffit pas de
  juste sauvegarder la variable dans Vercel).
- **Test de réception réelle pas encore confirmé** au moment d'écrire cette note — David
  devait retester après redéploiement.

### 2026-08-25 (suite 6)

**[Docs] — Corrige les noms des variables VAPID documentés (ne correspondaient pas au code)**
(`app/CLAUDE.md`) :
- David a demandé si les commentaires du babillard apparaissaient dans le suivi admin, et si
  les notifications fonctionnaient en staging. Recherche par agent : confirmé qu'aucune vue
  admin n'agrège `meeting_poll_comments`/`meeting_poll_responses` — seule
  `/planification` les affiche. Par contre, chaque appel `sendPushToAdmins` (soumission de
  disponibilités, commentaire) insère inconditionnellement une ligne dans `notification_log`
  (même si l'envoi push réel échoue silencieusement) — donc `Admin → Messages →
  Notifications` (`/admin/pool?tab=communication`) montre bien un historique indirect de
  l'activité `/planification`, juste pas une vue dédiée.
- En vérifiant l'infra push, trouvé que `app/lib/push.ts` (`initVapid()`) lit
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_MAILTO`, alors que
  `app/CLAUDE.md` et `SUIVI_PROJET.md` (note historique) documentaient
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` — noms différents sur 2 des 3
  variables. Si la config Vercel avait été faite d'après la doc plutôt que le code, les push
  échoueraient silencieusement (`initVapid()` retourne `false`, aucune erreur visible).
  `app/CLAUDE.md` corrigé pour refléter les vrais noms lus par le code.
- Pas vérifié directement si les variables sont correctement configurées dans le projet
  Vercel `cap-crunch-staging` (aucun accès Vercel API/CLI dans cette session) — à valider
  par David via Project Settings → Environment Variables, ou plus simple : bouton "Tester"
  dans `/compte` (`app/app/compte/PushToggle.tsx`/`testPushAction`) après avoir activé les
  notifications sur son propre appareil en staging.

### 2026-08-25 (suite 5b)

**[Chore] — Comptes poolers staging réinitialisés + dossier `credentials/` créé**
(`.gitignore`, `credentials/poolers-staging.md` — non versionné) :
- David a réalisé qu'aucun pooler ne s'était jamais réellement connecté (mots de passe
  temporaires d'origine oubliés). Demandé la requête pour les retrouver — impossible par
  design (Supabase ne stocke qu'un hash bcrypt, jamais le mot de passe en clair). Proposé la
  vraie solution : réinitialiser via l'API admin Supabase (`auth.admin.update_user_by_id`).
- Décision : staging d'abord pour valider le flux, prod ensuite une fois confirmé (fait en
  suite 11). 8 comptes staging réinitialisés (courriels `@staging.test`, des placeholders —
  pas les vrais poolers), mots de passe aléatoires générés (`secrets`, 10 caractères,
  majuscule/minuscule/chiffre garantis). Connexion réelle vérifiée via la clé anon staging
  (`app/.env.staging.local`) — `sign_in_with_password` réussi, confirmant que le reset
  fonctionne de bout en bout, pas juste que l'appel admin n'a pas levé d'erreur.
- Nouveau dossier `credentials/` à la racine, exclu de git (`.gitignore`) — jamais commité,
  jamais poussé. Sert à consigner les identifiants générés (staging et, plus tard, prod) dans
  un format lisible pour David, sans jamais les faire transiter par l'historique git.

### 2026-08-25 (suite 5)

**[Fix] — Le mode avant-première masquait aussi la Navbar pour l'admin**
(`app/components/Navbar.tsx`) :
- David a demandé si l'admin voyait le site complet en tout temps — non : `navPlanificationOnly`
  masquait le cluster de liens (Pool Saison, Statistiques, Admin, etc.) pour **tout le monde**,
  admin inclus, contrairement à l'intention (restreindre les poolers pendant la mise en place,
  pas l'admin qui doit continuer à naviguer le site pour faire son travail).
- Nouveau calcul `hidePoolNav = navPlanificationOnly && !effectiveIsAdmin` — le cluster complet
  et le menu mobile ne se masquent que si le mode est actif ET que le viewer n'est pas un admin
  effectif. Combine naturellement avec le toggle "Vue pooler" déjà existant
  (`effectiveIsAdmin = isAdmin && !isPoolerView`) : un admin qui active "Vue pooler" voit alors
  la Navbar restreinte comme un vrai pooler la verrait — utile pour prévisualiser l'effet du
  mode avant-première sans se couper soi-même l'accès au site.
- Simplifié les 6 gardes `effectiveIsAdmin && !navPlanificationOnly` du menu mobile (section
  Admin sous le menu Compte) en simplement `effectiveIsAdmin` — devenu redondant puisque
  `hidePoolNav` gère déjà la condition en amont pour tout le cluster.

### 2026-08-25 (suite 4)

**[Feature] — Babillard de commentaires sur `/planification`**
(`schema.sql`, `app/app/planification/actions.ts`, `app/app/planification/page.tsx`,
`app/app/planification/PlanificationManager.tsx`) :
- David a demandé un espace pour que les poolers laissent des commentaires libres liés au
  sondage de planification (ex: contraintes d'horaire, suggestions de lieu), en plus du choix
  de dates. Nouvelle table `meeting_poll_comments` (poll_id, pooler_id, body, created_at) —
  patron RLS identique aux autres tables `meeting_poll_*` : lecture publique, auteur peut
  publier/supprimer son propre commentaire, admin peut tout gérer (modération). **Migration
  pas encore appliquée** — bloc SQL ajouté dans `schema.sql`, à exécuter manuellement
  (staging d'abord).
- `addCommentAction` réutilise le même patron `sendPushToAdmins(...).catch(() => {})` que
  `submitAvailabilityAction` — notifie les admins (sauf l'auteur si c'est lui-même admin) à
  chaque nouveau commentaire, avec un extrait tronqué à 120 caractères dans le corps de la
  notification.
- UI : simple liste chronologique (nom, horodatage, texte) + zone de texte pour publier,
  sous la section Résumé. Suppression visible seulement pour l'auteur du commentaire ou un
  admin — la vérification d'appartenance est refaite côté serveur dans
  `deleteCommentAction` (pas seulement côté UI), RLS en filet de sécurité supplémentaire.

### 2026-08-25 (suite 3)

**[Fix] — favicon.ico générique entrait en concurrence avec les icônes badgées local/staging**
(`app/app/favicon.ico` → `app/public/favicon.ico`) :
- David a signalé ne plus voir le badge gris "L" sur l'icône en local. Vérifié par `curl`
  contre le serveur dev déjà en marche : le `<head>` contenait **deux** candidats
  `<link rel="icon">` — le fichier spécial `app/app/favicon.ico` (convention Next.js,
  identique sur les 3 environnements, jamais badgé puisqu'un seul fichier statique partagé)
  généré automatiquement par Next.js et injecté *avant* les PNG badgés déclarés
  explicitement dans `layout.tsx` (`/icons/local/favicon-16x16.png` etc.). Correction de la
  session du 2026-08-24 ("les `<link rel=icon>` explicites suffisent") invalidée par ce test
  — certains navigateurs peuvent préférer le premier candidat/le `.ico` générique.
- Correctif : déplacé `app/app/favicon.ico` vers `app/public/favicon.ico` — reste servi à la
  même URL `/favicon.ico` (aucun lien cassé, vérifié `200`), mais n'étant plus dans le
  dossier de convention spéciale de Next.js, il n'est plus auto-injecté comme `<link>` dans
  le `<head>`. Seuls les PNG badgés par environnement restent déclarés. Vérifié par `curl` :
  le candidat générique a disparu, seuls les liens `/icons/local/favicon-*.png` demeurent.

### 2026-08-25 (suite 2)

**[Design] — Icône de l'app + grand logo sur l'accueil et Planification**
(`app/public/icons/**`, `app/app/favicon.ico`, `app/public/branding/logo-app.png`,
`app/app/page.tsx`, `app/app/planification/PlanificationManager.tsx`) :
- David a fourni deux nouveaux visuels : `docs/branding/Cap_Crunch_Mobile_App_Icon.png`
  (même mascotte ampoule/casquette que la session précédente, mais sur fond crème plutôt que
  navy) pour l'icône, et `docs/branding/Cap_Crunch_Logo_App.png` (lockup complet — mascotte +
  bandeau "CAP CRUNCH" + tagline "Pool entre amis !" sur fond glace) pour un affichage "en
  gros" limité à l'accueil et `/planification`, pas les autres pages.
- Icône : même traitement que les sessions précédentes (recadrage carré exact, coins arrondis
  source repeints en crème via masque géométrique par distance plutôt qu'un seuil de couleur
  — le delta entre le crème de la carte et le blanc du canevas était trop faible, ~9/255,
  pour un seuil de couleur simple ; scanlines multiples nécessaires pour bien détecter la
  bbox). Régénéré les 3 variantes (prod/local/staging badge L/S) à toutes les tailles.
- Grand logo : copié tel quel dans `app/public/branding/logo-app.png` (pas de retouche —
  c'est un visuel "hero" déjà composé, pas une icône à aplatir), servi via `next/image`
  (optimisation à la volée, même pattern que l'icône déjà utilisée). Remplace le petit
  icône+titre "Cap Crunch" du `Header` de `app/app/page.tsx` (le wordmark étant déjà dans
  l'image, le `<h1>` texte devenait redondant — retiré). Ajouté en haut de
  `PlanificationManager.tsx`, au-dessus du titre "Planification".
- Validé par `next build` + requêtes `curl` directes contre le serveur dev déjà en marche
  (`/icons/icon-192x192.png`, `/branding/logo-app.png`, `/favicon.ico` tous 200, tailles
  correspondant aux nouveaux fichiers — ces routes contournent l'auth via le matcher de
  `proxy.ts`, pas besoin de session pour les tester). Pas de vérification visuelle en
  navigateur connecté (mêmes limites de credentials que les sessions précédentes).

### 2026-08-25 (suite)

**[Feature] — Planification ajoutée à la Navbar + toggle "Mode avant-première"**
(`schema.sql`, `app/app/layout.tsx`, `app/components/Navbar.tsx`,
`app/app/planification/actions.ts`, `app/app/planification/page.tsx`,
`app/app/planification/PlanificationManager.tsx`) :
- David a exécuté la migration `meeting_polls`/`meeting_poll_dates`/`meeting_poll_responses`
  en staging (erreur transitoire "Could not find the table... in the schema cache" observée —
  cache PostgREST pas encore rafraîchi juste après le `CREATE TABLE`, pas un vrai problème ;
  `NOTIFY pgrst, 'reload schema';` documenté dans `schema.sql` si ça se reproduit).
- Changement d'approche : au lieu d'un lien caché envoyé manuellement, `/planification`
  devient un lien permanent de la Navbar (réutilisable chaque année), avec un toggle admin
  "Mode avant-première" qui masque tous les *autres* liens de la Navbar pour tous les poolers
  (pas juste l'admin) tant que le reste de l'UI du pool n'est pas prêt à être montré — jusqu'à
  ce que David le désactive une fois la rencontre planifiée.
- Nouvelle table `app_settings` (une seule ligne, `id=1`) — réglage global, pas par-pooler
  (contrairement au "Vue pooler" existant qui est un simple `localStorage` côté admin, pour
  se prévisualiser soi-même). RLS : lecture publique, écriture admin seulement, même patron
  que les autres tables. **Migration pas encore appliquée** — bloc SQL ajouté dans
  `schema.sql`, à exécuter manuellement (staging d'abord).
- `app/app/layout.tsx` lit `app_settings.nav_planification_only` et le passe à `Navbar` ;
  dégrade proprement à `false` si la table n'existe pas encore (`?? false`, pas de throw côté
  supabase-js sur une erreur de requête) — vérifié par `curl` contre le serveur dev déjà en
  marche (aucune table `app_settings` en base à ce moment, page `/login` rendue sans erreur,
  `navPlanificationOnly:false` bien présent dans le payload RSC).
- `Navbar.tsx` : quand le flag est actif, tout le cluster de liens desktop/mobile (Pool
  Saison, Statistiques, Contrats LNH, Repêchage, Calendrier, Pool Séries, Admin) est remplacé
  par un seul lien Planification ; le menu compte (avatar, Mon compte, Aide, Déconnexion,
  Vue pooler) reste intact dans les deux modes. `setNavPlanificationOnlyAction` fait
  `revalidatePath('/', 'layout')` pour propager le changement immédiatement à toutes les
  pages (la Navbar vient du layout racine, pas d'une page individuelle).
- Toggle exposé directement sur `/planification` (visible admin seulement) plutôt que dans
  `/admin/pool?tab=config` — contextuellement plus proche de son usage.

### 2026-08-25

**[Feature] — Sondage de planification type Doodle (`/planification`)**
(`schema.sql`, `app/proxy.ts`, `app/app/login/page.tsx`, `app/app/planification/page.tsx`,
`app/app/planification/PlanificationManager.tsx`, `app/app/planification/actions.ts`,
`CLAUDE.md`) :
- Contexte : David veut planifier la rencontre annuelle du pool via l'app, et voit ça comme
  une occasion de tester en conditions réelles le login et les notifications push avec les
  poolers (pas juste en admin). Nouvelle route volontairement **hors Navbar** — lien partagé
  manuellement, "avant-première" avant d'éventuellement l'exposer plus largement.
- Format retenu (discuté) : Doodle classique — l'admin propose des dates candidates, chaque
  pooler coche **toutes** celles qui lui conviennent (pas une seule préférée) — permet de
  repérer la date avec le plus de disponibilités communes. Résumé (qui est dispo quand)
  visible à tous les poolers, pas juste à l'admin.
- 3 nouvelles tables (`meeting_polls`, `meeting_poll_dates`, `meeting_poll_responses`) —
  RLS suit le patron déjà établi (lecture publique, admin gère les dates/le sondage, chaque
  pooler gère ses propres réponses via `pooler_id = auth.uid()`). **Migration pas encore
  appliquée** — bloc SQL ajouté dans `schema.sql` (section migrations), à exécuter
  manuellement dans le SQL Editor Supabase, staging d'abord.
- `submitAvailabilityAction` réutilise le patron `sendPushToAdmins(...).catch(() => {})`
  déjà en place (`app/app/gestion-series/playoff-pool-actions.ts`) — fire-and-forget, exclut
  l'auteur de la soumission (utile si un admin répond aussi comme pooler).
- Gap corrigé en passant : `proxy.ts` renvoyait toujours vers `/login` sans retenir la page
  d'origine, et `/login` renvoyait toujours vers `/` après connexion — un lien direct comme
  `/planification` perdait donc sa destination. Ajout d'un paramètre `?next=` porté par
  `proxy.ts` à travers la redirection, lu par `/login` (depuis `window.location.search`,
  pas `useSearchParams` — évite l'exigence de `Suspense` de Next.js) pour rediriger au bon
  endroit après connexion. Validé par requête directe contre le serveur dev déjà en marche
  (`curl /planification` non authentifié → `307` vers `/login?next=%2Fplanification`).
- Retrait d'une date candidate par l'admin nettoie aussi les réponses déjà soumises pour
  cette date (`meeting_poll_responses.candidate_date` n'est pas une clé étrangère vers
  `meeting_poll_dates` — juste une colonne `DATE` parallèle scoping par `poll_id`, pour
  éviter une jointure ; sans ce nettoyage explicite ces réponses resteraient orphelines).
- **À faire par David avant que la fonctionnalité soit utilisable** : exécuter le bloc SQL de
  migration dans Supabase (staging), puis tester le flux (créer le sondage, ajouter des
  dates, soumettre une réponse depuis un compte pooler non-admin) avant de partager le lien.

### 2026-08-24 (suite 9)

**[Design] — Nouveau logo "ampoule + casquette CC" adopté pour l'icône de l'app**
(`app/public/icons/**`, `app/app/favicon.ico`, `docs/branding/DG_Ampoule.png`,
`docs/branding/dg-ampoule-simplified.png`) :
- David a proposé une alternative au logo cerveau-fissuré : une ampoule (idée) avec un "$" au
  centre au-dessus d'une casquette portée par une rondelle, texte "DG" sur la casquette. Avis
  donné (traits fins, texture, "DG" sans lien avec le nom de l'app) — David a demandé un essai
  de simplification.
- Tentative de filtrage (flou + réduction de couleurs via PIL) pour aplatir l'image source :
  résultat pire que l'original (bruit/dithering, pas un vrai style plat) — les filtres raster
  ne remplacent pas un redessin. Reconstruit à la main avec des primitives PIL (ellipses,
  chord pour la palette de la casquette, polygones) façon vectorielle, badge partagé pour
  montrer la direction — jugé correct mais plus chargé que le cerveau à petite taille.
- David a refait lui-même le logo (`docs/branding/DG_Ampoule.png`, remplacé) : casquette en
  blanc plein (contraste net sur fond navy, contrairement à la 1re version navy-sur-navy),
  texte "DG" remplacé par "CC" (Cap Crunch), plus de gradients/textures. Confirmé lisible à
  32-48px (ampoule+$ comme point d'ancrage). Adopté.
- Le fichier fourni était un carré arrondi avec une marge blanche externe (comme les logos
  précédents) — recadré au carré exact (bbox 52,52-1202,1202 sur 1254px), puis les 4 coins
  arrondis (rayon ~262px) repeints en navy via un masque géométrique (distance au centre du
  rayon, pas un seuil de couleur — plus robuste à l'anti-aliasing) pour obtenir un carré plein
  cadre sans marge, même traitement que la session du 2026-08-24 (suite 1). Bug initial dans
  le calcul des 4 rectangles de coin (un des 4 couvrait toute la largeur de l'image, effaçant
  les yeux) — corrigé avant régénération finale.
- Régénéré les 3 jeux d'icônes (prod inchangée en structure, `local`/`staging` avec badge
  couleur L/S) à toutes les tailles. Piège évité : le générateur écrivait par erreur
  `favicon.ico` dans `public/icons/` au lieu du fichier spécial Next.js `app/app/favicon.ico`
  pour la variante prod — corrigé avant commit (voir `app/lib/appEnv.ts`/session du
  2026-08-24 suite 2 pour le contexte des 3 variantes).

### 2026-08-24 (suite 8)

**[Fix] — Corrige le panneau Guide admin : la transition de saison a déjà un outil dédié**
(`app/components/AdminGuidePanel.tsx`) :
- En répondant à "comment je fais le changement de saison ?", découvert que le panneau Guide
  ajouté plus tôt cette session décrivait l'**ancienne** méthode manuelle (`/admin/init?tab=
  rosters` en mode init) — celle du plan confirmé le 2026-08-19/20
  ([[project_historique_excel_import]]), avant qu'un outil dédié soit construit entretemps
  dans `/admin/pool?tab=config` (`SeasonsManager.tsx` + `previewTransitionAction`/
  `transitionSeasonAction`/`activateSeasonAction` dans `admin/config/actions.ts`) : bouton
  "Transitionner les rosters →" qui copie automatiquement les rosters actifs de la saison
  active vers la saison cible (LTIR→actif automatique), avec aperçu (nb joueurs/poolers,
  avertissement joueurs sans contrat pour la nouvelle saison) avant confirmation, puis
  "Activer" pour basculer la saison active.
- Panneau corrigé : l'étape "Reporter les rosters" pointe maintenant vers
  `/admin/pool?tab=config` et décrit le vrai flux (Transitionner → aperçu → Confirmer →
  Activer) au lieu du report manuel via le mode init.
- Vérifié en staging que la saison 2026-27 (`pool_seasons.id=4`) existe déjà (créée le
  2026-06-06, cap NHL 104M$, cap pool 129M$) — reste à cliquer Transitionner puis Activer une
  fois les rosters finaux 2025-26 arrêtés.
- Leçon : avant d'écrire un contenu de référence figé dans l'UI (checklist, guide), vérifier
  l'état actuel du code plutôt que de se fier à une mémoire de session qui peut avoir été
  supplantée par du travail plus récent non revu à ce moment-là.

### 2026-08-24 (suite 7)

**[Chore] — Pipeline PuckPedia validé et poussé vers prod**
(`python_script/PuckPedia_offline.csv`, `python_script/PuckPedia_update.csv`,
`python_script/teams_offline/*.csv`) :
- David a roulé `run_pipeline_staging.ps1`. Log `run_pipeline_staging_2026-08-24_11-47-47.log`
  validé : 4/4 étapes réussies (scraping 246.2s, import joueurs/contrats 47.3s, import
  repêchages 4.8s, backfill nhl_id 3.8s, total 302.1s), aucune erreur/timeout/échec HTTP.
  Seul signal : 564 joueurs sans correspondance `nhl_id` — gap connu et déjà documenté (voir
  session sur le bug nhl_id manquant de Peterka), pas un blocage.
- CSV modifiés (32 équipes + `PuckPedia_offline`/`PuckPedia_update`) committés et poussés sur
  `main` (commit `84f87d3`) selon la convention CLAUDE.md — déclenche automatiquement
  `.github/workflows/import.yml` vers prod (confirmé démarré via `gh run list`).

### 2026-08-24 (suite 6)

**[Feature] — Panneau "Guide admin" avec checklist de transition de saison**
(`app/app/admin/layout.tsx`, `app/components/AdminGuidePanel.tsx`) :
- Contexte : David estime la transition 2025-26 → 2026-27 prête côté prod (voir
  [[project_historique_excel_import]] pour le plan détaillé confirmé le 2026-08-19/20) et a
  demandé un panneau consultable dans l'app pour se rappeler les étapes des manipulations
  admin importantes, plutôt que de rouvrir `SUIVI_PROJET.md`/la mémoire à chaque fois.
- Choix validés avec David (AskUserQuestion) : contenu limité à la checklist de transition de
  saison pour l'instant (extensible plus tard), et bouton global accessible depuis n'importe
  quelle page admin plutôt qu'un onglet dans un hub existant.
- `app/app/admin/layout.tsx` (nouveau) enveloppe toutes les routes `/admin/*` (hubs à onglets
  et pages autonomes comme `/admin/repechage`, `/admin/joueurs/[id]`) et injecte
  `AdminGuidePanel` sans dupliquer la logique d'auth de chaque page (chaque page continue de
  faire son propre `redirect()` si non-admin — vérifié que ça bloque bien le rendu du panneau
  pour un visiteur non connecté, testé via `curl` sur `/admin/init` non authentifié → redirect
  307 vers `/login`, et absence du texte "Guide" sur `/login`).
- `AdminGuidePanel` : bouton flottant en bas à droite (`📘 Guide`), ouvre un panneau latéral
  (même pattern visuel que `PlayerSlideOver.tsx` — fond noir semi-transparent + panneau à
  droite, fermeture Échap/clic backdrop/×). Contenu : les 4 étapes confirmées avec David
  (report des rosters finaux via `/admin/init?tab=rosters`, pipeline de données, `/admin/init
  ?tab=presaison`, `/admin/repechage`), chaque étape avec lien direct cliquable vers la route
  concernée.
- Validé par `next build` + vérification `curl` (redirect non-authentifié). Pas de test
  manuel en navigateur connecté cette fois (David peut valider visuellement à l'usage — le
  bouton `📘 Guide` apparaît en bas à droite sur n'importe quelle page `/admin/*`).

### 2026-08-24 (suite 5)

**[Fix] — Badge de propriétaire figé dans "Joueurs disponibles" après un submit (`/admin/init?tab=rosters`)**
(`app/app/admin/rosters/RosterManager.tsx`) :
- Contexte : David a rapporté que certains joueurs semblaient rester associés à l'ancien
  pooler dans le menu de recherche après un changement + soumission + changement de pooler,
  alors que les alignements réels étaient corrects.
- Cause (investigation par agent, puis vérification directe du code) : `allTakenPlayerIds` et
  `playerOwnerMap` (badge orange affichant le propriétaire d'un joueur dans "Joueurs
  disponibles", visible en mode init) sont des props calculées côté serveur une seule fois au
  chargement de `/admin/init` (`app/app/admin/init/page.tsx`). `handleSubmit()` ne rechargeait
  que le roster du pooler courant après un submit réussi et n'appelait `router.refresh()` que
  sur le chemin d'erreur/fallback — jamais sur un succès normal. Résultat : après un submit
  réussi, ces props restaient figées jusqu'à un rechargement complet de la page, donnant
  l'impression (uniquement dans le menu de recherche, pas dans les alignements eux-mêmes,
  rechargés séparément par pooler) qu'un joueur déplacé appartenait encore à l'ancien pooler.
- Correctif : `router.refresh()` appelé aussi après un submit réussi. Sans impact sur l'état
  client (`roster`/`selectedPooler`) — pattern déjà utilisé ailleurs dans ce même fichier
  (`handleViderTous`).
- Validé par David manuellement en local (déplacement de joueur entre poolers, badge à jour
  après changement de sélection). Tentative de test automatisé en navigateur (Playwright,
  compte admin QA jetable en staging) bloquée par le classificateur de permissions de
  l'auto-mode — abandonnée au profit de la validation manuelle.

### 2026-08-24 (suite 4)

**[Fix] — Clarifie l'affichage des badges de type de recrue dans la Banque de recrues**
(`app/app/admin/recrues/BanqueRecruesManager.tsx`) :
- Contexte : David a demandé pourquoi Tyler Boucher (repêché 2021, protégé) et Logan Mailloux
  (agent libre/ELC, en fin de protection) se comportaient différemment dans
  `/admin/init?tab=recrues`, alors que les deux badges se ressemblaient visuellement.
  Investigation (agent dédié) : comportement attendu, pas un bug — `isEntryProtected()`
  (même fichier, ligne 37-45) applique deux règles distinctes : `repeche` = fenêtre fixe
  `pool_draft_year + 5 saisons` (ne dépend pas du vrai contrat NHL), `agent_libre` = protégé
  tant que `players.status === 'ELC'` (champ vivant du pipeline PuckPedia, suit le vrai
  contrat). Les deux dates de fin peuvent légitimement diverger même pour une même cohorte.
- Cause de la confusion : le badge vert "Repêché {année}" utilise `pool_draft_year` (année où
  le joueur a été assigné au repêchage **du pool**), affiché juste à côté d'un texte gris
  montrant le vrai repêchage NHL (`draft_year`/`draft_round`/`draft_overall`) — sans distinction
  visuelle quand les deux années coïncident (cas de Boucher).
- Vérifié en staging (requête directe sur `pooler_rosters` where `rookie_type IS NULL` et
  `player_type='recrue'` et `is_active=true`) : 1 cas réel — Liam Öhgren (VAN, ELC, repêché NHL
  2022 R1 #19) dans la banque de Sébastien S., sans aucun badge affiché et traité comme protégé
  par défaut (`isEntryProtected`, ligne 39) faute de classification.
- Correctifs (affichage seulement, aucun changement de logique de protection ni de schéma) :
  badge vert renommé "Repêché du pool {année}" (cohérent avec le libellé déjà utilisé dans
  `TypePanel`), badge ambre renommé "Agent libre (ELC)", le texte gris de repêchage NHL réel
  préfixé "NHL" et affiché pour toutes les recrues (plus seulement `repeche`) pour aider à
  classifier un cas non défini, et nouveau badge rouge "Type à définir" quand `rookie_type`
  est `null` (au lieu d'aucun badge). Tooltips ajoutés sur les 3 badges expliquant la règle
  de protection associée.
- Aucun changement serveur nécessaire : `updateRookieTypeAction` (`admin/rosters/actions.ts`)
  accepte déjà une transition depuis `rookie_type = null` sans contrainte — le bouton ✎
  existant (visible au survol de la ligne) suffit pour que l'admin classe Öhgren.

### 2026-08-24 (suite 3)

**[Feature] — Icône/nom PWA distincts entre local, staging et prod**
(`app/lib/appEnv.ts`, `app/app/manifest.ts`, `app/app/layout.tsx`,
`app/public/icons/local/*`, `app/public/icons/staging/*`) :
- Contexte : après le rattrapage staging↔main (voir plus haut), David a demandé un moyen de
  distinguer visuellement les raccourcis PWA installés sur son laptop pour les 3 environnements
  (prod, staging, local via `npm run dev` — qui pointe toujours vers la base staging mais tourne
  sur une URL/instance distincte).
- `getAppEnv()` détecte l'environnement via `process.env.VERCEL` (absent en local) puis
  `VERCEL_GIT_COMMIT_REF` (`staging` vs `main`) — pas `VERCEL_ENV`, qui vaut `production` dans
  les deux projets Vercel (chacun a sa propre branche de production) et ne permettrait donc pas
  de distinguer staging de prod.
- Régénéré le même pictogramme (recadré depuis `docs/branding/cap-crunch-logo2.jpg`, voir session
  précédente) en 3 variantes : prod inchangée (`public/icons/`), local et staging avec un badge
  circulaire ajouté en coin inférieur droit (gris "L" / orange "S"), toutes tailles (16/32/180/
  192/512 + favicon.ico).
- `manifest.ts` et `layout.tsx` choisissent le dossier d'icônes et suffixent le nom
  (` (Local)` / ` (Staging)`) selon `getAppEnv()`. Validé par 3 builds (`next build`) locaux avec
  les variables d'env simulées (aucune, `VERCEL=1`+`VERCEL_GIT_COMMIT_REF=staging`, `=main`) —
  le `manifest.webmanifest` généré était correct dans les 3 cas.
- Pas de changement nécessaire à `favicon.ico` (fichier spécial Next.js, un seul chemin possible)
  — les `<link rel="icon">` explicites dans `layout.tsx` (16x16/32x32 par env) suffisent pour que
  les navigateurs modernes affichent la bonne icône d'onglet/raccourci.

### 2026-08-24 (suite)

**[Fix] — Branche `staging` désynchronisée de `main` depuis 3 semaines**
(aucun fichier applicatif, juste git) :
- Constat de David : le nouveau logo était visible en prod mais pas en staging. Diagnostic :
  `staging` n'avait pas reçu de merge depuis `main` depuis le 2026-07-31 (`4f993cb`) — il lui
  manquait donc ~19 commits, pas seulement l'icône (masquer saison inactive, report atomique
  au lendemain, panneau d'historique des mouvements, lien repêchage recrues 2025, etc.).
- Fusionné `origin/main` dans `staging` (merge classique, sans conflit) et poussé
  (`3dfe43f`) — déclenche le redéploiement Vercel de `cap-crunch-staging`.
- À surveiller : ce project n'a pas de sync auto `main → staging` ; si l'écart se reproduit,
  envisager d'automatiser (ex: workflow GitHub Actions sur push `main`) plutôt que de
  détecter le problème a posteriori via un symptôme visuel.

### 2026-08-24

**[Design] — Mise à jour de l'icône de l'app avec le nouveau logo**
(`app/public/icons/*.png`, `app/app/favicon.ico`, `docs/branding/cap-crunch-logo1.jpg`,
`docs/branding/cap-crunch-logo2.jpg`) :
- David a fourni deux variantes du logo "puck + cerveau fissuré" (`cap-crunch-logo1.jpg`,
  `cap-crunch-logo2.jpg`). Retenu : logo2 — traits plus épais/pleins (cerveau en forme
  blanche pleine plutôt que fins contours) et fissure plus large, donc plus lisible à petite
  taille d'icône que logo1.
- Le pictogramme seul (sans le texte "CAP CRUNCH", illisible en petit format) a été recadré
  depuis logo2, puis recentré sur un canevas carré avec la couleur de fond du manifest
  (`#f9fafb`) pour remplir ~82% du cadre (même logique que l'icône précédente, en pleine
  bordure plutôt qu'avec une grosse marge blanche).
- Régénéré : `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` (180×180),
  `icon-192x192.png`, `icon-512x512.png`, `favicon.ico` (multi-résolution 16/32/48/256).
  Aucun changement de code (`manifest.ts`, `layout.tsx`) — les chemins et tailles référencés
  n'ont pas changé.

### 2026-08-23 (suite 2)

**[Feature] — Masquer une saison inactive aux poolers (`is_public` sur `pool_seasons`)**
(`schema.sql`, `app/app/admin/config/actions.ts`, `app/app/admin/config/SeasonsManager.tsx`,
`app/app/admin/config/ConfigTabsClient.tsx`, `app/app/admin/pool/page.tsx`,
`app/app/transactions/page.tsx`, `app/app/repechage-recrues/page.tsx`) :
- Contexte : en préparant la transition 2025-26 → 2026-27 (voir plus haut), David a demandé
  que les poolers ne puissent pas tomber sur la saison 2025-26 une fois 2026-27 active, pour
  éviter qu'un alignement/historique jugé non présentable donne l'impression d'un bug.
- Recherche (agent dédié) : sur toutes les pages de consultation, seules **2** laissent un
  pooler non-admin naviguer vers une saison passée sans filtre sur `is_active` —
  `/transactions` (dropdown + `?saison=`) et `/repechage-recrues` (dropdown + `?saisonId=`).
  Toutes les autres (`/classement`, `/poolers/[id]`, `/joueurs`, `/gestion-effectifs`,
  `/calendrier`, `/résultats`, `/statistiques`, accueil) suivent automatiquement la saison
  active, sans possibilité de revenir en arrière.
- Nouvelle colonne `pool_seasons.is_public` (`BOOLEAN NOT NULL DEFAULT true`) — migration
  exécutée manuellement en staging par David (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
  à rejouer en prod au moment de la vraie transition).
- Toggle par saison inactive dans `/admin/pool?tab=config` (« Masquer aux poolers » /
  « Rendre visible ») → `setSeasonVisibilityAction`. Sans effet sur la saison active —
  toujours incluse dans son propre sélecteur via `.or('is_public.eq.true,is_active.eq.true')`
  sur les deux pages concernées, pour éviter qu'elle disparaisse de son propre menu.
- Solution générique et réutilisable (pas un correctif ponctuel pour 2025-26 seulement) —
  applicable à chaque future transition de saison.
- Validé : `npx tsc --noEmit` propre. Colonne confirmée présente en staging après exécution
  du SQL par David (`is_public=true` par défaut sur les 5 saisons existantes).

### 2026-08-23 (suite)

**[Feature] — Report atomique au lendemain si un match est déjà commencé (soumissions en direct)**
(`app/lib/gameDayLock.ts` nouveau, `app/app/gestion-effectifs/actions.ts`,
`app/app/admin/transactions/actions.ts`) :
- Contexte : en validant les points d'une période (popup ↩ sur `/classement`), David a
  repéré un écart d'1 passe pour Auston Matthews entre l'appli et NHL.com sur Oct 7 -
  Dec 2 2025. Cause trouvée : une ligne `pooler_rosters` (reconstruction staging) avait
  `removed_at = 2025-12-02T12:00:00Z` (convention `T12:00:00Z` pour une date saisie sans
  heure, soit 7h heure de l'Est) alors que le match des Leafs ce soir-là a débuté à 19h30
  heure de l'Est — le match tombait donc après la fin de fenêtre, excluant légitimement
  cette passe (cas confirmé correct par David, pas un bug).
- Ça a mené à une question plus large : pour une **vraie soumission en direct** (pas une
  date forcée), `added_at`/`removed_at` = l'heure réelle de soumission (`now()`), comparée
  ensuite au `game_start_time` exact de chaque joueur dans `buildStandings()`
  (`app/lib/standings.ts:262`). Donc dans un même lot touchant 2 joueurs (ex: échange même
  pooler où l'un sort pendant que l'autre entre), si le match d'un des deux joueurs est déjà
  commencé au moment de la soumission mais pas celui de l'autre, l'un basculerait sous son
  ancien statut pour son match du jour et l'autre sous le nouveau — un résultat asymétrique
  au sein d'un même mouvement. David a demandé que ce soit plutôt atomique : si un des
  joueurs touchés n'est plus éligible pour la journée (match déjà commencé), tout le lot
  bascule au lendemain plutôt que chacun selon son propre match.
- Nouvelle fonction partagée `computeBatchEffectiveDate(playerIds)` (`app/lib/gameDayLock.ts`) :
  résout l'équipe LNH actuelle de chaque joueur touché, interroge l'horaire NHL du jour en
  direct (`https://api-web.nhle.com/v1/schedule/{date}` — mêmes endpoint/format que
  `/calendrier`, pas `player_game_logs` qui n'est peuplé qu'après coup par le pipeline
  nocturne), et si un match d'une équipe concernée a déjà débuté (`startTimeUTC <= now`),
  retourne un horodatage de report au lendemain (`{demain}T12:00:00Z`, même convention que
  les dates historiques). Ne bloque jamais la soumission en cas d'échec/timeout de l'API
  NHL (repli sur `now()`, comportement actuel inchangé) — même philosophie que les autres
  appels NHL API du projet (timeout + repli silencieux).
- Câblé dans `submitBatchAction` (`/gestion-effectifs`) et `submitTransactionAction`
  (`/admin/transactions`), uniquement sur la branche "en direct" (ni pré-saison, ni date
  forcée — ces deux cas ont déjà leur propre date explicite). Message d'avertissement
  affiché après soumission quand le report a eu lieu.
- Validé : `npx tsc --noEmit` propre. Format de réponse de l'API NHL revérifié via `curl`
  sur une date connue (2025-12-02, correspond exactement au `game_start_time` déjà en base
  pour Matthews) et sur une date hors-saison (aucun match, aucun report — comportement
  inchangé).

### 2026-08-23

**[Feature] — Panneau latéral d'historique des mouvements dans les outils admin**
(`app/lib/rosterChangeLabels.ts` nouveau, `app/components/movement-history-actions.ts` nouveau,
`app/components/MovementHistoryPanel.tsx` nouveau, `app/app/admin/pool/page.tsx`,
`app/app/gestion-effectifs/GestionEffectifsManager.tsx`, `app/app/gestion-effectifs/page.tsx`,
`app/app/admin/transactions/TransactionBuilder.tsx`, `app/app/admin/effectifs/page.tsx`) :
- David voulait pouvoir suivre l'historique des mouvements d'alignement pendant qu'il saisit
  des actions dans `/gestion-effectifs` ou `/admin/transactions`, sans naviguer vers l'onglet
  Suivi séparément.
- Ajout d'un panneau latéral réutilisable (`MovementHistoryPanel`) affiché uniquement en mode
  admin (`isAdmin`), sur les deux outils. Deux modes : filtré sur le pooler actuellement
  sélectionné dans le formulaire (par défaut) ou "Tous" pour la vue globale — bascule via
  onglets dans le panneau. Se rafraîchit automatiquement après chaque soumission réussie
  (`refreshKey` incrémenté).
- Même source de données que l'onglet Suivi existant (`roster_change_log` + `transactions`),
  extraite dans une nouvelle server action `getMovementHistoryAction` — filtrage par pooler
  via `pooler_id` sur `roster_change_log`, et via une jointure sur `transaction_items`
  (`from_pooler_id`/`to_pooler_id`) pour les transactions par lot.
- `CHANGE_LABEL`/`CHANGE_COLOR` (libellés et couleurs par `change_type`) extraits de
  `admin/pool/page.tsx` vers `app/lib/rosterChangeLabels.ts` pour éviter la duplication
  (réutilisés par la nouvelle server action).
- Dans `TransactionBuilder`, le pooler suivi est celui sélectionné en A (ou B si seul B est
  choisi) pour une transaction.
- Conteneurs élargis (`max-w-3xl` → `max-w-6xl`) sur `/gestion-effectifs` (seulement si admin)
  et l'onglet Mouvements de `/admin/effectifs` pour laisser la place au panneau.
- Validé : `npx tsc --noEmit` propre. Vérification visuelle faite par David en local (pas de
  vérification par navigateur automatisé — pas d'accès aux identifiants admin dans cette
  session).

### 2026-08-22

**[Décision] — Transition 2025-26 → 2026-27 en prod : copier les alignements finaux, pas l'historique complet** (aucun fichier modifié) :
- David a confirmé l'approche pour la mise en place de la saison 2026-27 en prod : au
  lieu de terminer la reconstruction historique complète 2025-26 (piste staging
  uniquement, voir [[project_historique_excel_import]]), pousser directement les
  alignements finaux 2025-26 dans la nouvelle saison via `adminInitRosterAction`
  (`/admin/init?tab=rosters` — écrit seulement `pooler_rosters`, sans
  `roster_change_log`), puis dérouler le flux normal de transition déjà existant :
  pipeline de données (salaires à jour), `/admin/presaison` (protections recrues
  expirées → activation/libération, décisions ELC, reset LTIR, ordre de repêchage),
  puis `/admin/repechage` (repêchage annuel réel). Confirmé par lecture du code
  (`app/app/admin/presaison/actions.ts`) que cette séquence gère déjà tout ça — aucun
  nouvel outil requis.
- Prévu de valider d'abord toute cette séquence en staging (environnement isolé) avant
  de la refaire en prod.
- **Clarification en cours de route** : la saison 2025-26 existe déjà en prod (`pool_seasons`,
  32 `pool_draft_picks`, et surtout **351 lignes `pooler_rosters` réelles** — la saison a
  été jouée normalement dans l'app, avec de vrais mouvements actif/réserviste/LTIR).
  Correction d'une fausse piste : `CLAUDE.md`/mémoire donnaient l'impression que
  `pooler_rosters` 2025-26 était vide en prod (confusion avec le fait que le repêchage
  recrues 2025 n'avait jamais été *soumis* — `is_used=false` sur les 32 picks). Les deux
  faits sont distincts : rosters réels présents, mais sans lien vers le repêchage.

**[Data] — Repêchage recrues 2025 relié en prod pour consultation** (nouveau script
`python_script/push_repechage_2025_to_prod.py`) :
- Suite à la clarification ci-dessus, David a demandé d'ajouter le repêchage 2025 pour
  consultation en prod (`/repechage-recrues`, `/admin/repechage`, `/admin/init?tab=choix`
  y étaient vides faute de picks `is_used`).
- Script écrit sur le modèle de `sync_staging_to_prod.py` (dry-run par défaut, `--apply`
  + confirmation "oui"), mais **aucun insert** : les 32 recrues du repêchage 2025
  existaient déjà comme lignes `pooler_rosters` réelles en prod (`player_type='recrue'`),
  simplement sans `rookie_type`/`pool_draft_year`/`draft_pick_id` renseignés. Le script
  a seulement fait un UPDATE des 32 lignes existantes (retrouvées par
  pooler+joueur, avec mapping `players.id` staging→prod par `nhl_id` puis nom) +
  `pool_draft_picks.is_used=true` sur les 32 choix — `player_type`, `is_active`,
  `added_at`/`removed_at` jamais touchés, `current_owner_id` des picks pas écrasé
  (l'ownership réelle en prod fait foi, pas la reconstruction staging).
- Accord 32/32 entre le pooler assigné par pick en staging (`current_owner_id`) et le
  pooler qui détient réellement ce joueur en prod — confirme que la reconstruction
  staging du repêchage correspond à la réalité prod pour cette partie précise.
- Dry-run vérifié et présenté à David avant `--apply`. Exécuté et vérifié après coup
  (32/32 picks `is_used`, 32/32 lignes liées via `draft_pick_id`).
- Portée volontairement limitée à ce seul repêchage — le reste de l'historique 2025-26
  (mouvements de saison, transactions) n'est toujours pas reconstruit en prod, et ne le
  sera pas (voir décision ci-dessus).

### 2026-08-17 (suite)

**[Clarification] — Ordre de repêchage 2026-27 vs classement final 2025-26** (aucun fichier
modifié) :
- David s'inquiète que le classement final 2025-26 (en cours de reconstruction manuelle
  depuis l'abandon de l'import Excel, voir entrée 2026-08-07) ne soit pas identique à la
  réalité, et se demandait si ce classement dicterait automatiquement l'ordre de repêchage
  de la saison 2026-27.
- Confirmé en lisant le code : `/admin/presaison` a un bouton optionnel « Initialiser à
  partir du classement précédent (inversé) » (`PresaisonManager.tsx:765-770` →
  `initDraftOrderFromStandingsAction` → `computeReverseStandingsOrder()` dans
  `app/lib/draftOrder.ts`, qui appelle `buildStandings()` sur la saison précédente et
  inverse l'ordre). Ce n'est **pas automatique** — un seul clic, à tout moment avant le
  repêchage — et l'ordre reste réordonnable à la main ensuite via `/admin/repechage` →
  « Ordre de sélection » (`DraftOrderEditor.tsx`, flèches ▲▼). Même mécanique répétée chaque
  préseason, jamais un verrou définitif.
- Donc pas de blocage : si le classement 2025-26 reconstruit s'avère peu fiable, David peut
  simplement ignorer ce bouton et fixer l'ordre 2026-27 à la main.

### 2026-08-17

**[Feature] — Signer/classer directement un agent libre sur ELC comme recrue, sans passer par `/admin/init`**
(`app/app/gestion-effectifs/actions.ts`, `app/app/gestion-effectifs/GestionEffectifsManager.tsx`,
`app/app/admin/transactions/actions.ts`, `app/app/admin/transactions/TransactionBuilder.tsx`) :
- David a clarifié la répartition voulue entre les deux mécanismes de classement recrue :
  `/admin/init` → Banque de recrues reste réservé au cas où le joueur a été **repêché par le
  pool** (pas la LNH) mais n'est **plus** sur son ELC — il faut alors rattacher manuellement
  `pool_draft_year` pour la fenêtre de protection de 5 saisons, une info que rien d'autre ne
  peut déduire. Le cas **agent libre encore sur son ELC** (protégé tant que ELC, peu importe
  `pool_draft_year`) doit pouvoir se faire directement dans le flux normal de signature/
  changement de statut, sans détour admin.
- **Éligibilité recrue élargie** (partout où elle est vérifiée pour ce nouveau chemin) :
  `is_rookie` OU `draft_year` dans la fenêtre 5 saisons OU **statut de contrat `ELC`** —
  avant, seul `is_rookie`/`draft_year` étaient acceptés, ce qui bloquait un agent libre sur
  ELC sans historique de repêchage pertinent (ex: universitaire non repêché tout juste signé).
- **`/gestion-effectifs`** : « Signer agent libre » offre maintenant « Recrue (agent libre sur
  ELC) » comme destination (en plus d'Actif/Réserviste), et « Changement de statut » vers
  Recrue fixe automatiquement `rookie_type = 'agent_libre'` quand la ligne n'a jamais été
  classée (`deactivate()` — remplace l'ancien avertissement « à compléter dans Rosters
  initiaux »). Le cas repêché par le pool (`rookie_type` déjà posé à `'repeche'` dès le
  repêchage annuel, voir `admin/repechage/actions.ts`) n'est jamais écrasé — seule une ligne
  encore non classée bascule vers `agent_libre`.
- **`/admin/transactions`** : action « Signer » accepte aussi « Recrue » comme nouveau statut,
  avec la même validation d'éligibilité et le même `rookie_type = 'agent_libre'` posé côté
  serveur (`submitTransactionAction`).
- Validé : `npx tsc --noEmit` propre.

### 2026-08-16 (suite 3)

**[Feature] — « Retour LTIR » : le joueur qui fait de la place peut aller sur LTIR au lieu de Réserviste**
(`app/app/gestion-effectifs/GestionEffectifsManager.tsx`, `app/app/gestion-effectifs/actions.ts`) :
- David a signalé un blocage réel : quand un joueur revient de la LTIR alors que le roster
  actif est déjà plein (12A/6D/2G), l'action « Retour LTIR » forçait systématiquement à
  démouvoir l'actif libérant la place vers Réserviste — or ce joueur est parfois lui-même en
  train de se blesser au même moment, et devrait plutôt aller sur LTIR (ce qui, en prime,
  sort sa masse salariale du calcul de cap, contrairement à Réserviste qui compte toujours).
- Ajouté un sélecteur « Ce joueur devient » (Réserviste / LTIR) dans le formulaire Retour
  LTIR — `deactivateNewType` propagé de `CartItem` → `BatchActionInput` →
  `deactivate(action.deactivateActifId, action.deactivateNewType ?? 'reserviste')` côté
  serveur. Défaut `reserviste` inchangé si l'admin ne touche pas au nouveau sélecteur.
- Le backend `deactivate()` acceptait déjà `'ltir'` comme `toType` (utilisé par l'action
  simple `LTIR` existante) — aucune nouvelle validation nécessaire, la fonction gère déjà
  `checkFutureRosterConflict`/journalisation pour ce cas.
- Validé : `npx tsc --noEmit` propre.

### 2026-08-16 (suite 2)

**[Feature] — Étend le sélecteur de statut aux joueurs LTIR échangés**
(`app/app/admin/transactions/TransactionBuilder.tsx`) :
- David a signalé un cas manquant : un pooler avec un joueur en LTIR peut vouloir l'échanger
  directement (plutôt que le réactiver puis le mettre au ballotage faute de place) ; le
  receveur doit alors pouvoir choisir son statut d'arrivée.
- Sélecteur du résumé « Échanges » ([TransactionBuilder.tsx:333](app/app/admin/transactions/TransactionBuilder.tsx#L333)) étendu : `old_player_type === 'ltir'`
  déclenche maintenant aussi le sélecteur, avec une option LTIR ajoutée en plus
  d'Actif/Réserviste (le receveur peut aussi le garder en LTIR).
- Aucun changement backend requis : `submitTransactionAction` (`actions.ts`) accepte déjà
  n'importe quel `new_player_type` sur la branche `transfer`, et `validateFinalRoster`
  exclut déjà les LTIR du calcul de cap et des limites de roster.
- Validé : `npx tsc --noEmit` propre.

### 2026-08-16 (suite)

**[Feature] — Choix du statut Actif/Réserviste pour un joueur reçu dans un échange**
(`app/app/admin/transactions/TransactionBuilder.tsx`) :
- David a remarqué que le joueur reçu dans un échange héritait automatiquement du statut
  qu'il avait chez le pooler donneur (`new_player_type = entry.player_type` dans
  `addTransferPlayer`), sans possibilité de le recevoir Réserviste plutôt qu'Actif (ou
  l'inverse) si le roster du receveur est déjà plein sur ce statut.
- Ajouté un sélecteur Actif/Réserviste directement sur la ligne « Échanges » du résumé de
  transaction (`updateItemDestType`), visible seulement pour les items `transfer` avec
  `player_id` dont le statut source est `actif` ou `reserviste` — les recrues et joueurs
  LTIR continuent d'hériter automatiquement de leur statut (protection recrue, LTIR suit
  le joueur), comme avant.
- Validé : `npx tsc --noEmit` propre.

### 2026-08-16

**[Fix] — Retrait du bouton « Ballotage » dans `/admin/transactions`** (`app/app/admin/transactions/TransactionBuilder.tsx`,
`app/app/admin/transactions/actions.ts`) :
- David a signalé que le bouton orange « Ballotage » (à côté de « Donner » dans la liste de
  joueurs d'un pooler) était mélangeant : il assignait automatiquement le joueur au Pooler B
  sélectionné pour l'échange, alors que le ballotage devrait pouvoir se faire sans désigner
  de réclamant précis dans cet outil — ce cas passe déjà par le bouton « Libérer joueur »
  (Ajustements) plus bas.
- Retiré : bouton Ballotage, fonction `addBallotagePlayer`, section résumé « Ballotage »,
  et le type `'ballotage'` de `ActionType`/`submitTransactionAction` (fusionné avec la
  branche `transfer`, logique identique). Confirmé que `admin/transactions/actions.ts`
  n'est importé que par `TransactionBuilder.tsx` — aucun impact sur les mécanismes de
  ballotage distincts et toujours actifs dans `/gestion-effectifs` et `/admin/historique`.
- Validé : `npx tsc --noEmit` propre.

### 2026-08-13 (suite)

**[Feature] — Export CSV du journal complet d'une saison** (`app/app/admin/suivi/export-actions.ts`,
`app/app/admin/suivi/JournalExport.tsx`, `app/app/admin/pool/page.tsx`) :
- Demandé par David : une preuve/backup exportable de tous les mouvements d'une saison
  (alignement + transactions), triée par date effective, pour utilisation dans un tableur
  externe si l'app venait à ne plus fonctionner.
- Plutôt qu'une nouvelle page, ajouté un bloc « Journal complet d'une saison » à l'onglet
  Suivi existant (`/admin/pool?tab=suivi`) — sélecteur de saison + bouton d'export,
  indépendant du fil d'activité affiché au-dessus (qui reste plafonné à 100/50 lignes
  récentes, pensé pour un coup d'œil rapide, pas un export complet).
- **Une seule source suffit** : `roster_change_log` capture déjà tous les mouvements réels
  peu importe l'outil d'origine (`/gestion-effectifs`, `/admin/historique`,
  `/admin/transactions` — ce dernier y écrit aussi en plus de `transactions`, voir
  `CLAUDE.md` section 6) — pas besoin de fusionner deux sources séparées comme le fait le
  fil d'activité actuel (qui, lui, duplique déjà l'info pour les transactions : une ligne
  générique "Transaction" en plus des lignes détaillées par joueur).
- Export CSV point-virgule (délimiteur attendu par Excel en locale française) avec BOM
  UTF-8 (accents), date effective en premier (`YYYY-MM-DD HH:mm`, fuseau Toronto, format
  qui reste trié correctement même en texte brut), une ligne par mouvement avec joueur/choix,
  action, ancien/nouveau statut, et si la date a été forcée manuellement.
- Requête paginée (dépasse la limite Supabase de 1000 lignes sur une saison complète).

### 2026-08-13

**[Refactor] — Fusion Ajustement/Activation recrue/Retour banque en Changement de statut** — voir commit
`901b2dc` (déjà fait la veille, documenté ici pour référence croisée avec les échanges de
cette session qui l'utilisent).

**[Fix] — Joueur parti d'un pooler affiché comme actif dans `/poolers/[id]`, `/classement`
et le résumé de la page d'accueil** (`app/lib/standings.ts`, `app/app/poolers/[id]/PoolerPageTabs.tsx`,
`app/app/classement/ClassementTable.tsx`, `app/components/SummaryTable.tsx`) :
- Repéré par David : après avoir signé Nick Schmaltz chez Paule (1er novembre, via
  « Changement de statut » + « Libération » combinés dans un même panier — a confirmé que
  la soumission combinée fonctionne bien, doute initial dissipé après vérification en
  base : les deux lignes de `roster_change_log` sont créées à la même seconde), Jonathan
  Marchessault (retiré le même jour) continuait de s'afficher identique à un joueur
  actif — pas grisé comme un réserviste/LTIR, malgré son départ complet du pooler.
- **Cause** : `PlayerContrib.playerType` (retourné par `buildStandings()`) reflète le
  `player_type` de la **dernière ligne `pooler_rosters`** pour ce (pooler, joueur), qui
  reste `'actif'` même après un retrait complet (`is_active=false`, `removed_at` posé) —
  rien ne distinguait "encore sur le roster mais pas actif" (réserviste/LTIR/recrue, déjà
  grisé) de "plus du tout sur le roster" (jamais grisé, car `playerType` vaut quand même
  `'actif'`).
- **Correctif** : nouveau champ `PlayerContrib.stillRostered` (`true` seulement si la
  dernière ligne a `removed_at === null`, donc encore ouverte). Les 3 endroits qui
  dérivaient un style "actif" de `playerType === 'actif'` seul vérifient maintenant aussi
  `stillRostered` — grisé + badge **« PARTI »** dans les tableaux de points, exclu du
  sous-total B/A/V/DP/BL du résumé page d'accueil (le total de points, lui, était déjà
  correct — calculé période par période, indépendant du statut actuel).
- Bug systémique (dupliqué dans les 3 fichiers, pas propre à une seule page) — trouvé en
  cherchant tous les usages de `playerType === 'actif'` après le signalement initial sur
  `/poolers/[id]`.

**[Fix] — Sélecteur de pooler vide sur `/gestion-effectifs` (page personnelle, pas le hub admin)**
(`app/app/gestion-effectifs/GestionEffectifsManager.tsx`) :
- David (admin) ne voyait aucune option dans le menu déroulant « Pooler » sur
  `/gestion-effectifs` — contrairement à `/admin/effectifs?tab=mouvements`, cette page ne
  récupère/passe jamais la liste des poolers, mais le sélecteur s'affichait quand même
  (conditionné sur `isAdmin` seul, pas sur la présence réelle de la liste), vide et inutile.
- **Décision** : `/gestion-effectifs` doit toujours agir sur son propre pooler, même pour
  un admin qui teste sa propre page — `/admin/effectifs` couvre déjà le cas "choisir
  n'importe quel pooler". Sélecteur maintenant conditionné sur `!!poolers && poolers.length
  > 0` (donc seulement quand le hub admin le fournit) au lieu de `isAdmin`. `poolerName`
  (ligne de confirmation avant soumission) corrigé en même temps — dépendait aussi de
  `isAdmin` seul et se serait retrouvé vide dans le même scénario.

### 2026-08-11

**[Fix] — 328/330 lignes `pooler_rosters` mal datées (saisie au lieu du début de saison), staging** :
- Point de départ : David a signalé un blocage de délai de réactivation sur Sam Rinzel chez
  Paule après un échange saisi au 11 octobre 2025. Investigation a révélé 3 lignes
  `roster_change_log` résiduelles datées d'aujourd'hui (tests précédents) — supprimées.
- En vérifiant le cas voisin (David Jiricek), David a remarqué que sa ligne était datée du
  9 août 2026 (date réelle de saisie) au lieu du début de saison — question qui a mené à
  vérifier l'ensemble de la saison plutôt qu'un cas isolé.
- **Ampleur confirmée** : sur 330 lignes `pooler_rosters` (saison 2025-26), seulement 2
  étaient correctement datées (le vrai échange du 11 octobre). Les 328 autres portaient la
  date réelle de saisie (8-9 août 2026) au lieu du 7 octobre 2025 (`saison_start_date`).
  Même chose pour `roster_change_log` : 298 lignes de bruit sur 302 (seules 4, liées à
  l'échange, étaient légitimes).
- **Cause** (`app/app/admin/rosters/RosterManager.tsx:115`) : le bouton « Mode init » —
  qui force `added_at` au début de saison et n'écrit aucune ligne de journal
  (`adminInitRosterAction`, conçu "sans validations, sans snapshots") — est un état
  purement local au navigateur (`useState(false)`), désactivé par défaut et réinitialisé à
  chaque rechargement de page. Sur une saisie de 8 poolers étalée sur 2 jours avec
  plusieurs rechargements probables, facile à oublier de réactiver.
- **Correctifs appliqués (staging)** :
  1. `pooler_rosters.added_at` ramené à `2025-10-07T12:00:00Z` pour les 328 lignes
     concernées (`UPDATE ... WHERE added_at LIKE '2026%'`).
  2. Les 298 lignes `roster_change_log` de bruit supprimées (pas juste redatées — le mode
     init n'est censé en écrire aucune, donc aligné avec le comportement voulu plutôt que
     de garder des événements `old_type=null` qui n'auraient pas dû exister).
  3. `initMode` démarre maintenant à `true` par défaut sur cette page — son seul but est la
     saisie des rosters de départ, donc plus cohérent que de compter sur un bouton qu'on
     peut oublier d'activer. Reste basculable au besoin (cas rares hors init).
- Prod non touchée (aucune donnée saisie là-bas pour cette reconstruction).

**[Fix] — J.J. Peterka à 0 pt malgré un statut actif correct depuis le 7 octobre (staging)** :
- Repéré par David dans l'alignement de Vincent : `MJ` à « — » et 0 pt alors que la fenêtre
  active était correcte (contrairement au cas du 328/330 ci-dessus, réglé juste avant).
- **Cause** : `players.nhl_id` était `null` pour Peterka (id=1343) — sans lui, aucun match
  ne peut jamais être relié, peu importe la fenêtre `added_at→removed_at`. Pas un problème
  de diminutif (le nom `John-Jason Peterka` correspond exactement dans l'API NHL,
  `nhl_id=8482175`) : `backfill_nhl_ids.py` n'avait simplement jamais été relancé depuis
  qu'il a commencé à jouer pour de vrai cette saison. Particularité pour staging : ce
  script fait partie du pipeline hebdomadaire automatique (`run_pipeline.py`, lundi 6h UTC)
  mais **seulement contre prod** — staging ne se met à jour que si on le lance dessus
  manuellement, donc ce genre de retard y est normal et pourrait resurgir pour d'autres
  joueurs qui débutent en cours de saison.
- **Erreur en cours de route** : `backfill_nhl_ids.py` charge `.env` par défaut (pas
  `.env.staging`, contrairement aux autres scripts one-off utilisés cette session) — mon
  premier `--dry-run` et la première exécution réelle ont donc tourné contre **PROD** par
  erreur. Impact vérifié et sans collatéral : une seule ligne modifiée (le `nhl_id` de
  Peterka, id=1343 dans les deux bases), correction légitime identique des deux côtés.
  Relancé correctement ensuite avec les variables d'env de staging exportées explicitement.
- **Gap découvert dans `backfill_regular_game_logs.py`** : une fois le `nhl_id` posé, le
  rejeu du calendrier n'a récupéré que 4 matchs sur 82 — le script saute les **dates**
  déjà en base (optimisation normale pour un run de routine), donc les ~187 dates déjà
  traitées pour d'autres joueurs avant que Peterka ait un `nhl_id` ne sont jamais
  revisitées pour lui. Pas de flag `--force` existant pour ce cas.
- **Correctif appliqué** : script one-off (non committé) allant chercher directement le
  journal de matchs complet de Peterka via l'API NHL par joueur
  (`/v1/player/{nhl_id}/game-log/...`, 1 seul appel pour toute la saison) plutôt que de
  rejouer les 197 dates ; heure exacte de chaque match récupérée via boxscore par
  `gameId` (nécessaire pour `statusAt()`, `standings.ts:261`). 82 lignes upsertées
  (`on_conflict=player_id,game_date,season,game_type`, donc sans risque de doublon) — 25B
  22A (47 pts) au total.
- **Audit de portée** : comparé les 110 joueurs actuellement rosterés en staging *avec* un
  `nhl_id` déjà valide contre leurs vrais matchs joués (API NHL) — **aucun écart trouvé**.
  Peterka était un cas isolé ; les ~564 joueurs rosterés/sous contrat sans `nhl_id` restant
  n'ont légitimement aucun match NHL cette saison (prospects, etc.), déjà tous essayés sans
  correspondance par `backfill_nhl_ids.py`.
- Aucun changement de code cette fois — script one-off, pas un bug reproductible du
  pipeline lui-même (contrairement au bug de scraping du 2026-08-08).

### 2026-08-10

**[Refactor] — Fusion Ajustement / Activation recrue / Retour banque en une seule action « Changement de statut »** (`app/app/gestion-effectifs/GestionEffectifsManager.tsx`, `actions.ts`) :
- David a trouvé les 3 tuiles ajoutées la veille confuses (elles se chevauchaient
  conceptuellement — toutes des variantes de "changer le statut d'un ou deux joueurs") et a
  demandé un seul menu où on choisit librement le nouveau statut de chaque joueur impliqué
  (Actif/Réserviste/Recrue, n'importe quelle combinaison), plutôt que des tuiles
  pré-configurées par paire de statuts.
- `ActionType` simplifié : `'swap' | 'activate_rookie' | 'demote_rookie'` remplacés par un
  seul `'change_status'`, avec `entry1Id`/`newType1` + `entry2Id`/`newType2` optionnel (2e
  joueur pour un échange en une seule action de panier au lieu de deux distinctes).
- Chaque transition applique automatiquement la bonne validation selon le **statut cible**
  plutôt que selon la tuile choisie : délai de réactivation désormais systématique vers
  `actif` (amélioration incidente — l'ancienne « Activation recrue » ne le vérifiait jamais,
  ce qui aurait permis de contourner le délai en repassant un joueur par la banque de recrues
  avant de le réactiver), admissibilité recrue (5 saisons) + avertissement `rookie_type`
  manquant vers `recrue` (déplacés dans `deactivate()` pour s'appliquer peu importe l'appelant).
- `deactivate()`/`activate()` (déjà génériques) réutilisés tels quels via un petit wrapper
  `applyStatus()` — aucune duplication de logique de validation.
- Aucune donnée persistée ne référençait les anciens noms `ActionType` (valeurs transitoires
  d'une requête, jamais écrites en base — `roster_change_log.change_type` utilise un
  vocabulaire distinct et inchangé), donc remplacement propre sans migration nécessaire.

### 2026-08-09

**[Fix] — Doublon Mitch/Mitchell Marner (staging + PROD)** :
- Repéré par David en saisissant les alignements initiaux : deux fiches pour le même
  joueur, `Mitch Marner` (`nhl_id` vide, créée début juillet) et `Mitchell Marner`
  (`nhl_id=8478483`, la fiche canonique déjà utilisée dans les rosters/journal). Cause
  distincte du bug de scraping ci-dessus (pas de nom corrompu) : PuckPedia affiche le
  diminutif sur une page et le nom complet sur une autre, et le matching par nom exact de
  `import_supabase.py` (aucune règle de rapprochement par diminutif) ne les relie jamais.
  Le dédoublonnage existant du pipeline (cas 1-3 documentés dans `import_supabase.py`,
  ~ligne 350) ne couvre pas non plus ce cas puisqu'il compare des noms normalisés
  identiques, pas des variantes.
- La fiche fantôme avait un contrat 2030-31 (12 M$) absent de la fiche canonique — reporté
  avant suppression pour ne rien perdre. Vérifié sans référence dans `pooler_rosters`/
  `roster_change_log`/`transaction_items`/`player_stat_snapshots` dans les deux bases avant
  suppression.
- **Pas de correctif de code** cette fois — cas ponctuel plutôt qu'un bug systémique
  reproductible comme le scraping ; pas exploré de règle générale de rapprochement par
  diminutif (risque de faux positifs élevé, ex. deux joueurs différents partageant un
  diminutif). À surveiller si d'autres cas du genre apparaissent pendant la saisie.

**[Jalon] — Alignements initiaux (octobre 2025) saisis au complet en staging** :
- David a terminé la saisie des 8 rosters de départ via `/admin/init?tab=rosters`.
- Prochaine étape (annoncée par David, pas encore commencée) : saisir les transactions
  majeures et quelques mouvements de test via `/admin/historique` (gros du travail) et les
  outils `/gestion-effectifs`/`/admin/transactions` (test des outils + calcul des points,
  voir décision du 2026-08-08) pour valider la mécanique de périodes actives et les
  transferts joueurs/choix.

**[Feature] — Action « Retour banque » ajoutée à Gestion d'effectifs, fusionnée le lendemain (voir 2026-08-10)** (`app/app/gestion-effectifs/GestionEffectifsManager.tsx`, `actions.ts`) :
- David a signalé, en testant les transactions, qu'aucune action ne permettait de renvoyer
  un joueur actif/réserviste à la banque de recrues — seule la direction inverse
  (« Activation recrue ») existait.
- Nouvelle action `demote_rookie`, symétrique à `activate_rookie`, disponible pour tous
  (pas admin-only) sur `/gestion-effectifs` et `/admin/effectifs?tab=mouvements`.
- Liste filtrée sur l'admissibilité recrue (`is_rookie` ou `draft_year` dans la fenêtre de
  protection de 5 saisons — même formule que `getDraftYearCutoff()` dans
  `admin/rosters/actions.ts`), revalidée côté serveur en plus du filtre client.
- `rookie_type`/`pool_draft_year` déjà sur la ligne `pooler_rosters` sont conservés tels
  quels (jamais touchés par un simple changement de `player_type`) ; si absents (joueur
  jamais passé par la banque sur cette ligne), avertissement non bloquant plutôt que blocage
  — cohérent avec l'affichage existant de `/admin/init?tab=rosters` qui invite déjà à
  compléter le type recrue manquant.
- `deactivate()` (helper interne de `submitBatchAction`) étendu pour accepter `'recrue'`
  comme type cible, en plus de `'reserviste'`/`'ltir'` — réutilise `checkFutureRosterConflict`
  et `computeTypeChangeAddedAt` sans dupliquer la logique.
- **Remplacé le lendemain** par la fusion générique « Changement de statut » (voir
  2026-08-10) — cette action `demote_rookie` dédiée n'existe plus telle quelle, sa logique de
  validation a été absorbée dans `deactivate()`.

### 2026-08-08

**[Décision] — Abandon de la reconstruction Excel, repart des rosters d'octobre 2025** :
- L'écart actif/reserviste non résolu (voir session 2026-08-06/07) a coûté plus cher à
  déboguer qu'à refaire : David repart des alignements réels d'octobre 2025 (`/admin/init`),
  saisit manuellement les transactions majeures (agents libres, IR, échanges) via
  `/admin/historique` (choisi plutôt que `/admin/transactions`/`/gestion-effectifs` pour le
  gros du travail — seul outil à faire un échange N-contre-M + choix de repêchage en une
  transaction atomique, avec correction/annulation ligne par ligne), et valide contre de
  vraies feuilles de match NHL plutôt que des captures marqueur.com.
- `pooler_rosters`/`roster_change_log` de la saison 2025-26 vidés en staging (386 + 815
  lignes) pour repartir propre. Prod non touchée.
- Les outils `/gestion-effectifs`/`/admin/transactions` restent utiles séparément pour
  tester le fonctionnement réel des outils de saison (validations, notifications, trace
  `/transactions`) — indépendant du calcul des points, qui exige une date forcée dans la
  fenêtre déjà jouée (le calendrier réel n'a aucune incidence en staging).

**[Fix] — Choix de repêchage orphelins bloquant `/admin/repechage`** (staging uniquement) :
- 4 lignes `pool_draft_picks` (rondes 1-4, saison 2025-26) avaient `current_owner_id` et
  `original_owner_id` tous les deux `null`, faisant planter `DraftBoard.tsx`
  (`Cannot read properties of null (reading 'id')`).
- Cause probable : un compte pooler jetable créé/supprimé le 2026-07-30 pour un test
  Playwright (voir session de cette date) — le trigger `create_picks_for_new_pooler()` lui
  a créé 4 choix (seule saison existante à ce moment), puis `ON DELETE SET NULL`
  (`schema.sql`) a vidé les deux colonnes propriétaire à sa suppression. Reste une zone
  d'ombre : les saisons créées plus tard (2026-PO, 2026-27/27-28/28-29) n'ont pas le même
  problème alors qu'elles existaient déjà à cette date — pas pu vérifier si le trigger est
  réellement actif en base (pas d'accès SQL direct).
- Lignes supprimées (ids 417-420). Les 32 choix restants (8 poolers × 4 rondes) sont intacts.
- Puisque `pooler_rosters` avait aussi été vidé (décision ci-dessus), le repêchage 2025 déjà
  complété (32/32) n'affichait plus aucune recrue sur `/poolers` ni `/repechage-recrues`
  (l'assignation recrue↔pick vit dans `pooler_rosters`, pas `pool_draft_picks`). Choix
  ramenés à `is_used=false`/`pending_player_id=null` pour refaire le repêchage 2025 pour de
  vrai via `/admin/repechage` — sert aussi de test de cet outil.

**[Fix] — Recrues disponibles au repêchage non filtrées par année** (`app/app/admin/repechage/page.tsx`) :
- La requête `players` du tableau de repêchage incluait une fenêtre de 5 années
  (`draft_year >= poolDraftYear - 4`) au lieu de l'année sélectionnée seule — confusion
  entre la règle de protection recrue (5 saisons, une fois choisie) et l'éligibilité à
  l'affichage dans CE repêchage. Filtré strictement sur `draft_year = poolDraftYear`.

**[UI] — Recherche de joueurs remontée en haut sur écran étroit** (`app/app/admin/rosters/RosterManager.tsx`) :
- Sous le point de rupture `lg`, le bloc "Joueurs disponibles" (colonne de droite en
  affichage large) passe en premier via `order-first lg:order-none` — évite de défiler
  jusqu'en bas à chaque ajout de joueur pendant l'initialisation des alignements sur une
  fenêtre réduite. Aucun changement au-delà de `lg`. Page admin desktop-only donc pas
  d'obligation responsive, mais amélioration UX demandée par David.

**[Fix] — Bug de scraping dupliquant des joueurs avec un nom corrompu** (`python_script/scrape_puckpedia.py`) :
- Repéré par David en cherchant Simon Edvinsson dans `/admin/init?tab=rosters` : deux
  fiches, une correcte et une `EdvinssonDage23cap$894k`.
- Cause : quand la cellule du nom n'a pas de lien `<a>` (variante de mise en page
  PuckPedia), le code retombait sur `cells[0].get_text(strip=True)`, qui aspire tout le
  texte de la cellule (nom + position + âge + cap hit imbriqués) sans séparateur. Le
  `nhl_id` de ces lignes restant toujours `null`, `import_supabase.py` ne les fait jamais
  correspondre au joueur existant et en insère un nouveau à chaque run plutôt que de
  corriger l'existant.
- **Ampleur réelle, découverte en creusant au-delà du cas signalé** : 16 doublons en
  staging, **175 en PROD** (accumulés du 16 au 30 juillet sur plusieurs runs, le plus gros
  lot du 21 juillet). Vérifié avant suppression : aucune référence dans `player_contracts`
  ni `pooler_rosters` — suppression sans collatéral.
- Correctif : sur cette cellule, retirer les `<div>`/`<span>` d'info imbriqués (mêmes
  blocs utilisés plus loin pour position/âge/tir) avant de lire le texte restant.
- Nettoyage exécuté : 16 lignes supprimées en staging, 175 en PROD (`last_name ILIKE
  '%cap$%'`, confirmé sans collatéral avant suppression).

### 2026-08-06

**[Fix] — Bug de doublons `pooler_rosters` causé par l'apply du 2026-08-05, repéré par David via `/classement` et `/poolers/[id]`** (`python_script/import_mouvements_excel.py`) :
- David a repéré des joueurs (ex: Tage Thompson) avec 2 « périodes actives » commençant
  toutes les deux le 7 octobre dans le popup de points, et le même joueur listé deux fois
  dans l'onglet Alignement d'un pooler (cap et compte de postes doublés, ex: « Attaquants
  20/12 » au lieu de 10/12).
- **Cause confirmée en base (staging)** : l'étape de suppression de l'apply (`--apply`)
  ne vide `pooler_rosters`/`roster_change_log` que pour `report.players_touched` (les
  joueurs réellement mentionnés dans l'onglet `Mouvements`, ~155), mais l'étape
  d'insertion qui suit boucle sur `sim.rows_by_pair` au complet — qui contient aussi les
  ~320 joueurs préchargés depuis l'onglet `Roster_Initial` (`preload_initial()`), qu'ils
  aient été touchés ou non. Chaque joueur préchargé mais jamais mentionné dans
  `Mouvements` s'est donc fait insérer une ligne `pooler_rosters` neuve en plus de sa
  ligne préexistante jamais supprimée — même bug de fond que celui déjà corrigé le
  2026-08-05 (suite 2) pour l'affichage du rapport (`compute_final_rosters`), mais jamais
  appliqué à la vraie boucle d'écriture en base.
- **Portée confirmée par requête directe sur staging** : 191 joueurs avec 2 lignes
  `pooler_rosters` ouvertes simultanément. Point rassurant vérifié explicitement :
  **aucun cas cross-pooler** (0 joueur avec 2 lignes ouvertes chez 2 poolers différents)
  — la contrainte « un joueur = un seul pooler à la fois » n'est donc pas violée pour de
  vrai, c'est un doublon de bookkeeping chez le même pooler. Impact réel : points
  doublés dans `buildStandings()` (Thompson : 81 pts réels affichés 162), cap et compte
  de postes doublés dans l'onglet Alignement, pour ~191 des ~320 joueurs de la saison.
- **Correctif appliqué** : la boucle d'insertion (`import_mouvements_excel.py` autour de
  la ligne 996) ignore maintenant les paires `(pooler, pid)` dont `pid` n'est pas dans
  `touched_ids`, pour rester alignée avec la boucle de suppression qui précède.
- **Staging pas encore nettoyé** : les 191 doublons déjà insérés le 2026-08-05 sont
  toujours en base. David a choisi de prioriser le correctif du script pour l'instant;
  le nettoyage des lignes déjà dupliquées en staging reste à faire (analyse déjà faite :
  87 paires parfaitement identiques, 104 paires avec une ligne datée réellement + une
  ligne parasite datée exactement au début de saison — mécaniquement résolubles —, et 1
  cas (David Jiricek chez Paule, `actif` vs `reserviste`) qui demande un arbitrage
  manuel plutôt qu'une règle automatique).
- Sync vers prod (`sync_staging_to_prod.py`) à ne surtout pas lancer avant ce nettoyage.

**[Data] — Nettoyage des 191 doublons `pooler_rosters` en staging + découverte d'un second gap (métadonnées recrue perdues)** (staging uniquement, script one-off non committé) :
- En préparant le nettoyage des 191 paires identifiées ci-dessus, découverte d'un
  problème distinct : l'insertion de l'apply du 2026-08-05
  (`import_mouvements_excel.py` ~ligne 1002) n'écrit que `pooler_id`/`player_id`/
  `pool_season_id`/`player_type`/`is_active`/`added_at`/`removed_at` — jamais
  `rookie_type`/`pool_draft_year`/`draft_pick_id`. Ces champs pilotent la protection
  recrue (`isProtected()` dans `app/app/poolers/[id]/page.tsx`, fenêtre de 5 saisons) et
  le lien vers `pool_draft_picks`. Sur les 234 lignes `recrue` ouvertes en staging à ce
  moment, 126 n'avaient ni l'un ni l'autre — bien plus large que les 191 doublons
  (touche tout joueur recrue rejoué par l'apply, dupliqué ou non). Effet pratique :
  `isProtected()` retombe sur `!row.rookie_type → true` (protection par défaut, pas de
  perte de protection, mais impossible de calculer une date d'expiration correcte).
- Décidé avec David : traiter en deux temps. D'abord fusionner-puis-dédupliquer les 191
  paires (récupérer `rookie_type`/`pool_draft_year`/`draft_pick_id` de la ligne
  supprimée vers la ligne conservée quand elle les avait), reporter le gap plus large
  (joueurns recrue touchés mais jamais dupliqués) à une session séparée.
- **Logique de résolution par paire** (script one-off, non committé — vit dans le
  scratchpad de la session) : pour chaque paire, reconstruit l'état correct à partir des
  entrées `roster_change_log` `change_type='excel_import'` de la paire (la première
  transition `old_type IS NULL` donne le vrai `added_at`, la chaîne de transitions
  rejouée donne le vrai `player_type` final) ; la ligne dont `(added_at, player_type)`
  correspond à cet état reconstruit est conservée, l'autre est supprimée. Quand les deux
  lignes correspondent exactement (doublon de valeur pur), conserve l'id le plus bas.
  Avant chaque suppression, copie `rookie_type`/`pool_draft_year`/`draft_pick_id` de la
  ligne supprimée vers la ligne conservée si cette dernière ne les a pas déjà.
  191/191 paires résolues automatiquement (0 cas ambigu nécessitant un arbitrage manuel
  — y compris les 2 cas repérés avec un vrai changement de statut, ex: Matthew Schaefer
  recrue→actif le 16 avril, David Jiricek actif→réserviste le 9 octobre : la ligne
  reconstruite à partir de `roster_change_log` était la bonne dans les deux cas, celle
  gardée par erreur lors de l'apply était la ligne périmée d'avant le 2026-08-05).
- **Exécuté** : 105 lignes fusionnées (métadonnées recrue récupérées), 191 lignes en
  double supprimées. Vérifié après coup : 0 paire dupliquée restante, `pooler_rosters`
  passe de 577 à 386 lignes. Gap résiduel (recrues touchées par l'apply, jamais
  dupliquées, toujours sans `rookie_type`/`draft_pick_id`) : 21 lignes sur 128 recrues
  ouvertes — à traiter séparément.
- **Reste à faire** : combler le gap résiduel de 21 lignes recrue ; revalider
  `/classement` en staging (points ne devraient plus être doublés) ; seulement ensuite
  envisager `sync_staging_to_prod.py`.

**[Investigation] — David signale des joueurs encore actifs en fin de saison qui ne devraient plus l'être (ex: 17 attaquants actifs chez David au lieu de 12) — comparaison avec marqueur.com démarrée, pas terminée** (aucun changement de code, DB pas modifiée) :
- Après le nettoyage des doublons ci-dessus, David a signalé un problème distinct : sur
  `/poolers/[id]` (onglet Alignement), David semblait avoir 17 attaquants « actifs »
  (non grisés) au lieu du maximum légal de 12. Vérification directe en base : le compte
  réel de lignes `pooler_rosters.player_type='actif'` ouvertes pour David n'est que de 7
  attaquants — donc le « 17 » observé dans l'app était très probablement un rendu en
  cache d'avant le nettoyage (ISR/ revalidate), pas un nouveau bug de code.
- **Mais la vérification a quand même révélé un vrai problème de fond** : le statut
  final (`actif` vs `réserviste`) issu de la reconstruction Excel du 2026-08-05 est
  incorrect pour un nombre significatif de joueurs, indépendamment du bug de doublons
  déjà corrigé. David a fourni 8 captures d'écran (une par pooler) du classement final
  réel sur marqueur.com, déposées dans `marqueur/` (dossier ajouté au `.gitignore`, même
  traitement que `excel/` — matériel de référence local, pas du code applicatif) :
  `marqueur/Alignement_final_{David,Vincent,Jerome,Nicolas,Paule,Sebastien_Fau,Sebastien_Stl,Steve}.jpg`.
  Sur marqueur.com, les lignes en rouge = joueur inactif en fin de saison (les gardiens
  ont un bogue connu côté marqueur.com : jamais de ligne rouge pour eux, donc ce signal
  n'est pas utilisable pour valider les gardiens — se fier à nos propres règles
  (max 2 gardiens actifs) à la place).
- **Comparaison ciblée faite (liste `actif` courante en DB vs couleur sur marqueur.com)**,
  avec un niveau de confiance variable selon le cas (images ~270px de large, pas d'OCR
  disponible dans cet environnement — lecture visuelle directe, pas de script fiable à
  100 % pour le nom exact de chaque ligne). Cas confirmés avec bonne confiance :
  - **David** : Igor Chernyshov et Teuvo Teravainen sont marqués `actif` en DB mais
    apparaissent en rouge (inactifs) sur marqueur.com. À l'inverse, plusieurs joueurs que
    marqueur.com montre actifs (ex: Marchenko, Eklund, Blake, Stankoven, Malkin, Savoie,
    Konecny, McCann) ne sont **pas** actuellement `actif` pour David en DB — Eklund en
    particulier est actuellement rattaché à un tout autre pooler (Vincent) dans notre DB.
  - **Sébastien F.** : Ivan Barbashev et Artturi Lehkonen marqués `actif` en DB mais
    rouges sur marqueur.com.
  - **Steve** : Artyom Levshunov (défense) semble rouge sur marqueur.com alors que la DB
    le dit actif — moins confiant que les cas ci-dessus, à revérifier.
  - Joueurs confirmés **corrects** (DB actif = marqueur.com blanc/actif), pour référence :
    Connor, Pastrnak, Raymond, Scheifele, Tuch (David) ; Debrincat, Sennecke, Zacha
    (Sébastien F.) ; O'Reilly, Michkov (Sébastien S.) ; Carlsson, Graf, Malinski (Steve).
- **Pas encore fait / à reprendre en priorité la prochaine session** :
  - Comparaison complète et fiable pour les 8 poolers (celle-ci n'a couvert qu'un
    sous-ensemble ciblé, pas la totalité de chaque alignement — le mismatch touche
    apparemment ~30-40 % des joueurs actuellement `actif`, pas juste quelques cas isolés).
  - Décider d'une méthode plus fiable que la lecture visuelle d'image basse résolution :
    soit David confirme/corrige manuellement les cas ambigus, soit il fournit les données
    marqueur.com dans un format texte/exportable plutôt qu'en capture d'écran.
  - Une fois la liste des écarts confirmée, corriger `pooler_rosters` en staging (aucune
    écriture faite pour cette partie-là — uniquement l'investigation).
  - Ne toujours pas synchroniser vers prod tant que ce point n'est pas réglé.

### 2026-08-05 (suite 5)

**[Planification] — Réconciliation des choix de repêchage échangés durant 2025-26 (hors scope du script, à faire manuellement)** (aucun changement de code) :
- Les colonnes de choix de repêchage du fichier Excel (`Choix acquis/cédé`, `Echange
  Pooler`, `Choix Pooler`) sont volontairement hors scope de
  `import_mouvements_excel.py` (décidé le 2026-08-03) — jamais rejouées dans
  `pool_draft_picks`. David veut les ajuster manuellement avant la sync vers prod.
- Le rapport du script liste 8 lignes brutes concernées (« Lignes avec choix de
  repêchage, non traitées »). En les pairant (une ligne par côté d'un même échange, même
  principe que les mouvements de joueurs — voir la mécanique documentée le 2026-08-04),
  ça se résout en **6 mouvements de choix distincts**, tous saison 2026 :

  | Ronde | Propriétaire original | Nouveau propriétaire |
  |---|---|---|
  | 4e | Paule | David |
  | 2e | David | Vincent |
  | 4e | Vincent | David |
  | 2e | Nicolas | Vincent |
  | 2e | Paule | David |
  | 3e | David | Steve |

- **Point à vérifier par David avant d'appliquer** : le choix « 2e ronde, original Paule →
  David » (26 février) correspond à l'échange où David cède Jakob Chychrun à Paule contre
  un choix — David avait mentionné verbalement une 3e ronde à l'époque (voir entrée du
  2026-08-04, section Chychrun), mais le fichier Excel indique une 2e ronde. À confirmer
  laquelle est correcte avant la réassignation.
- **À faire par David, manuellement** : réassigner ces 6 choix via `/admin/init?tab=choix`
  (interface existante pour réassigner le propriétaire d'un pick échangé hors-app) — pas
  couvert par le script d'import.

### 2026-08-05 (suite 4)

**[Data] — `--apply` exécuté : historique 2025-26 reconstruit en staging** (`python_script/import_mouvements_excel.py`, données `pooler_rosters`/`roster_change_log` en staging) :
- Après une longue session de revue (voir toutes les entrées du 2026-08-03 au 2026-08-05),
  David a confirmé que le rapport dry-run était propre (0 bootstrap, 0 anomalie, 0 nom non
  résolu, 0 violation de légalité résiduelle, 0 signalement d'alignement final) et a donné
  le feu vert pour appliquer.
- **`--apply` exécuté avec succès** : 383 lignes `pooler_rosters` + 808 lignes
  `roster_change_log` insérées pour les 155 joueurs touchés par le fichier (remplacement
  complet — delete + reinsert, les corrections manuelles `/admin/historique` déjà faites
  pour ces joueurs sont maintenant recalculées, pas dupliquées). `pooler_rosters` passe de
  336 à 577 lignes pour la saison (528 ouvertes / 49 fermées). Vérifié directement en base :
  Conor Geekie → David/recrue depuis le 2 février, Trevor Zegras → Sébastien F./réserviste
  depuis le 6 mars — cohérent avec les corrections validées.
- **Cible : staging uniquement**, comme prévu depuis le début. Prod pas touchée.
- **Reste à faire** : valider le classement (`/classement`) en staging avec les nouveaux
  points calculés, puis synchroniser vers prod via `sync_staging_to_prod.py` une fois
  l'historique jugé définitif (voir `project_staging_prod_sync.md`). Les colonnes de choix
  de repêchage du fichier Excel restent hors scope (jamais rejouées dans
  `pool_draft_picks`) — à traiter séparément si souhaité.

### 2026-08-05 (suite 3)

**[Feat] — Corrections d'alignement final depuis un fichier texte, même principe que les corrections de légalité** (`python_script/import_mouvements_excel.py`) :
- David voulait pouvoir corriger des erreurs repérées dans la section « Alignements
  finaux » (ex: statuts finaux erronés) sans éditer `Mouvements` à la main. Décidé de
  garder ça simple : appliqué à la date de fin de saison (`saison_end_date`), sans demander
  de date précise par joueur (confirmé avec David — pas besoin de préserver l'attribution
  fine des points pour ces ajustements de toute fin de saison).
- `load_final_alignment_corrections()` lit `excel/correction_alignements_finaux.txt` —
  **même format que la section du rapport** (indentation 2/4/6 espaces : pooler / position /
  statut+nom) — David copie la section, corrige les lignes fautives, je la relis directement.
- Nouvelle fonction `compute_final_rosters()` (extraite de la logique d'affichage
  existante, réutilisée aux deux endroits) pour éviter de dupliquer le calcul combiné
  simulé+baseline. Applique changement de statut (même pooler) ou vrai transfert (pooler
  différent) selon le cas. Un joueur absent du fichier n'est **jamais** retiré
  automatiquement (trop risqué d'inférer une suppression depuis une omission) — seulement
  signalé pour revue manuelle.
- Testé avec le fichier que David avait déjà préparé : 5 corrections appliquées sans
  erreur (Jackson Blake, Matthew Schaefer, Ryker Evans, Brandon Bussi, Scott Wedgewood —
  tous des passages recrue/réserviste → actif chez le même pooler).
- Toujours dry-run, `--apply` pas exécuté.

### 2026-08-05 (suite 2)

**[Feat + Fix] — Section « Alignements finaux » étendue à tous les joueurs (pas seulement les touchés), regroupés par position/statut** (`python_script/import_mouvements_excel.py`) :
- David voulait valider l'alignement complet de chaque pooler (recrues jamais bougées
  incluses), pas seulement les joueurs touchés par le fichier. Étendu la section pour
  combiner joueurs simulés (touchés + préchargés via `Roster_Initial`) et joueurs jamais
  touchés (statut DB actuel, inchangé), regroupés par position (attaquants/défenseurs/
  gardiens) puis par statut.
- **Bug trouvé immédiatement en testant** : plusieurs joueurs dupliqués (Kyle Connor, Lucas
  Raymond, Mark Scheifele, Evan Bouchard, plusieurs recrues). Vérifié d'abord côté base
  (seul le doublon déjà connu du 2026-08-03 existe, aucun nouveau) — donc bug de script :
  `Roster_Initial` précharge déjà TOUS les ~320 joueurs dans `sim.rows_by_pair` (pas
  seulement les touchés), mais la boucle ajoutant les joueurs "non touchés" depuis la DB ne
  vérifiait que `pid not in all_touched_ids`, sans tenir compte de ce préchargement — un
  joueur jamais touché par `Mouvements` mais présent dans `Roster_Initial` se faisait donc
  compter deux fois. Corrigé : exclusion basée sur `(pooler, pid) in sim.rows_by_pair`
  plutôt que sur l'ensemble des joueurs touchés.
- Reste à faire : David termine sa relecture des alignements complets avant `--apply`.

### 2026-08-05 (suite)

**[Feat] — Section « Alignements finaux » ajoutée au rapport** (`python_script/import_mouvements_excel.py`) :
- David voulait valider les alignements complets de chaque pooler au 16 avril (fin de
  saison), pas seulement les écarts vs la base (le diff de sanité n'affiche que les joueurs
  qui diffèrent, pas la liste complète). Ajouté une nouvelle section listant, pooler par
  pooler, tous les joueurs touchés par le fichier encore sous contrat à la fin de la
  simulation, groupés par statut (actif/réserviste/ltir/recrue).
- Reste à faire : David termine sa relecture de cette nouvelle section avant `--apply`.

### 2026-08-05

**[Fix] — Mapping pooler incomplet (« Sébastien F. » non reconnu) + statut de banc non naturel pour les corrections de légalité** (`python_script/import_mouvements_excel.py`) :
- En relisant le diff de sanité en détail, David a repéré plusieurs incohérences : Trevor
  Zegras encore chez David en fin de saison alors qu'il avait été échangé à Sébastien F.
  (confirmé le 2026-08-04), Matias Maccelli/Victor Hedman/Jordan Kyrou/Jonathan Marchessault
  encore listés réservistes alors qu'ils avaient été mis au ballotage, Conor Geekie/Fyodor
  Svechkov listés réservistes plutôt que recrue.
- **Cause Zegras (et 2 autres lignes)** : `POOLER_NAME_MAP` reconnaissait `"Sébastien S."`
  comme variante directe (ajoutée le 2026-08-03) mais pas l'équivalent `"Sébastien F."` —
  quand la cellule `Echange Pooler` contenait littéralement ce texte (lignes 198-200, le
  vrai échange Zegras/McMichael/Drysdale contre Reinhart), `map_pooler()` retournait `None`
  silencieusement, faisant échouer le transfert vers l'autre pooler. Corrigé : ajout de
  `'sebastien f.': 'Sébastien F.'`.
- **Effet de bord découvert en corrigeant Zegras** : une ligne 201 dupliquait le retrait de
  Connor McMichael côté David (sans `Echange Pooler` cette fois, contrairement à la ligne
  198 qui gère déjà correctement son départ) — un vrai doublon de reconstruction, du même
  type que les autres déjà nettoyés. Supprimée par David.
- **Cause Geekie/Svechkov** : leur statut `Recrue` (acquis le 2 février lors de l'échange
  avec Nicolas, confirmé par David) était correct dans la simulation, mais le mécanisme de
  correction de légalité les rebasculait systématiquement vers `Réserviste` en les
  bannissant, sans tenir compte de leur vrai statut de repli. Nouvelle fonction
  `get_status_before_activation()` : au lieu de toujours bannir vers `reserviste`, résout le
  statut qui précédait le dernier passage à `actif` (ex: Svechkov promu `recrue`→`actif` le
  15 avril, banni immédiatement après pour dépassement — redescend maintenant à `recrue`,
  son vrai statut de repli, pas `reserviste`).
- **Résultat** : 0 bootstrap, 0 anomalie, 0 violation résiduelle, tous les cas signalés par
  David désormais cohérents entre simulé et attendu. Toujours dry-run, `--apply` pas encore
  exécuté — David termine sa relecture du diff de sanité avant de donner le feu vert.

### 2026-08-04 (suite 4)

**[Feat + Fix] — Application automatique des corrections de légalité depuis un fichier texte, 4 bugs de chronologie trouvés en le débogant** (`python_script/import_mouvements_excel.py`) :
- David a produit `excel/correction_violations_alignements.txt` (47 lignes, même format que
  la section « Violations de légalité » du rapport — la vraie liste des joueurs actifs à
  chaque période au lieu de celle simulée), couvrant les 97 violations de la session
  précédente pour les 6 poolers concernés (pas seulement David/Vincent).
- Plutôt que de demander à David d'éditer 27 lignes dans `Mouvements` à la main, le script
  lit maintenant ce fichier directement (`load_legality_corrections()`) et applique les
  changements de statut lui-même : `pooler_rosters`/`roster_change_log` équivalents générés
  automatiquement pour chaque joueur à bannir/réactiver, à la bonne date, sans jamais
  toucher aux points déjà gagnés en dehors de la période corrigée.
- **4 bugs de chronologie trouvés en creusant pourquoi les corrections ne s'appliquaient pas
  toutes correctement** (aucun n'était un problème du fichier de David) :
  1. `get_roster_snapshot` lisait `row['player_type']` (statut **final** de la ligne) au lieu
     de résoudre le statut à la date demandée — cassé par le déplacement de la vérification
     de légalité après les corrections (avant, elle tournait immédiatement après chaque
     date traitée, donc "final" coïncidait avec "à cette date").
  2. `ts = f"{start}T12:00:00Z"` alors que `start` était déjà un timestamp complet →
     `"...T12:00:00ZT12:00:00Z"`, cassant silencieusement les comparaisons de chaînes.
  3. `change_type` décidait qu'un changement était un no-op en comparant au statut **actuel**
     de la ligne plutôt qu'au statut **au moment visé** — ratait les corrections insérées à
     une date antérieure à un événement déjà simulé (ex: Jake Neighbours, corrigé au 23
     octobre après que son vrai déclassement du 11 novembre ait déjà tourné).
  4. Le suivi interne "déjà banni par une correction" ne voyait pas les vraies réactivations
     survenues entre-temps via le fichier (Ryan Leonard : banni par correction le 3
     novembre, réactivé pour de vrai le 13, aurait dû être re-banni le 17 décembre par une
     2e correction — ratée car le suivi le croyait encore banni). Remplacé par une
     comparaison toujours basée sur un snapshot frais de l'état réellement simulé, plutôt
     qu'un suivi de "qui j'ai déjà banni".
- **Résultat final : 0 violation résiduelle** (parti de 97, en passant par 55 → 25 → 0
  changements appliqués au fil des corrections de bugs). Toujours dry-run, `--apply` pas
  exécuté — reste à faire une dernière relecture du rapport avec David avant de lancer.

### 2026-08-04 (suite 3)

**[Fix] — Bug de fuite baseline pour les joueurs à première mention tardive + tri chronologique du rapport** (`python_script/import_mouvements_excel.py`) :
- David a repéré en lisant le détail (ajouté à la session précédente) que Trevor Zegras
  apparaissait comme actif chez David dès le 8 octobre, alors qu'il ne l'a acquis que le
  21 octobre (`Mouvements` ligne 18). Cause : `check_legality` exclut du baseline (état DB
  actuel) les joueurs "touchés" par le fichier via `report.players_touched`, construit
  **incrémentalement** pendant la boucle — un joueur dont la première mention est tardive
  n'est donc pas encore dans cet ensemble pour les dates qui précèdent sa première ligne,
  et fuit dans le baseline (son statut DB actuel, `actif`) pour ces dates-là.
- **Corrigé** : calcul d'un `all_touched_ids` complet en un seul passage sur tout le fichier
  avant la boucle principale (au lieu de l'ensemble incrémental), utilisé pour l'exclusion
  du baseline. Violations 106 → **97**.
- David a aussi demandé un tri chronologique du rapport de légalité (au lieu d'un
  regroupement par pooler/catégorie) pour pouvoir le parcourir dans l'ordre de la saison et
  construire un fichier de corrections joueur par joueur — fait.
- **Prochaine étape (David)** : il prépare un fichier listant, pour chaque ligne de
  violation, la vraie liste des joueurs actifs à ce moment (au lieu de la liste simulée) —
  je pourrai alors calculer les corrections précises (qui doit être réserviste, et depuis
  quand) sans risquer de retirer des points à tort.
- Toujours dry-run, `--apply` pas exécuté.

### 2026-08-04 (suite 2)

**[Fix + Feat] — Vérification de légalité une fois par jour, rapport enrichi avec les noms de joueurs** (`python_script/import_mouvements_excel.py`) :
- David a validé toutes les corrections restantes du fichier (Moser, trade Zegras/McMichael/
  Drysdale contre Reinhart, Chychrun, Monahan) — **0 bootstrap, 0 anomalie, 0 nom non résolu**
  atteint pour la première fois. Chronologie du fichier maintenant entièrement cohérente.
- David a ensuite demandé à voir les joueurs concernés par les 206 violations de légalité
  pour décider qui mettre sur le banc — ajouté les noms + regroupement par période stable
  au rapport (`check_legality` prend maintenant `pindex`, stocke `(date, pooler, bucket,
  msg, noms)` au lieu de juste `(date, pooler, msg)`).
- **Bug trouvé par David en examinant le détail** : la même date affichait plusieurs
  compteurs différents pour le même pooler (ex: Vincent 14 puis 15 attaquants actifs le
  9 octobre) — la légalité était vérifiée après **chaque ligne individuelle** du fichier,
  capturant des états transitoires en plein milieu de journée quand plusieurs transactions
  du même pooler partagent la même date, plutôt que l'état de fin de journée. Corrigé :
  vérification différée à une fois par `(date, pooler)`, après que toutes les lignes de
  cette date aient été appliquées (`flush_legality_checks()`). Effet : 206 → **106**
  violations (~moitié de bruit).
- **Analyse des noyaux « toujours actifs »** (joueurs présents dans 100% des violations
  d'un groupe pooler/catégorie, donc jamais rétrogradés une seule fois de la saison) :
  confirmée stable avant/après le fix du bug de comptage — donc un vrai signal, pas du
  bruit. David a identifié des candidats pour David et Vincent (attaquants et défenseurs),
  mais tous sont des joueurs actuellement `actif` toute la saison dans les données (jamais
  touchés par le fichier Excel) — les marquer réservistes rétroactivement sans date précise
  leur retirerait des points potentiellement mérités. **Décision en suspens** : attendre que
  David précise soit des dates approximatives, soit qu'il accepte ces dépassements comme
  imperfection connue (rappel : la légalité n'affecte jamais le calcul des points).
- Toujours dry-run, `--apply` pas exécuté.

### 2026-08-04

**[Fix] — Deux bugs de simulation trouvés en creusant les bootstraps restants** (`python_script/import_mouvements_excel.py`) :
- En cherchant pourquoi Morgan Rielly (Vincent) déclenchait un bootstrap alors que son
  historique semblait complet, traçage en direct de la simulation (import du module,
  monkeypatch des méthodes `Simulation` pour logguer chaque appel touchant son `player_id`)
  a révélé la vraie cause : **`Date tri` désynchronisée de `Date`** sur 5 lignes (ex: ligne
  41, `Date`=2025-12-23 mais `Date tri` encore à 2025-11-08 — reliquat d'un run antérieur de
  `sort_mouvements.py`, jamais relancé après une correction de `Date` par David). Le script
  utilisait `Date tri` en priorité ; la réclamation au ballotage de Rielly par Jérôme était
  donc traitée 6 semaines trop tôt, fermant la ligne de Vincent avant même ses propres
  événements (descente en réserve, mise au ballotage) du 17 décembre — d'où le faux
  bootstrap. **Corrigé** : `Date` (toujours renseignée, vérifié sur les 272 lignes) prime
  maintenant sur `Date tri`, qui ne sert plus que de repli si `Date` est vide.
- **2e bug, distinct** : le fichier vient à l'origine de tabs séparés par pooler
  (`extract_mouvements.py`) — un même échange entre 2 poolers apparaît donc souvent 2 fois
  (une ligne "acquis" côté receveur, une ligne "cédé" côté donneur, à des dates parfois
  légèrement différentes). La simulation traitait chaque ligne comme un événement
  indépendant ; si la ligne "acquis" s'appliquait en premier (transfert réel), la ligne
  "cédé" jumelle tentait de re-retirer le joueur d'un pooler qui ne l'avait déjà plus,
  déclenchant un bootstrap fantôme (touchait Jiri Kulich, Liam Greentree, Brady Tkachuk,
  Jagger Firkus). **Corrigé** dans `process_cede` : si le joueur est déjà chez
  `Echange Pooler` au moment de traiter la ligne, elle est traitée comme la réaffirmation
  d'un échange déjà appliqué (simple `change_type`), pas un 2e retrait.
- Effet combiné : bootstraps 11 → **6** sur 156 joueurs touchés. Nouveau : un vrai contrôle
  d'anomalie signale maintenant les cas où un "cédé" est déclaré chez un pooler qui, selon
  la simulation, ne détient déjà plus le joueur (au lieu de bootstraper silencieusement à
  tort) — 5 cas détectés (Janis Jérôme Moser, Trevor Zegras, Jamie Drysdale, Jakob Chychrun
  ×2), tous des incohérences chronologiques réelles dans le fichier à faire valider par
  David plutôt que des bugs de script.
- **Reste à faire** : revue des 5 anomalies + 6 bootstraps avec David avant `--apply`.
  Toujours aucune écriture en base.

### 2026-08-03

**[Feat] — Script d'import de l'historique de roster 2025-26 depuis Excel (dry-run livré, `--apply` pas encore lancé)** (`python_script/import_mouvements_excel.py`, nouveau) :
- Suite de la planification du 2026-07-31 : `excel/Mouvements_consolides.xlsx` (269 lignes,
  hors dépôt git) n'a jamais été parfaitement nettoyé par David (colonne `Type` toujours à
  21 libellés incohérents), mais il a demandé d'avancer quand même — dry-run d'abord.
- **Mécanique retenue, indépendante du texte `Type`** (jugé peu fiable après lecture
  détaillée du fichier — ex: une ligne "Échange entre pooler" s'est avérée être un simple
  changement de statut interne) : simulation chronologique par joueur, décidant à partir de
  l'état simulé courant (pas du texte) si un "Joueur acquis" est un changement de statut
  interne, un vrai transfert, ou un ajout neuf ; le "Joueur cédé" reste chez le même pooler
  sauf si son statut est `Ballotage` (départ réel, pool devient "non détenu") ou si la
  colonne `Echange Pooler` est remplie (transfert réel vers cet autre pooler). Validé en
  confrontant le résultat simulé aux 2 cas déjà corrigés manuellement et connus comme
  corrects (Zeev Buium/Sam Rinzel, Jiri Kulich) — la simulation, entièrement indépendante,
  arrive exactement au même état final que ces corrections déjà validées en juillet.
- **Hors scope confirmé avec David** : les colonnes de choix de repêchage (Choix
  acquis/cédé, Choix Pooler) ne sont pas rejouées dans `pool_draft_picks` — seulement
  listées dans le rapport (9 lignes concernées). Le script ne réinitialise rien avant de
  tourner : il régénère entièrement l'historique (delete + reinsert) de tout joueur touché
  par le fichier, donc les corrections manuelles déjà faites (McMichael/Blake/Rinzel/Buium/
  Kasper/Kulich/Isaac Howard) sont simplement recalculées, pas dupliquées.
- Résolution des noms via le pattern `unidecode` déjà établi dans ce dossier
  (`import_supabase.py`, `backfill_nhl_ids.py`) — aucune approximation silencieuse, les
  noms non résolus vont dans le rapport avec suggestion `difflib` optionnelle.
- **Résultat du dry-run** (`python_script/logs/import_mouvements_*.log`) : 269/269 lignes
  traitées, 155 joueurs touchés, 1 seul nom non résolu (`Leon Draisatl`, typo pour
  Draisaitl), 1 anomalie (statut cédé manquant, ligne 226 — vrai trou dans le fichier). 97
  "origines déduites" (joueur jamais vu avant sa première mention dans le fichier — statut
  de départ supposé `actif`, à vérifier au cas par cas si un résultat semble faux). 147
  violations de légalité listées mais **peu fiables** : le baseline utilisé pour les joueurs
  jamais touchés vient de l'état DB actuel (pas garanti valide rétroactivement) — noté
  explicitement dans le rapport pour ne pas les lire comme 147 vrais problèmes distincts.
  Diff de sanité (simulé final vs DB actuelle) : 96/155 joueurs touchés diffèrent — attendu,
  puisque la quasi-totalité de cette histoire n'a jamais été saisie dans l'app.
- Suit le pattern déjà établi par `sync_staging_to_prod.py` (dry-run par défaut, `--apply`
  + confirmation `oui`, log dupliqué sur fichier via `Tee`).
- **Reste à faire** : David doit relire le rapport (`Noms non résolus`, `Anomalies`,
  `Diff de sanité`) avant tout `--apply`. `--apply` n'a **pas** été exécuté cette session —
  aucune écriture en base. Cible restée staging uniquement, comme prévu.

**[Amélioration] — Onglet `Roster_Initial` pour remplacer le bootstrap heuristique par la vraie donnée** (`python_script/import_mouvements_excel.py`) :
- Les « origines déduites » (joueur jamais vu avant sa première mention dans le fichier,
  statut de départ deviné) représentaient 97 des 155 joueurs touchés — trop pour être
  fiable. David a proposé de fournir l'alignement réel de chaque pooler en tout début de
  saison ; ajouté lui-même un onglet `Roster_Initial` (Pooler/Joueur/Statut, 320 lignes,
  alignement complet des 8 poolers) dans `Mouvements_consolides.xlsx`.
- `Simulation.preload_initial()` charge ces 320 lignes avant de rejouer les mouvements —
  le bootstrap heuristique (`actif` par défaut) ne s'applique plus qu'en dernier recours,
  pour un joueur absent à la fois de `Roster_Initial` et de tout mouvement antérieur.
- Effet sur le dry-run : « origines déduites » 97 → **13** (317/320 lignes de
  `Roster_Initial` résolues ; 3 problèmes mineurs restants : 2 noms légèrement mal
  orthographiés — `Axel Sandin-Pellikka` avec trait d'union au lieu d'espace, `Dmitry
  Simashev` au lieu de `Dmitriy` —, 1 doublon `Matvei Michkov` chez le même pooler). Noms
  non résolus et anomalies diverses : déjà à 0 (David avait corrigé la typo Draisaitl et le
  statut manquant de la ligne 226 entre-temps). Violations de légalité 147 → 214 — attendu
  et pas une régression : l'ancien bootstrap ne posait une ligne qu'à la première mention
  d'un joueur, donc beaucoup de joueurs touchés étaient invisibles (absents de tout calcul)
  pendant les premières semaines de saison ; avec l'alignement réel préchargé dès le 7
  octobre, le calcul de légalité est maintenant plus complet, donc plus de vraies
  compositions (probablement réellement en dépassement à l'époque) apparaissent.
- **Reste à faire** : David peut corriger les 3 derniers problèmes `Roster_Initial` dans le
  fichier (optionnel, faible enjeu). `--apply` toujours pas exécuté.

### 2026-07-31

**[Chore] — Validation log pipeline staging et push CSV vers prod** (CSV pipeline) :
- David a roulé le pipeline en staging (`run_pipeline_staging_2026-07-30_10-23-37.log`, 5527 lignes) : aucune erreur/exception. 1527 joueurs mis à jour, 4345 contrats upserted, 0 changement repêchage (376 `is_rookie` resynchronisés), backfill `nhl_id` 1/566 trouvé (profil habituel, cf. entrée du 2026-07-19, pas une anomalie). Pipeline complet en 207s.
- CSV poussés sur `main` (`a83fed3`) selon la convention établie — déclenche l'import GitHub Actions vers prod, vérifié avec `gh run watch` (30552155193, succès).

**[Planification] — Import automatisé de l'historique de roster depuis Excel, en remplacement de la saisie manuelle `/admin/historique`** (`excel/Mouvements_consolides.xlsx` — **hors dépôt git, `.gitignore` ligne 6** — aucune trace dans l'historique Git, cette entrée est la seule mémoire du contexte) :
- Point de départ : la reconstruction manuelle de l'historique de saison via `/admin/historique` (voir entrées 2026-07-18 à 2026-07-20) est jugée beaucoup trop longue par David. Il a en main `excel/Mouvements_consolides.xlsx`, son suivi personnel des transactions de la saison (279 lignes), et a demandé si je pouvais m'en servir pour faire la saisie à sa place.
- **Structure du fichier** (feuille `Mouvements`) : une ligne = un mouvement pour **un seul pooler** (`Joueur acquis/activé` + `Joueur cédé/désactivé`, avec dates `Date`/`Jusqu'à`/`Date tri`/`Date estimée`). Colonnes `Choix acquis`/`Choix cédé`/`Année` pour les picks, `Échange Pooler`/`Choix Pooler` pour lier les deux côtés d'un vrai échange à 2 poolers.
- **Itération avec David** : le fichier original avait une colonne `Type` à 11 valeurs incohérentes (Ballotage, BLT/BLT 1/BLT 2, Agent Libre 1/2, Gestion Blessure, IR, Gestion Lineup, Échange Pooler, vide) sans indication du **statut résultant** (actif/réserviste/recrue/LTIR) — impossible à mapper de façon fiable vers les 6 types de l'outil Historique sans deviner. David a enrichi le fichier lui-même : renommé `Type` avec le vocabulaire de l'outil (`Changement de type` / `Échange même pooler - X` / `Échange entre pooler` / `Retrait seulement de l'alignement` / `Ballotage`), ajouté 2 colonnes `Statut joueur acquis` / `Statut joueur cédé`, et un onglet `Feuil1` (notes en texte libre pour les transactions complexes multi-joueurs, ex: "Réclame Morgan Rielly; laisse aller Alex Vlasic et Alex Laferriere; monte Zachary Bolduc...").
- **Règles confirmées avec David** (à respecter dans le script d'import) :
  - `Statut cédé = 'Ballotage'` → le joueur quitte réellement l'alignement du pooler, peu importe le `Type` de la ligne (pas une histoire de rester avec un nouveau statut).
  - `Échange même pooler - IR` (et variantes Agent libre) : le joueur acquis n'entre pas forcément par échange — peut être un agent libre. Le sens mécanique reste le même (un joueur entre Actif, un autre passe IR **sans quitter** le même pooler) — la source exacte du joueur acquis n'a pas d'impact sur l'écriture en BD.
  - `Ballotage` : la ligne ne montre que le côté du réclamant (joueur acquis + joueur libéré pour faire de la place). Le côté "qui perd le joueur" ne sera **pas** ajouté comme colonne — je le déduirai en simulant l'état du roster de tous les poolers en ordre chronologique (je sais déjà qui possédait le joueur juste avant cette ligne).
- **Validation de légalité demandée par David** : au fil de l'historique reconstruit, vérifier que chaque pooler reste dans les règles (12A/6D/2G actifs max, min. 2 réservistes, masse salariale ≤ cap du pool) — mêmes règles que `validateFinalRoster()` dans `/admin/transactions/actions.ts`, absentes de `/admin/historique` aujourd'hui. David sait qu'il y a des transactions impossibles à retracer (trous dans son suivi) — **décision** : le script produira un **rapport de dry-run** listant les incohérences (date, pooler, problème) plutôt que de bloquer l'import ; David corrige ce qui est corrigeable, accepte le reste en connaissance de cause. Rien n'est écrit en base avant validation du rapport.
- **État à la reprise** : David finit encore la correction du fichier (36 lignes sur 273 restaient sur les anciens libellés de `Type` au dernier passage). **Script d'import pas encore écrit** — prochaine étape une fois le fichier prêt : lire le fichier enrichi, simuler chronologiquement, produire le rapport de légalité, puis (après revue) écrire réellement dans `pooler_rosters`/`roster_change_log` en respectant la même logique que `submitHistChangeAction` (`app/app/admin/historique/historique-actions.ts`) — `computeTypeChangeAddedAt`, `checkFutureRosterConflict`, vocabulaire `roster_change_log.change_type`.
- Cible : **staging uniquement**, comme le reste de la reconstruction d'historique (voir `project_staging_prod_sync.md` — sync vers prod seulement une fois l'historique complet et validé).

### 2026-07-30

**[UI] — Logo mis de l'avant sur la page d'accueil** (`app/app/page.tsx`) :
- `Header` réécrit en lockup logo + marque : `icon-512x512.png` affiché à 64px (mobile) / 80px
  (desktop) à gauche, `Cap Crunch` agrandi (`text-3xl`/`text-4xl`, `font-extrabold`) à droite.
  « Bienvenue {nom} » déplacé en petite ligne discrète au-dessus du nom de marque au lieu
  d'être fondu dans la même phrase que le titre.
- Testé avec un compte pooler jetable créé/supprimé via l'API admin Supabase (service role,
  `python_script`-style) piloté par Playwright (installé ponctuellement dans `app/node_modules`,
  pas ajouté à `package.json` — pas de skill de lancement dédiée pour ce projet, à
  considérer via `/run-skill-generator` si on refait ça souvent) : capture desktop et mobile,
  aucune erreur console, layout responsive ok.
- Commit : `2aa615e`.

**[Infra] — Synchronisation `staging` après le nouveau logo, conflit `CLAUDE.md` résolu** :
- `cap-crunch-staging` déploie depuis la branche git `staging`, pas `main` — les commits du
  logo (`d3d850c` et suivants) poussés sur `main` la veille n'apparaissaient donc pas sur
  `cap-crunch-staging.vercel.app` tant qu'un merge manuel n'était pas fait. Pas de sync
  automatique entre les deux branches : à refaire à chaque fois que `staging` doit rattraper
  `main`.
- `git merge origin/main` dans `staging` → conflit dans `CLAUDE.md` (règle du projet :
  confirmation demandée avant de committer un conflit) : la branche `staging` avait encore
  l'ancien lien de preview Vercel (`cap-crunch-staging-git-b91a22-boucherdavids-projects.vercel.app`)
  au lieu du domaine court actuel (`cap-crunch-staging.vercel.app`) — résolu en gardant la
  version de `main` (confirmé par David). `SUIVI_PROJET.md` avait fusionné sans conflit.
- Commit de fusion : `bb4c889` (branche `staging`), poussé.
- **Diagnostic cache appris en cours de route** (utile si ça revient) : trois caches distincts
  et indépendants peuvent faire persister l'ancien favicon/icône après un déploiement — cache
  navigateur du favicon (quirk connu Chrome/Edge, survit à un hard refresh), icône PWA déjà
  installée (capturée par l'OS à l'installation, ne se met pas à jour toute seule — nécessite
  désinstaller/réinstaller), et cache d'icônes Windows pour un raccourci épinglé à la barre des
  tâches (résolu en détachant/réépinglant, ou en redémarrant l'explorateur Windows). Vérifié
  côté serveur avec `curl -I` sur le fichier déployé (`X-Vercel-Cache: MISS`, bytes identiques
  au fichier local) pour confirmer que l'origine servait déjà la bonne version avant de
  chercher la cause côté client.
- Effet de bord sans lien avec le logo : la bannière d'installation PWA (`InstallBanner.tsx`)
  peut sembler disparaître après ces manipulations — c'est `localStorage` (`installBannerDismissed`,
  `pwaInstalled`) qui persiste d'une visite à l'autre sur le même navigateur, pas un bug.

### 2026-07-29

**[Infra] — Environnement staging distant sur Vercel + renommage complet de l'app en « Cap Crunch »** (`CLAUDE.md`, `app/CLAUDE.md`, branding applicatif, config Vercel/GitHub) :
- Point de départ : David voulait pouvoir tester à distance des fonctionnalités futures qui nécessitent une vraie participation des poolers (ex: draft en direct, réponse au ballotage) — impossible avec `npm run dev` local (accessible seulement sur son poste) et risqué à tester directement en prod.
- **Solution retenue** : un deuxième projet Vercel (`cap-crunch-staging`, gratuit sur le plan Hobby existant — usage partagé entre tous les projets du compte mais largement dans les limites pour un pool de 8 personnes) branché sur une nouvelle branche git `staging`, avec ses propres variables d'env pointant vers la base Supabase staging (mêmes valeurs que `app/.env.staging.local`). `rootDirectory=app`, framework Next.js configuré explicitement (`vercel project add` ne le détecte pas automatiquement — premier déploiement avait échoué en 404 plateforme faute de ce réglage).
- **Piège rencontré** : les déploiements non-Production sont protégés par défaut par la SSO Vercel (redirection vers `vercel.com/sso-api`), ce qui aurait bloqué tous les poolers (pas de compte Vercel). Désactivé via `ssoProtection: null` sur le projet staging — l'authentification réelle reste gérée par Supabase, comme en prod.
- Réglage « Production Branch » (Settings → Environments → Production, pas Settings → Git comme dans les versions précédentes du dashboard Vercel) changé manuellement par David de `main` à `staging` sur le projet staging.
- **Rebranding complet en cours de route** : David a profité de l'occasion pour renommer l'app « DB Hockey Manager » → **Cap Crunch** (jeu de mots sur le cap salarial + Cap'n Crunch, avec un clin d'œil à la charge de gestion des contrats qui montent en flèche). Repo GitHub renommé `boucherdavid/DB_Hockey_Manager` → `boucherdavid/cap-crunch` (remote local mis à jour), les deux projets Vercel renommés (`db-hockeypool-manager` → `cap-crunch`, `db-hockeypool-manager-staging` → `cap-crunch-staging`), et toutes les occurrences UI du nom (title, manifest PWA, notifications push, page Aide, export feedback) mises à jour dans le code.
- **Piège rencontré (rename)** : renommer un projet Vercel ne fait *pas* automatiquement apparaître le nouveau domaine court `<nom>.vercel.app` — l'ancien domaine (`db-hockeypool-manager.vercel.app`) est resté attaché et fonctionnel (aucune interruption pour les poolers), mais il a fallu ajouter explicitement `cap-crunch.vercel.app`/`cap-crunch-staging.vercel.app` comme nouveaux domaines via l'API Vercel (`POST /v10/projects/:id/domains`) pour qu'ils pointent vers les déploiements courants.
- URLs finales : prod `https://cap-crunch.vercel.app/`, staging `https://cap-crunch-staging.vercel.app/`. Ancien lien prod (`db-hockeypool-manager.vercel.app`) laissé actif en parallèle (David va simplement repartager le nouveau lien aux poolers, aucun n'avait encore le lien staging).
- **Non couvert / connu et accepté** : les deux projets Vercel surveillent l'ensemble du repo, donc un push sur `main` déclenche aussi un build Preview (inoffensif, gaspille juste un peu de build-minutes) sur le projet staging, et vice-versa un push sur `staging` déclenche un Preview sur le projet prod. Pas de `vercel.json`/`ignoreCommand` mis en place pour filtrer ça — impact jugé négligeable pour l'usage actuel. Nom du dossier local (`C:\Projet_Codex\Hockey_Pool_App`) volontairement non renommé (changement disruptif pour peu de gain, aucune référence utilisateur ne l'expose).
- Validé : `npx tsc --noEmit` propre ; les deux URLs (prod et staging) testées en HTTP direct après déploiement, titre de page confirmé "Cap Crunch".
- Guide ajouté (`docs/RENOMMER_DOSSIER_LOCAL.md`) pour renommer proprement le dossier local plus tard (chemins codés en dur à corriger dans `.mcp.json`, `start_app.ps1`, `run_pipeline_*.ps1`, `docs/GIT_GUIDE.md`, 2 pages admin ; venv Python et cache `.next` à recréer ; mémoire Claude Code liée au chemin à migrer manuellement si voulu).
- Commits : `3d1421d`, `ed1a444`, `98ca076` (main), `720933f` (staging).

**[Branding] — Nouvelle icône PWA/favicon (remplace l'ancien badge « DBHM »)** (`app/public/icons/*.png`, `docs/branding/`) :
- L'icône (favicons, `apple-touch-icon`, `icon-192/512`) portait encore le texte « DBHM » (ancien nom, DB Hockey Manager) gravé dans le PNG — jamais mis à jour lors du rebranding Cap Crunch du même jour (voir entrée précédente), puisque c'est un raster, pas du texte dynamique.
- David a généré deux mascottes sur ideogram.ai ; retenu le personnage qui cligne de l'œil (casque bleu marine, bandeau rouge, bâton + rondelle avec `$`). Fourni en JPEG haute résolution (`cap-crunch-logo.jpg`, fond crème plein).
- Recadrage automatique (script Python/Pillow, `Pillow` installé à la volée dans `python_script/venv` — pas ajouté à `requirements.txt`, usage ponctuel) : détection de la bbox du personnage par analyse ligne par ligne des pixels non-fond, pour exclure le bandeau de texte « CAP CRUNCH / HOCKEY POOL » (illisible de toute façon sous 512px) — crop carré 538×538 dans l'original 1024×1024, puis redimensionné en 512/192/180/32/16.
- Question posée : le mascotte clignant de l'œil paraissait-il trop enfantin ? Diagnostic : proportions chibi + clin d'œil + fond pastel crème. Fond recoloré en gris-glace (`#c8d6e0`, remplace le crème par seuillage colorimétrique) — testé aussi un fond navy foncé d'abord, rejeté : le casque (déjà navy) devenait illisible en 16/32px faute de contraste, le gris-glace clair règle ça tout en étant moins « pastel ».
- Tentative de neutraliser le clin d'œil (copier/refléter l'œil ouvert par-dessus) laissait une trace résiduelle et un raccord visible — pas d'outil de retouche fine disponible ici. David a choisi de garder le clin d'œil tel quel plutôt que de régénérer via Ideogram.
- Fichier source déplacé de `app/public/icons/` (servi publiquement par Next.js, pas souhaitable pour un brut non recadré) vers `docs/branding/cap-crunch-mascot-source.jpg`. `DBHM_Logo.svg` (orphelin, déjà inutilisé dans le code) supprimé.
- Non couvert : le clin d'œil reste tel quel (accepté par David) ; icône adaptative Android (`maskable`) non implémentée, juste vérifiée par anticipation que le mark tient dans la zone de sécurité circulaire.
- Commit : `d3d850c`.

### 2026-07-26

**[Feat] — Nouveau type « Réclamé au ballotage » dans `/admin/historique`, pour tester la mécanique** (`app/app/admin/historique/historique-actions.ts`, `HistoriqueManager.tsx`, `docs/saisie-historique-mouvements.md`) :
- David veut valider si le mécanisme de ballotage fonctionne en le rejouant dans l'outil de reconstruction d'historique, sans construire le vrai système complet (Chantier G — notifications, ordre de priorité par classement, délai de réclamation, tables `waiver_entries`/`waiver_claims` — toujours **non construit**, voir `docs/regles-changements-alignement.md` section Ballotage).
- Nouveau `HistTxType = 'ballotage'` : retrait chez le pooler qui libère + ajout chez le pooler qui réclame (mécaniquement comme un `trade` à sens unique, un seul joueur), journalisé `hist_ballotage` — distinct de `hist_trade` pour rester identifiable dans un futur Suivi/notifications. Type d'arrivée choisi (actif/réserviste/recrue/LTIR).
- Ajouté en cours de session (cas réel rencontré par David en testant : Jérôme veut réclamer Morgan Rielly mais doit libérer Alex Vlasic pour faire de la place) : champ optionnel **« Joueur libéré par le réclamant »** — si rempli, ce 2e joueur est retiré (retrait complet) du roster du réclamant à la même date, journalisé séparément. Ce joueur ne repasse pas lui-même par un nouveau cycle de ballotage dans cet outil simplifié (si besoin, saisie manuelle distincte).
- **Piège rencontré** : le pooler qui libère doit encore avoir la ligne `pooler_rosters` **ouverte** (`removed_at IS NULL`) pour ce joueur au moment de la saisie — la fonction ne fait pas juste un ajout, elle applique retrait+ajout en un seul événement atomique (miroir du vrai processus : le joueur est encore dans l'équipe au moment d'être libéré). Cas concret : Vincent avait déjà retiré Morgan Rielly via un « Échange même pooler » antérieur (ligne déjà fermée) — pour le refaire en ballotage, il a fallu supprimer cette ligne précise dans le journal (`deleteHistLogAction`, restaure `removed_at = null`) avant de ressaisir le mouvement complet via le nouveau type. La ligne jumelle (arrivée de Roman Josi, même transaction d'origine) n'a pas eu besoin d'être touchée — chaque ligne du journal est indépendante.
- Discussion connexe (pas de changement de code) : pas besoin d'un « panier » de transactions multi-étapes pour Historique (contrairement à `/admin/transactions`/`TransactionBuilder`, dont le panier existe justement parce que cet outil-là bloque toute soumission invalide à mi-parcours — cap, composition 12A/6D/2G, budgets). Historique ne valide jamais rien, donc un scénario en plusieurs étapes (ex: trade pour faire de la place, puis ballotage) peut simplement être saisi comme plusieurs transactions séparées, dans l'ordre chronologique logique. Rappel confirmé en cours de route : en saison régulière normale (sans "Forcer une date effective"), c'est bien l'heure réelle de soumission (`new Date().toISOString()`) qui est utilisée, pas une heure fixe — contrairement à Historique qui fixe toujours midi UTC sur la date choisie.
- Validé : `npx tsc --noEmit` propre après chaque étape. Testé en staging par David en cours de session (scénario Rielly/Vlasic/Josi/Vincent/Jérôme).
- **Reste à faire** : David poursuit les tests en staging dans une session future — pas encore de verdict final sur si la mécanique simplifiée couvre tous les cas voulus.

### 2026-07-25 (suite)

**[Fix] — Tri des joueurs par pts strictement décroissant, peu importe le statut** (`app/app/classement/ClassementTable.tsx`, `app/app/poolers/[id]/PoolerPageTabs.tsx`) :
- David a repéré que dans la liste détaillée d'un pooler (par position), les joueurs `reserviste`/`recrue`/`ltir` étaient toujours regroupés après les `actif`, peu importe leurs points — ex: Ryan Leonard (LTIR, 4 pts) apparaissait sous Shabanov (réserviste, 0 pt) au lieu d'être classé entre Peterka (0 pt) et Cuylle (38 pts) selon ses propres points.
- `groupAndSort()` (dupliquée à l'identique dans les deux fichiers) triait par `typeOrder(playerType)` d'abord, `poolPoints` ensuite — retiré le critère de statut, tri uniquement par `poolPoints` décroissant à l'intérieur de chaque groupe de position (attaquants/défenseurs/gardiens). Fonction `typeOrder()` supprimée (plus utilisée).
- Validé : `npx tsc --noEmit` propre.

### 2026-07-25

**[Feat] — Échange même pooler : le joueur retiré peut changer de statut au lieu de quitter le pool** (`app/app/admin/historique/historique-actions.ts`, `HistoriqueManager.tsx`) :
- David a signalé un cas manquant dans l'onglet « Échange même pooler » : aller chercher un agent libre (dans le max de signatures LTIR décidé) en échange d'un joueur qu'on met sur LTIR — jusqu'ici le joueur retiré quittait toujours complètement le pool (`removed_at` fermé), aucune façon de simplement lui changer de statut (réserviste/recrue/LTIR) en une seule transaction avec l'ajout du nouveau joueur.
- Nouveau champ `playerOutANewType` (optionnel) sur `HistChangeInput` : si fourni, le joueur retiré reste chez le pooler A avec ce nouveau statut (via la même logique que « Changement de type » — `checkFutureRosterConflict` + `computeTypeChangeAddedAt`) au lieu d'être fermé (`removed_at`). `null` = comportement existant inchangé (retrait complet).
- `applyTypeChange` (auparavant définie localement dans la branche `type_change`) sortie au niveau de la fonction pour être réutilisée par les deux branches (`type_change` et `swap`), signature étendue avec `poolerId` en paramètre.
- UI : nouveau sélecteur « Sort du joueur retiré » (Retiré du pool / Réserviste / Recrue / LTIR) affiché uniquement pour `txType === 'swap'` quand un joueur est sélectionné. Avertissement durée minimale LTIR (`checkHistLtirDurationAction`) câblé de la même façon que pour Changement de type (non bloquant, même philosophie — voir `CLAUDE.md` section 6).
- Scope volontairement limité à « Échange même pooler » (demande explicite de David) — pas touché aux autres onglets.
- Validé : `npx tsc --noEmit` propre ; testé en direct par David en staging pendant la session (logs serveur confirment `checkHistLtirDurationAction` appelé avec succès sur un vrai cas actif→ltir).

### 2026-07-24

**[Fix données] — Audit des risques résiduels notés le 2026-07-22 (staging uniquement, prod pas encore synchronisée)** (aucun changement de code, données `pooler_rosters`/`roster_change_log` en staging) :
- Script d'audit lecture seule écrit et lancé contre staging pour couvrir les deux risques résiduels documentés le 22 juillet : (A) lignes `roster_change_log` restantes hors du lot de 342 déjà nettoyé, (B) autres lignes `pooler_rosters` avec `added_at` figé dans la fenêtre de reconstruction (7 juin – 10 juillet 2026, même bug que Rinzel/Buium/Kasper/Kulich corrigé le 22 juillet).
- **Audit A (10 lignes `is_admin_override=false` restantes, toutes examinées individuellement)** : 8 confirmées légitimes (vraies actions en temps réel — double-clic inoffensif sur Spencer Knight, lot réel de 5 changements de type chez Vincent le 13 juillet, désactivation Logan Mailloux). 2 confirmées comme vrais fantômes de la même famille que Dustin Wolf (clic réel fait avant qu'une correction Historique ultérieure ne referme la ligne à une date antérieure, laissant un évènement orphelin après `removed_at`) : `id=387` (Sam Rinzel, David) et `id=407` (Jiri Kulich, Vincent) — supprimés avec l'accord de David, aucun impact sur les points (déjà hors fenêtre active).
- **Audit B (134 lignes avec `added_at` dans la fenêtre suspecte)** : 130 étaient des joueurs `recrue` en banque sans période active — aucun risque, exclus du calcul par construction (`periods.length === 0`). 1 cas confirmé par une preuve directe (correction Historique réelle datée du 2025-10-09 mais jamais reflétée dans `added_at`) : **Axel Sandin Pellikka (Vincent)** — même bug exact que Rinzel/Buium. 3 cas sans preuve directe (aucun `roster_change_log`, aucune transaction) mais au profil identique (ajoutés `actif` le 2026-07-09 à la minute près, sans aucune trace) : **Sean Monahan (Sébastien S.), Brock Nelson (Nicolas), Anton Lundell (Paule)** — confirmés par David comme devant être actifs depuis le début de saison plutôt que de vraies acquisitions de juillet.
- **Correction appliquée en staging** (`added_at` reculé à `saison_start_date` 2025-10-07T12:00, cohérent avec la convention du 22 juillet — fonctionnellement équivalent à reculer à la date exacte de l'évènement puisque `statusAt()` retombe sur `recrue` avant l'évènement de toute façon) : `pooler_rosters` id 317 (Pellikka), 335 (Monahan), 336 (Nelson), 337 (Lundell).
- **Vérifié par simulation** (rejeu Python de la logique `buildStandings()` contre `player_game_logs` réels, avant/après) : Pellikka +21 pts (68 matchs), Monahan +36 pts (78 matchs), Nelson +65 pts (81 matchs), Lundell +44 pts (64 matchs). **Total : +166 pts** répartis sur 4 poolers différents (Vincent, Sébastien S., Nicolas, Paule).
- Ré-audit après correctif : Audit A à 8/8 lignes classées légitimes (0 résiduel), Audit B sans plus aucune ligne `actif`/`reserviste` dans la fenêtre suspecte (les 130 restantes sont toutes `recrue`, non-risque confirmé).
- **Reste à faire** : ces corrections ne sont qu'en **staging**. La synchronisation vers prod (`sync_staging_to_prod.py --apply`) n'a pas encore été lancée pour ce lot — à faire quand David confirme, car ça affecte le classement réel vu par tous les poolers.

### 2026-07-22 (suite 2)

**[Feat] — LTIR ajouté aux 4 sélecteurs de type dans l'onglet Historique + avertissement durée minimale** (`app/app/admin/historique/historique-actions.ts`, `HistoriqueManager.tsx`, `app/app/admin/config/actions.ts`, `SeasonConfigForm.tsx`, `app/app/admin/pool/page.tsx`, `supabase_migrations/duree_min_ltir_jours.sql`) :
- David a remarqué que `/admin/historique` (Échange même pooler, Changement de type, Ajout seulement) n'offrait que Actif/Reserviste/Recrue — LTIR manquant partout, alors que les règles LTIR sont documentées dans `docs/regles-changements-alignement.md` et s'appliquent en saison régulière.
- Ajouté `'ltir'` à `PLAYER_TYPES` (constante unique réutilisée aux 4 endroits) et à `HistPlayerType`. Confirmé que la contrainte CHECK de `pooler_rosters.player_type` accepte déjà `ltir` (3 lignes staging existantes, gérées ailleurs via `/gestion-effectifs`).
- David a demandé que la durée minimale LTIR (délai avant de pouvoir sortir un joueur de LTIR, ex. 21 jours) ne soit **pas bloquante** dans Historique (même philosophie que le délai de réactivation : Historique doit rester libre pour reconstituer des scénarios réels) — seulement une trace dans le journal si non respectée.
- Nouveau champ configurable `pool_seasons.duree_min_ltir_jours` (défaut 21), migration `supabase_migrations/duree_min_ltir_jours.sql` (exécutée manuellement par David dans le SQL Editor Supabase staging — pas de connexion Postgres directe disponible pour du DDL, contrairement aux corrections de données via l'API REST). Ajouté dans `/admin/config` à côté de Max signatures LTIR.
- `checkHistLtirDurationAction` (nouveau, même pattern que `checkHistReactivationDelayAction`) : cherche le dernier événement `roster_change_log` avec `new_type='ltir'` pour ce (pooler, joueur) avant la date choisie ; si moins de `duree_min_ltir_jours` jours se sont écoulés, avertissement orange non bloquant. Câblé en direct dans le formulaire Changement de type (joueur 1 et joueur 2) et rétroactivement dans `getHistLogAction` (badge ⚠ avec tooltip dans le journal).
- Validé : `npx tsc --noEmit` propre ; migration confirmée appliquée en staging (colonne lue avec succès, défaut 21 sur toutes les saisons) ; logique vérifiée par simulation contre les 3 lignes LTIR réelles en staging (toutes posées à l'alignement initial sans événement journalisé — comportement correct : pas d'avertissement possible, faute de date de départ connue, même limite que le délai de réactivation).
- **Non couvert** : le délai LTIR n'est vérifié que dans `/admin/historique` (demande explicite de David) — pas dans `/gestion-effectifs` ni `/admin/transactions`, qui ont leurs propres mécanismes LTIR (`ltir`/`return_ltir`/`ltir_sign`) sans cette vérification.
- Migration également appliquée en prod par David (confirmée : colonne présente, défaut 21 sur les 2 saisons actives). Fonctionnalité pleinement opérationnelle en staging et en prod.

### 2026-07-22 (suite)

**[Fix données] — Nettoyage complet du lot de 342 lignes `roster_change_log` fantômes du 2026-07-10** (données staging, aucun changement de code) :
- En resaisissant un `Changement de type` pour Steve (Nick Paul / Tyson Foerster), `checkFutureRosterConflict` a bloqué avec un message pointant un événement du 2026-06-07 — un artefact du même lot de 365 lignes déjà repéré le 2026-07-20 (`created_at` = instantané du 2026-07-10, `is_admin_override=false`), toujours présent en résidu (307 lignes à l'époque).
- Supprimé les 2 lignes bloquantes immédiates (id 154 Nick Paul, id 170 Tyson Foerster), puis David a demandé de nettoyer tout le lot restant d'un coup plutôt que de le rencontrer une ligne à la fois au fil de la saisie.
- Audit complet du lot (`created_at = 2026-07-10T13:04:46.765128`, 342 lignes restantes) avant suppression en bloc :
  - 307 lignes réaffirmaient encore le statut courant de la ligne `pooler_rosters` visée (inoffensives par définition, mais deviendraient bloquantes/fantômes dès la prochaine correction touchant ce joueur — même schéma que Rinzel/Buium plus tôt dans la journée).
  - ~30 lignes étaient des `retrait` fantômes (`new_type=null`) sur des joueurs de la banque de recrues jamais réellement retirés — invisibles pour `buildStandings()` (filtre `new_type IS NOT NULL`) mais visibles et bloquantes pour `checkFutureRosterConflict` (qui ne filtre pas les `null`).
  - Vérifié pour chaque ligne restante qu'aucun événement réel (`is_admin_override=true`) ne dépend chronologiquement de sa présence — 7 cas limites (dont Spencer Knight, Dustin Wolf, Jiri Kulich) confirmés sans impact par simulation manuelle de `statusAt()`/`activeSegments()` avant suppression.
  - Supprimé les 342 lignes en un seul DELETE (`roster_change_log` où `created_at` = l'horodatage exact du lot).
- **Découverte connexe** : en vérifiant Dustin Wolf (David), 3 événements dangling *distincts* du lot (clics réels de test le 2026-07-11, `is_admin_override=false`) tronquaient sa période active au 11 juillet 2026 au lieu de la laisser ouverte (0 pt d'impact, saison déjà terminée en avril, mais mauvaise date de fin affichée dans le popup). Supprimés avec l'accord de David (id 366, 367, 371).
- **Vérifié par simulation** (rejeu Python de `buildStandings()` contre les vraies données) : Spencer Knight inchangé (2 périodes, 52 pts) avant/après le nettoyage du lot — confirme qu'aucun point n'a bougé. Dustin Wolf repasse à 1 période ouverte, mêmes 53 pts.
- **Risque résiduel** : reste 35 lignes non liées à ce lot dans `roster_change_log` (dont potentiellement d'autres artefacts ponctuels comme celui de Wolf) — pas d'audit exhaustif au-delà de ce qui a été croisé aujourd'hui.

### 2026-07-22

**[Fix code+données] — Joueurs invisibles/points perdus après un changement de type ou un échange rétroactif** (`app/lib/standings.ts`, `app/app/admin/historique/historique-actions.ts`, données `pooler_rosters`/`roster_change_log` en staging) :
- David a repéré que Sam Rinzel (échangé, actif en début de saison chez lui) n'apparaissait plus du tout dans son effectif `/poolers/[id]`, et que Zeev Buium (qui l'a remplacé) affichait une date de période incorrecte (7 juin au lieu du 9 octobre) avec 0 pt alors qu'il a joué toute la saison.
- **Cause 1 (bug de code actif)** : la requête `buildStandings()` excluait `.not('player_type', 'eq', 'recrue')` — TOUTE la ligne `pooler_rosters` disparaissait dès que le statut *courant* était `recrue`, même si le joueur avait été `actif` plus tôt dans la saison (cas Rinzel : rétrogradé à `recrue` le 2025-10-09 avant d'être échangé). Corrigé : le filtre SQL est retiré, et l'exclusion se fait maintenant après calcul des périodes (`periods.length === 0 && player_type === 'recrue'`) — ne masque que les joueurs réellement toujours restés en banque de recrues.
- **Cause 2 (bug de code actif)** : la branche `trade` de `submitHistChangeAction` fixait `removed_at` sans vérifier qu'elle est postérieure à `added_at` de la ligne existante — a produit une fenêtre inversée (`added_at` 2026-06-07 > `removed_at` 2025-10-09) pour la ligne David/Rinzel. Corrigé : nouvelle fonction `removeFromRoster()` qui valide `ts >= added_at` avant de fermer la ligne, retourne une erreur explicite sinon (même philosophie que `checkFutureRosterConflict`).
- **Cause 3 (données périmées, pas un bug actif)** : le recul automatique de `added_at` lors d'un changement de type (`computeTypeChangeAddedAt`) n'a été livré que le 2026-07-17 (commit `16846b3`). Les corrections Historique de Rinzel/Buium et de 4 lignes chez Vincent (Isaac Howard, Jiri Kulich, Marco Kasper) ont été saisies le 2026-07-13, avant ce correctif — `added_at` est resté figé à la date réelle de la session de reconstruction (7-10 juin 2026, **après la fin de la saison**), tronquant ou annulant les vraies périodes actives.
- **Correction des données en staging** (SQL direct, confirmé avec David) : `added_at` reculé au 2025-10-07T12:00 (date de début de saison, `saison_start_date`) sur 6 lignes (`pooler_rosters` id 44, 47, 253, 309, 313, 314). Supprimé aussi 2 lignes `roster_change_log` fantômes (id 381, 408 — des clics "Activer" en temps réel faits juste avant la vraie correction historique, devenus redondants et qui auraient créé une fausse période active récente une fois `added_at` corrigé, même schéma que le bug documenté le 2026-07-20).
- **Vérifié par simulation** (rejeu de la logique `buildStandings()` en Python contre les vraies données `player_game_logs`, `/poolers/[id]` étant protégé par auth donc impossible à tester directement) : Buium +26 pts (0 → 26), Kulich +1 pt, Marco Kasper +18 pts récupérés. Rinzel et Isaac Howard réapparaissent avec une période réelle mais 0 pt (n'ont pas joué durant leur courte fenêtre de 2 jours).
- Validé : `npx tsc --noEmit` propre.
- **Risque résiduel** : d'autres lignes du même lot de reconstruction (added_at figé 7-10 juin 2026) pourraient exister sans avoir encore été détectées — seules celles ayant un événement `roster_change_log` réel antérieur à cette date ont été repérées (requête ciblée), pas un audit exhaustif de tout `pooler_rosters`.

**[Chore] — Validation log pipeline staging et push CSV vers prod** (CSV pipeline) :
- Log `run_pipeline_staging_2026-07-22_07-50-56.log` validé : aucune erreur, 1523 joueurs mis à jour, 4315 contrats upserted, pipeline terminé en 232.9s. Backfill nhl_id : 0/566 (identique aux runs précédents).
- CSV poussés sur `main` : commit `d9d12cd`.

### 2026-07-21

**[UI] — Affichage uniforme du détail par période dans le classement** (`app/app/classement/ClassementTable.tsx`, `app/app/poolers/[id]/PoolerPageTabs.tsx`) :
- David a repéré une incohérence visuelle : les joueurs avec une seule période active affichaient une date sous leur nom, ceux avec plusieurs périodes affichaient un bouton `↩N` ouvrant le détail par période — deux affichages différents pour la même information (dates de début/fin), source d'ambiguïté.
- Le popup (`PeriodPopup`) affiche déjà `addedAt → removedAt` par période, donc rien ne se perdait à retirer la date affichée directement sous le nom.
- Retiré la branche conditionnelle `isMultiPeriod ? bouton : date` dans les deux fichiers — le bouton `↩{p.periods.length}` s'affiche maintenant toujours, même pour une seule période (`↩1`). `fmtDate` reste utilisé à l'intérieur du popup.
- Validé : `npx tsc --noEmit` propre.
- Non touché : `app/app/classement-series/ClassementSeriesTable.tsx` a le même pattern `periods` mais n'a pas été demandé — à uniformiser dans une session future si souhaité.

**[Chore] — Validation log pipeline staging et push CSV vers prod** (CSV pipeline) :
- Log `run_pipeline_staging_2026-07-21_11-04-12.log` validé : aucune erreur/traceback, 1523 joueurs mis à jour, 4310 contrats upserted, 9 désactivés (absents du run), pipeline terminé en 244.5s. Backfill nhl_id : 0/566 correspondance trouvée, identique aux runs précédents (comportement stable, pas une régression).
- CSV poussés sur `main` : commit `915229d`. Déclenche l'import automatique GitHub Actions vers prod.

### 2026-07-20

**[Fix données] — Périodes fantômes dans le popup classement après correction Historique** (données `roster_change_log`, staging) :
- David a repéré, en validant McMichael (David) et Blake (David), une "Période 2 actif" fantôme apparaissant après une correction `type_change` saisie dans `/admin/historique` avec une date effective passée (2025-10-14).
- Cause : une vieille ligne `roster_change_log` (`change_type` sans préfixe `hist_`, `is_admin_override=false`) existait déjà pour ces joueurs avec une date effective (`changed_at`) plus tardive (2026-06-07) que la nouvelle correction historique, et un `new_type` reflétant leur statut **avant** la correction. `statusAt()` (`app/lib/standings.ts`) trie uniquement par date effective, donc cette vieille ligne s'appliquait après la correction et annulait son effet à partir du 7 juin.
- Portée : un lot de 365 lignes du même genre (`activation`/`ajout_recrue`/`retrait`/`ajout_reserviste`/`deactivation`, toutes `changed_at` entre le 2026-06-07 et le 2026-07-09, `created_at` le 2026-07-10 — probablement un instantané de l'état courant importé/généré ce jour-là, origine exacte non confirmée). Comparé chaque ligne au `player_type` actuel réel : 309 correspondaient encore (inoffensives), 19 ne correspondaient plus plus (même bug que McMichael/Blake, touchant 6 poolers différents), 2 concernaient des joueurs retirés depuis (sans effet, fenêtre déjà fermée).
- Vérifié avant toute suppression : la saison 2025-26 se termine le 2026-04-16 et toutes ces lignes ont `changed_at` ≥ 7 juin 2026 — donc **aucun point déjà calculé n'était faussé**, seul l'affichage (popup périodes) l'était.
- Supprimé en staging, avec l'accord de David : les 2 lignes McMichael/Blake (id 9, 24) puis les 19 lignes mismatch confirmées (id 17,19,21,36,42,56,63,91,136,178,184,191,193,194,195,268,303,307,364).
- **Risque résiduel** : les 309 lignes restantes redeviendront "mismatch" (même bug) dès qu'une future correction Historique changera le type d'un de ces joueurs — le nettoyage n'est pas définitif, à revérifier après chaque nouvelle vague de corrections. Pas de garde-fou côté code pour l'instant (`submitHistChangeAction` n'inspecte pas les événements futurs existants avant d'insérer une correction).

**[Fix code] — Garde-fou contre la récurrence des périodes fantômes** (`app/lib/rosterTypeChange.ts`, `app/app/admin/historique/historique-actions.ts`, `app/app/gestion-effectifs/actions.ts`) :
- David a demandé un correctif définitif (pas juste un nettoyage ponctuel) pour que ce problème ne se reproduise plus, y compris hors saisie Historique (ex: `/gestion-effectifs` avec "Forcer une date effective"), pour les saisons futures.
- Ajouté `checkFutureRosterConflict()` dans `rosterTypeChange.ts` : avant d'appliquer un changement de type sur une ligne `pooler_rosters` existante à une date effective donnée, vérifie s'il existe déjà un événement `roster_change_log` daté après cette date pour le même (pooler, joueur, saison) dont le `new_type` ne correspond pas au nouveau statut. Si oui, **bloque l'action** avec un message clair indiquant la date en conflit et où la résoudre (`/admin/pool?tab=suivi`) — volontairement bloquant plutôt qu'auto-nettoyant, car impossible de distinguer ici de façon fiable un artefact obsolète (sûr à supprimer) d'un vrai événement futur réel (ex: un vrai retrait déjà survenu) sans risquer d'effacer une donnée réelle.
- Câblé dans les 3 points d'entrée qui modifient `player_type` avec une date potentiellement passée : `submitHistChangeAction` (type_change, `/admin/historique`), et `deactivate`/`activate`/`addNewPlayer` (`/gestion-effectifs`, checkbox "Forcer une date effective" + mode pré-saison basé sur `saison_start_date`).
- **Non couvert volontairement** : les chemins `trade`/`ajout`/`retrait`/`swap` de `/admin/historique` (insertions de nouvelles lignes `pooler_rosters`, logique de mutation déjà engagée en cascade — risque de collatéral plus élevé pour un gain plus faible, le cas concret rencontré était toujours un `type_change`) ; et `/admin/transactions` (`submitTransactionAction`) qui, séparément, n'écrit **aucune** ligne `roster_change_log` du tout pour `type_change`/`promote`/`reactivate` — un gap distinct repéré en marge de ce fix, non corrigé, à traiter séparément si besoin.
- Validé : `npx tsc --noEmit` propre, et requête de détection re-testée manuellement contre le scénario McMichael reproduit temporairement en staging (conflit bien détecté, ligne de test nettoyée ensuite).

**[Fix code] — Comble le gap `/admin/transactions` : aucune ligne `roster_change_log` écrite** (`app/app/admin/transactions/actions.ts`) :
- David a demandé de traiter ce gap avant de poursuivre la saisie d'historique, pour éliminer les sources d'erreurs restantes. `submitTransactionAction` mettait déjà `pooler_rosters.player_type` à jour correctement mais n'écrivait **aucun** événement `roster_change_log` — `statusAt()` (`app/lib/standings.ts`) ne voyait donc jamais ces transitions et retombait sur le `player_type` courant pour toute la fenêtre `added_at→removed_at`. Contrairement au bug des périodes fantômes (sans impact réel car daté après la fin de saison), celui-ci pouvait fausser des points déjà comptés pour la saison en cours, silencieusement, dès qu'une transaction (`transfer`/`ballotage`/`promote`/`reactivate`/`sign`/`release`/`type_change`) changeait un statut en cours de saison.
- Ajouté un helper `log()` (même pattern que `/gestion-effectifs` et `/admin/historique`) et une fonction `pickChangeType()` locale qui choisit le même vocabulaire de `change_type` (`activation`/`deactivation`/`ajout_reserviste`/`ajout_recrue`/`retrait`/`ltir`/`retour_ltir`/`changement_type`) déjà reconnu par le Suivi (`CHANGE_LABEL` dans `admin/pool/page.tsx` et `poolers/[id]/PoolerPageTabs.tsx`), pour que le journal reste cohérent peu importe l'interface d'origine.
- Câblé `checkFutureRosterConflict()` (le même garde-fou qu'`/admin/historique`/`/gestion-effectifs`) sur les branches `transfer`/`ballotage` (arrivée), `promote`/`reactivate`/`type_change`, et `sign` — cette route accepte aussi une `transactionDate` backdatée, donc exposée au même risque de période fantôme.
- Validé : `npx tsc --noEmit` propre ; smoke-test des 3 routes touchées (`/admin/transactions`, `/admin/historique`, `/gestion-effectifs`) sur le serveur de dev contre staging — 307 (redirection login normale), aucune erreur serveur.
- **Correction d'une fausse piste signalée par erreur** : j'avais d'abord cru `app/app/admin/rosters/actions.ts` en bonne partie mort (pas de `page.tsx` dans `admin/rosters/`), en oubliant que ce dossier avait déjà été noté comme "composants/actions réutilisés par les onglets des hubs" lors de la suppression de `admin/rosters/page.tsx` (voir plus bas dans ce journal). Vérifié à nouveau, précisément : `RosterManager.tsx` est bien rendu par l'onglet "Rosters initiaux" de `/admin/init` (`app/app/admin/init/page.tsx:6,164`), qui utilise `submitRosterAction`/`adminInitRosterAction`/`updateRookieTypeAction`/`viderRostersAction`. Seule `changeTypeAction` (grep : zéro appelant nulle part) était réellement morte — supprimée (48 lignes), `detectChangeType` reste utilisé par les 6 autres appels dans le fichier. `tsc --noEmit` propre après coup.

### 2026-07-20 (suite)

**[Vérification] — Reprise après plantage de session, état réel confirmé** (aucun changement de code) :
- Session précédente plantée avant sa fin. David pensait que 3 choses étaient faites : le garde-fou, la synchro staging→prod, et la revérification des 309 lignes restantes. Vérifié chacune contre l'état réel (code + logs), pas contre la mémoire :
  - **Garde-fou** : confirmé fait et committé (`3c00626`, `9044f47`), scope inchangé (type_change seulement, voir entrée du 2026-07-20 plus haut).
  - **309 lignes fantômes restantes** : confirmé indirectement stable — le dry-run de `sync_staging_to_prod.py` montre `roster_change_log` à 381 lignes aujourd'hui contre 402 dans le log du 2026-07-18, soit exactement -21, cohérent avec les 2+19 lignes supprimées en staging plus tôt le 2026-07-20.
  - **Synchro staging→prod** : **pas faite**. Seuls deux dry-runs existent dans `python_script/logs/sync_staging_to_prod_*.log` (2026-07-18 et 2026-07-20), aucun `--apply`. David a clarifié : quand il disait "le sync est fait", il parlait du script (écrit et fonctionnel), pas de la synchro exécutée — à ne pas confondre à l'avenir.
- **Décision** : ne pas lancer `--apply` tant que la reconstruction/correction de l'historique de roster en staging n'est pas terminée. Synchroniser une seule fois vers prod une fois l'historique validé au complet, pas en cours de route.
- Mémoire mise à jour : `project_staging_prod_sync.md` (statut réel + piège de vocabulaire).
- David poursuit la reconstruction de l'historique staging dans une session future.

### 2026-07-19

**[Chore] — Validation log pipeline staging et push CSV vers prod** (CSV pipeline) :
- Log `run_pipeline_staging_2026-07-19_10-48-33.log` validé : aucune erreur, 1522 joueurs mis à jour, 4298 contrats upserted, pipeline terminé en 224s. Backfill nhl_id : 0/566 correspondance trouvée, comportement identique au run du 2026-07-18 (566 sans match) — pas d'anomalie.
- CSV poussés sur `main` selon la convention établie hier : commit `e9990a2`. Déclenche l'import automatique GitHub Actions vers prod.

### 2026-07-18 (suite 2)

**[Chore+Docs] — CSV PuckPedia poussé vers prod après validation staging, nouvelle convention** (CSV pipeline, `CLAUDE.md`) :
- David a demandé (suite à la discussion sur le fonctionnement staging/prod) que je pousse systématiquement le CSV PuckPedia sur `main` dès qu'un log de pipeline staging est validé propre, pour que l'import automatique GitHub Actions (`import.yml`) mette prod à jour — plutôt que de devoir rouler `run_pipeline_prod.ps1` séparément pour les salaires/contrats.
- Poussé le CSV du run staging du 2026-07-18 (déjà validé plus tôt dans la session) : commit `26d6431`. Déclenché et vérifié le run GitHub Actions (`gh run watch`) — succès en 58s, 1521 joueurs mis à jour, 4338 contrats upserted en prod.
- Convention documentée dans `CLAUDE.md` section 2 (commandes essentielles) et en mémoire long terme (`feedback_push_csv_after_staging_validation.md`) : appliquer par défaut à chaque validation de log staging propre, sans attendre la demande.
- Nouvelle mémoire `project_staging_prod_sync.md` : distingue les 2 mécanismes de synchro staging→prod qui existent maintenant — CSV salaires (semi-automatique via push git) vs historique de roster (manuel via `sync_staging_to_prod.py --apply`, jamais automatique).

### 2026-07-18 (suite)

**[Feat] — Script de synchronisation staging → prod pour l'historique de roster** (`python_script/sync_staging_to_prod.py` nouveau, `CLAUDE.md`) :
- Contexte : David reconstruit son historique de saison (échanges, changements de type, picks) dans l'outil Historique, mais toujours contre staging. Il a fait remarquer qu'il ne voulait pas resaisir deux fois la même chose en prod — le but de staging est justement de valider avant, pas de dupliquer le travail.
- Investigation avant de coder (lecture directe des deux bases) : les `poolers.id` et `pool_draft_picks.id` sont identiques entre staging et prod (même origine de clone) — aucun remapping nécessaire pour eux. Par contre `players.id` **diverge** : les deux bases sont importées indépendamment par le même pipeline PuckPedia, l'ordre d'insertion des nouveaux joueurs n'est pas garanti identique (prod : 2553 joueurs, id max 3051 ; staging : 2569 joueurs, id max 2824). Une copie brute des `player_id` aurait donc pu pointer vers le mauvais joueur en prod. ~20% des joueurs actuellement rostérés (67/326) n'ont pas de `nhl_id` (recrues/prospects encore en junior/AHL) — un mapping uniquement par `nhl_id` aurait donc raté une bonne partie des cas réels.
- Décidé avec David (2 questions) : script de synchronisation avec **remplacement complet** de la saison régulière active (efface `pooler_rosters`/`roster_change_log` de prod pour cette saison et les remplace par la version staging), plutôt qu'une fusion incrémentale — plus simple, correspond au modèle mental "staging = source de vérité une fois validé".
- **`sync_staging_to_prod.py`** : mapping des joueurs par `nhl_id` en premier, repli sur `(prénom, nom)` exact si absent des deux côtés ; si un joueur référencé par le roster actif de staging n'a aucune correspondance fiable en prod (introuvable ou ambigu), le script **abandonne sans rien écrire** plutôt que de risquer une corruption — recommande de rouler le pipeline prod d'abord. `pool_draft_picks` synchronisé par `id` direct (ownership + `is_used`). Dry-run par défaut (aucune écriture) ; `--apply` requiert une confirmation tapée "oui", avant toute suppression. Log dans `python_script/logs/` comme les autres scripts du pipeline.
- Portée volontairement limitée : pas les joueurs/contrats (déjà gérés par le pipeline PuckPedia indépendant par base), pas les comptes poolers, pas la config de saison, pas `transactions`/`transaction_items` (non utilisé par le flux Historique).
- Testé en dry-run contre les vraies données (staging et prod) : 2517/2569 joueurs mappés automatiquement, aucun problème sur les 326 lignes du roster actif — script fonctionnel, prêt à être utilisé avec `--apply` quand David voudra pousser son historique validé vers prod. Pas encore exécuté en mode réel.

### 2026-07-18

**[Fix] — Le recul automatique de `added_at` (session 2026-07-17) ne couvrait que l'onglet Historique, pas les mouvements de saison régulière** (`app/lib/rosterTypeChange.ts` nouveau, `app/app/admin/historique/historique-actions.ts`, `app/app/gestion-effectifs/actions.ts`, `app/app/gestion-effectifs/GestionEffectifsManager.tsx`, `app/app/admin/transactions/actions.ts`, `app/app/admin/transactions/TransactionBuilder.tsx`) :
- Contexte : David a demandé confirmation que la mécanique de comptage de points serait correcte en saison régulière, pas seulement pour la saisie d'historique. En vérifiant plutôt que de simplement confirmer, j'ai trouvé que le fix du 2026-07-17 (recul de `added_at` si la date effective le précède) n'avait été appliqué qu'à `submitHistChangeAction` (onglet Historique) — pas aux deux autres interfaces qui font exactement le même type de mutation (`UPDATE player_type` sur une ligne existante, sans jamais toucher `added_at`) avec une date effective potentiellement passée :
  - `/gestion-effectifs` (`GestionEffectifsManager`, utilisé en direct pendant la saison par les poolers et par l'admin) : `activate()`/`deactivate()`, avec la checkbox admin "Forcer une date effective" (`forcedDate`).
  - `/admin/transactions` (`TransactionBuilder`) : action `type_change`/`promote`/`reactivate`, avec `transactionDate`.
- **Extraction** : nouvelle fonction pure partagée `computeTypeChangeAddedAt()` (`app/lib/rosterTypeChange.ts`) — même logique que le fix Historique, réutilisée dans les 3 endroits plutôt que dupliquée. `historique-actions.ts` refactorisé pour l'utiliser aussi (comportement inchangé).
- Les 3 actions serveur retournent maintenant `{ error?, warning? }` (au lieu de `{ error? }` seulement) ; les 3 composants clients (`HistoriqueManager`, `GestionEffectifsManager`, `TransactionBuilder`) affichent l'avertissement non bloquant en orange après soumission.
- Sans ce fix, une désactivation/réactivation "en temps réel" du **jour même** ne posait aucun problème (dates toujours croissantes) — le risque était spécifiquement le cas où un admin utilise une date passée (`forcedDate`/`transactionDate`) sur un joueur ajouté en direct plus tôt dans la saison mais dont la date d'ajout réelle n'a jamais été corrigée.
- Validé par `next build` complet + `tsc --noEmit` propre.

### 2026-07-17 (suite 3)

**[Fix] — buildStandings() : statut avant le premier événement journalisé + périodes découpées par fenêtre active** (`app/lib/standings.ts`) :
- Contexte : David a confirmé le modèle attendu du calcul de points (recrue/réserviste = 0 point, actif = comptabilisé, un joueur peut avoir plusieurs fenêtres actives dans la saison qui s'additionnent) avec l'exemple concret de Jackson Blake (recrue jusqu'au 14 octobre 2025, puis actif). En vérifiant `statusAt()` par rapport à ce modèle, j'ai trouvé un vrai bug plutôt que de simplement confirmer.
- **Bug 1 (calcul)** : `statusAt()` retombait sur le `player_type` *courant* de la ligne quand aucun événement `roster_change_log` ne précédait le moment du match. Pour Blake, son événement "ajout recrue" original a une date effective réelle (juin 2026, ajout en direct hors Historique) *postérieure* à son "Changement de type" du 14 octobre (date historique). Triés par date effective, le premier événement chronologique est donc le Changement de type — donc pour ses matchs du 9 et 11 octobre (avant tout événement connu), le fallback utilisait son type courant ('actif') au lieu de son vrai type à ce moment ('recrue'), lui attribuant 2 points (assists) qu'il ne devrait pas avoir.
  - Fix : le fallback utilise maintenant `old_type` du premier événement chronologique (`'recrue'` ici, capturé par le Changement de type) plutôt que le type courant de la ligne.
  - Vérifié directement contre les données réelles de staging (script Python reproduisant la logique) : total de Blake passe de 53 à **51 points**, les 2 matchs pré-activation étant désormais exclus.
- **Amélioration 2 (affichage)** : les "périodes" (bouton ↩ + popup détail dans `/classement` et `/poolers/[id]`) ne se découpaient auparavant que sur les vraies lignes `pooler_rosters` (ajout/retrait/échange), pas sur les changements de type. Un joueur réactivé plusieurs fois sans jamais quitter le pool (ex: réserve→actif→réserve→actif, tout sur la même ligne) affichait donc une seule période couvrant tout, avec un total déjà correct mais sans le détail par fenêtre. Nouvelle fonction `activeSegments()` : découpe chaque ligne en fenêtres actives contiguës (bornées par les événements `roster_change_log`), une entrée `PeriodContrib` par fenêtre plutôt qu'une par ligne. Décidé avec David : oui, découper aussi sur les changements de type.
- Pas de migration de schéma ni de changement de données — recalcul dynamique, s'applique automatiquement à toute la saison dès le déploiement.
- Validé par `next build` complet + `tsc --noEmit` propre + vérification manuelle contre les données réelles de staging.

### 2026-07-17 (suite 2)

**[Fix] — Changement de type sans effet réel sur les points car `added_at` restait figé après un ajout en direct** (`app/app/admin/historique/historique-actions.ts`, `app/app/admin/historique/HistoriqueManager.tsx`, données staging) :
- Contexte : David a constaté que Jackson Blake (marqué "Changement de type" → actif le 14 octobre 2025 via Historique) affichait 0 point partout dans son alignement, malgré des dizaines de matchs joués par CAR depuis le 7 octobre.
- Cause : sa ligne `pooler_rosters` avait `added_at = 2026-06-07T15:07:28` (ajout en direct via `addPlayerAction`, sans date historique — pas via le mode init qui date correctement au `saison_start_date`). Le "Changement de type" du 14 octobre a bien modifié `player_type`, mais cette action ne touche jamais `added_at`/`removed_at` par conception — la fenêtre de calcul des points (`added_at → removed_at`) commençait donc en juin, après toute la saison, peu importe les événements dans `roster_change_log`.
- Discussion avec David sur la règle attendue : la date effective saisie dans Historique doit toujours faire foi comme date de début pour le joueur concerné ; en temps normal (hors Historique), c'est l'horodatage réel de l'action qui compte — comportement déjà correct pour les ajouts/échanges/retraits (ils fixent `added_at`/`removed_at` explicitement). Le trou ne concernait que `type_change`, seule action qui modifie une ligne existante sans jamais reposer `added_at`.
- **Fix** : `applyTypeChange` compare maintenant la date effective saisie à `added_at` de la ligne visée — si la date saisie est antérieure, `added_at` est reculé à cette date (décision validée avec David : correction automatique plutôt qu'un simple avertissement, cohérent avec "la date effective saisie fait foi"). Un avertissement non bloquant (orange) informe l'admin quand ça se produit, avec l'ancienne et la nouvelle date. `submitHistChangeAction` retourne maintenant `{ warning? }` en plus de `{ error? }`.
- Correction ponctuelle en staging : `added_at` de Jackson Blake (pooler_rosters id=37) remis au 2025-10-07 (début de saison réel), plutôt qu'à la date du 14 octobre — cohérent avec la règle générale "un joueur présent depuis le début de saison a `added_at = saison_start_date`, les changements de type ultérieurs se chargent de la bonne classification à l'intérieur de cette fenêtre".
- Validé par `next build` complet + `tsc --noEmit` propre.

### 2026-07-17 (suite)

**[Fix] — Choix de repêchage : le tableau ne se rafraîchissait pas au changement de saison** (`app/app/admin/presaison/PicksManager.tsx`) :
- David a signalé, en testant `/admin/init?tab=choix` juste après le nettoyage de routes de cette session, que changer la saison dans le sélecteur ne mettait rien à jour dans le résumé.
- Cause : `PicksEditor.tsx` initialise son état local `localPicks` avec `useState<Pick[]>(picks)` — ça ne fixe la valeur qu'au montage initial, donc un nouveau prop `picks` (saison différente) ne resynchronise jamais l'état une fois le composant monté.
- Fix : `key={selectedId}` sur `<PicksEditor>` dans `PicksManager.tsx` pour forcer un remount complet à chaque changement de saison.

### 2026-07-17

**[Fix+Chore] — Nettoyage des routes admin mortes + carte des routes documentée dans CLAUDE.md** (`app/app/admin/init/page.tsx`, `app/app/admin/series/page.tsx`, `app/app/signaler/actions.ts`, `app/app/admin/config/actions.ts`, suppression de 9 fichiers `page.tsx` orphelins + 2 dossiers, `CLAUDE.md`) :
- Contexte : en essayant de corriger le pick échangé dans la transaction Yakemchuk/Rinzel (voir 2026-07-16), j'ai orienté David vers `/admin/config` — une route qui n'existe plus dans la navigation réelle depuis la réorganisation de l'admin en 4 pages hub à onglets (`/admin/pool`, `/admin/init`, `/admin/effectifs`, `/admin/series`). CLAUDE.md listait encore l'ancienne structure à plat (`/admin/config`, `/admin/joueurs`, etc.), jamais mise à jour lors de cette réorg. David a demandé un document de mapping tenu à jour pour éviter que ça se reproduise.
- **Investigation complète** (agent Explore, lecture directe du code) : la vraie fonctionnalité de réassignation de pick (`PicksEditor.tsx`) vit maintenant sous l'onglet "Choix de repêchage" de `/admin/init` (`?tab=choix`, via `PicksManager`), pas `/admin/config`.
- **Bug trouvé** : `/admin/init` contient un 5e bloc de code ("Repêchage des recrues" — `DraftBoard`/`DraftOrderEditor`) absent de son tableau `TABS` — donc inatteignable par navigation (`activeTab` retombe toujours sur `rosters`). Code mort depuis la réorg ; le vrai tableau de repêchage annuel reste accessible via la route séparée `/admin/repechage`, toujours liée dans la Navbar. Bloc supprimé de `admin/init/page.tsx` (fetch + JSX + imports `DraftBoard`/`DraftOrderEditor`/`SaisonSelectNav` + param `saisonId`) — ces composants restent utilisés par `/admin/repechage/page.tsx`, donc non supprimés eux-mêmes.
- **2 liens cassés corrigés** : `admin/series/page.tsx` pointait vers `/admin/config` (orphelin) → `/admin/pool?tab=config` ; la notification push envoyée sur un nouveau feedback (`app/signaler/actions.ts`) pointait vers `/admin/feedback` (orphelin) → `/admin/pool?tab=communication`. `config/actions.ts` : `REVALIDATE_PATHS` mis à jour (`/admin/config` → `/admin/pool`).
- **Pages orphelines supprimées** (confirmé via `grep` qu'aucun `href`/lien n'y menait encore, seulement d'anciens `revalidatePath` inoffensifs) : `admin/poolers/page.tsx`, `admin/rosters/page.tsx`, `admin/recrues/page.tsx`, `admin/transactions/page.tsx`, `admin/presaison/page.tsx`, `admin/historique/page.tsx`, `admin/suivi/page.tsx`, `admin/config/page.tsx`, `admin/feedback/page.tsx` — chaque fois seulement le `page.tsx` (les composants/actions du même dossier restent utilisés par les onglets des hubs). Dossiers `admin/mouvements/` et `admin/notifications/` supprimés en entier (aucun composant réutilisé ailleurs — `MouvementsManager.tsx` confirmé non importé nulle part, superseded par `GestionEffectifsManager`). `admin/joueurs/page.tsx` et `admin/draft-center/page.tsx` conservés : ce sont des redirections volontaires vers les onglets équivalents, pas du code mort.
- Vérifié avec David que rien de lié aux séries n'était "mort" seulement parce qu'aucune saison séries n'est active actuellement — confirmé : `/admin/series` est une vraie page hub live, le message "aucune saison active" est un état normal, pas du code mort.
- **CLAUDE.md section 5** réécrite avec la vraie structure (table hub → onglets, vérifiée par `next build` + grep des liens réels) ; section 8 (pages responsive) corrigée (`/series`/`/series/picks` n'existent plus, remplacées par `/gestion-series`/`/classement-series`).
- Validé par `next build` complet (aucune erreur, liste des routes générées confirmée) + `tsc --noEmit` propre après chaque étape.
- Reste à faire par David : utiliser `/admin/init?tab=choix` (pas `/admin/config`) pour remettre le pick de la transaction Yakemchuk/Rinzel chez son propriétaire d'origine.

### 2026-07-16

**[Feat] — Historique : picks dans le journal, transfert du statut recrue, correction de date effective** (`app/app/admin/historique/historique-actions.ts`, `app/app/admin/historique/HistoriqueManager.tsx`, `supabase_migrations/roster_change_log_pick_transfer.sql`) :
- Contexte : après avoir soumis un échange entre poolers incluant un choix de repêchage, David a signalé 3 manques : (1) le pick échangé n'apparaissait pas dans le journal, (2) le statut de recrue (protégé 5 ans si repêché, ou protégé le temps de l'ELC si agent libre) ne survivait pas au changement de pooler, (3) impossible de corriger la date effective d'une transaction déjà saisie (cas concret : échange Carter Yakemchuk / Sam Rinzel saisi avec la date du jour au lieu du 9 octobre 2025).
- **Migration** (`roster_change_log_pick_transfer.sql`, déjà appliquée en staging et prod par David) : `player_id` devient nullable sur `roster_change_log`, nouvelle colonne `pick_id` (FK `pool_draft_picks`). Une ligne de journal représente désormais soit un joueur, soit un pick.
- **Picks dans le journal** : `submitHistChangeAction` (chemin `trade`) journalise maintenant chaque pick transféré (départ + arrivée, même pattern que les joueurs). `getHistLogAction` embarque `pool_draft_picks(round, pool_seasons(season))` ; le journal affiche "Choix — {saison} Ronde {round}" à la place du nom de joueur pour ces lignes.
- **Transfert automatique du statut recrue** : `getHistRosterAction` renvoie maintenant `rookieType`/`poolDraftYear`/`draftPickId` par joueur du roster. Dans `TradeSidePicker`, choisir le type "Recrue" pour un joueur qui était déjà recrue chez le pooler d'origine pré-remplit automatiquement `rookie_type`/`pool_draft_year` (protection transférée), avec un contrôle pour corriger manuellement si besoin. `draft_pick_id` suit uniquement si les valeurs pré-remplies n'ont pas été modifiées (transfert non ambigu) — sinon abandonné, le lien vers le pick d'origine n'étant plus fiable après une correction manuelle. Décidé avec David : transfert automatique par défaut, override possible (pas de ressaisie obligatoire à chaque échange).
- **Correction de date effective** (nouvelle action `updateHistLogDateAction`) : sélection multiple de lignes du journal (checkbox) + un seul champ date pour corriger en masse — utile car un échange produit plusieurs lignes (N joueurs × 2 sens + picks). Corrige `roster_change_log.changed_at` **et** `pooler_rosters.added_at`/`removed_at` correspondant (jamais l'un sans l'autre, cf. règle CLAUDE.md section 6) ; ignore la propagation pour les lignes `type_change` (aucune fenêtre associée) et les lignes de pick (pas de `added_at`/`removed_at`). Si la ligne `pooler_rosters` correspondante est introuvable (déjà modifiée depuis), retourne une erreur explicite plutôt que de laisser le journal et le roster désynchronisés.
- Validé par `tsc --noEmit` (aucune erreur) ; lint : mêmes avertissements `any`/`set-state-in-effect` déjà présents avant ces changements, rien de nouveau introduit.
- **Suite** : la transaction Yakemchuk/Rinzel avait été saisie avant ce fix — le pick échangé dedans n'a donc aucune ligne de journal (rien à corriger là, sa propriété actuelle reste correcte). Plutôt que de corriger la date après coup, décidé avec David de supprimer les 4 lignes joueurs et de ressaisir la transaction au complet.
- **Nouvelle action `deleteHistLogAction`** : supprime une ou plusieurs lignes du journal et annule la vraie mutation associée (jamais seulement la ligne du journal) — arrivée joueur → supprime la ligne `pooler_rosters` créée ; départ joueur → restaure `removed_at = null` sur la ligne d'origine ; `type_change` → restaure l'ancien `player_type` (connu via `old_type`, stocké depuis le début) ; arrivée pick → restaure `current_owner_id` vers le propriétaire précédent (retrouvé via la ligne de départ jumelle, même `pick_id` + `changed_at`). Chaque cas vérifie que l'état courant correspond encore à ce que la ligne avait fait avant d'agir — sinon erreur explicite plutôt que d'écraser un changement plus récent. Bouton "Supprimer la sélection" ajouté à côté de la correction de date, avec confirmation navigateur.
- Reste à faire par David : sélectionner et supprimer les 4 lignes Yakemchuk/Rinzel dans le journal, puis ressaisir la transaction avec la date du 2025-10-09 (pick déjà chez le bon propriétaire, pas besoin de le resélectionner).

### 2026-07-15 (suite 2)

**[Doc] — Rôle de `stop_app.ps1` clarifié** (aucun code) :
- David a demandé si `stop_app.ps1` restait utile après la fusion `start_app.ps1`/`start_staging.ps1`.
- Rôle distinct de `start_app.ps1` (qui tourne en foreground, s'arrête normalement au `Ctrl+C`) : `stop_app.ps1` sert à libérer le port 3000 quand le process est resté orphelin (fenêtre de terminal fermée sans `Ctrl+C`) ou depuis un autre terminal que celui d'origine. `start_app.ps1` s'appuie dessus explicitement (message "port déjà utilisé → `.\stop_app.ps1`").
- Bénéfice de la simplification de la session précédente : `stop_app.ps1` fait un `Stop-Process -Force`, qui coupait auparavant le bloc `finally` de bascule d'env (`start_staging.ps1`) — source potentielle de corruption de `.env.local`. Depuis que `start_app.ps1` n'a plus de swap/restore, ce risque n'existe plus : `stop_app.ps1` est maintenant strictement sûr à utiliser à tout moment. Pas de changement de code, garde son rôle actuel.

### 2026-07-15 (suite)

**[Chore] — Fusion start_app.ps1/start_staging.ps1, plus de notion de "prod" en local** (`start_app.ps1`, `start_staging.ps1` supprimé, `CLAUDE.md`, `python_script/setup_staging.py`) :
- Contexte : en préparant la session précédente, constat que `app/.env.local` **et** `app/.env.local.prod` pointaient tous les deux vers staging au lieu de prod (`unnghyqtbkopflqgfori`) — la vraie config prod locale avait été perdue, probablement lors du plantage évoqué en début de session (le bloc `finally` de `start_staging.ps1` qui restaure `.env.local` n'a pas pu s'exécuter). Un incident identique était déjà documenté le 2026-05-xx (voir plus bas, ligne ~131) — donc un 2e occurrence du même problème.
- David a clarifié qu'aucun script "prod" en local n'est nécessaire : l'app de prod tourne en continu sur Vercel (ses variables d'environnement vivent dans le dashboard Vercel, pas dans ces fichiers), donc personne n'a besoin de démarrer/arrêter une "version prod" localement — seul le test contre staging a une utilité.
- `start_app.ps1` (l'ancien, `npm run dev` simple sans bascule d'env) supprimé, `start_staging.ps1` renommé `start_app.ps1` (`git mv`, historique préservé). Le script simplifié n'a plus de logique de sauvegarde/restauration (`.env.local.prod`) — il écrase simplement `.env.local` avec `.env.staging.local` à chaque lancement (`Copy-Item -Force`), sans rien à restaurer à l'arrêt. Ça élimine la fenêtre de plantage qui causait la corruption (plus de swap = plus rien à interrompre au mauvais moment).
- Fichier `app/.env.local.prod` (obsolète, gitignoré) supprimé localement.
- Références mises à jour : `CLAUDE.md` (section 2 + arborescence, précise que `start_app.ps1` cible toujours staging), `python_script/setup_staging.py` (message de fin pointait encore vers `start_staging.ps1`).
- Aucune valeur prod reconstruite dans `app/.env.local` — inutile désormais, rien ne la consomme.

### 2026-07-15

**[Feat] — Échange entre poolers : plusieurs joueurs par côté (N contre M)** (`app/app/admin/historique/historique-actions.ts`, `app/app/admin/historique/HistoriqueManager.tsx`) :
- Contexte : l'onglet Historique ne permettait qu'un joueur par côté dans un "Échange entre poolers" (`playerOutAId`/`playerInA`/`playerInBType`) — insuffisant pour reconstituer un vrai échange à plusieurs joueurs (ex: 2 contre 1 + picks).
- `HistChangeInput` : `playerInBType` retiré, remplacé par `playersAOut`/`playersBOut: HistTradePlayer[]` (`{ playerId, type }`), un par joueur échangé de chaque côté. `submitHistChangeAction` boucle sur chaque tableau (retrait chez l'origine + ajout chez la destination avec le type choisi) — chemin `trade` complètement séparé du chemin "un seul joueur" (swap/ajout/retrait), qui garde `playerOutAId`/`playerInAId` inchangés.
- UI : nouveau composant `TradeSidePicker` (liste à cocher du roster de chaque pooler + choix actif/réserviste/recrue par joueur sélectionné + avertissement délai de réactivation par joueur) — remplace les selects uniques + l'affichage en lecture seule "même que Joueur A/B" côté B.
- Avertissement de délai de réactivation recalculé par joueur (`warningsAOut`/`warningsBOut`, un appel `checkHistReactivationDelayAction` par joueur sélectionné) plutôt qu'un seul avertissement global.
- Reprise après un plantage de l'ordinateur en cours de développement (le backend et le nouveau `TradeSidePicker` étaient déjà écrits mais pas encore branchés au reste du formulaire — état incohérent au redémarrage) — validé par `tsc --noEmit` (aucune erreur) après reconnexion des deux côtés du formulaire au nouveau modèle.
- Non testé manuellement dans le navigateur (page admin derrière authentification, pas d'accès aux identifiants dans cette session) — à valider par David avant de considérer le chantier clos.

### 2026-07-13 (suite)

**[Feat] — Type "Recrue" partout + choix de repêchage dans les échanges entre poolers** (`app/app/admin/historique/historique-actions.ts`, `app/app/admin/historique/HistoriqueManager.tsx`, `docs/saisie-historique-mouvements.md`) :
- David a signalé 2 manques en saisissant un échange entre poolers : (1) impossible de placer le joueur reçu directement en banque de recrues (utile s'il est encore sous ELC ou déjà en banque chez l'autre pooler) ; (2) impossible d'inclure des choix de repêchage échangés dans la même transaction.
- `playerInAType`/`playerInBType` élargis à `'actif' | 'reserviste' | 'recrue'` (nouveau type `HistPlayerType`).
- Nouvelle section "Choix de repêchage échangés" sous Côté B (visible seulement si l'un des deux poolers a des picks non utilisés) : cases à cocher par pick (saison + ronde), transfert de `pool_draft_picks.current_owner_id` à la soumission — même pattern que `admin/transactions/actions.ts` (déjà utilisé pour les vraies transactions). Vérification que le pick appartient encore au bon pooler et n'est pas déjà utilisé avant transfert.
- `canSubmit` assoupli pour permettre un échange **pick(s)-contre-pick(s) sans aucun joueur**.
- Validé (requête picks) directement contre staging avant de pousser.

### 2026-07-13

**[Fix] — Un joueur mis en réserve perdait tous ses points de saison dans le classement** (`app/lib/standings.ts`, `app/app/poolers/[id]/PoolerPageTabs.tsx`, `docs/saisie-historique-mouvements.md`) :
- Contexte : David a remarqué, en consultant son alignement après un "Changement de type" (Spencer Knight mis en réserve), que Knight affichait quand même 53-54 pts dans le tableau — pensant que ça aurait dû refléter seulement les points d'un match précis plutôt qu'un cumul.
- Investigation (agent Explore) : `buildStandings()` filtre le total du pooler par le `player_type` **actuel** de la ligne `pooler_rosters` (`rows[rows.length-1].player_type`), pas par le statut réel pendant chaque match. Comme `deactivate()`/`activate()` (Mouvements) et notre nouveau `type_change` (Historique) ne font qu'un `UPDATE player_type` sur la ligne existante (jamais de nouvelle ligne), mettre un joueur en réserve efface rétroactivement **tous** ses points de la fenêtre `added_at→removed_at`, même ceux gagnés pendant qu'il était vraiment actif. Confirmé sur prod : 175 actifs / 25 réservistes / 9 LTIR dans la saison 2025-26 active — potentiellement 34 joueurs affectés.
- Fix (confirmé avec David avant de toucher au moteur de classement) : chaque période est découpée en segments actif/non-actif via `roster_change_log` (nouvelle fonction `statusAt`, utilise le dernier événement `changed_at <= heure du match`, fallback sur le `player_type` de la ligne si aucun événement ne précède). Le filtre final `.filter(p => p.playerType === 'actif')` est retiré car le gating se fait maintenant match par match. Même correction dans le total du pied de page `PoolerPageTabs.tsx` (libellé "Total (actifs seulement)" renommé simplement "Total", plus exact).
- Validation : simulation Python de l'ancienne vs nouvelle logique contre staging (cas Spencer Knight) avant de pousser — confirmé que la date du 8 octobre 2025 saisie pour Knight (son premier vrai changement de la saison) donne bien 0 pt compté, ce que David a confirmé être correct.
- **Nuance importante découverte et clarifiée avec David** : le fix ne "répare" un joueur que si une vraie transaction datée dans la saison existe pour lui. ~22 joueurs actuellement réservistes n'ont qu'un marqueur générique daté du 2026-06-07 (import en bloc, `old_type=None`, postérieur à la fin de saison du 16 avril) — pour eux, le calcul retombe sur leur statut actuel (comportement inchangé, pas de régression) jusqu'à ce que leur vraie date de désactivation soit saisie via Changement de type. David a confirmé : c'est le concept attendu (actif par défaut du 7 oct au 16 avril, affiné au fur et à mesure de la saisie historique) — pas une procédure standard, mais le principe reste juste.
- Aucune migration de schéma requise — fix de code seulement, s'applique automatiquement à prod (push) et staging (hot-reload local).

### 2026-07-12 (suite 2)

**[Feat] — "Changement de type" : 2e joueur optionnel en une seule transaction** (`app/app/admin/historique/historique-actions.ts`, `app/app/admin/historique/HistoriqueManager.tsx`) :
- David a fait remarquer que le pattern habituel est toujours pairé (un actif descend, un réserviste/recrue monte, au même moment) — la version précédente forçait 2 saisies séparées, contre-intuitif.
- `submitHistChangeAction` : nouveau helper `applyTypeChange()` interne, appelé pour le joueur 1 puis, si fourni, pour un 2e joueur (`typeChangeSecondPlayerId`/`typeChangeSecondTo`) dans la même soumission. Reste optionnel pour les cas asymétriques (ex: promotion de recrue sans contrepartie).
- UI : bloc "Joueur 2 (optionnel)" sous le premier, sélection depuis le roster actuel (exclut le joueur 1 déjà choisi).

### 2026-07-12 (suite)

**[Fix+Feat] — "Échange même pooler" faisait un retrait complet au lieu d'un ajustement actif/réserve ; ajout de "Changement de type"** (`app/app/admin/historique/historique-actions.ts`, `app/app/admin/historique/HistoriqueManager.tsx`) :
- Contexte : David a remarqué en consultant son alignement réel que Dustin Wolf affichait 3 périodes (159 pts au lieu de 53) et que Spencer Knight, censé être réserviste, apparaissait actif.
- Investigation complète de l'historique `pooler_rosters`/`roster_change_log` pour ces 2 joueurs chez David : le vrai ajustement actif/réserve que David avait fait le 9 juillet (via l'onglet Mouvements — Wolf→réserve, Knight→actif) était légitime. Mais notre test "Échange même pooler" de la veille (censé représenter "Wolf remplace Knight le 8 octobre") avait fait un **retrait complet** de Knight (pas un passage en réserve), écrasant sa vraie fiche continue depuis le 7 octobre. En plus, Wolf était déjà chez David depuis le 7 octobre (pas le 8) — le test n'était donc pas un vrai fait historique, juste une validation de l'outil.
- **Cause racine** : l'onglet Historique n'avait que 4 types (swap/trade/ajout/retrait), tous des départs/arrivées complets du pool — aucun moyen d'entrer un simple changement de statut (actif↔réserviste↔recrue) sans retirer le joueur, ce qui casse sa fenêtre `added_at`/`removed_at` continue utilisée par `buildStandings()`.
- Nettoyage en staging : suppression des lignes `pooler_rosters` fantômes créées par nos 2 tests (id 339, 340) et des entrées `roster_change_log` correspondantes (369, 374), restauration de Wolf (id=33, réserviste, continu depuis le 7 oct) et Knight (id=34, actif, continu depuis le 7 oct) à leur état réel (`removed_at=null`).
- **Nouvelle action "Changement de type"** dans Historique : un joueur + son nouveau type (actif/réserviste/recrue), simple `UPDATE player_type` sur la ligne existante — pas de retrait/ajout. David a confirmé avoir besoin de ce type de mouvement pour beaucoup de son historique (montées de recrues, ajustements actif/réserve). Choix : une action générique plutôt que de dupliquer les paires "swap"/"activate_rookie" de Mouvements — plus flexible pour de la reconstruction historique libre (2 saisies indépendantes couvrent n'importe quelle combinaison).
- Requêtes validées directement contre staging (Python) avant de pousser le code.
- Toujours en attente : nettoyage optionnel des entrées `roster_change_log` de troubleshooting (id 366-368, 371-372, type 'retrait'/'deactivation'/'activation' avec `changed_at` = aujourd'hui) — n'affectent pas l'état actuel du roster, juste du bruit dans l'audit trail. Pas fait, David n'a pas demandé.

### 2026-07-12

**[Fix] — Doublon Dustin Wolf en staging (données de test) nettoyé** (base staging, aucun code) :
- Contexte : le bug de l'embed ambigu (entrée précédente) avait fait "disparaître" une première soumission "Échange même pooler" du journal, poussant David à la ressaisir — créant un vrai doublon `pooler_rosters` (Dustin Wolf actif ET réserviste chez David, même date).
- David a confirmé que "Actif" était la version correcte. Supprimé directement en base (staging) : `pooler_rosters` id=338 (réserviste, en trop) et les 2 entrées `roster_change_log` redondantes (370, 373 — dont une sans effet réel puisque la 1re soumission avait déjà retiré Spencer Knight).
- Validé après coup : un seul Wolf actif restant, journal propre à 2 lignes.

**[Feat] — Avertissement non bloquant sur le délai de réactivation (onglet Historique)** (`app/app/admin/historique/historique-actions.ts`, `app/app/admin/historique/HistoriqueManager.tsx`, `docs/saisie-historique-mouvements.md`) :
- Contexte : David a demandé si le délai de réactivation (3 jours entre désactivation et réactivation d'un joueur chez le même pooler, `pool_seasons.delai_reactivation_jours`) était pris en compte lors de la saisie. Vérification : **non, nulle part** — même l'onglet Mouvements a `checkReactivationDelay()` mais avec `if (isAdmin) return` en premier, donc jamais appliqué puisque David soumet toujours en admin.
- Décision avec David (2 questions) : avertissement dans l'onglet **Historique seulement**, **informatif** (n'empêche pas de soumettre) — pas de blocage, car des cas légitimes existent (LTIR, etc.) et Historique doit rester libre pour reconstituer des scénarios réels.
- `checkHistReactivationDelayAction` (nouveau) : cherche la désactivation la plus récente du même joueur chez le même pooler avant la date choisie, compare à `delai_reactivation_jours` (actuellement 3 en staging). Appelé en direct dans le formulaire (useEffect sur sélection joueur/pooler/date, côtés A et B) → message orange non bloquant si sous le délai.
- `getHistLogAction` étendu : calcule le même avertissement pour chaque ligne déjà journalisée (comparaison en mémoire contre toutes les désactivations de la saison, une seule requête plutôt qu'une par ligne) → badge ⚠ avec tooltip dans le journal.
- Validé par requêtes directes contre staging (mêmes requêtes que le code TS, rejouées en Python) avant de pousser — confirmé `delai_reactivation_jours = 3` en staging, aucune erreur de requête.

### 2026-07-11 (suite)

**[Fix] — Journal Historique toujours vide malgré des lignes bien écrites** (`app/app/admin/historique/historique-actions.ts`) :
- Contexte : après le fix env staging/prod (voir plus haut), David a refait sa transaction en staging — toujours absente du journal. Vérification directe en base : les lignes `hist_swap` étaient bien présentes dans `roster_change_log`, donc l'écriture fonctionnait — le problème était côté lecture.
- Cause trouvée en reproduisant la requête de `getHistLogAction` directement (Python/postgrest) : `roster_change_log` a deux FK vers `poolers` (`pooler_id` et `changed_by`), donc l'embed `poolers(name)` est ambigu pour PostgREST (erreur `PGRST201`). Le code faisait `const { data } = await db.from(...).select(...)` sans jamais vérifier `error` — la requête échouait silencieusement et `(data ?? [])` retombait sur un tableau vide, exactement le symptôme observé.
- Fix : `poolers!roster_change_log_pooler_id_fkey(name)` pour lever l'ambiguïté. Ajout de la vérification d'erreur dans `getHistLogAction` et dans le helper `log()` de `submitHistChangeAction` (qui avait le même angle mort) pour que ce genre d'échec ne redevienne pas silencieux.
- Validé en rejouant la requête corrigée directement contre staging : les 4 lignes `hist_swap` de David reviennent correctement, pooler "David" bien résolu.
- Bug de code introduit dans le commit `3209e5d` de la veille (le typecheck/eslint ne peuvent pas détecter une ambiguïté de relation PostgREST au runtime) — leçon : vérifier systématiquement `error` sur les requêtes Supabase avec embed multi-FK, et idéalement tester une lecture réelle après un changement de ce type plutôt que de se fier au seul typecheck.

### 2026-07-11

**[Fix] — `app/.env.local` pointait sur staging au lieu de prod + `stop_app.ps1` cassé** (`app/.env.local`, `app/.env.local.prod`, `stop_app.ps1`) :
- Contexte : David a saisi une transaction dans l'onglet Historique et ne la retrouvait pas dans le journal. Investigation : `roster_change_log` prod ne contenait aucune ligne `hist_%`, mais staging en avait 2 fraîches — le serveur dev local était configuré sur staging (`pwblgjdmuaoyfixeyltg`), probablement depuis un `start_staging.ps1` interrompu sans Ctrl+C (le `.env.local.prod` de secours datait du 8 mai et contenait déjà des valeurs staging, donc lui-même inutilisable comme sauvegarde).
- Corrigé `app/.env.local` et `app/.env.local.prod` avec les vraies valeurs prod (`unnghyqtbkopflqgfori`) : URL et `SUPABASE_SERVICE_ROLE_KEY` repris de `python_script/.env`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` fourni par David depuis le dashboard Supabase (onglet Legacy anon/service_role — vérifié par le payload JWT décodé : bon `ref`, mêmes `iat`/`exp` que la clé service_role).
- David a demandé de valider en staging avant de continuer en prod → basculé via `start_staging.ps1` (qui sauvegarde maintenant correctement la config prod réparée).
- Bug trouvé en cours de route : `stop_app.ps1` utilisait `$pid` comme nom de variable — `$pid` est une variable automatique PowerShell en lecture seule (PID du process courant), donc l'affectation échouait silencieusement à **chaque** appel du script, l'empêchant d'arrêter quoi que ce soit. Renommé en `$targetPid`. Testé après fix : fonctionne, et confirme au passage que le `finally` de `start_staging.ps1` restaure bien `.env.local` vers prod même quand le serveur est tué depuis un autre terminal (pas seulement via Ctrl+C dans la fenêtre d'origine).
- État à la fin de la session : aucun serveur local actif, `.env.local` repointé sur prod (restauré automatiquement par le `finally`). La transaction test de David reste dans staging (inoffensif) — à ressaisir en prod une fois la validation staging terminée.
- `.env.local`/`.env.local.prod` sont gitignorés, aucune clé commitée.

### 2026-07-09/10

**[Feat/Fix] — Onglet Historique : journal à deux dates, filtre par type, fix confirmation** (`app/app/admin/historique/HistoriqueManager.tsx`, `app/app/admin/historique/historique-actions.ts`, `supabase_migrations/roster_change_log_created_at.sql`, `docs/saisie-historique-mouvements.md`) :
- Contexte : en pleine saisie de l'historique (voir entrée précédente), David a signalé 3 problèmes sur l'onglet Historique : (1) le journal ne montrait pas ses saisies récentes — enterrées sous des entrées plus "récentes" en date effective (ex. lot du 2026-06-10) car le tri se faisait sur `added_at`/`removed_at`, pas sur le moment réel de la saisie ; (2) pas de filtre par type de transaction ; (3) le message de succès à la soumission ne s'affichait jamais.
- Cause du (3), trouvée en lisant le code : `handleSubmit()` faisait `setSuccess(true)` puis appelait `reset()` qui faisait `setSuccess(false)` — React batch les deux dans le même rendu, donc `success` finissait toujours à `false`. Vrai bug, pas juste un manque de feedback.
- Fix (1)+(2) : ni `pooler_rosters` ni `roster_change_log` n'avaient de colonne distinguant "date effective" de "date de saisie". Migration `roster_change_log_created_at.sql` (`created_at TIMESTAMPTZ DEFAULT NOW()`), exécutée par David en staging et prod. `submitHistChangeAction` écrit maintenant dans `roster_change_log` (nouveaux `change_type` préfixés `hist_` — `hist_swap`/`hist_trade`/`hist_ajout`/`hist_retrait` — jamais comptés dans les budgets agents libres/LTIR existants, qui filtrent sur `signature_agent_libre`/`signature_ltir`). `getHistLogAction` réécrit pour lire `roster_change_log` au lieu de dériver de `pooler_rosters`, avec tri par `created_at desc` (date de saisie) et filtre client par `change_type`.
- Fix (3) : séparation de `reset()` (déclenché par changement de type/pooler, vide tout y compris `success`) et `resetSelections()` (déclenché après soumission réussie, vide seulement les champs joueur — garde pooler + date pour enchaîner, décision confirmée avec David).
- Conséquence attendue et acceptée : les entrées du journal saisies avant ce fix (lot du 2026-06-10, entrées du 2026-07-09) ne réapparaissent pas dans la nouvelle vue — elles restent correctes dans `pooler_rosters`, seul l'affichage du journal repart à neuf.
- Doc `docs/saisie-historique-mouvements.md` mise à jour en conséquence.
- `npx tsc --noEmit` et `npx eslint` validés sur les fichiers touchés — aucune nouvelle erreur (les erreurs `any`/`set-state-in-effect` restantes sont préexistantes, hors scope).

### 2026-07-09

**[Fix] — Poolers admin exclus du sélecteur de l'onglet Historique** (`app/app/admin/effectifs/page.tsx`, `app/app/admin/historique/page.tsx`) :
- Contexte : en suivant la procédure de saisie de l'historique (voir entrée précédente), David a remarqué qu'il n'apparaissait pas dans la liste déroulante des poolers de l'onglet Historique.
- Cause : `db.from('poolers').select('id, name').eq('is_admin', false)` — filtre qui exclut les poolers marqués admin. Or David est à la fois admin **et** un des 8 poolers actifs (roster/équipe propre), donc incorrectement exclu.
- Fix : retrait du filtre `is_admin` dans les deux pages qui alimentent `HistoriqueManager` (page vivante `/admin/effectifs?tab=historique` et l'ancienne route orpheline `/admin/historique`, corrigée par cohérence même si non liée dans le Navbar).

**[Docs] — Procédure de saisie de l'historique des mouvements** (`docs/saisie-historique-mouvements.md`) :
- Contexte : David commence la saisie de l'historique des mouvements de roster à partir de `excel/Mouvements_consolides.xlsx`. Question posée : quelle procédure suivre.
- Investigation : `/admin/mouvements` (référencé dans une note du 2026-06-27) n'est plus le chemin de navigation actuel — le Navbar pointe vers `/admin/effectifs`, une page à onglets (`Mouvements`, `Transactions`, `Historique`, `Données`). L'onglet **Mouvements** (`GestionEffectifsManager`) est pour la gestion courante — il bloque toute soumission qui ne respecte pas la composition 12A/6D/2G + 2 réservistes + cap, donc mal adapté à une reconstruction historique. L'onglet **Historique** (`HistoriqueManager`/`historique-actions.ts`, commit `01cafb1`) a été construit spécifiquement pour ce cas : aucune validation de roster, écrit directement `added_at`/`removed_at` sur `pooler_rosters` sans passer par `roster_change_log`.
- Doc créée pour tracer la procédure (David a précisé qu'il ne referait probablement pas cette opération, mais voulait une trace) : préparation via `extract_mouvements.py`/`sort_mouvements.py`, choix de l'onglet Historique, saisie chronologique stricte (les dropdowns ne montrent que le roster réellement actif en base), les 4 types de transaction (échange même pooler, échange entre poolers, ajout seul, retrait seul), et les pièges (aucun garde-fou de cap/doublon, pas de compteur agents libres/LTIR alimenté).
- Pas de changement de code.

### 2026-07-08

**[Data] — Run pipeline complet (nouvelles signatures d'agents libres)** (`python_script/PuckPedia_offline.csv`, `python_script/PuckPedia_update.csv`, `python_script/teams_offline/*.csv`) :
- Contexte : David a signalé de nouvelles signatures non captées dans les CSV en attente (datant du 2026-07-06, jamais committés).
- Run staging complet (`run_pipeline_staging.ps1`, scraping + import) : 32/32 équipes fraîches, 1710 joueurs mis à jour, 4311 contrats upserted, 22 corrections de salaire retenu, 15 groupes de joueurs échangés (Carlo, Kadri, Coleman, S. Jones, Duchene, Myers, Hathaway, Gallagher, Korpisalo, Veleno, White, Karlsson, Wotherspoon, Hertl, Ekman-Larsson) tous résolus vers la bonne équipe actuelle. Aucune erreur.
- Validation staging : faute d'outil d'automatisation navigateur dans cet environnement (et `WebFetch` ne peut pas atteindre `localhost`), validation faite par requête directe en lecture sur la BD staging (`players` + `teams`) pour les 15 joueurs échangés — tous corrects, aucun homonyme mal assigné.
- CSV committés (`chore(data): mise à jour des données PuckPedia (pipeline 2026-07-08)`).
- Run prod (`--no-scrape`, réutilise les CSV déjà validés plutôt que de rescrapper) : mêmes résultats que staging, aucune erreur, 72.2s.
- **Note technique** : `run_pipeline_prod.ps1` utilise `Read-Host` pour la confirmation manuelle — incompatible avec un terminal non-interactif (échoue immédiatement, aucune donnée touchée). Contournement : variables d'env chargées manuellement depuis `python_script/.env` + appel direct du script Python, après confirmation explicite de David dans la conversation. Pas de changement au script lui-même.

**[Chore] — Désactivation du workflow GitHub Actions "Mise à jour stats pool des séries"** (`.github/workflows/playoff_stats.yml`) :
- Contexte : le pool des séries 2026 est terminé, le cron quotidien (`import_playoff_stats.py`) générait des courriels d'erreur sans plus d'utilité.
- Action : `gh workflow disable` sur le workflow (id 274163650) — désactivé côté GitHub, le fichier reste dans le repo pour réactivation lors des prochaines séries. Pas de suppression de fichier ni de modification de code.

### 2026-07-06

**[Feat] — Réorganisation du menu Admin : Données joueurs et Classement des prospects déplacés dans Gestion du pool** (`app/components/Navbar.tsx`, `app/app/admin/pool/page.tsx`, `app/app/admin/joueurs/*`, `app/app/admin/draft-center/*`) :
- Contexte : David voulait alléger le menu déroulant Admin en déplaçant "Données joueurs" et "Classement des prospects" comme onglets de "Gestion du pool" (qui a déjà un système d'onglets — Poolers/Configuration/Communication/Suivi), et ajouter en bas du menu Admin un accès direct aux onglets "Messages" (Communication) et "Suivi", pour éviter de devoir naviguer par la page puis choisir l'onglet.
- `admin/pool/page.tsx` : ajout de 2 onglets (`joueurs`, `prospects`) réutilisant le contenu et les composants existants (`PlayerMerge`, `AddProspectForm`, `DraftProspectActions`, `AdminDraftYearSelect`) — aucune logique dupliquée, juste déplacée dans le bloc conditionnel par onglet.
- `admin/joueurs/page.tsx` et `admin/draft-center/page.tsx` (anciennes pages) transformées en redirections vers `/admin/pool?tab=joueurs` / `/admin/pool?tab=prospects` (le second préserve `?year=`) — les liens/favoris existants continuent de fonctionner. Les routes `[id]`/`nouveau` (déjà désactivées) et la fiche d'édition d'un prospect restent des routes séparées, juste leur lien de retour a été mis à jour.
- `AdminDraftYearSelect.tsx` : le sélecteur d'année pousse maintenant vers `/admin/pool?tab=prospects&year=X`.
- Navbar : dropdown Admin (desktop + mobile) réorganisé — "Pool des séries" remonté avant un premier séparateur, puis un second séparateur avec "Messages" (badge des nouveaux messages déplacé ici depuis "Gestion du pool") et "Suivi" en accès direct.
- Vérifié par David en direct dans le navigateur (je n'ai pas pu tester moi-même — pas d'outil d'automatisation navigateur disponible dans cet environnement, et la session admin authentifiée est nécessaire).

**[Fix] — `backfill_nhl_ids.py` assignait parfois le nhl_id du mauvais homonyme** (`python_script/backfill_nhl_ids.py`) :
- Contexte : le run staging du 2026-07-05 (validé — voir plus bas) a montré une erreur `duplicate key value violates unique constraint "players_nhl_id_key"` pour Sebastian Aho (id=2735) — la contrainte unique a bloqué l'écriture, donc aucune corruption, mais révélait un bug latent.
- Cause : `id_map` (nom normalisé → nhl_id) écrasait silencieusement une entrée en cas de collision de nom (les deux Sebastian Aho présents dans l'API stats NHL saison 2025-26), assignant potentiellement le nhl_id du mauvais joueur à `id_map.get(key)` sans jamais passer par le filtre équipe+position déjà présent dans ce script pour le fallback des surnoms (Mitch/Mitchell, etc.).
- David a demandé si le fix par âge (ajouté à `import_supabase.py` la semaine dernière) réglait aussi ce cas — non, `backfill_nhl_ids.py` est un script séparé avec sa propre logique, aucune des deux corrections précédentes ne le couvrait.
- Fix : détection des noms ambigus (2+ nhl_id différents pour le même nom normalisé), retirés de `id_map` pour forcer le passage par le filtre équipe+position existant (suffisant ici : Aho CAR = attaquant, l'autre = défenseur). `lastname_index` reconstruit depuis `detail_map` (garde tous les candidats) plutôt que `id_map` (qui les a retirés).
- Pas de nouvelle logique d'âge nécessaire — réutilisation du mécanisme existant.

### 2026-07-05

**[Validation] — Run staging complet après les correctifs de la semaine** (`python_script/logs/run_pipeline_staging_2026-07-05_14-25-33.log`) :
- 0 fenêtre Chrome recréée (le fix `page_load_strategy='eager'` a réglé les blocages de chargement).
- 32/32 équipes traitées fraîchement, aucun fallback sur données périmées.
- Mason McTavish apparaît maintenant sous STL — confirme le fix du scraper figé depuis mars.
- 11 corrections de salaire retenu appliquées avec succès (Gallagher, Karlsson, Hertl, Kadri, Jones, Myers, Hathaway, Korpisalo, Carlo, Coleman, Wotherspoon) — valeurs réduit→plein cohérentes.
- Les deux Sebastian Aho correctement gardés distincts (`Homonyme NHL confirmé par l'âge, âges 28.0/30.0`) — le fix par âge fonctionne pour `import_supabase.py`.
- Import : 69 insérés, 1641 mis à jour, 4277 contrats, 12 désactivés.
- Un seul problème trouvé (voir section suivante) : `backfill_nhl_ids.py` a tenté d'assigner un nhl_id déjà pris — rejeté proprement par la BD, corrigé le lendemain.
- David a demandé de toujours valider le log le plus récent dès qu'il annonce avoir terminé un run — noté comme pratique systématique pour les prochaines sessions.

**[Fix] — Chargement de page PuckPedia bloqué en boucle (fenêtres Chrome multiples) + log corrompu** (`python_script/scrape_puckpedia.py`, `run_pipeline_staging.ps1`, `run_pipeline_prod.ps1`) :
- Le log confirmait que le timeout matériel fonctionnait (fenêtre tuée/recréée après 40s), mais **presque chaque équipe** restait bloquée au premier essai — donc une nouvelle fenêtre Chrome s'ouvrait à répétition tout au long du run, pas juste occasionnellement.
- Cause probable : les pages PuckPedia contiennent des pubs/vidéos tierces (bannières, lecteur vidéo intégré) qui ne terminent parfois jamais leur chargement réseau — la stratégie de chargement par défaut de Chrome ("normal") attend TOUTES les ressources avant de considérer la page chargée, ce qui bloque `driver.get()` indéfiniment malgré le `page_load_timeout` configuré.
- Fix : `options.page_load_strategy = 'eager'` dans `get_driver()` — Chrome considère la page chargée dès que le DOM est prêt, sans attendre les ressources tierces. Le tableau qu'on scrape est déjà présent à ce stade ; `WebDriverWait` continue d'attendre explicitement l'élément voulu ensuite. Le mécanisme de timeout matériel + tuer/recréer (session précédente) reste en filet de sécurité si ça bloque quand même.
- **Bonus découvert en cours de route** : le fichier log généré par `Tee-Object` était corrompu (caractères espacés, accents/emojis remplacés par du charabia). Cause : PowerShell décode le stdout du process Python avec l'encodage console par défaut (pas UTF-8) malgré `sys.stdout.reconfigure(encoding='utf-8')` côté Python, et `Tee-Object`/`Out-File` écrit en UTF-16 par défaut. Fix : `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` + `$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'` ajoutés dans les deux scripts `run_pipeline_*.ps1`.
- À revalider au prochain `.\run_pipeline_staging.ps1` — s'attendre à voir beaucoup moins (idéalement zéro) de fenêtres Chrome supplémentaires en cours de run.

**[Fix] — Timeout matériel pour débloquer un chargement de page figé** (`python_script/scrape_puckpedia.py`) :
- Contexte : le scraping restait figé après avoir ouvert la fenêtre de la première équipe (page normale affichée, mais le script ne progresse jamais) — le `page_load_timeout` de Selenium ne s'est pas déclenché, probablement à cause d'une ressource tierce (pub, script tiers) qui ne termine jamais son chargement selon Chrome.
- Ajout de `naviguer_avec_timeout()` : lance `driver.get()` dans un thread daemon et n'attend que le temps imparti (`page_load_timeout + 10s`) ; si le thread est toujours vivant après ce délai, tue le processus chromedriver (`tuer_driver()`) pour le débloquer plutôt que d'attendre indéfiniment.
- Piège évité : une première version utilisait `concurrent.futures.ThreadPoolExecutor` — `future.result(timeout=...)` respecte bien le timeout, mais la sortie du `with` (shutdown implicite) attend quand même le thread bloqué, annulant l'effet recherché. `threading.Thread(daemon=True)` + `thread.join(timeout)` n'a pas ce problème (vérifié par test : le script se termine immédiatement même avec un thread bloqué en arrière-plan).
- Utilisé à la fois pour le chargement des pages d'équipe et des fiches joueurs (salaires retenus). La boucle principale (`scraper_depuis_csv_source`) tue et recrée systématiquement la fenêtre en cas d'échec, sans sonder sa santé au préalable (une sonde comme `driver.title` risquerait elle aussi de rester bloquée).
- À revalider au prochain `.\run_pipeline_staging.ps1`.

**[Feat] — Correction automatique du cap hit réduit par rétention de salaire** (`python_script/scrape_puckpedia.py`, `python_script/import_supabase.py`) :
- Contexte : David a remarqué que Brendan Gallagher (échangé MTL → VAN avec rétention) affichait $3,25M sur la page d'équipe PuckPedia (montant réduit après rétention) au lieu de son vrai cap hit de $6,50M. Règle du pool : on veut toujours le salaire plein du contrat, jamais le montant réduit — sinon un joueur échangé avec rétention avantagerait injustement son pooler en cours de contrat.
- PuckPedia marque ces cellules avec une icône loupe (`data-title="Retained Salary"`). Fiche HTML réelle obtenue via l'aide de David (Cloudflare bloque les requêtes headless depuis cet environnement) pour confirmer la structure exacte des tableaux `pp_table-contract` sur la fiche du joueur (ligne "Cap Hit", inclut les saisons futures d'un contrat actif — contrairement au tableau de stats saison-par-saison qui s'arrête à la dernière saison jouée).
- `scrape_puckpedia.py` : détection de l'icône par cellule, nouvelle fonction `recuperer_salaires_reels()` qui va chercher la fiche du joueur et en extrait le cap hit plein par saison, remplace la valeur réduite avant l'écriture du CSV. Nouvelle colonne `Salaire_Reel_Saisons` (saisons corrigées, format pipe comme `ELC_Saisons`) pour tracer quelles saisons ont été corrigées.
- **Interaction avec un mécanisme existant** : `import_supabase.py` avait déjà `should_sum_retained_fragments`/`sum_contract_fragments` qui reconstitue un salaire plein en additionnant 2 lignes (équipe d'origine qui retient + équipe receveuse réduite) quand un joueur apparaît 2x dans le CSV — ex. Cam Fowler (ANA+STL). Risque de double comptage si les deux mécanismes s'appliquaient au même joueur. Corrigé : `Salaire_Reel_Saisons` fait maintenant sauter la sommation pour les saisons déjà corrigées par le scraper (vérifié dans les deux fonctions).
- Pas encore validé sur un vrai run (Cloudflare empêche de tester depuis cet environnement) — à valider au prochain `.\run_pipeline_staging.ps1`.

**[Fix] — Récupération d'un plantage de fenêtre Chrome partagée + diagnostics salaire retenu** (`python_script/scrape_puckpedia.py`) :
- Premier run réel avec la fenêtre partagée (session précédente) : la fenêtre Chrome est morte après ~13 équipes (`WinError 10061`, chromedriver ne répondait plus) et **toutes les équipes suivantes sont retombées silencieusement sur le HTML déjà présent sur disque** (potentiellement périmé) — exactement le bug corrigé plus tôt, réintroduit par un angle différent.
- Toutes les corrections de salaire retenu ont aussi échoué ("Impossible de récupérer la fiche joueur"), y compris pour des équipes traitées *avant* le plantage — cause encore inconnue.
- Fix : `telecharger_html()` retourne maintenant explicitement succès/échec ; en cas d'échec, vérifie si la fenêtre est morte (`driver.title`) et la recrée avant de réessayer une fois, plutôt que de laisser toutes les équipes restantes échouer en boucle. Si on doit quand même retomber sur un fichier existant, c'est maintenant annoncé clairement dans les logs (liste des équipes concernées en résumé final) au lieu d'être silencieux.
- `recuperer_salaires_reels()` : ajout de diagnostics (taille du HTML reçu, attente explicite du tableau de contrat au lieu d'un `sleep` fixe, nombre de `pp_table-contract` trouvés si l'extraction échoue) pour comprendre la cause réelle au prochain run.
- À revalider au prochain `.\run_pipeline_staging.ps1`.

### 2026-07-03

**[Fix] — Bugs critiques découverts en validant un run staging du pipeline PuckPedia** (`python_script/scrape_puckpedia.py`, `python_script/import_supabase.py`) :
- Contexte : David a lancé `.\run_pipeline_staging.ps1` pour tester le pipeline en pleine période d'agents libres. En validant le résultat (page `/joueurs` staging), il a remarqué que Mason McTavish apparaissait toujours à Anaheim alors qu'il a été échangé, et que Granlund/Terry/McTavish (ANA) affichaient des salaires suspicieusement identiques.
- **Bug #1 (majeur)** : `scraper_depuis_csv_source()` ne retéléchargeait le HTML PuckPedia d'une équipe que si `diagnostics/{TEAM}_source.html` n'existait pas déjà. Ces fichiers dataient du 19 mars (28 équipes) et du 3 avril (FLA/NSH/WSH) — **aucune transaction/signature depuis 3.5 mois n'a donc jamais été captée par le scraper**, malgré tous les runs successifs du pipeline depuis cette date (le pipeline réimportait silencieusement la même capture figée à chaque fois). Fix : le scraper retélécharge maintenant systématiquement à chaque run (plus de cache persistant entre les runs).
- **Bug #2** : en creusant les logs du run, fusion incorrecte détectée en base — les deux joueurs réels distincts nommés "Sebastian Aho" (attaquant CAR, nhl_id 8478427 ; ex-défenseur PIT, nhl_id 8480222) ont été fusionnés en une seule fiche. Cause : le filet de sécurité anti-homonyme (`deduplicate_players`, exception A) ne se basait que sur les rosters NHL en direct (`roster_ambiguous`) pour savoir si un nom correspond à 2 personnes différentes — signal aveugle quand l'un des deux est actuellement agent libre sans équipe (justement le cas de l'ex-défenseur PIT ce mois-ci), ce qui a laissé passer la fusion via la branche nhl_id de l'exception B.
- Fix : `ambiguous_names` (calculé à partir du CSV du jour — 2+ équipes différentes pour un même nom, signal qui capte bien ce cas puisqu'indépendant des rosters NHL) est maintenant passé à `deduplicate_players()` et combiné à `roster_ambiguous` pour bloquer la fusion. Recalcul déplacé plus tôt dans `upload_vers_supabase()` pour être disponible dès le premier passage de dédoublonnage. Le matching principal (nom ambigu + un seul candidat en base) ne tente plus un départage par âge risqué contre un candidat isolé — traité comme nouveau joueur (visible en base pour révision plutôt que fusion silencieuse).
- Pour référence, la logique d'âge ajoutée en session précédente avait déjà bien fonctionné pour Colin White et Ryan Suter (départage correct, joueurs réels uniques ayant changé d'équipe) ; seul le cas homonyme réel (candidat unique en base) restait à sécuriser.
- **Action requise** : relancer `.\run_pipeline_staging.ps1` maintenant que le scraper est corrigé pour obtenir les vraies données de la période d'agents libres 2026, puis revalider avant de toucher prod.

**[Chore] — Scripts de lancement du pipeline staging/prod** (`run_pipeline_staging.ps1`, `run_pipeline_prod.ps1`, `run_staging_pipeline.ps1` supprimé, `CLAUDE.md`) :
- Contexte : David voulait lancer facilement `run_pipeline.py` (scraping PuckPedia + import) contre staging avant de toucher prod, en pleine période d'agents libres. Le pipeline (`scrape_puckpedia.py`, `import_supabase.py`, `import_drafts.py`, `backfill_nhl_ids.py`) fait toujours `load_dotenv()` sans argument → cible systématiquement `python_script/.env` (prod), sans flag `--env` intégré comme certains scripts plus récents (`import_draft_prospects.py`, `backfill_regular_game_logs.py`).
- Ajout de 2 scripts à la racine (même style que `start_app.ps1`) : `run_pipeline_staging.ps1` (lit `python_script/.env.staging`) et `run_pipeline_prod.ps1` (lit `python_script/.env`, demande confirmation "oui"). Les deux nettoient d'abord les variables `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` résiduelles de la session avant de les redéfinir, pour éviter qu'un run staging précédent dans le même terminal ne contamine un run prod (ou vice-versa). Args passés au script Python via `@args` (ex: `--no-scrape`).
- **Découverte en cours de route** : un script `run_staging_pipeline.ps1` existait déjà (créé une seule fois, commit `3eaa4d1`, jamais mis à jour) pour lancer `import_playoff_stats.py` contre staging, mais il était cassé — il lit `STAGING_SUPABASE_URL`/`STAGING_SERVICE_KEY` dans `.env.staging`, alors que ce fichier utilise en réalité `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` (mêmes noms qu'en prod, comme `setup_staging.py` les consomme réellement). Supprimé à la demande de David plutôt que réparé — pas de besoin actif de tester le pool des séries en staging en ce moment.
- CLAUDE.md section 2 mise à jour avec les nouvelles commandes.

**[Feat] — Départage par âge des homonymes lors de l'import PuckPedia** (`python_script/import_supabase.py`) :
- Contexte : David a demandé (en pleine période d'agents libres, beaucoup de changements d'équipe) si le pipeline gère bien les joueurs qui changent d'équipe. Analyse : le cas à risque est un vrai homonyme NHL (ex. les deux Sebastian Aho) où l'un des deux vient de signer ailleurs — le matching par nom seul est volontairement bloqué dans ce cas (`ambiguous_names` côté import, `roster_ambiguous` côté dédoublonnage) pour ne pas fusionner deux personnes différentes, ce qui pouvait laisser un doublon non résolu pour le joueur qui a bougé.
- David a proposé d'utiliser l'âge du joueur (déjà scrapé, colonne `players.age DECIMAL(4,1)`) comme signal de départage : deux personnes différentes partageant le même nom ET un âge quasi identique sont rarissimes.
- Ajout `AGE_MATCH_TOLERANCE = 1.0` (an) + fonction `match_by_age()` : comparaison par proximité plutôt qu'égalité stricte, car l'âge est recalculé à la date du scrape et dérive donc légèrement d'un import à l'autre pour le même joueur.
- Utilisé à deux endroits : (1) `upload_vers_supabase()` — quand le nom seul est ambigu, tente de matcher via l'âge avant de considérer le joueur comme nouveau ; (2) `deduplicate_players()` cas 3 — quand ni le `nhl_id` ni l'exception homonyme NHL ne tranchent, tente une fusion par âge (limité à exactement 2 candidats restants, pour rester conservateur).
- Ne fusionne/matche que si un seul candidat est dans la tolérance — sinon reste conservateur (comportement inchangé) plutôt que de deviner entre deux personnes différentes.
- Pas de migration requise (colonne `age` déjà existante). À valider au prochain run du pipeline (surveiller les lignes `[DEDUP] ... départagé par âge` dans la sortie console).

**[Feat] — Renommage "DraftCenter" → "Classement des prospects" + réordonnancement du menu Repêchage + sélecteur d'année** (`app/components/Navbar.tsx`, `app/app/draft-center/page.tsx`, `app/app/draft-center/DraftYearSelect.tsx`, `app/app/admin/draft-center/page.tsx`, `app/app/admin/draft-center/AdminDraftYearSelect.tsx`, `app/app/admin/draft-center/[id]/page.tsx`) :
- Contexte : David voulait un nom plus clair que "DraftCenter" et un ordre logique dans le dropdown "Repêchage" : Classement des prospects (avant le repêchage LNH) → Repêchage LNH → Repêchage recrues (pool, qui pige parmi les joueurs déjà repêchés).
- Renommage du libellé partout (desktop/mobile, admin/public) : "DraftCenter"/"DraftCenter 2026" → "Classement des prospects". Les noms de fichiers/composants (`DraftCenterTable`, route `/draft-center`) ne sont pas renommés (changement de libellé uniquement).
- Réordonnancement des liens du dropdown "Repêchage" (desktop et mobile) : Classement des prospects, Repêchage LNH, Repêchage recrues.
- **Ajout d'un sélecteur d'année** sur `/draft-center` (public, visible seulement si ≥2 années présentes) et `/admin/draft-center` (toujours visible, inclut année suivante + année demandée par l'URL) : avant ce changement, la page ne montrait que la valeur MAX(draft_year) dans `draft_prospects`, donc dès qu'un nouveau repêchage serait importé (ex. 2027), le classement 2026 serait devenu invisible/inaccessible. Maintenant navigable via `?year=`.
- Pas de migration de schéma requise (draft_prospects.draft_year existait déjà, supporte plusieurs années).

**[Fix] — DraftBoard repêchage de recrues : affichage du mauvais joueur par pick** (`app/app/admin/repechage/DraftBoard.tsx`, `app/app/admin/repechage/page.tsx`, `app/app/repechage-recrues/page.tsx`, `app/app/admin/init/page.tsx`) :
- Contexte : David a signalé que le repêchage 2025 recréé (staging) affichait des joueurs répétés à plusieurs picks différents (ex. Vincent = Cullen Potter à 3 reprises, Steve = Mason West 2 fois) alors que chaque pick doit correspondre à une recrue distincte.
- Cause : `DraftBoard.tsx` déterminait le joueur affiché pour un pick soumis en cherchant dans la banque du pooler un joueur dont `draft_round` (round NHL réel) correspondait au round du pool — une coïncidence sans rapport — et retombait sur `bankPlayers[0]` (le premier joueur de la banque) si aucun match. Résultat : le même premier joueur de la banque s'affichait pour tous les picks du pooler.
- Les données en base étaient correctes : `pooler_rosters.draft_pick_id` (FK explicite vers `pool_draft_picks.id`, ajoutée par migration 2026-04-09) est bien remplie par `submitDraftAction`. C'était un bug d'affichage pur.
- Vérifié par reconstruction directe sur staging via `draft_pick_id` : 32/32 sélections du repêchage 2025 sont distinctes, aucun doublon — les données recréées sont bonnes (Nicolas = Matthew Schaefer en ronde 1, etc.).
- **Constat additionnel** : en **prod**, la saison 2025-26 n'a aucun pick soumis (`is_used=false` sur les 32 picks, `draft_pick_id` absent) — le repêchage 2025 n'a été recréé qu'en staging pour l'instant, pas encore poussé en prod.
- Fix : les 3 pages qui alimentent `DraftBoard` (`admin/repechage`, `repechage-recrues`, `admin/init?tab=repechage`) construisent maintenant une map `pick.id → joueur` via `draft_pick_id` au lieu de deviner. Le même bug était dupliqué dans les 3 fichiers (copié-collé) — les trois ont été corrigés.
- Mémoire ajoutée : toujours joindre via une FK explicite quand elle existe (`draft_pick_id`), ne jamais improviser un matching par round/ordre; vérifier tous les appelants d'un composant partagé avant de considérer un fix de ce type terminé.
- Pas encore commité (en attente de confirmation).

### 2026-07-01

**[Feat] — DraftCenter : améliorations UX tableau** (`app/app/draft-center/DraftCenterTable.tsx`, `app/app/draft-center/page.tsx`) :
- Colonnes par source toujours visibles dans le tableau (acronymes en en-tête) + code couleur : bleu foncé rang 1–5, gris foncé 6–15, gris pâle 16+.
- Colonnes CS-NA et CS-EU en fond ambré pour les distinguer visuellement des sources classement global.
- Légende déplacée en haut de page avec explication du code couleur.
- Suppression des onglets Central Scouting (rangs désormais visibles directement comme colonnes).
- Rang moyen affiché en gros et bleu en première colonne sticky; colonnes Joueur et Rang moyen restent visibles au scroll horizontal.
- Séparateur automatique avant les prospects classés uniquement par les Éclaireurs LNH.
- Expand par clic sur une ligne : affiche équipe + stats complètes (PJ/B/A/PTS/PUN).
- Texte indicatif ajusté : "cliquer sur un joueur pour voir les points amassés au cours de la dernière saison".
- Suppression du sous-titre redondant sur la page.
- Commits : `60284f3` à `609ff6b`.

**[Fix] — DraftCenter : ajustements sources + import complet 16 sources** (`app/lib/draft-sources.ts`, `app/app/draft-center/`, `app/app/admin/draft-center/page.tsx`, `python_script/import_draft_prospects.py`, `supabase_migrations/draft_center_v2.sql`) :
- Retrait de `recruit_scouting` (pas de liste disponible) — migration SQL `draft_center_v2.sql` met à jour la contrainte CHECK.
- `central_scouting_na` et `central_scouting_eu` marqués `infoOnly: true` dans `draft-sources.ts` : exclus du rang moyen (leurs listes sont par catégorie NA/EU distinctes, pas un classement global), affichés séparément dans l'expand sous "Éclaireurs LNH (informatif)".
- Import complet des 16 onglets (15 onglets nouveaux + `elite_prospects` déjà en BD) : 512 rangs, 75 prospects distincts.
- Migration `draft_center_v2.sql` confirmée exécutée sur **staging** le 2026-07-02 (test d'insertion `source='recruit_scouting'` rejeté par la contrainte CHECK, code 23514). Statut sur **prod** non vérifié directement — à confirmer.

**[Feat] — DraftCenter : rankings de prospects repêchage LNH 2026** (`supabase_migrations/draft_center.sql`, `python_script/import_draft_prospects.py`, `app/lib/draft-sources.ts`, `app/app/draft-center/`, `app/app/admin/draft-center/`, `app/components/Navbar.tsx`) :
- Contexte : David veut offrir aux poolers un centre de classements de prospects (17 sources : EliteProspects, TSN/Button, TSN/Peters, McKeen's, THN×2, Daily Faceoff, FloHockey, Central Scouting NA/EU, Draft Prospects Hockey, Sportsnet×2, Recruit Scouting, Smaht Scouting, DobberProspects, HPR/Malloy) sans risquer la violation de copyright (classement = faits non protégés ; liens vers les sources pour attribution, pas de texte rédactionnel copié).
- **BD** : 2 nouvelles tables `draft_prospects` (bio + stats PJ/B/A/PTS/PUN) + `draft_prospect_rankings` (rang par source avec contrainte CHECK sur 17 slugs), RLS lecture publique / écriture admin. Migration exécutée staging + prod.
- **Script Python** `import_draft_prospects.py` : lit un classeur Excel multi-onglets (nom d'onglet = slug source). Gère deux formats de colonnes : `first_name/last_name/position` séparés ou champ `name` combiné du style `"Gavin McKenna\xa0(LW)Verified player"` (EliteProspects), nettoyage du préfixe `"USA flagNCAA"` dans le champ `league`, accept `p` et `tp` indifféremment pour les points. Import initial EliteProspects : 32 prospects créés (saison régulière stats incluses). Fichier source : `excel/draft_prospects_2026.xlsx` (gitignored).
- **Page publique** `/draft-center` : tableau trié par rang moyen, colonnes PJ/B/A masquées mobile, clic sur joueur pour voir les rangs de chaque source sous forme de badges cliquables (avec lien source si `source_url` renseignée).
- **Page admin** `/admin/draft-center` : liste avec rang moyen + nb sources + actions Modifier/Supprimer ; formulaire ajout inline ; page `/admin/draft-center/[id]` avec édition bio/stats + 17 champs rang+URL par source.
- **Navbar** : lien public "DraftCenter 2026" ajouté dans le dropdown "Repêchage" (desktop + mobile) ; lien admin "DraftCenter" dans le menu Admin (desktop + mobile).

### 2026-06-27

**[Feat] — Désactivation d'une saison de séries + masquage des menus séries hors saison active** (`app/app/admin/config/actions.ts`, `app/app/admin/config/SeasonsManager.tsx`, `app/components/Navbar.tsx`) :
- Contexte : David a terminé la saison de séries 2026-PO et voulait la désactiver sans la supprimer (le seul bouton visible pour une saison de séries active était "Supprimer", qui efface `transactions`/`transaction_items` liés et cascade en BD — destructif et non souhaité).
- Constat : `pool_seasons` n'a qu'un statut binaire `is_active` (pas de notion "terminée" distincte), et `actions.ts` n'avait que `activateSeasonAction`/`deleteSeasonAction`, aucune action de désactivation pure.
- Ajout `deactivateSeasonAction` (`admin/config/actions.ts`) : met `is_active=false` sur une saison, refuse si `is_playoff=false` (une saison régulière doit toujours avoir une autre saison active à la place via "Activer", jamais juste être désactivée à vide).
- `SeasonsManager.tsx` : nouveau bouton "Désactiver" visible uniquement quand `is_active && is_playoff`.
- Demande complémentaire : masquer les menus "Pool Séries" (Choix des joueurs, Classement, Résultats) dans la Navbar quand aucune saison de séries n'est active, sauf dans le menu Admin. `Navbar.tsx` recevait déjà `initialNewPlayoffActive` (fetch `pool_seasons.is_active && is_playoff` dans `layout.tsx`) — le dropdown "Pool Séries" complet (desktop) et la section mobile équivalente sont maintenant conditionnés par `newPlayoffActive`. Les liens admin (`/admin/series`) restent accessibles via le menu Admin (desktop ligne ~296, mobile ligne ~415), qui ne dépendent pas de ce flag.
- Pas de migration de schéma requise.
- Pas encore commité.

**[Fix] — `added_at` non propagé lors d'une signature historique dans `/admin/mouvements`** (`app/app/admin/mouvements/actions.ts`) :
- Contexte : David demandait si on était prêt à saisir l'historique des mouvements (source `excel/Mouvements_consolides.xlsx`, déjà consolidée et triée chronologiquement via `python_script/extract_mouvements.py` + `sort_mouvements.py`).
- Audit de `submitMouvementAction` : `swap`/`activate_rookie`/`ltir`/`return_ltir` ne touchent pas `added_at`/`removed_at` — correct, car `buildStandings()` (`app/lib/standings.ts`) fenêtre les points sur la tenure complète du roster (`added_at`→`removed_at`), pas sur le statut actif/réserve/LTIR.
- Bug réel : `addNewPlayer()` (utilisé par `sign` et `ltir_sign`) ne fixait jamais `added_at` — un nouvel insert retombait sur `DEFAULT NOW()` et une réactivation gardait l'ancien `added_at`, faussant la fenêtre de points pour toute saisie à une date passée. Conforme à la règle documentée dans `CLAUDE.md` (section 6).
- Correction : `added_at: changedAt` ajouté dans les deux branches (insert et update) de `addNewPlayer()`.
- `release()` était déjà correct (`removed_at: changedAt`).
- Conclusion pour David : l'outil est maintenant fiable pour saisir l'historique complet via `/admin/mouvements`.
- Pas encore commité.

### 2026-06-22

**[Fix] — Saisons NHL codées en dur dans le pipeline Python** (`python_script/import_supabase.py`, `python_script/fix_null_positions.py`) :
- Contexte : question de David sur l'état à jour du pipeline PuckPedia. Audit a révélé `NHL_SEASON = '20252026'` (`import_supabase.py`) et `SEASON = '2025-26'` (`fix_null_positions.py`) codés en dur, alors que `backfill_nhl_ids.py` avait déjà été migré vers une lecture dynamique de `pool_seasons` (commit `6326270`).
- Risque : ces constantes deviennent fausses au changement de saison (ex : entre-saison actuelle avant 2026-27), faussant la désambiguïsation des rosters NHL (`import_supabase.py`) et le filtre de contrat actif (`fix_null_positions.py`).
- Correction : ajout d'une fonction `get_active_season(supabase)` (même logique que `backfill_nhl_ids.py` — saison régulière active dans `pool_seasons`, sinon la plus récente) dans les deux scripts ; `charger_rosters_nhl()` prend désormais `saison` en paramètre au lieu de lire une constante globale.
- Pas de migration de schéma requise — lecture seule sur `pool_seasons`.
- Pas encore commité.

### 2026-06-21

**[Outil] — Consolidation des mouvements historiques depuis l'Excel `Pool LT.xlsm`** (`python_script/extract_mouvements.py`, `python_script/sort_mouvements.py`, `excel/Mouvements_consolides.xlsx`) :
- Contexte : David doit saisir manuellement dans `/admin/transactions` l'historique des mouvements de roster, jusqu'ici éparpillé dans 8 onglets Excel (un par pooler : Vincent, Sebastien_FAU, Jerome, Sebastien_STL, David, Steve, Paule, Nicolas), colonnes P à Z.
- `extract_mouvements.py` : fusionne les 8 onglets en une seule feuille, ajoute une colonne `Pooler` (271 lignes au total).
- `sort_mouvements.py` : trie le résultat par ordre chronologique sur la colonne `Date`. Pour les lignes sans date explicite (échanges, "BLT", "Gestion Blessure" sans fenêtre temporaire), la date est déduite par report de la dernière date connue du même pooler (les onglets sources étaient déjà en ordre chronologique) ; colonne `Date estimée` (Oui/Non) ajoutée pour distinguer les dates lues des dates déduites.
- Cas limite signalé à David : les 7 lignes de l'onglet `Sebastien_STL` n'ont aucune date dans tout l'onglet — restent sans `Date tri`, à dater manuellement avant saisie.
- Décision : David valide lui-même le fichier `excel/Mouvements_consolides.xlsx` avant qu'on transforme la liste en transactions structurées pour `/admin/transactions`. Pas encore fait à ce stade.
- Rappel discuté en session : saisir les transactions historiques dans `/admin/transactions` **en ordre chronologique strict** (pas par pooler), car `submitTransactionAction` valide l'état courant des rosters au moment de la saisie et ne gère pas les chevauchements temporels rétroactifs — voir [[feedback_date_override_roster]] et section 6 de `CLAUDE.md`.
- Pas de commit : fichiers `extract_mouvements.py`, `sort_mouvements.py` et `excel/Mouvements_consolides.xlsx` ajoutés mais non poussés (le dossier `excel/` n'a pas encore été évalué pour inclusion au repo — à clarifier avec David : data perso/Excel à garder hors `.gitignore` ou pas).

**[Outil] — Keepalive automatique du projet Supabase staging** (`.github/workflows/keepalive_staging.yml`, `python_script/keepalive_staging.py`) :
- Contexte : email Supabase signalant que le projet staging (`pwblgjdmuaoyfixeyltg`, plan gratuit) serait mis en pause après 7 jours d'inactivité.
- Écarté : changer de système de BD (Snowflake évalué et rejeté — c'est un entrepôt analytique OLAP, pas adapté à un backend applicatif avec Auth/RLS/temps réel).
- Solution retenue : nouveau workflow GitHub Actions `keepalive_staging.yml`, cron hebdomadaire (jeudi 6h UTC, avant le seuil de 7 jours), qui exécute `keepalive_staging.py` (lecture minimale `SELECT id FROM poolers LIMIT 1` via `supabase-py`) sur le projet staging.
- Secrets GitHub ajoutés : `STAGING_SUPABASE_URL`, `STAGING_SERVICE_KEY` (valeurs reprises de `python_script/.env.staging`, fichier local non commité).
- Testé localement avec succès contre le vrai projet staging avant de pousser.
- Alternative écartée : passer au plan Pro Supabase juste pour désactiver la pause auto — jugé disproportionné pour un projet staging.

### 2026-06-20 (suite 2)

**[Docs] — Clarification : `/gestion-effectifs` permet déjà de forcer une date manuelle** (`CLAUDE.md`) :
- Question posée : pouvoir corriger les mouvements d'un pooler (signalés par texto) avec une date manuelle au lieu de la date de saisie
- Constat : déjà implémenté — admin uniquement, checkbox "Forcer une date effective" (`GestionEffectifsManager.tsx:736-756`), `forcedDate` propagé correctement à `added_at`/`removed_at`/`roster_change_log.changed_at` dans `submitBatchAction` (`gestion-effectifs/actions.ts`)
- Ajout d'une section "Convention — date historique d'un mouvement de roster" dans `CLAUDE.md` (section 6) listant tous les mécanismes de surcharge de date existants (`/gestion-effectifs`, `/admin/transactions`, `/admin/historique`, `adminInitRosterAction`) et la règle obligatoire (propager à `added_at`/`removed_at`, pas seulement à l'affichage)
- Ajout de `/gestion-effectifs`, `/gestion-series`, `/admin/historique` à la liste des routes (section 5) — manquaient
- But : éviter de re-découvrir ou de re-implémenter ce mécanisme par erreur dans une future session

### 2026-06-20 (suite)

**[Fix] — `/admin/transactions` ignorait la date historique pour le calcul des points** (`app/app/admin/transactions/actions.ts`) :
- Contexte : avant de lancer la saisie des transactions historiques 2025-26 (échanges, signatures, libérations survenus en cours de la vraie saison, jamais saisis dans l'app), vérification de la mécanique de `submitTransactionAction`
- Bug trouvé : le champ `transactionDate` du formulaire n'était appliqué qu'à `transactions.created_at` (affichage). Les mutations réelles sur `pooler_rosters` (`added_at` à l'ajout, `removed_at` au retrait) utilisaient toujours `new Date().toISOString()` — la date du jour, peu importe la date choisie
- Impact : `buildStandings()` somme les game-logs dans la fenêtre `added_at → removed_at` — une transaction historique daterait sa fenêtre d'aujourd'hui au lieu de la vraie date passée → points mal attribués pour toute transaction backdatée
- Fix : nouvelle constante `txTs` (= `${transactionDate}T12:00:00Z` si fourni, sinon `now()`), utilisée pour tous les `added_at`/`removed_at` sur `pooler_rosters` (transfer, ballotage, sign, release)
- **Non corrigé (préexistant, hors scope)** : `promote` (recrue → actif) et `reactivate` (LTIR → actif) ne touchent pas `added_at` — la fenêtre de points repart du premier ajout (même si ce était en banque de recrues ou en LTIR). Comportement identique partout ailleurs dans le code (`gestion-effectifs/actions.ts`, `admin/rosters/actions.ts`). À surveiller si des transactions historiques de type promotion sont saisies — vérifier manuellement le classement après ces cas précis
- Commit : `6be82f5`
- **Recommandation** : tester la saisie des transactions historiques en staging d'abord (écrit/restructure des données de poolers), valider le classement contre l'Excel avant de répliquer en prod

**[Feat] — Automatisation de `added_at` lors des rosters initiaux** (`app/app/admin/rosters/actions.ts`, `WORKFLOW_NOUVELLE_SAISON.md`) :
- `adminInitRosterAction()` (Mode init) lit désormais `pool_seasons.saison_start_date` et fixe `added_at = '<saison_start_date>T12:00:00Z'` sur chaque ajout, au lieu de laisser le défaut BD (`now()`)
- Reprend le pattern déjà validé dans `gestion-effectifs/actions.ts` (pré-saison)
- Élimine l'étape SQL manuelle documentée le 2026-06-14 (`UPDATE pooler_rosters SET added_at = ...`) suite au bug "classement à 0 points" — supprimée du `WORKFLOW_NOUVELLE_SAISON.md`, remplacée par une note indiquant que `saison_start_date` doit être renseigné avant de soumettre les rosters initiaux
- Si `saison_start_date` est vide, fallback sur la date réelle de saisie (comportement inchangé)

### 2026-06-15

**[Fix] — Affichage UTC au lieu de l'heure de l'Est (EDT) dans les timestamps admin** (`app/app/admin/series/ChangeLogPanel.tsx`, `app/app/gestion-series/GestionSeriesManager.tsx`, `app/app/admin/series/SeriesAdminManager.tsx`) :
- `toLocaleString('fr-CA', {...})` sans `timeZone` utilisait le fuseau du serveur Vercel (UTC) → les heures affichées étaient ~4h trop tard par rapport à l'heure locale (EDT = UTC−4)
- Ajout de `timeZone: 'America/Toronto'` dans les 3 fonctions de formatage concernées (cohérent avec le reste du codebase)

**[Fix données] — Cache classement pool des séries stale** (`playoff_pool_standings_cache`) :
- Le cron `import_playoff_stats.py` (6h UTC) n'avait pas importé les game-logs de la partie du 14 juin (CAR, début 00h00 UTC 15 juin = 20h ET 14 juin), vraisemblablement parce que le boxscore NHL n'était pas finalisé à 2h ET
- Les game-logs étaient présents en BD (`player_game_logs`) mais le cache (mis à jour à 12h11 UTC) ne les incluait pas encore
- Correction directe via Python : recalcul des totaux de tous les poolers et mise à jour du cache → David 86→106, Paule 92→105 (Bussi Brandon V+JB = +4 pts, Shea Theodore activé mais 0 pt)
- La mécanique elle-même est correcte : `added_at (20h58-59 UTC) < game_start_time (00h00 UTC 15 juin)` → les points comptent bien

### 2026-06-14 (suite)

**[Fix données] — Classement à 0 points malgré les game logs importés** (correction manuelle SQL, `pooler_rosters`) :
- `buildStandings()` (`app/lib/standings.ts`) ne compte un match que si `game_start_time > added_at` de la ligne `pooler_rosters`
- Les rosters initiaux 2025-26 ont été créés le 2026-06-07/08/10 → `added_at` valait cette date (après tous les matchs de la saison, terminée le 2026-04-16) → 0 point partout
- Correction : `UPDATE pooler_rosters SET added_at = '2025-10-07T12:00:00Z' WHERE pool_season_id = 1 AND player_type IN ('actif','reserviste') AND is_active = true` (182 lignes, exécuté manuellement)
- Le champ "Date de début de saison" dans `/admin/config` (`saison_start_date`) est actuellement **informatif seulement** — rien ne l'applique automatiquement à `added_at` lors de la mise en place initiale des rosters
- **À faire pour la prochaine saison** : soit automatiser ce réglage de `added_at = saison_start_date` au moment de la soumission des rosters initiaux (`adminInitRosterAction` / `submitRosterAction`), soit ajouter cette étape SQL manuelle au `WORKFLOW_NOUVELLE_SAISON.md`

### 2026-06-14

**[Fix] — Sélecteur de recrues : menu coupé en bas de page** (`app/app/admin/repechage/RookieSelect.tsx`) :
- Le combobox est réécrit avec `createPortal` (rendu dans `document.body`, `position: fixed` calculée via `getBoundingClientRect()`)
- Corrige le menu déroulant tronqué pour les dernières rangées (David, Vincent) dans les conteneurs `overflow-hidden`

**[Fix] — Soumission du repêchage rejetait des recrues valides** (`app/app/admin/repechage/actions.ts`) :
- `submitDraftAction()` validait avec `is_rookie === true` strict alors que le sélecteur accepte déjà `is_rookie = true OU draft_year >= poolDraftYear - 4`
- Règle alignée sur celle du sélecteur ; corrige l'erreur "Le joueur sélectionné (id: 886) n'est pas une recrue" pour Aitcheson (R1 #17, 2025)

**[Audit] — Règle d'éligibilité recrue propagée partout** (`app/app/admin/rosters/actions.ts`, `app/app/admin/init/page.tsx`) :
- Nouveau helper `getDraftYearCutoff()` (lit `pool_seasons.season`, retourne `saisonFin - 5`)
- `changeTypeAction()` et `submitRosterAction()` (ajouts ET changements de type vers `recrue`) utilisaient encore `is_rookie === true` strict → alignés sur la règle large (`is_rookie = true OU draft_year >= cutoff`)
- `admin/init/page.tsx` (onglet "Choix de repêchage", duplique `/admin/repechage`) : requête recrues alignée sur le filtre `.or(is_rookie.eq.true,draft_year.gte.poolDraftYear-4)` + ajout de `pending_player_id` à la requête des picks pour que la sauvegarde de progression fonctionne aussi sur cette page

### 2026-06-13

**[Docs] — Procédures admin** (`WORKFLOW_NOUVELLE_SAISON.md`) :
- Étape 6 (Repêchage des recrues) corrigée : l'ordre de sélection n'est **pas** serpentin, il est le même à toutes les rondes
- Ajout d'une mention du raccourci "Initialiser à partir du classement précédent (inversé)" (session 2026-06-11)

**[Feat] — Résumé des choix par pooler** (`app/app/admin/config/PicksEditor.tsx`, `app/app/admin/repechage/DraftBoard.tsx`) :
- Tableau condensé ajouté : nombre de choix par ronde/total par pooler (config), et Faits/Restants/Total par pooler (repêchage)
- Le résumé du repêchage est visible aussi côté public (`/repechage-recrues`) pour le suivi en direct

**[Fix] — Sélecteur de recrues : exclut les repêchés sans `is_rookie=true`** (`app/app/admin/repechage/page.tsx`, `app/app/repechage-recrues/page.tsx`) :
- Même règle d'éligibilité que la banque de recrues (session 2026-06-08) : `is_rookie = true` OU `draft_year >= poolDraftYear - 4`
- Corrige l'absence de joueurs comme Aitcheson (R1 #17, 2025, `is_rookie=false`) dans le sélecteur

**[Feat] — Sélecteur de recrues avec recherche** (`app/app/admin/repechage/RookieSelect.tsx` nouveau, `DraftBoard.tsx`) :
- Remplace le `<select>` par un combobox texte avec filtre par nom
- Les recrues déjà choisies dans une autre ronde/pick (session en cours) disparaissent de la liste au lieu d'être juste désactivées

**[Feat] — Sauvegarde des choix en cours de repêchage** (`supabase_migrations/draft_pending_selection.sql`, `app/app/admin/repechage/actions.ts`, `page.tsx`, `DraftBoard.tsx`) :
- Nouvelle colonne `pool_draft_picks.pending_player_id` (exécutée manuellement dans Supabase)
- Nouvelle action `saveDraftProgressAction()` + bouton "Sauvegarder" : persiste les sélections sans assigner les joueurs
- Au chargement, les sélections sont restaurées depuis `pending_player_id` (admin seulement)
- `submitDraftAction()` met `pending_player_id = null` au moment de la soumission finale

### 2026-06-11

**[Feat] — Initialisation automatique de l'ordre de repêchage (agents libres + recrues)** (`app/lib/draftOrder.ts`, `app/app/admin/presaison/actions.ts`, `app/app/admin/presaison/PresaisonManager.tsx`) :
- L'ordre de repêchage des agents libres (`pool_seasons.presaison_draft_order`) et celui des recrues (`pool_draft_picks.draft_order`) sont tous les deux censés être l'inverse du classement final de la saison régulière précédente — mais étaient saisis manuellement et séparément
- Nouveau helper `computeReverseStandingsOrder()` : trouve la saison précédente (`pool_seasons` triée par `season`), appelle `buildStandings()`, inverse l'ordre (pire au meilleur = premier au dernier choix)
- Nouvelle action `initDraftOrderFromStandingsAction()` : met à jour `presaison_draft_order` ET `pool_draft_picks.draft_order` (toutes rondes) en un clic
- Bouton "Initialiser à partir du classement précédent (inversé)" ajouté dans Admin > Pré-saison > Ordre du repêchage — pré-remplit l'éditeur, l'admin sauvegarde ensuite (peut ajuster manuellement avant)
- Les deux éditeurs existants (`/admin/presaison` et `/admin/repechage`) restent disponibles pour ajustements manuels (échanges de premier choix, etc.)

### 2026-06-09

**[Fix] — Banque de recrues : référence résiduelle `bankPlayerIds` cassait le build Vercel** (`app/app/admin/recrues/BanqueRecruesManager.tsx`) :
- Le commit `a350563` avait supprimé la variable `bankPlayerIds` mais oublié une référence dans le tableau de dépendances du `useMemo` de `availableRookies`, causant une erreur TypeScript en build (`Cannot find name 'bankPlayerIds'`) et une erreur runtime côté admin
- Remplacée par `allTakenIds`
- Commit : `4d864d9`

### 2026-06-08

**[Fix] — Recrues éligibles à la banque : accepter les repêchés sans contrat NHL actif** (`app/app/admin/rosters/actions.ts`, `RosterManager.tsx`) :
- La validation ne vérifiait que `is_rookie = true` (flag PuckPedia) — bloquait les joueurs repêchés récemment sans contrat ELC actif (ex : contrat AHL, pas encore signé NHL comme Eiserman 2024)
- Désormais : `is_rookie = true` **OU** `draft_year >= saison_fin - 5` sont tous les deux éligibles
- Corrigé côté serveur (`actions.ts`) et côté client (`RosterManager` : `addPlayer` + `changeType`)
- Commits : `b9db51b`

**[Feat] — Banque de recrues : panel recherche sticky + layout 2 colonnes fixe** (`app/app/admin/recrues/BanqueRecruesManager.tsx`) :
- Layout `grid-cols-1 lg:grid-cols-2` → `grid-cols-2` permanent (admin desktop-only) pour que la zone de recherche reste toujours visible à droite de la banque
- `sticky top-4 self-start` sur la colonne droite + hauteur liste adaptée à la fenêtre (`max-h-[calc(100vh-16rem)]`)
- Commits : `7ee2262`, `b810f60`

**[Fix] — Banque de recrues : exclure les recrues déjà assignées à un autre pooler** (`app/app/admin/recrues/BanqueRecruesManager.tsx`) :
- `bankPlayerIds` ne couvrait que le pooler courant — un joueur ajouté à David restait visible dans la liste de Jérôme
- `allTakenIds` charge au montage tous les `player_id` en `player_type='recrue'` pour la saison (tous poolers), et se met à jour localement lors des ajouts/retraits
- Commit : `a350563`

### 2026-06-06

**[Feat] — Page publique Repêchage recrues + admin multi-saisons** (`app/app/repechage-recrues/`, `app/app/admin/repechage/`, `app/components/Navbar.tsx`) :
- `/repechage-recrues` : nouvelle page publique lecture seule — tableau de bord du draft par ronde, sélecteur de saison pour l'historique, liste des joueurs encore disponibles
- `/admin/repechage` : sélecteur de saison ajouté (plus limité à la saison active)
- `DraftBoard` : prop `readOnly` — masque dropdowns, bouton soumettre et boutons annuler
- Navbar : "Repêchage" devient un dropdown (Repêchage LNH + Repêchage recrues), lien admin ajouté
- Onglets admin/init réordonnés : Choix de repêchage **avant** Repêchage recrues (logique chronologique)
- Auto-création des saisons futures : confirmé que `createSeasonAction` crée la saison demandée + les 2 suivantes automatiquement (comportement intentionnel existant)
- Commits : `04a19d5`, `0ad78a9`

**[Feat] — Picks configurables multi-saisons** (`app/app/admin/presaison/`, `app/app/admin/init/`) :
- `PicksManager` dans Init > Choix de repêchage : sélecteur de toutes les saisons régulières + bouton **Initialiser** (N rondes × M poolers dynamiques)
- `draft_rounds` configurable par saison (Config > Pool Saison)
- `PicksEditor` : rondes dérivées des picks réels (plus hardcodé 1-4)
- Migration BD : `supabase_migrations/draft_rounds_configurable.sql` (appliquée)
- Commits : `99c0e43`, `98af829`

### 2026-06-05

**[Fix] — Mode init : DELETE avant INSERT pour éviter conflit de clé** (`app/app/admin/rosters/actions.ts`, `RosterManager.tsx`) :
- `adminInitRosterAction` utilise maintenant `createAdminClient()` (bypass RLS) + DELETE avant chaque INSERT pour garantir zéro conflit de clé peu importe l'état de la BD
- Ajout bouton **"Vider tous les rosters"** (rouge) dans la bannière mode init → supprime toutes les lignes `pooler_rosters` de la saison active via `viderRostersAction`
- Commits : `e549088`

**[Feat] — Choix de repêchage configurables et multi-saisons** (`app/app/admin/presaison/`, `config/actions.ts`, `config/PicksEditor.tsx`) :
- `draft_rounds` configurable par saison (Config > Pool Saison > Règles de transactions)
- `PicksManager` : sélecteur de saison (toutes les saisons régulières) + bouton **"Initialiser"** qui crée N rondes × M poolers picks dynamiquement
- `PicksEditor` : rondes dérivées des picks réels (plus hardcodé 1-4)
- `initPicksAction` : crée les picks pour tous les poolers existants
- Contrainte `pool_draft_picks.round >= 1` (remplace `BETWEEN 1 AND 4`)
- **À appliquer en BD** : `supabase_migrations/draft_rounds_configurable.sql`
- Commit : `99c0e43`

### 2026-06-02 (suite)

**[Feat] — Indicateurs de performance gardiens configurables** (`app/app/admin/config/SeasonConfigForm.tsx`, `actions.ts`, `statistiques/page.tsx`, `poolers/[id]/page.tsx`) :
- 4 nouvelles colonnes dans `pool_seasons` : `indicator_goalie_wins_streak`, `indicator_goalie_sv_pct` (0.0–1.0), `indicator_goalie_gaa`, `indicator_goalie_min_games`
- Nouvelle section "Indicateurs gardiens" dans l'onglet Pool Saison : victoires consécutives, sv% minimum (affiché en %), GAA maximale, matchs minimum pour la fenêtre sv%/GAA
- `statistiques/page.tsx` et `poolers/[id]/page.tsx` lisent maintenant les valeurs depuis la BD (fallback sur `DEFAULT_INDICATOR_CONFIG` si null)
- **À appliquer en BD** : `supabase_migrations/goalie_indicators.sql`
- Commit : `0480ee5`

### 2026-06-02

**[Refactor] — Réorganisation complète de la configuration admin en 5 onglets séparés** (`app/app/admin/config/`, `app/app/admin/pool/page.tsx`, `app/app/admin/presaison/`) :
- `ConfigForm.tsx` supprimé → remplacé par `SeasonConfigForm.tsx` (saison régulière) et `PlayoffConfigForm.tsx` (séries), sans aucune logique conditionnelle `is_playoff`
- `ScoringConfig.tsx` supprimé → remplacé par `ScoringConfigSaison.tsx` (colonne `points` uniquement) et `ScoringConfigSeries.tsx` (tableau simple, sans colonne Saison ni Distinct — valeurs séries directement éditables)
- `ConfigTabsClient.tsx` créé : 5 onglets — Saisons | Pool Saison | Pool Séries | Pointage Saison | Pointage Séries
- `InitTabs.tsx` supprimé → contenu (PicksEditor + RookieOverrideManager) déplacé vers `/admin/presaison` via `PresaisonTabs.tsx` (3 onglets)
- `/admin/pool?tab=config` et `/admin/config` utilisent tous deux le nouveau `ConfigTabsClient`
- Motivation : l'onglet Configuration était confus car tout était mélangé; le pool des séries est incertain pour le futur donc séparation totale
- Commit : `a1b53f4`

### 2026-06-01

**[Chantier MIGRATION SÉRIES — complété] — Calendrier migré vers nouveau système** (`app/app/calendrier/page.tsx`) :
- Remplacé `playoff_seasons` → `pool_seasons (is_playoff=true)` et `playoff_rosters` → `playoff_pool_rosters`
- Plus aucune référence aux vieilles tables dans l'app Next.js
- Chantier MIGRATION SÉRIES complété — vieilles tables `playoff_seasons` et `playoff_rosters` droppées en BD (2026-06-01)
- Roadmap et feedback memory mis à jour pour refléter l'état réel du projet
- Commit : (voir hash)

### 2026-05-30

**[Fix] — Marner absent du picker pool des séries + backfill game logs + amélioration backfill_nhl_ids** (`.github/workflows/import.yml`, `python_script/backfill_nhl_ids.py`) :
- **Cause racine** : Mitch Marner est enregistré sous "Mitchell Marner" dans notre BD mais l'API NHL le connaît sous "Mitch Marner" → mismatch de surnom → `nhl_id = null` → filtré par `getAvailablePlayoffPlayersAction` (filtre `.filter(p => p.nhlId !== null)`).
- **Fix immédiat** : `nhl_id = 8478483` mis à jour directement en BD. Backfill des game logs playoffs (`backfill_playoff_game_logs.py --start 2026-04-19 --end 2026-05-29`) → 2857 lignes importées, incluant ses 7G + 14A (21 pts, leader des séries).
- **Fix pipeline** : `backfill_nhl_ids.py` amélioré avec fallback par préfixe de prénom (≥4 chars) + filtre équipe/position pour éviter les faux positifs. Corrige les cas Mitchell/Mitch, Joshua/Josh, Christopher/Chris, Matthew/Matt, William/Will, etc. Le filtre équipe résout aussi les ambiguïtés (Brandon vs Christopher Tanev). 7 autres joueurs avec nickname mismatch corrects.
- **Prévention** : `backfill_nhl_ids.py` ajouté au GitHub Actions (`import.yml`) — tourne désormais à chaque import hebdomadaire.
- Commit : `970fe68`

**[Refactor] — backfill_nhl_ids.py : saison dynamique depuis pool_seasons** (`python_script/backfill_nhl_ids.py`) :
- `NHL_SEASON` et `SEASON_LABEL` n'étaient plus hardcodés (`'20252026'` / `'2025-26'`).
- Nouvelle fonction `get_active_season(supabase)` : lit `pool_seasons` (saison régulière active en priorité, sinon la plus récente). Convertit `'2025-26'` → `'20252026'` pour l'API NHL.
- Zéro modification de code requise à chaque début de saison.
- Commit : `6326270`

### 2026-05-29

**[Feat] — Indicateurs de séquence spécifiques gardiens** (`app/lib/streaks.ts`, `app/components/StreakLegend.tsx`, `app/app/statistiques/StatsTable.tsx`, `app/app/classement-series/ClassementSeriesTable.tsx`, `app/app/poolers/[id]/PoolerPageTabs.tsx`) :
- Nouveau type `GoalieBadgeType` : `'wins_streak' | 'sv_elite' | 'gaa_basse' | null`.
- `StreakInfo` gagne deux champs optionnels : `goalieBadge?` et `goalieValue?` (valeur numérique pour le tooltip).
- `IndicatorConfig` gagne 4 nouveaux champs : `goalieWinsStreak` (déf. 3), `goalieSvPctThreshold` (déf. 0.930), `goalieGaaThreshold` (déf. 2.50), `goalieMinGames` (déf. 3).
- Nouvelle fonction `computeGoalieBadge` : analyse uniquement les départs (`gamesStarted === 1`). Priorité : victoires consécutives > sv% récent > GAA récente. Fenêtre = `fenetreTendance` derniers départs.
- `fetchStreak` appelle `computeGoalieBadge` uniquement quand `isGoalie=true` et l'injecte dans le résultat.
- Les badges s'ajoutent en parallèle aux badges existants (🔥/🧊 basés sur pts pool) : un gardien peut afficher jusqu'à 2 badges.
- Composant `GoalieBadge` ajouté dans les 3 vues ; `StreakLegend` gagne une section "Gardiens — indicateurs additionnels" avec 🏆/🛡️/🎯.
- Commit : `c9d3b7c`

**[Refactor] — NHL_SEASON dynamique : lit pool_seasons au lieu du hardcode** (`app/lib/nhl-stats.ts`, `app/lib/streaks.ts`, `app/lib/daily-recap.ts`, `app/lib/nhl-snapshot.ts`, `app/app/statistiques/page.tsx`) :
- Problème : `NHL_SEASON = '20252026'` hardcodé dans 3 endroits distincts. Chaque début de saison nécessitait une mise à jour manuelle dans le code.
- `nhl-stats.ts` : `buildUrl`, `fetchNhlSkaters`, `fetchNhlGoalies`, `fetchNhlSkatersByNhlId`, `fetchNhlGoaliesByNhlId` acceptent maintenant un paramètre optionnel `nhlSeason` (fallback sur la constante).
- `streaks.ts` : `fetchGameLog`, `fetchStreak`, `fetchStreaks` acceptent `nhlSeason` optionnel, propagé jusqu'au call NHL API.
- `daily-recap.ts` : `fetchPlayerStats` accepte `nhlSeason`. Les deux fonctions principales (`fetchRegularRecapForDate`, `fetchPlayoffRecapForDate`) requêtent maintenant `pool_seasons.season` via leur `poolSeasonId` et calculent dynamiquement l'ID NHL (`'2025-26' → '20252026'`, `'2026-PO' → '20252026'`).
- `nhl-snapshot.ts` : suppression du doublon `NHL_SEASON_ID = 20252026` — remplacé par `parseInt(NHL_SEASON, 10)` importé de `nhl-stats.ts`. `fetchPlayerStatsAsOfDate`, `fetchPlayerStatsSafe`, `fetchPlayerStatsById` acceptent `nhlSeasonId` optionnel.
- `statistiques/page.tsx` : suppression du doublon local `const NHL_SEASON = '20252026'` — remplacé par import + nouvelle fonction `fetchActiveNhlSeasonId(isPlayoff)` qui lit `pool_seasons.season`. La page principal lit la saison en premier, puis la passe à `fetchSkaters`, `fetchGoalies` et `fetchStreaksForStats`.
- Résultat : à partir de la saison 2026-27, zéro modification de code requise — les pages lisent automatiquement la saison active.
- Commit : `e47beb6`

### 2026-05-28

**[Feat] — Popup multi-périodes saison régulière** (`app/lib/standings.ts`, `app/app/classement/ClassementTable.tsx`, `app/app/poolers/[id]/PoolerPageTabs.tsx`) :
- `standings.ts` : nouveau type `PeriodContrib` (stats + dates par fenêtre d'activation). `PlayerContrib` gagne un champ `periods: PeriodContrib[]`. `buildStandings` regroupe maintenant les lignes `pooler_rosters` par (pooler, joueur) au lieu de créer une entrée par ligne — un joueur échangé puis re-acquis donne une entrée unique avec N périodes.
- `ClassementTable.tsx` : composant `PeriodPopup` (design identique au popup séries). Bouton `↩N` affiché à côté du nom quand `periods.length > 1`. Clic ouvre le popup avec stats/pts par période + total. Joueurs à période unique : comportement inchangé (date affichée sous le nom).
- `PoolerPageTabs.tsx` : même pattern dans l'onglet Alignement.
- Commit : `bd5aa9c`

### 2026-05-27 (suite)

**[Feat] — Pipeline game-logs saison régulière : script quotidien + workflow + backfill prod** (`python_script/import_regular_stats.py`, `.github/workflows/regular_stats.yml`, `python_script/import_playoff_stats.py`, `.github/workflows/playoff_stats.yml`) :
- Nouveau script `import_regular_stats.py` : miroir de `import_playoff_stats.py` pour game_type=2. Lit la saison active depuis `pool_seasons` (is_active=True, is_playoff=False), calcule le NHL season dynamiquement (`'2025-26' → 20252026`). OTL saison régulière : `decision == 'O'` (vs playoffs : `decision == 'L' + toi > 3600`). Pagination sur la table `players` (patch contre bug >1000 lignes).
- Fix pagination dans `import_playoff_stats.py` : même bug corrigé que dans le backfill (1 seule requête sans range → max 1000 joueurs, joueurs à ID élevé ignorés silencieusement).
- Nouveau workflow `regular_stats.yml` : tourne à 6h UTC quotidiennement. Sort proprement si aucune saison régulière active. Supporte `--date YYYY-MM-DD` via `workflow_dispatch` (utile pour relancer une date manquante).
- `playoff_stats.yml` mis à jour : ajout de `workflow_dispatch.inputs.date` pour passer `--date` au script (même commodité).
- **Backfill 2025-26 en production** : `backfill_regular_game_logs.py --season 2025-26 --start 2025-10-04 --end 2026-04-18` → 167 dates avec matchs, 94 gardiens enrichis, **50 705 lignes** insérées, 0 erreur.
- Vérification : `player_game_logs` en prod = 50 705 lignes game_type=2 + 2 835 lignes game_type=3. ✓
- Commit : `41c231c`

### 2026-05-27

**[Perf] — Optimisation pipeline : game-log → boxscore** (`python_script/import_playoff_stats.py`, `backfill_playoff_game_logs.py`, `backfill_regular_game_logs.py`) :
- Remplacé l'approche 1 appel/joueur (632 appels/date) par 1 appel/match via `/v1/gamecenter/{id}/boxscore`.
- Import quotidien : ~3-5 appels par nuit au lieu de 632.
- Backfill scripts : `--start` / `--end` pour itérer sur une plage de dates, aucun argument joueur requis.
- Backfill des séries 2026 relancé avec le nouveau script : 37 dates, 2706 lignes, 0 erreur, ~2 minutes (vs plusieurs heures avec l'ancien script).
- Correction OTL playoffs (`decision='L'` + `toi > 3600`) intégrée dans les 3 scripts.
- `backfill_regular_game_logs.py` : `--season` obligatoire (ex: `--season 2025-26`), prêt pour la saison régulière.
- Commit : `f37f696`

**[Style] — Révision responsive mobile de toutes les pages de consultation** (`app/app/classement-series/ClassementSeriesTable.tsx`, `app/app/classement/ClassementTable.tsx`, `app/app/poolers/[id]/PoolerPageTabs.tsx`, `app/app/joueurs/JoueursTable.tsx`, `app/app/statistiques/StatsTable.tsx`) :
- Date d'activation déplacée de l'inline vers une deuxième ligne (`<div className="text-xs text-gray-400 mt-0.5">`) dans les 3 tableaux de joueurs — plus lisible sur mobile.
- `ClassementSeriesTable` tableau de détail : colonnes Éq., V, DP, BL masquées < sm (aligné sur le même patron que `ClassementTable`).
- `JoueursTable` : colonnes Âge et Expérience masquées < md ; colonnes saisons futures (2026-27 à 2029-30) masquées < lg — seule la saison en cours reste visible sur mobile.
- `StatsTable` : en-tête convertie en `flex-col sm:flex-row` pour éviter l'écrasement des boutons Saison/Séries sur petits écrans.
- Audit complet des autres pages : transactions (cartes), calendrier (cartes), résultats (compact), repêchage (overflow-x-auto suffisant), aide (texte) — aucun changement requis.
- Commit : `9c16446`

**[Fix] — Buts/passes gardiens absents du boxscore NHL** (`python_script/import_playoff_stats.py`, `backfill_playoff_game_logs.py`, `backfill_regular_game_logs.py`) :
- Le boxscore NHL (`/v1/gamecenter/{id}/boxscore`) n'inclut PAS les champs `goals`/`assists` dans la section `goalies[]` — champs absents de la réponse API.
- Fix : après traitement du boxscore, `parse_boxscore` retourne maintenant un tuple `(rows, goalie_nhl_ids)`. Pour chaque gardien trouvé, on appelle `/v1/player/{id}/game-log/{season}/{game_type}` et on corrige `goals`/`assists` dans les rows correspondantes via un index `(nhl_id, game_date)`.
- Appliqué aux 3 scripts : `import_playoff_stats.py`, `backfill_playoff_game_logs.py`, `backfill_regular_game_logs.py`.
- Coût additionnel : ~2-4 appels/nuit pour les gardiens actifs dans le pool — négligeable.
- Backfill séries à re-rouler sur `--start 2026-04-19` pour corriger les gardiens (ex: Dobes A=1 manquant).

**[Fix] — OTL gardien non détecté dans les séries + heure d'activation dans les classements** (`python_script/import_playoff_stats.py`, `app/app/classement-series/ClassementSeriesTable.tsx`, `app/app/classement/ClassementTable.tsx`, `app/app/poolers/[id]/PoolerPageTabs.tsx`) :
- **Bug OTL** : En séries, la NHL retourne `decision='L'` (pas `'O'`) pour une défaite en prolongation. Le pipeline comparait `== 'O'` → `goalie_otl = 0` pour tous les matchs en prolongation en séries. Fix : si `decision == 'L'` ET `toi > 60:00`, c'est une défaite en prolongation.
- Dobes avait 4 défaites en prolongation manquantes (21 avr, 1 mai, 23 mai, 25 mai). Backfill requis sur ces dates.
- **Argument `--date`** ajouté au script (`python import_playoff_stats.py --date YYYY-MM-DD`) pour faciliter les relances manuelles.
- **Heure d'activation** : les dates d'activation affichées dans les classements (séries, saison, page pooler) montrent maintenant `JJ mmm, HH h MM` au lieu de `JJ mmm` — vérification visuelle du timing d'activation.
- **Buts/passes gardiens** : dans le tableau des séries, B et A étaient forcés à `—` pour les gardiens mais comptaient quand même dans les points → remplacé par `|| '—'` (affiche la valeur si non-nulle).

### 2026-05-26

**[Feat] — Date d'ajout visible dans les classements** (`app/lib/standings.ts`, `app/app/classement/ClassementTable.tsx`, `app/app/classement-series/ClassementSeriesTable.tsx`, `app/app/poolers/[id]/PoolerPageTabs.tsx`) :
- `PlayerContrib` reçoit un nouveau champ `addedAt: string | null` passé depuis `row.added_at`.
- Dans `ClassementTable` et `PoolerPageTabs` (alignement), la date d'ajout apparaît en gris clair à côté du nom.
- Dans `ClassementSeriesTable`, la date d'activation (`periods[0].activatedAt`) s'affiche pour les joueurs à période unique ; les joueurs multi-périodes conservent le bouton ↩N.
- Objectif : vérification visuelle des fenêtres d'activation lors des tests historiques.

### 2026-05-25

**[Feat] — Type ballotage dans gestion d'effectifs** (`app/app/gestion-effectifs/actions.ts`, `GestionEffectifsManager.tsx`, `poolers/[id]/PoolerPageTabs.tsx`) :
- Nouvelle action `ballotage` dans l'outil de mouvements (admin-only) : ajoute un joueur avec `change_type = 'ballotage'` dans le log.
- Exempt de la validation de budget AL/LTIR (mécanisme distinct).
- Badge cyan `Ballotage` dans l'onglet Historique du pooler.
- Commit : `2c0f708`

**[Feat] — Filtre début/fin de saison sur l'historique du pooler** (`app/app/poolers/[id]/page.tsx`, `admin/config/ConfigForm.tsx`, `admin/config/actions.ts`, `supabase_migrations/saison_end_date.sql`) :
- Nouvelle colonne `pool_seasons.saison_end_date DATE`. Configurable depuis `/admin/pool?tab=config`.
- La requête `roster_change_log` filtre maintenant par `>= saison_start_date` ET `<= saison_end_date` quand ces colonnes sont renseignées.
- Si une date est `null`, le filtre correspondant n'est pas appliqué (comportement neutre).
- Migration à rouler en staging et prod : `supabase_migrations/saison_end_date.sql`
- Commit : `10b082e`

**[Feat] — Réorganisation onglets page pooler : Masse Salariale + Recrues** (`app/app/poolers/[id]/page.tsx`, `PoolerPageTabs.tsx`) :
- L'onglet "Organisation" (avec sous-onglets internes via `OrganisationToggle`) est remplacé par deux onglets distincts.
- **Masse Salariale** : barre de cap + picks de repêchage + attaquants / défenseurs / gardiens / réservistes / LTIR.
- **Recrues** : banque de recrues (séparée par position) + section "Activation obligatoire" si applicable.
- `OrganisationToggle.tsx` supprimé (plus utilisé).
- Commit : `7c94f15`

**[Feat] — Sélecteur de saison onglet Repêchage + saison_start_date + is_admin_override** :

**Sélecteur de saison — `/admin/init?tab=repechage`** (`app/app/admin/init/page.tsx`, `SaisonSelectNav.tsx`) :
- L'onglet repêchage pointait toujours sur la saison active. Maintenant un `<select>` dans le header permet de naviguer vers n'importe quelle saison via `?tab=repechage&saisonId=X`.
- `SaisonSelectNav` : petit composant client qui pousse l'URL via `useRouter().push()`.

**`saison_start_date` + logique pré-saison** (`supabase_migrations/saison_start_date_admin_override.sql`, `gestion-effectifs/actions.ts`, `admin/config/ConfigForm.tsx`, `admin/config/actions.ts`) :
- Nouvelle colonne `pool_seasons.saison_start_date DATE`. Configurable depuis `/admin/pool?tab=config`.
- Tant que `NOW() < saison_start_date` : mode pré-saison — `added_at` des joueurs ajoutés = `saison_start_date`, aucune entrée dans `roster_change_log`.
- Après la date : comportement normal (timestamp réel).

**`is_admin_override` + badge historique** (`roster_change_log`, `poolers/[id]/page.tsx`, `PoolerPageTabs.tsx`, `admin/suivi/page.tsx`, `admin/pool/page.tsx`) :
- Nouvelle colonne `roster_change_log.is_admin_override BOOLEAN DEFAULT false`.
- Mis à `true` quand l'admin utilise le toggle "Forcer une date effective".
- Badge orange `override` visible dans l'onglet Historique du pooler et dans les vues suivi admin.

### 2026-05-24

**[Fix] — Gestion effectifs : comptage positions incorrect dans État projeté** (`app/app/gestion-effectifs/GestionEffectifsManager.tsx`) :
- `posCategory()` vérifiait `p === 'D'` mais la BD stocke `LD` et `RD` (voir schema.sql). Résultat : tous les défenseurs comptaient comme attaquants → "18A 0D 2G" au lieu de "12A 6D 2G".
- Fix : ajouter `p === 'LD' || p === 'RD'` dans la branche défenseur.

**[Feat] — Refonte du menu admin : 4 pages tabulées** (`app/components/AdminTabBar.tsx`, `app/app/admin/pool/page.tsx`, `app/app/admin/init/page.tsx`, `app/app/admin/effectifs/page.tsx`, `app/app/admin/page.tsx`, `app/components/Navbar.tsx`) :
- Ancien menu : 12 items éparpillés dans le dropdown Admin.
- Nouveau menu : 4 pages thématiques avec onglets URL-based (`?tab=X`), inspiré du pattern PoolerPageTabs. Navigation server-side pour éviter de charger les données de tous les onglets en même temps.
- **`/admin/pool`** : Poolers | Configuration | Communication (feedback + notifications) | Suivi.
- **`/admin/init`** : Rosters initiaux | Banque de recrues | Repêchage recrues | Pré-saison.
- **`/admin/effectifs`** : Mouvements | Transactions | Historique | Mise à jour données.
- **`/admin/series`** : inchangé (déjà existant).
- Dashboard `/admin` simplifié : 4 grandes cartes colorées avec description + badge feedback.
- Navbar : dropdown réduit à 4 items + badge agrégé (feedback + notifications).
- Anciennes routes (`/admin/poolers`, `/admin/config`, etc.) toujours accessibles directement mais retirées du menu.
- `AdminTabBar.tsx` : composant client réutilisable, reçoit `activeTab` en prop (pas de `useSearchParams`), génère des `<Link>` vers `basePath?tab=X`.



### 2026-05-12

**[Fix] — Page d'accueil + /resultats : liens repositionnés, date min, pool unique** (`app/page.tsx`, `app/resultats/page.tsx`, `app/resultats/ResultatsManager.tsx`) :
- Accueil : liens "Classement détaillé" et "Résultats détaillés" déplacés dans un `<tfoot>` du tableau séries, alignés sous les colonnes PTS (bleu) et HIER (vert) respectivement.
- `/resultats` : navigation bloquée avant le premier jour du pool (= date de la `playoff_submission_deadline`). Date trop ancienne dans l'URL bornée automatiquement. Bouton "← Veille" masqué quand on est sur la première journée.
- `/resultats` : saison régulière masquée quand un pool séries est actif.
- Commits : `0c7bac9`, `2ae210c`

**[Feat] — `/admin/rosters` : Mode init sans contraintes** (`app/admin/rosters/actions.ts`, `page.tsx`, `RosterManager.tsx`) :
- Nouveau toggle "⚙ Mode init" dans la barre du haut (admin seulement).
- En mode init : liste tous les joueurs y compris ceux appartenant à d'autres poolers (badge orange avec le nom du propriétaire). Aucune validation (limites de positions, min réservistes, is_rookie). `adminInitRosterAction` retire automatiquement le joueur de son roster actuel avant de l'assigner. Pas de snapshots NHL ni de notifications push.
- Suppression de toutes les notifications push de `/admin/rosters` (l'admin ne devrait pas spammer les poolers pour des ajustements techniques).
- Commits : `b2747b7`, `2d66dd6`

**[Fix] — Pipeline Python : heuristique ELC faux positif (ex. Jet Greaves)** (`python_script/import_supabase.py`) :
- L'heuristique ELC (âge ≤ 25 + salaire ≤ 975 K$ + fin RFA) est désormais désactivée si la colonne `ELC_Saisons` est présente dans le CSV — ce qui signifie que le scraper a tourné et n'a pas détecté d'ELC pour ce joueur. L'heuristique reste active en fallback si `ELC_Saisons` est absente (scraper incomplet).
- Correction immédiate : `UPDATE players SET is_rookie = false WHERE first_name = 'Jet' AND last_name = 'Greaves'` exécuté en SQL.
- Commit : `0455fa0`

**[Fix] — Pipeline Python : homonymes NHL (2x Sebastian Aho)** (`python_script/import_supabase.py`) :
- Bug 1 (`upload_vers_supabase`) : le fallback `existing_by_name` (len==1) assignait le 2e homonyme au même enregistrement BD que le 1er. Fix : pré-calcul des noms ambigus dans le CSV (même nom, équipes différentes) → fallback bloqué pour ces noms. Commit : `9b54618`
- Bug 2 (`deduplicate_players` Cas 3) : après insertion du nouveau CAR Aho, la dédup le supprimait (un a nhl_id, l'autre non → "changement d'équipe"). Fix initial : `roster_ambiguous` (noms sur plusieurs équipes NHL). Commit : `f3c5384`
- Bug 2 (suite) : fix insuffisant si PIT Aho n'est pas dans le roster NHL API → `roster_ambiguous` vide → dedup supprime quand même CAR Aho. Fix robuste : `charger_rosters_nhl` retourne aussi `roster_by_team` (set de tuples `fn|ln|team`). En Cas 3, si le joueur sans `nhl_id` est présent dans `roster_by_team` pour son équipe → ignoré, c'est un vrai joueur. Commit : `fd915ab`
- Fix immédiat CAR Aho (SQL) : le pipeline avait écrasé `team_id` à PIT en gardant `nhl_id=8478427` (qui appartient à CAR Aho). Correction : `UPDATE players SET team_id=(CAR), position='C' WHERE id=2474` + `INSERT` pour PIT Aho séparé + `setval` pour réinitialiser la séquence.

**[Fix] — Pipeline Python : backfill_nhl_ids crash 406** (`python_script/backfill_nhl_ids.py`) :
- `maybe_single()` plantait avec 2 saisons actives (saison régulière + séries). Ajout de `.eq('is_playoff', False)` sur la query. Commit : `0e6c4a8`

### 2026-05-15

**[Feat] — Pool séries : popup détail multi-période dans classement** (`app/app/classement-series/ClassementSeriesTable.tsx`, `app/app/gestion-series/playoff-pool-actions.ts`) :
- `calcPlayoffPoints` retourne maintenant `periods: PeriodInfo[]` (une entrée par paire activation→deactivation + période ouverte).
- Chaque période contient : stats delta (B/A ou V/DP/BL), points calculés, `activatedAt` / `deactivatedAt`.
- Joueurs avec 2+ périodes : icône `↩N` cliquable à côté du nom dans le tableau de détail.
- Clic sur l'icône ou le nom ouvre un popup modal centré : détail par période (dates, stats, pts) + total.
- Joueurs à période unique : comportement inchangé, pas d'icône.
- Note : à implémenter aussi pour la saison régulière dans une prochaine session.

**[Refonte] — Pool séries : calcul des points basé sur game-logs (remplace les snapshots)** (`python_script/import_playoff_stats.py`, `python_script/backfill_playoff_game_logs.py`, `app/app/gestion-series/playoff-pool-actions.ts`, `supabase_migrations/player_game_logs.sql`) :
- **Architecture** : `player_stat_snapshots` remplacé par `player_game_logs` (une ligne par match joué par joueur). Impossible d'avoir des points négatifs avec cette approche.
- **Migration SQL** : nouvelle table `player_game_logs` avec `game_start_time TIMESTAMPTZ` pour la règle activation avant mise en jeu.
- **Backfill** : `backfill_playoff_game_logs.py` — récupère tous les matchs joués depuis le 19 avril pour les joueurs du pool.
- **GitHub Action** : `import_playoff_stats.py` réécrit — insère les game-logs des matchs de la veille au lieu de `live_cache`.
- **Standings** : `getPlayoffPoolStandingsAction` réécrit — calcule les points par somme des game-logs dans les fenêtres `added_at → removed_at` de `playoff_pool_rosters`. Règle : `added_at < game_start_time AND (removed_at IS NULL OR removed_at >= game_start_time)`.
- **Nettoyage (2026-05-18)** : snapshot writes supprimés partout — voir entrée ci-dessous.
- **Validation (2026-05-18)** : Necas, Hutson, Lacombe, Byram vérifiés manuellement — totaux corrects avec différentes périodes d'activation. ✓

### 2026-05-23

**[Fix] — Backfill game-logs : pagination manquante sur la table `players`** (`python_script/backfill_regular_game_logs.py`, `python_script/debug_gamelogs.py`) :
- **Cause racine** : `client.table('players').select(...).execute()` retourne au maximum 1000 lignes (limite Supabase par défaut). La table `players` en staging contient ~1200+ joueurs avec `nhl_id`. Les joueurs avec `player_id` élevé (Scheifele 1541, Connor 1544, McMichael 1502, Maccelli 1304, Marchenko 206 si hors fenêtre) étaient ignorés silencieusement — aucun game-log inséré pour eux.
- **Symptôme** : plusieurs joueurs affichaient 0 pts dans le classement staging malgré des stats réelles sur marqueur.com. Les runs de backfill signalaient "0 erreurs, 0 sans matchs" sans révéler le problème.
- **Fix** : pagination sur la lecture de `players` (même pattern que `buildStandings` pour les game-logs, commit `8ddd5b8`). 997 joueurs traités, 48 300 game-logs insérés.
- **Autres améliorations** : capture des erreurs DB sur chaque batch upsert (auparavant silencieuses), argument `--nhl-ids` pour cibler des joueurs spécifiques.
- **Diagnostic** : le SQL Editor Supabase était connecté à la PRODUCTION (pas staging) durant tout le debug — requêtes de diagnostic à toujours valider dans le bon projet (`pwblgjdmuaoyfixeyltg` = staging).
- Commits : `8ddd5b8`, `b9b46f6`, `72c4cc4`, `828e4f5`

**État staging après cette session :**
- 48 300 game-logs saison régulière pour 997 joueurs dans `player_game_logs` (game_type=2, season=20252026)
- Classement 2025-26 validé : 8 poolers avec scores réalistes (David 1282, Sébastien F. 1237, etc.)
- **Prochaine étape** : valider les totaux contre l'Excel poolers pour confirmer la cohérence

### 2026-05-21 (suite 2)

**[Feat] — Backfill game-logs saison régulière + réécriture buildStandings** (`python_script/backfill_regular_game_logs.py`, `app/lib/standings.ts`) :
- `backfill_regular_game_logs.py` : fetche les game-logs NHL (game_type=2, season=20252026) pour TOUS les joueurs de la table `players` (pas seulement le pool actif — couvre les échanges en cours de saison). Argument `--env` pour cibler `.env.staging`. Retry avec backoff exponentiel sur erreurs API. Upsert idempotent sur `(player_id, game_date, season, game_type)` — aucun risque de collision avec les game-logs séries (game_type=3).
- `buildStandings` réécrit : abandonne les snapshots et les appels NHL API live. Lit `pooler_rosters` (tous les joueurs, actifs et retirés) + `player_game_logs` (game_type=2). Calcule les points en sommant les logs dans les fenêtres `added_at → removed_at`. Pas de dépendance externe. Commits : `c23629a`, `038edf6`, `4600258`, `f61a959`

**[Fix] — Staging : connexion et menu admin** :
- `login/page.tsx` : `router.push + router.refresh` remplacé par `window.location.href = '/'` — `router.refresh()` ne re-rend pas le layout racine dans Next.js App Router. Commit : `74cfc5f`
- Staging Supabase : policy "Pooler gère son profil" sur `poolers` causait récursion infinie (`EXISTS (SELECT 1 FROM poolers...)` dans une policy sur `poolers`). Fix : créer `is_admin()` SECURITY DEFINER + recréer la policy avec `is_admin()`. À documenter dans `setup_staging.py` pour les prochaines installations.
- `start_staging.ps1` : fix si `.env.local.prod` existe déjà. Commit : `549d592`

**État staging après cette session :**
- 31 708 game-logs saison régulière insérés dans `player_game_logs` (game_type=2)
- Saison 2025-26 active en staging
- Admin connecté et fonctionnel
- **Prochaine étape** : entrer les rosters initiaux 2025-26 via `/admin/rosters` Mode init, puis valider `/classement` contre l'Excel

### 2026-05-21 (suite)

**[Fix] — Pool séries : délai de réactivation 3 jours ignoré pour l'admin** (`app/app/gestion-series/playoff-pool-actions.ts`, `GestionSeriesManager.tsx`) :
- Bug : la condition `!isAdmin` sur le check cooldown permettait à l'admin de réactiver un joueur immédiatement après l'avoir retiré de son propre roster.
- Fix serveur : le bypass admin s'applique uniquement quand l'admin corrige le roster d'un **autre** pooler (`adminBypassCooldown = isAdmin && user.id !== input.poolerId`). Quand l'admin gère son propre roster, la règle des 3 jours s'applique.
- Ajout client : nouvelle action `getRecentlyRemovedAction` — récupère les joueurs retirés volontairement dans les 3 derniers jours. Le `PlayerPicker` affiche ces joueurs grisés avec une date "dispo le X" au lieu de les laisser sélectionnables. Le `cooldownMap` est recalculé à chaque changement de pooler.
- Nettoyage : suppression du prop `isAdmin` inutilisé dans `SlotRow`, simplification de `cartVoluntary`.
- Commit : `05fffa9`

### 2026-05-21

**[Feat] — Notifications push : détection désync souscription** (`app/app/compte/PushToggle.tsx`, `app/app/compte/push-actions.ts`) :
- Ajout d'un état `'desynced'` : navigateur pense avoir une souscription active, mais elle n'est plus en DB (peut arriver quand le push échoue 410/404 et nettoie la DB, ou quand l'OS révoque les permissions).
- Au chargement, si le browser a une souscription, on vérifie que son endpoint exact est bien en DB (`getSubscriptionStatusAction(endpoint)`).
- Si désynchronisé : point orange + message explicatif + bouton "Réactiver" orange.
- Si synchronisé : comportement inchangé (point vert, bouton Tester).
- Contexte : un pooler a eu ses notifications OS coupées sans s'en rendre compte, avec aucun feedback visible dans l'app.
- Commit : `d14c3eb`

### 2026-05-18 (suite 3)

**[Fix] — Pool séries : contrainte UNIQUE sur `playoff_pool_rosters` bloquait les réactivations** (`supabase_migrations/drop_unique_playoff_pool_rosters.sql`) :
- La contrainte `UNIQUE(pool_season_id, pooler_id, player_id)` empêchait de réactiver un joueur déjà présent dans la saison (multi-période).
- Supprimée en prod et staging. Remplacée par un index non-unique de performance.
- Migration documentée dans `supabase_migrations/drop_unique_playoff_pool_rosters.sql`. Commit : `38c56a3`

**[Refactor] — Pool séries : suppression limite et compteur remplacements élimination** (`GestionSeriesManager.tsx`, `playoff-pool-actions.ts`) :
- Avec changements volontaires illimités, la limite séparée pour les remplacements d'élimination n'avait plus de sens.
- Retiré : check de limite côté serveur, compteur "Remplacements élim." côté client, `cartElim`, `remainingElim`.
- Conservé : validation que le joueur marqué "élimination" est bien sur une équipe éliminée.
- `isTrulyLocked = false` — l'alignement n'est plus jamais verrouillé pendant la période de test. Commit : `ddea674`

**État du chantier validation 2024-25 (en cours) :**
- Staging prêt : saison 2024-25 active, contrainte UNIQUE supprimée, `/admin/historique` déployé.
- `/admin/historique` validé fonctionnel (changements séries prod confirment la mécanique).
- **Prochaine session** :
  1. Entrer les rosters initiaux 2024-25 via `/admin/rosters` Mode init en staging (8 poolers × ~20 joueurs)
  2. SQL : `UPDATE pooler_rosters SET added_at = '2024-10-01' WHERE pool_season_id = (SELECT id FROM pool_seasons WHERE season = '2024-25') AND added_at > '2024-10-01'`
  3. Entrer les transactions historiques dans `/admin/historique` (fichier Excel chronologique)
  4. Script Python backfill game-logs 2024-25 (gameType=2, season=20242025)
  5. Script de validation : points par pooler via game-logs × scoring config → comparer avec Excel

### 2026-05-18 (suite 2)

**[Feat] — `/admin/historique` : saisie des transactions historiques 2024-25** (`app/app/admin/historique/`, `app/components/Navbar.tsx`) :
- Nouvelle page admin pour saisir les données historiques de la saison 2024-25 en staging, en vue de valider la mécanique game-logs.
- 4 types de transactions : échange même pooler (swap), échange entre poolers (trade symétrique auto), ajout seulement, retrait seulement.
- Roster actuel du pooler chargé dynamiquement (joueurs avec `removed_at IS NULL`) pour le sélecteur "joueur sortant".
- Recherche de joueurs pour l'acquisition. Trade inter-poolers : symétrie automatique (le joueur A envoie = B reçoit, pas de double saisie).
- Journal des 50 dernières transactions en temps réel (badges verts/rouges ajout/retrait).
- Lien dans la navbar admin desktop. Commit : `01cafb1`

**Prérequis staging déjà faits :**
- Contrainte UNIQUE sur `pooler_rosters` absente du staging (pas besoin de la supprimer).
- `pool_season` 2024-25 créée (nhl_cap=88M, cap_multiplier=1.25 → pool_cap=110M, is_active=true en staging temporairement).
- Saison 2025-26 désactivée temporairement dans staging pour saisie.

**Prochaines étapes :**
1. Entrer les rosters initiaux via `/admin/rosters` Mode init en staging, puis SQL `UPDATE added_at = '2024-10-01'`.
2. Entrer les transactions chronologiques via `/admin/historique`.
3. Script Python backfill game-logs 2024-25 (gameType=2, season=20242025).
4. Script de validation : somme game-logs dans fenêtres `added_at→removed_at` × scoring config → comparer avec Excel.

### 2026-05-18 (suite)

**[Feat] — Pool séries : changements volontaires illimités + délai réactivation 3 jours** (`app/app/gestion-series/playoff-pool-actions.ts`, `app/app/gestion-series/GestionSeriesManager.tsx`) :
- Supprimé la limite de changements volontaires post-deadline (côté serveur dans `submitPlayoffPoolChangeAction` et `submitSeriesBatchAction`, côté client dans `canMarkForRemovalEntry`, `canAddPlayer`, `isTrulyLocked`, display).
- Ajouté délai de réactivation de 3 jours : si un joueur a été retiré volontairement, il ne peut pas être remis dans l'alignement avant 3 jours — l'erreur indique la date exacte (ex: "Martin St-Louis ne peut pas être remis dans l'alignement avant le lundi 25 mai."). Admin exempt.
- UI : affiche "Changements : X / illimité" au lieu de "X/N".
- Objectif : tester la mécanique de réactivation avec dates avant de l'appliquer à la saison régulière.
- Commit : `0b6d18a`

### 2026-05-18

**[Chore] — Suppression des writes vers player_stat_snapshots** (`app/app/gestion-series/playoff-pool-actions.ts`, `app/app/admin/series/ChangeLogPanel.tsx`, `app/app/admin/series/series-admin-actions.ts`, `app/app/gestion-effectifs/actions.ts`, `app/app/admin/mouvements/actions.ts`, `app/app/admin/rosters/actions.ts`, `app/app/admin/transactions/actions.ts`, `app/app/admin/config/actions.ts`, `app/lib/snapshot.ts`) :
- Supprimé les writes vers `player_stat_snapshots` dans `submitSingleChangeAction` et `submitSeriesBatchAction` (pool séries).
- Supprimé `recalcPostDeadlineSnapshotsAction`, `recalcDeactivationSnapshotsAction`, `recalcMissingBaselinesAction` (fonctions mortes depuis migration game-logs).
- Supprimé `resetBaselineToDeadlineAction` dans `series-admin-actions.ts` (dead code).
- Retiré le bouton "↺ Corriger données" de `ChangeLogPanel.tsx` — le panel affiche toujours le journal de changements.
- Supprimé `takeSnapshot` et `snap()` dans toutes les batch actions saison régulière (`gestion-effectifs`, `admin/mouvements`, `admin/rosters`, `admin/transactions`).
- Supprimé `seasonEndSyncAction` et le composant `SeasonEndSync.tsx` de la page `/admin/config`.
- Supprimé `lib/snapshot.ts` (plus aucun consommateur).
- **Table `player_stat_snapshots` toujours présente** : `lib/standings.ts` (classement saison régulière) lit encore cette table. Le DROP TABLE attendra la migration game-logs pour la saison régulière (prochaine session avant octobre 2026).
- **Prochaine étape** : nettoyer le code mort (snapshot writes dans batch actions, `recalcPostDeadlineSnapshotsAction`, `recalcDeactivationSnapshotsAction`, bouton "Corriger données" admin), puis supprimer `player_stat_snapshots` en BD.

**[Fix] — Pool séries : périodes pré-deadline ignorées dans calcPlayoffPoints** (`app/app/gestion-series/playoff-pool-actions.ts`) :
- Les snapshots `activation` pris AVANT la `playoff_submission_deadline` (gestion de roster pre-soumission) étaient inclus dans les périodes et le calcul de points — ex: Demidov ajouté+retiré le 8 mai (avant deadline) créait une "période 1" factice du 8 mai au 8 mai.
- Fix : `calcPlayoffPoints` accepte maintenant un paramètre `deadline: Date | null` et ignore les `activation` dont le `taken_at < deadline`. Les `deadline_baseline` (datés exactement à la deadline) sont toujours inclus.

**[Fix] — Standings séries : fallback game-log si endpoint /landing sans entrée playoffs** (`app/lib/nhl-snapshot.ts`, `app/app/gestion-series/playoff-pool-actions.ts`) :
- `fetchPlayerStatsById` retournait `EMPTY_STATS` (0G 0A) quand `/landing` n'avait pas d'entrée `seasonTotals` pour `gameTypeId=3`. Ces zéros masquaient les vraies stats.
- Fix 1 : `fetchPlayerStatsById` retourne maintenant `null` quand aucune entrée playoffs — permet au fallback game-log de `fetchPlayerStatsSafe` de s'activer.
- Fix 2 : Le fetch live des standings utilise maintenant `fetchPlayerStatsSafe` (landing → game-log si null) au lieu de `fetchPlayerStatsById` directement.
- Résultat : Demidov (et tout joueur sans entrée `/landing` playoffs) reçoit ses stats via le game-log NHL.

**[Fix] — Pool séries : activation snapshot manquant si nhlId null côté client** (`app/app/gestion-series/playoff-pool-actions.ts`) :
- Si le client transmet `nhlId: null` pour un ajout (race condition ou player picker sans nhl_id), le `if (a.nhlId)` était sauté silencieusement et aucun snapshot d'activation n'était créé.
- Fix : fallback BD — si `a.nhlId` est null, on relit `players.nhl_id` via l'admin client avant de tenter le snapshot.
- Cause probable pour Demidov : `nhlId` null au moment de la soumission du batch. "Corriger données" a recréé le snapshot manuellement (11 corrections le 15 mai).

**[Fix] — Pool séries : auto-correction annulait les points des joueurs ajoutés à 0** (`app/app/gestion-series/playoff-pool-actions.ts`) :
- **Cause** : l'auto-correction dans `calcPlayoffPoints` ("si `activation=0` et `live_cache≠0` → utiliser live_cache comme baseline") tirait aussi pour les ajouts post-deadline dont les stats étaient **légitimement à 0** au moment de l'ajout. Delta = live_cache − live_cache = 0.
- **Exemple** : Ivan Demidov ajouté à 8h10 (0G 0A en séries), 1G+1A le soir. Le lendemain : 0 pts dans le pool.
- **Fix** : l'auto-correction est maintenant restreinte au type `deadline_baseline` (snapshot pré-deadline potentiellement erroné). Les snaps `activation` (ajouts post-deadline) sont toujours pris tels quels.
- **Dobes non affecté** : ses stats à l'activation n'étaient pas 0 (victoires antérieures) → auto-correction ne tirait pas.

### 2026-05-14

**[Feat] — Pool séries : support multi-période (re-ajout d'un joueur)** (`app/app/gestion-series/playoff-pool-actions.ts`) :
- Re-add : toujours INSERT un nouveau row dans `playoff_pool_rosters` (plus de UPDATE). L'historique des périodes est conservé.
- Snapshots activation/deactivation : INSERT pur (plus de DELETE+INSERT ni UPSERT). Plusieurs paires par joueur possibles.
- Nouvelle fonction `calcPlayoffPoints` : accumule les deltas de toutes les périodes d'un joueur (deadline_baseline→deactivation + activation→deactivation + activation→courant).
- Standings refactorisé : groupement par joueur (toutes périodes), boucle cumulative alignée avec `calcFromSnapshots` de la saison régulière. Auto-correction activation=0 en mémoire dans `calcPlayoffPoints`.
- Compatible saison régulière : même pattern INSERT pur déjà utilisé dans `lib/snapshot.ts`.

**[Fix] — Pool séries : mécanique snapshots post-deadline — série de correctifs** (`app/app/gestion-series/playoff-pool-actions.ts`, `app/lib/nhl-snapshot.ts`, `app/lib/snapshot.ts`) :
- **Cause racine** : `fetchPlayerStatsById ?? EMPTY_STATS` + UPSERT silencieux sans contrainte UNIQUE → snapshots absents ou à 0 si l'API NHL est indisponible lors de l'ajout. `live_cache` (via GitHub Action `playoff_stats.yml`, 6h UTC quotidien) finit par être non-vide pendant que `activation=0` → delta = toutes les stats (gonflé).
- **Fix 1** : `fetchPlayerStatsSafe` — fallback automatique sur game-log si `/landing` échoue. Commit `148a017`
- **Fix 2** : `recalcDeactivationSnapshotsAction` — corrige deactivation=0 pour les retraits post-deadline. `.or()` au lieu de `.in()`. Commits `66c674e`, `f869742`
- **Fix 3** : logique standings — `added_at` dans le select roster, référence post-deadline = `activation` seulement (pas `deadline_baseline`), auto-correction `activation:=live_cache` si activation=0 et live_cache≠0. Commit `de1723c`
- **Fix 4** : joueur actif post-deadline sans activation snapshot → référence=0 en mémoire (pas invisible), DELETE+INSERT remplace UPSERT. Commit `2178cd1`
- **Comportement résiduel** : si API échoue lors d'un ajout, joueur affiche 0pts jusqu'au lendemain 2h ET (GitHub Action crée le `live_cache`, auto-correction s'applique au prochain chargement).
- **Résultat final** : "11 corrections effectuées" après clic sur "↺ Corriger données". Landeskog=1pt, Hall=3pts, Wedgewood=2pts, Makar=0pts (COL éliminé sans stats). Nouveaux joueurs à 0pts correct. Vincent = 20pts. ✓

**Règles à appliquer pour la saison régulière** (priorité haute avant le chantier standings saison) :
1. `player_stat_snapshots` n'a PAS de contrainte UNIQUE — **toujours DELETE+INSERT**, jamais UPSERT avec onConflict. Le UPSERT échoue silencieusement et ne retourne aucune erreur.
2. **`fetchPlayerStatsSafe`** pour tous les snapshots live (activation + deactivation) — fallback automatique sur le game-log si /landing échoue. Déjà en place dans `lib/snapshot.ts`.
3. **`nhl_id` non-null** obligatoire avant tout ajout post-deadline — sans lui, le snapshot est impossible et le bouton de correction ne peut pas aider.
4. **Joueurs post-deadline** : référence = `activation` uniquement (pas `deadline_baseline`). Auto-correction si `activation=0` et `live_cache≠0` → `activation:=live_cache`.
5. **Bouton "Corriger données"** (ou équivalent en saison) : couvre activation, deactivation et baselines manquantes — utile comme filet de sécurité mais ne devrait plus être nécessaire si les points 1-2 sont appliqués.

**[Fix] — Pool séries : recalcDeactivationSnapshotsAction — snapshots de retrait à zéro** (`app/app/gestion-series/playoff-pool-actions.ts`, `app/app/admin/series/ChangeLogPanel.tsx`) :
- **Cause** : `fetchPlayerStatsById ?? EMPTY_STATS` dans `submitSeriesBatchAction` — si l'API NHL est indisponible au moment d'un batch de changements, tous les snapshots (activation ET deactivation) sont créés à 0. Les joueurs retirés perdent leurs points accumulés ; les joueurs ajoutés reçoivent tous leurs points passés en delta.
- **Fix** : nouvelle fonction `recalcDeactivationSnapshotsAction` — recalcule les deactivation snapshots pour tous les retraits post-deadline en utilisant `fetchPlayerStatsAsOfDate(nhlId, 3, removedAt)`. Même approche que pour les activations. Ajoutée au bouton "↺ Corriger données" (aux côtés de `recalcPostDeadlineSnapshotsAction` et `recalcMissingBaselinesAction`).
- **À faire maintenant** : cliquer "↺ Corriger données" dans `/admin/series` pour corriger les snapshots de Vincent (batch du 14 mai à 08h10). Commit : `66c674e`
- **Fix root cause** : nouvelle fonction `fetchPlayerStatsSafe` dans `lib/nhl-snapshot.ts` — tente `fetchPlayerStatsById` (/landing), bascule automatiquement sur `fetchPlayerStatsAsOfDate` (game-log, endpoint différent) si le premier échoue. `lib/snapshot.ts` (saison régulière) et les deux actions de changement séries (`submitPlayoffPoolChangeAction`, `submitSeriesBatchAction`) utilisent maintenant `fetchPlayerStatsSafe` pour tous les snapshots live. La probabilité d'échec simultané des deux endpoints est négligeable. Commit : `TBD`

**[Fix + Leçons] — Pool séries : activation snapshot post-deadline et prévention pour la saison régulière** (`app/app/gestion-series/playoff-pool-actions.ts`) :
- **Bug Dobes (pool séries 2026, laissé tel quel)** : activation snapshot à 0 (API NHL n'avait pas ses stats au moment de l'ajout) → delta = toutes les stats depuis le début du pool, pas depuis son ajout le 11 mai → points en trop. Le bouton "Corriger données" ne pouvait pas corriger : probablement `nhl_id = null` pour ce joueur → les fonctions de correction le skippent silencieusement et retournent `fixed = 0`, faisant croire qu'il n'y a rien à corriger.
- **Fix déployé** : `recalcPostDeadlineSnapshotsAction` utilise désormais `fetchPlayerStatsAsOfDate(nhlId, 3, addedAt)` au lieu de `fetchPlayerStatsById` (stats actuelles). Un recalcul rétroactif doit utiliser la date d'ajout, pas les stats actuelles (un joueur retiré continue d'accumuler des stats après son retrait). Commit : `843ded6`
- **Leçons pour la saison régulière** :
  1. Tout joueur ajouté après la deadline doit avoir `nhl_id` non-null **avant** l'ajout — sans `nhl_id`, le snapshot d'activation est impossible à calculer ou à corriger ultérieurement.
  2. Le bouton de correction retourne `fixed = 0` même quand des joueurs sont skippés à cause d'un `nhl_id` null — ne pas interpréter "0 corrections" comme "tout est correct".
  3. Si un joueur a trop de points (delta depuis le début du pool), vérifier son snapshot `activation` : s'il est à 0 alors que le joueur avait des stats à son arrivée, c'est le bug API. Fix : SQL direct ou s'assurer que `nhl_id` est valide puis re-cliquer "Corriger données".

**[Fix] — Pool séries : snapshots d'activation incorrects (ex. Dobes → 0 victoires)** (`app/gestion-series/playoff-pool-actions.ts`, `app/admin/series/ChangeLogPanel.tsx`) :
- Cause : `fetchPlayerStatsAsOfDate` (game-log endpoint, lent) retournait `EMPTY_STATS` si l'API n'était pas à jour au moment de l'activation → snapshot à 0 → points faussés.
- Fix : activation snapshots utilisent maintenant `fetchPlayerStatsById` (`/landing` seasonTotals, plus fiable). Déactivation et deadline_baselines conservent `fetchPlayerStatsAsOfDate` (filtrage par date intentionnel). Commit : `229ce5e`
- Bouton "Corriger données" appelle maintenant aussi `recalcPostDeadlineSnapshotsAction` en plus de `recalcMissingBaselinesAction`. Commit : `dd47e7a`
- Fix immédiat Dobes : `UPDATE player_stat_snapshots SET goalie_wins = 2 WHERE snapshot_type = 'activation' AND player_id = ... AND pooler_id = ...` à exécuter en SQL.

### 2026-05-11 (suite 12)

**[Feat] — Page /resultats : récap journalier par pooler avec détail joueurs** (`lib/daily-recap.ts`, `app/resultats/page.tsx`, `app/resultats/ResultatsManager.tsx`, `app/page.tsx`, `components/Navbar.tsx`, `components/DailyRecapWidget.tsx`) :
- Nouvelle lib `lib/daily-recap.ts` : logique partagée séries + saison régulière. Types `RecapPlayer`, `RecapPooler`, `DailyRecap` centralisés. Fonctions `fetchPlayoffRecapForDate` (gameType=3, `playoff_pool_rosters`) et `fetchRegularRecapForDate` (gameType=2, `pooler_rosters`). Cache NHL `revalidate: 3600`.
- Page `/resultats?date=YYYY-MM-DD` : navigation ← Veille / Lendemain →, défaut = hier en ET. Affiche les deux pools (séries + saison) si actifs. Clic sur un pooler pour voir le détail de ses joueurs (stat line B/A ou V/P/JB + pts).
- Page d'accueil : lien "Résultats détaillés →" sous le classement séries, à côté de "Classement détaillé →".
- Navbar : lien "Résultats" dans le dropdown "Pool Séries" (desktop + mobile), visible quand un pool séries est actif.
- `DailyRecapWidget.tsx` : re-exporte les types depuis `lib/daily-recap` (plus de duplication).
- **Architecture saison régulière** : `fetchRegularRecapForDate` est prêt — se branchera automatiquement quand `regularSaison` sera actif.
- Commit : `d12b35a`

### 2026-05-11 (suite 11)

**[Feat] — Colonne "HIER" dans classement séries (page d'accueil)** (`app/app/page.tsx`) :
- Remplace la colonne "CE SOIR" (live, peu fiable) par les points gagnés la **veille** par chaque pooler.
- L'en-tête affiche la date courte (ex. "10 MAI") et la colonne disparaît si aucun résultat n'est disponible.
- Suppression de `fetchTodayPlayoffPts` et du widget `DailyRecapWidget` (widget séparé supprimé, données intégrées dans le tableau).
- **À dupliquer pour la saison régulière** (note mémoire enregistrée).
- Commit : `17f8e7d`

**[Fix] — Dobes invisible dans classement : investigation et leçons** :
- Diagnostic final : Dobes n'avait jamais d'entrée dans `playoff_pool_rosters` pour Jérôme (setup initial hors application).
- Le `removal_reason = null` observé venait d'un bug où `isLocked` pouvait être `false` côté client si `saison.submissionDeadline` non chargée. Corrigé par enforcement serveur (commit `d67bc37`).
- Bouton "↺ Corriger données" dans admin/series : corrige les `removal_reason = null` post-deadline ET crée les baselines manquantes en une passe.
- Leçons enregistrées en mémoire pour la saison régulière.

### 2026-05-11 (suite 10)

**[Fix] — Baseline manquante pour joueurs retirés post-deadline** (`playoff-pool-actions.ts`, `ChangeLogPanel.tsx`) :
- Auto-baseline dans standings : check par joueur incluant `removal_reason = voluntary/elimination`. Commit `d30bd67`.
- `recalcMissingBaselinesAction` : corrige aussi les `removal_reason = null` post-deadline puis crée les baselines.
- Bouton "↺ Corriger données" dans `ChangeLogPanel` (remplace les anciens boutons Recalculer snapshots + Baselines manquantes).
- Nettoyage : suppression bouton "Recréer baselines" destructeur dans `SeriesAdminManager`. Commit `d67bc37`.

### 2026-05-11 (suite 9)

**[Chore] — Nettoyage boutons de recalcul admin séries** (`ChangeLogPanel.tsx`, `SeriesAdminManager.tsx`) :
- Suppression des boutons "↺ Recalculer snapshots" et "↺ Baselines manquantes" — devenus inutiles avec les corrections automatiques.
- Suppression du bouton "🔄 Recréer baselines" (opération destructrice, non nécessaire).
- Seul bouton restant : "🔔 Rappel deadline" (visible avant la deadline uniquement).
- Les fonctions d'action sous-jacentes restent dans le code comme outils d'urgence.
- Commit : `TBD`

### 2026-05-11 (suite 8)

**[Fix] — Dobes absent du classement : baseline manquante pour joueurs retirés avant la première visite** (`app/app/gestion-series/playoff-pool-actions.ts`, `app/app/admin/series/ChangeLogPanel.tsx`) :
- **Cause** : l'auto-création des `deadline_baseline` filtrait `is_active = true`. Un joueur retiré post-deadline (ex: Dobes, remplacé par Andersen) avant que quiconque visite `/classement-series` n'avait jamais de baseline → delta impossible à calculer → joueur invisible.
- **Fix standings** : remplacé la logique "tout ou rien" (`!hasBaselines`) par un check **par joueur**. Inclut désormais les joueurs avec `removal_reason = 'voluntary' | 'elimination'` en plus des actifs.
- **Nouvelle action admin** `recalcMissingBaselinesAction` : crée les baselines manquantes pour tous les joueurs actifs et retraits post-deadline.
- **Bouton "↺ Baselines manquantes"** dans `ChangeLogPanel` (panel admin séries) : déclenche la correction sans recharger la page.
- **À faire après déploiement** : cliquer "↺ Baselines manquantes" dans admin/series pour corriger Dobes immédiatement.
- Commit : `TBD`

### 2026-05-11 (suite 7)

**[Fix] — Robustesse batch séries : attaquant manquant après remplacement double** (`app/app/gestion-series/playoff-pool-actions.ts`, `app/app/gestion-series/GestionSeriesManager.tsx`) :
- **Cause probable** : `.maybeSingle()` retourne `{data: null, error: PGRST116}` quand plusieurs lignes historiques existent pour un même joueur dans `playoff_pool_rosters`. Le code tombait dans la branche INSERT au lieu de UPDATE, puis l'insert du snapshot d'activation échouait silencieusement si un snapshot existait déjà, interrompant parfois le batch sans afficher d'erreur.
- **Fix `submitSeriesBatchAction` et `submitPlayoffPoolChangeAction`** : remplacé `.maybeSingle()` par `.limit(1).order('added_at', desc)` pour toujours obtenir la ligne la plus récente même en cas de doublons.
- **Fix snapshots** : remplacé `insert` par `upsert` (avec `onConflict: 'pooler_id,player_id,pool_season_id,snapshot_type'`) pour les snapshots d'activation et de désactivation, évitant les échecs silencieux sur contrainte unique.
- **Fix client** : ajout d'un `try-catch` autour du `submitSeriesBatchAction` dans `handleConfirmBatch` pour afficher les exceptions non capturées au lieu de les avaler silencieusement.
- Commit : `TBD`

**[Fix] — Redirection post-login vers `/`** (`app/app/login/page.tsx`) :
- `router.push('/dashboard')` remplacé par `router.push('/')`.
- Commit : `TBD`

**[Feat] — Récap soirée sur page d'accueil** (`app/app/page.tsx`, `app/components/DailyRecapWidget.tsx`) :
- Nouvelle fonction `fetchYesterdayPlayoffRecap` : récupère la liste des équipes ayant joué la veille (API NHL schedule), puis les game-logs de tous les joueurs actifs du pool sur ces équipes, filtrés à la date d'hier. Calcul des points par pooler.
- Cache Next.js `revalidate: 3600` sur chaque appel NHL → pas d'appel API à chaque page load.
- Nouveau composant client `DailyRecapWidget` : liste des poolers avec points d'hier, clic pour voir le détail des joueurs (buts, aides, victoires gardien).
- Affiché dans la colonne de droite de la page d'accueil, seulement quand des données sont disponibles (`poolers.length > 0`).
- Commit : `TBD`

### 2026-05-11 (suite 6)

**[Feat] — Panier découplé retraits/ajouts + fix snapshots activation + log admin** (`app/app/gestion-series/GestionSeriesManager.tsx`, `app/app/gestion-series/playoff-pool-actions.ts`, `app/app/admin/series/ChangeLogPanel.tsx`, `app/app/admin/series/page.tsx`) :

Plusieurs correctifs et améliorations en un commit :

1. **Panier découplé** : Retraits et ajouts sont maintenant deux listes indépendantes. Clic ↺ → joueur marqué "En sortie" immédiatement sans avoir à choisir un remplaçant en même temps. Le panneau d'ajout est libre (slot + joueur indépendants). Cap projetée = tous les retraits + tous les ajouts validés ensemble à la soumission. Élimine le problème du "1-pour-1 forcé" qui empêchait de croiser les salaires entre positions différentes. Commit : `e0d9f17`.

2. **Fix snapshots d'activation** : `fetchPlayerStatsById` (endpoint `/landing`) remplacé par `fetchPlayerStatsAsOfDate(demain)` (game-log) pour les snapshots d'activation. Plus fiable pour les gardiens, et implémente la règle "effectif demain" — les matchs du jour sont inclus dans la baseline donc ne comptent pas comme nouveaux points.

3. **Action admin `recalcPostDeadlineSnapshotsAction`** : Recalcule les snapshots d'activation pour tous les joueurs ajoutés après la deadline (ex: Andersen de Jérôme dont le snapshot était à zéro). Bouton "↺ Recalculer snapshots" dans l'interface admin séries.

4. **Log des changements admin** : Nouvelle section dans `/admin/series` montrant tous les retraits et ajouts post-deadline par pooler (qui, quoi, quand, type élim/volontaire). Composant `ChangeLogPanel.tsx`.

### 2026-05-11 (suite 5)

**[Feat] — Bouton Modifier sur les items du panier** (`app/app/gestion-series/GestionSeriesManager.tsx`) :
Chaque item du panier a maintenant un bouton "Modifier" en plus de "Retirer". Cliquer "Modifier" retire l'item du panier et réinjecte son contenu dans le formulaire de sélection : joueur sortant pré-rempli, slot correct, type élim./volontaire conservé, et joueur entrant actuel pré-sélectionné. L'utilisateur n'a qu'à choisir un autre joueur et re-ajouter au panier. Commit : `f4a6ca6`.

### 2026-05-11 (suite 4)

**[Feat] — Panier de changements multi-slots (batch cart) pour le pool des séries** (`app/app/gestion-series/GestionSeriesManager.tsx`, `app/app/gestion-series/playoff-pool-actions.ts`) :
Remplace le système "un changement à la fois" par un panier inspiré de `gestion-effectifs`. Les poolers peuvent préparer plusieurs swaps simultanément (élimination + volontaire mélangés), voir l'impact cap projeté en temps réel, puis confirmer en une seule action. Nouveaux mécanismes : `SeriesCartItem[]` (état local), `CapBar` mise à jour pour cap projetée après tout le panier, `SlotRow` affiche "avant → après" pour les slots en attente, budgets élim./volontaire reflètent le panier dans la bannière (ex. "0+2/4"), validation cap côté client avant soumission. Server action `submitSeriesBatchAction` : valide budget combiné + cap projeté + élimination côté serveur, applique tous les changements en boucle avec snapshots. Aligné avec la mécanique de `gestion-effectifs` pour préparer la saison régulière. Commit : `bdd022f`.

### 2026-05-11 (suite 3)

**[Feat] — Joueurs en action adapté au pool actif** (`app/app/page.tsx`) :
Pendant les séries, "Joueurs en action" affichait les joueurs du pool saison régulière, causant confusion (ex. gardien de BUF affiché alors que l'utilisateur pensait voir son gardien CAR du pool séries). Nouvelle fonction `fetchTodaySeriesActivity` qui interroge `playoff_pool_rosters` et filtre par les équipes jouant ce soir. Même logique que le classement : séries actives → pool séries, sinon → pool saison régulière. Commit : `1090d89`.

**[Feat] — Bandeau statut pool séries — 3 états** (`app/app/gestion-series/GestionSeriesManager.tsx`) :
"Alignement verrouillé" était affiché dès la deadline passée, même avec des changements restants. Nouveau `isTrulyLocked` = deadline + tous les budgets épuisés. Trois états : vert "Soumission libre" (avant deadline), orange "Comptabilisation en cours" (deadline passée, changements restants), rouge "Alignement verrouillé" (aucun changement possible). Commit : `d7272d0`.

### 2026-05-11 (suite 2)

**[Fix] — Validation serveur remplacement élimination alignée avec logique client** (`app/app/gestion-series/playoff-pool-actions.ts`) :
La validation serveur ne vérifiait l'élimination que via `playoff_eliminations`, alors que le front-end utilise aussi la logique "hors `playoff_participating_teams`". Un joueur de PHI (absent de la liste participante mais pas dans `playoff_eliminations`) était affiché comme éliminé côté client mais le serveur rejetait le remplacement avec "Ce joueur n'est pas sur une équipe éliminée." Fix : la validation serveur utilise maintenant la même logique duale (OR). Commit : `2bd032b`.

### 2026-05-11 (suite session 2026-05-10)

**[Fix] — Sélecteur pool des séries : changements volontaires après deadline** (`app/app/gestion-series/GestionSeriesManager.tsx`) :
Après la deadline, les poolers avec des changements volontaires restants ne pouvaient pas éditer leurs slots (UI bloquait trop tôt). Root cause : `canEdit` ne tenait pas compte du budget volontaire restant, et `SlotRow` n'autorisait que les slots de joueurs éliminés. Fix : `canVoluntaryEdit` et `canElimEdit` calculés dans le composant principal et passés à `SlotRow` comme props. La logique par slot est maintenant : slot éliminé → `canElimEdit`, slot normal → `canVoluntaryEdit`. Backend déjà correct. Commit : `3b19b83`.

**[Fix] — Équipes hors liste participante traitées comme éliminées + cadenas corrigé** (`app/app/gestion-series/playoff-pool-actions.ts`, `app/app/gestion-series/GestionSeriesManager.tsx`) :
Deux bugs : (1) `teamEliminated` basé uniquement sur `playoff_eliminations` — une équipe retirée de `playoff_participating_teams` sans être ajoutée aux éliminations donnait "Remplacement volontaire" au lieu d'"élimination". Fix : `isEliminated()` considère aussi les équipes absentes de `playoff_participating_teams` (quand la liste est configurée). (2) Le cadenas (🔒) s'affichait sur tous les slots verrouillés même si des changements volontaires restaient. Fix : cadenas conditionnel sur `!canEdit` (logique per-slot). Commit : `a0dbd7d`.

### 2026-05-10

**[Feat] — Colonne "Ce soir" dans le classement séries page d'accueil** (`app/app/page.tsx`) :
Nouvelle colonne orange "CE SOIR" dans le tableau du classement séries — affiche les points accumulés par chaque pooler pour la journée en cours via le game log NHL (gameType=3, filtre sur la date du jour ET). Visible uniquement les jours avec des matchs. Distinct du classement cumulatif (PTS). Commit : `cc33ebc`.

**[Fix] — Points négatifs classement séries** (`app/lib/nhl-snapshot.ts`, `app/lib/snapshot.ts`, `app/app/gestion-series/playoff-pool-actions.ts`, `app/app/gestion-series/actions.ts`) :
`fetchPlayerStatsById` retournait `EMPTY_STATS` (zéros) autant sur échec HTTP que sur stats légitimes à 0 — indiscernable, causait des deltas négatifs (0 − baseline). Fix : retourne `null` sur échec réseau/exception, `EMPTY_STATS` seulement si joueur sans stats. `getPlayoffPoolStandingsAction` ignore les `null` dans `liveMap` au lieu d'y mettre des zéros. `EMPTY_STATS` maintenant exporté. Commits : `0963c1a`.

**[Feat] — Cache classement séries en BD + pipeline live_cache** (`app/app/gestion-series/playoff-pool-actions.ts`, `app/app/page.tsx`, `python_script/import_playoff_stats.py`, `.github/workflows/playoff_stats.yml`, `supabase_migrations/`) :
Architecture uniformisée avec la saison régulière. Nouveau type snapshot `live_cache` dans `player_stat_snapshots` (contrainte CHECK mise à jour). Pipeline Python `import_playoff_stats.py` : fetch stats NHL playoffs pour tous les joueurs actifs du pool, delete+insert des snapshots `live_cache`. GitHub Action `playoff_stats.yml` planifié quotidiennement à 6h UTC (2h ET). `getPlayoffPoolStandingsAction` utilise `live_cache` en priorité (DB) avant l'appel NHL live. Nouvelle table `playoff_pool_standings_cache` : upsert après chaque calcul live, page d'accueil lit depuis le cache via `getPlayoffStandingsCached`. Zéro appel NHL API sur page load. Migrations appliquées staging + prod. Commits : `2bb14a6`, `fb0a2a2`, `0ad821c`, `eee8bea`.

**[Chore] — Retirer bouton Pool Séries redondant** (`app/app/page.tsx`) :
Le bouton "Pool Séries 2026-PO →" dans le header était redondant avec "Classement détaillé →" en bas du tableau. Supprimé. Commit : `2d3b6e3`.

### 2026-05-09

**Staging — mise en place complète** (`python_script/setup_staging.py`, `supabase_migrations/staging_setup.sql`, `start_staging.ps1`, `app/.env.staging.local`) :
Projet Supabase `DB_Hockey_Manager_staging` créé. Script `setup_staging.py` complété et corrigé : copie prod → staging, création des comptes Auth avant la copie des données (fix FK), gestion des accents dans les emails, exclusion de `pool_cap` (colonne générée), vidage de `pool_draft_picks` avant copie (trigger auto-création). Fichier `staging_setup.sql` contient toutes les migrations manquantes par rapport à `schema.sql`. Script `start_staging.ps1` swaps `.env.local` temporairement. Commandes : `python setup_staging.py` pour recharger les données, `.\start_staging.ps1` pour lancer l'app.

**Fix — affichage mobile "Détail par pooler"** (`classement/ClassementTable.tsx`, `classement-series/ClassementSeriesTable.tsx`) :
La section "Détail par pooler" était cachée sur mobile (`hidden sm:block`). Retiré sur les deux pages de classement. Règle : ne jamais mettre `hidden sm:block` sur du contenu principal dans les pages de consultation publique. Commit : `44e4b9e`.

**[Feat] — Cache classement séries en BD** (`app/app/gestion-series/playoff-pool-actions.ts`, `app/app/page.tsx`, `supabase_migrations/playoff_standings_cache.sql`) :
Problème root cause : `getPlayoffPoolStandingsAction` appelait l'API NHL à chaque chargement de page → résultats instables selon le rate limiting. Solution : nouvelle table `playoff_pool_standings_cache` (pool_season_id, pooler_id, total_pts, updated_at). `/classement-series` continue de calculer en live et upsert le cache après chaque calcul. La page d'accueil lit uniquement le cache via `getPlayoffStandingsCached` — aucun appel NHL, résultats stables. Le cache se peuple automatiquement à la première visite de `/classement-series`. Table créée avec RLS + policy SELECT publique. Migration appliquée en staging et prod. Commit : `2bb14a6`.

**[Fix critique] — Points négatifs dans le classement séries** (`app/lib/nhl-snapshot.ts`, `app/lib/snapshot.ts`, `app/app/gestion-series/playoff-pool-actions.ts`, `app/app/gestion-series/actions.ts`) :
Cause racine : `fetchPlayerStatsById` retournait `EMPTY_STATS` (zéros) autant lors d'un échec HTTP/réseau que lorsqu'un joueur n'a pas de stats. Ces deux cas étant indiscernables, si l'API NHL était en rate limit ou timeout, le delta = 0 − baseline = négatif. Aggravé par la page d'accueil qui effectue maintenant deux séries d'appels NHL en parallèle (`getPlayoffPoolStandingsAction` + `fetchTodayPlayoffPts`). Fix : `fetchPlayerStatsById` retourne maintenant `SnapshotStats | null` — `null` sur échec (HTTP error, exception), `EMPTY_STATS` seulement si le joueur n'a pas de stats légitimes. Dans `getPlayoffPoolStandingsAction`, un `null` = ne pas ajouter au `liveMap` → le joueur contribue 0 delta proprement via son snapshot, jamais négatif. Tous les autres callsites (`snapshot.ts`, `actions.ts`, `playoff-pool-actions.ts`) utilisent `?? EMPTY_STATS` comme fallback. `EMPTY_STATS` maintenant exporté. Commit : `0963c1a`.

**[Fix] — Page d'accueil : classement séries en direct + masquer saison régulière** (`app/app/page.tsx`) :
Deux bugs : (1) le calcul des points séries sur la page d'accueil était une version simplifiée incorrecte — les joueurs encore actifs (sans snapshot `deactivation`) donnaient 0 pt. Remplacé par `getPlayoffPoolStandingsAction(id, true)`, la même logique que `/classement-series` qui appelle l'API NHL en temps réel. (2) quand les séries sont actives, le tableau `SummaryTable` de la saison régulière s'affiche toujours — masqué avec `!seriesSaison`. Il reviendra automatiquement lors de la prochaine saison régulière. Commit : `253d099`.

**[Refactor] — Renommage badge "En froid" → "En panne"** (`app/lib/streaks.ts`, `app/components/StreakLegend.tsx`, `app/app/statistiques/StatsTable.tsx`, `app/app/poolers/[id]/PoolerPageTabs.tsx`, `app/app/classement-series/ClassementSeriesTable.tsx`, `app/app/admin/config/ConfigForm.tsx`) :
"En froid" n'est pas une expression valide en français hockey. Remplacé par "En panne" partout : type `BadgeType`, logique `computeIndicator`, labels d'affichage, vérifications `hasCount`, et commentaire admin. Commit : `e3ecda9`.

**[Feat] — Seuils EN FORME et EN CRISE configurables indépendamment** (`app/lib/streaks.ts`, `app/app/admin/config/ConfigForm.tsx`, `app/app/admin/config/actions.ts`, `app/app/statistiques/page.tsx`, `app/app/poolers/[id]/page.tsx`, `supabase_migrations/indicator_streak_forme_crise.sql`) :
EN FORME (2 matchs) et EN CRISE (8 matchs) étaient hardcodés. Ajout de `streakForme` et `streakCrise` dans `IndicatorConfig` avec valeurs par défaut (2 et 8). Nouvelles colonnes `indicator_streak_forme` et `indicator_streak_crise` dans `pool_seasons`. Admin `/admin/config` affiche maintenant 5 champs sur 2 rangées (grid-cols-3). Migration à appliquer manuellement sur staging et prod (fichier `supabase_migrations/indicator_streak_forme_crise.sql`). Commit : `c710311`.

**Fix — baselines séries via game log NHL** (`lib/nhl-snapshot.ts`, `gestion-series/playoff-pool-actions.ts`, `admin/series/series-admin-actions.ts`, `admin/series/SeriesAdminManager.tsx`) :
Double cause racine des points à 0 : (1) contrainte CHECK sur `player_stat_snapshots.snapshot_type` n'incluait pas `deadline_baseline` → auto-création silencieusement ignorée ; (2) la création lazy utilisait les stats courantes au lieu des stats historiques (delta = 0). Fix : ajout de `fetchPlayerStatsAsOfDate(nhlId, gameType, deadline)` qui somme le game log avant la date deadline. La création lazy et le bouton admin utilisent maintenant cette fonction. Bouton "🔄 Recréer baselines" visible dans `/admin/series` une fois la deadline passée. Migration SQL appliquée sur staging et prod pour ajouter `deadline_baseline` au CHECK. 62 baselines recréées sur prod, points confirmés corrects. Commit : `44e4b9e`.

### 2026-05-08

**Roadmap — staging + simulation de saison** :
Discussion sur la validation de la logique métier avant le lancement. Décisions : (1) `setup_staging.py` déjà écrit couvre la mise en place du staging ; (2) le staging seul ne suffit pas pour valider le scoring — l'API NHL ne retourne pas les stats à une date passée ; (3) approche retenue : fonction `snapshotAsOfDate(playerId, date)` qui reconstruit les stats cumulatives à partir du game-log NHL, sans curseur de date global ni table de gamelogs à maintenir. À implémenter en même temps que l'Étape 4 staging. Roadmap mise à jour en mémoire CCE.

**Fix — tri du sélecteur de joueurs dans le pool des séries** (`gestion-series/playoff-pool-actions.ts`) :
Les joueurs étaient triés uniquement par nom de famille (`.order('last_name')` Supabase). Nouveau tri en JavaScript après le `.map()` : 1) équipe alphabétique, 2) salaire décroissant, 3) nom de famille si égalité. Appliqué aux deux fonctions : `getAvailablePlayoffPlayersAction` et `searchPlayoffPoolPlayersAction`. Le tri Supabase a été retiré puisque le salaire n'est disponible qu'après le join. Commit : `d81f3e1`.

**Login — comptes récents avec sélection rapide** (`login/page.tsx`) :
Liste "Comptes récents" au-dessus du formulaire, alimentée par localStorage. Cliquer un compte remplit l'email et donne le focus au mot de passe. ✕ pour retirer un compte. Max 8 comptes, plus récents en premier. Utile pour les tests multi-utilisateurs pendant le développement. Commit : `58368f7`.

**Fix — cap disponible lors d'un remplacement séries** (`gestion-series/GestionSeriesManager.tsx`) :
Le composant `CapBar` ne soustrayait pas le salaire du joueur en cours de retrait — le cap "Disponible" restait gonflé pendant la sélection du remplacement. Fix : `current = total - removingCap` pour refléter le cap réel après retrait. "Après ajout" renommé "Après échange". Commit : `864bdd8`.

**Fix — cache NHL API 24h dans /statistiques** (`statistiques/page.tsx`) :
Les fetches `fetchSkaters` et `fetchGoalies` utilisaient `cache: 'no-store'` — chaque chargement de page déclenchait un appel NHL frais, causant du rate limiting intermittent (0 joueurs affiché). Remplacé par `next: { revalidate: 86400 }` — cache 24h côté Next.js, valable pour saison régulière et séries. Premier chargement après expiration reconstruit en arrière-plan. Commit : `c6607fc`.

**Notifications admin — journal + badge Navbar** (`lib/push.ts`, `layout.tsx`, `components/Navbar.tsx`, `admin/notifications/page.tsx`, `supabase_migrations/notification_log.sql`) :
Chaque appel à `sendPushToAdmins` est maintenant enregistré dans la table `notification_log`. Badge rouge sur le bouton Admin dans la Navbar indique le nombre de non lues. Page `/admin/notifications` liste les 100 dernières notifications (barre bleue = non lue, lien "Voir →" vers la page concernée, bouton "Tout marquer comme lu"). Commit : `5bbf1c8`.

**Fix — rotation clé Supabase service_role** :
Clé legacy `service_role` remplacée par une nouvelle clé `sb_secret_...` (onglet "Publishable and secret API keys" de Supabase). Mise à jour dans Vercel et `.env.local`. Aucun changement de code — `admin.ts` lit toujours `process.env.SUPABASE_SERVICE_ROLE_KEY`.

---

### 2026-05-07

**Fix — encodage mobile Navbar** (`components/Navbar.tsx`) :
Le lien admin mobile "Gestion/Création Pool des séries" affichait littéralement `é` car JSX texte n'interprète pas les escapes Unicode. Fix : envelopper dans `{'...'}` — dans une string JS, `é` est bien interprété. Commit : `d8ef435`.

**Fix — points négatifs dans classement séries** (`admin/series/series-admin-actions.ts`, `admin/series/SeriesAdminManager.tsx`) :
Les scores négatifs indiquaient que les snapshots d'activation avaient capturé les stats de saison régulière (gameType=2) au lieu des séries (gameType=3). Le code `submitPlayoffPoolChangeAction` utilise maintenant correctement `gameType=3` pour les deux snapshots (activation et désactivation). Le bouton "Réinitialiser les snapshots" (correctif ponctuel ajouté lors de la session précédente) a été retiré — il servait à corriger des données corrompues en base, mais était risqué en production (un clic accidentel aurait effacé le scoring accumulé). Commit : `d8ef435` (bug fix code) + `202874b` (suppression bouton).

**Fix — position primaire pour joueurs multi-positions + recrues sans contrat** (`gestion-series/GestionSeriesManager.tsx`, `gestion-series/playoff-pool-actions.ts`, `page.tsx`) :
- `posGroup` corrigé dans le sélecteur séries et la page d'accueil : utilise `split(',')[0]` pour extraire la position primaire avant comparaison. Les joueurs avec des positions composées (`LD,RD`, `C,LW`) étaient classifiés comme attaquants au lieu de leur vraie position.
- `getAvailablePlayoffPlayersAction` : filtre les joueurs sans contrat NHL pour la saison courante (`capNumber !== null`) — les recrues sans contrat (AHL, junior) n'apparaissent plus dans le sélecteur du pool des séries.
- `ClassementTable.tsx` et `PoolerPageTabs.tsx` utilisaient déjà `.includes('D')` — non affectés.
- Commits : `dd25eb6` + `680e620`.

**Notification admin — confirmation d'alignement séries** (`gestion-series/playoff-pool-actions.ts`, `gestion-series/GestionSeriesManager.tsx`) :
Avant la deadline : les picks s'auto-sauvegardent sans notifier l'admin. Quand l'alignement est complet, une bannière bleue apparaît avec un bouton "Confirmer mon alignement" — c'est ce clic unique qui envoie la notification. Après confirmation, bannière verte "✓ Alignement confirmé". Après la deadline : chaque changement (volontaire ou élimination) continue de notifier immédiatement. Nouvelle action `confirmPlayoffAlignmentAction`. Commit : `867bf2d`.

**Transactions — sélecteur de saison** (`transactions/page.tsx`, `transactions/TransactionsClient.tsx`) :
Dropdown en haut à droite de `/transactions` permettant de consulter l'historique par saison. Par défaut : saison régulière active. Changement via URL (`?saison=2025-26`) — rechargement serveur, page partageable. Saison active marquée `(active)` dans la liste. Visible seulement si plusieurs saisons existent. Commit : `3d7f1af`.

**Feuille de route — mise à jour** :
- Chantier A et Chantier I marqués complétés (confirmés via captures d'écran).
- Étape 4 (validation classement) abandonnée — preuve de concept faite par le pool des séries en production, aucun snapshot historique 2025-26 à comparer.
- Étape 3 (transactions historiques) recadrée : utile pour tester l'outil et offrir un historique aux poolers via `/transactions`, pas pour valider le scoring.

**Fix — sélecteur joueurs pool séries + classement masqué avant deadline** (`gestion-series/GestionSeriesManager.tsx`, `classement-series/page.tsx`) :
- Position affichée = premier code seulement (`RW` au lieu de `RW,LV`) + largeur fixe sur le salaire pour éviter l'empilement dans la liste.
- `/classement-series` masqué tant que la deadline n'est pas passée — message informatif avec la date limite. S'affiche automatiquement après.
- Commit : `da7e061`.

**Baseline automatique à la deadline** (`gestion-series/playoff-pool-actions.ts`, `lib/snapshot.ts`) :
- Nouveau type de snapshot `deadline_baseline`. Au premier appel du classement après la deadline, les stats actuelles de chaque joueur actif sont capturées automatiquement comme baseline (opération idempotente, une seule fois en base).
- Points = stats actuelles − baseline deadline (joueurs ajoutés avant la deadline) ou − snapshot d'activation (joueurs ajoutés après). Résultat : le scoring part toujours de zéro à la date limite.
- Même mécanique prévue pour la saison régulière (deadline = date de début de saison).
- Commit : `498bbe5`.

**Mode vue pooler pour l'admin** (`components/Navbar.tsx`) :
- Toggle "Vue pooler" dans le dropdown profil (et menu mobile) — masque le menu Admin et les liens admin dans Pool Séries.
- Bannière ambre visible en haut de la Navbar quand le mode est actif, avec lien direct pour revenir en mode admin.
- Persisté dans `localStorage` — survit aux changements de page.
- Commit : `aa69110`.

**Légende indicateurs de séquence partagée** (`components/StreakLegend.tsx`, `statistiques/StatsTable.tsx`, `poolers/[id]/PoolerPageTabs.tsx`, `classement-series/ClassementSeriesTable.tsx`) :
- Nouveau composant `StreakLegend` : grille 2 colonnes avec emoji, label et explication des seuils (🔥 3+ matchs avec pts, ✅ 2 matchs, 🧊 5+ sans pt, 🚨 8+ sans pt, 📈/📉 tendance sur 5 matchs).
- Intégré sur les 3 pages qui affichent des indicateurs. Un seul fichier à modifier si les seuils changent.
- Commit : `6ec8abb`.

**Classement séries — uniformisation + indicateurs + légende** (`classement-series/ClassementSeriesTable.tsx`, `classement-series/page.tsx`, `gestion-series/playoff-pool-actions.ts`, `statistiques/StatsTable.tsx`) :
- `/classement-series` réécrit pour correspondre exactement au style de `/classement` (saison régulière) : bannière slate-800, tableau synthèse avec B/A/V/DP/BL par pooler, détail expand/collapse par pooler avec couleurs de rang, joueurs groupés par position (Attaquants/Défenseurs/Gardiens) dans un tableau propre, joueurs retirés avec opacité + badge "retiré".
- Indicateurs de séquence (🔥✅🧊🚨📈📉) ajoutés pour les joueurs actifs — fetch game logs séries (gameType=3), batching 5, timeout 6 s.
- `nhlId` ajouté au type `PlayoffPoolStanding.players` et peuplé dans `getPlayoffPoolStandingsAction`.
- Légende des indicateurs ajoutée dans `/statistiques`, sous les filtres.
- Commit : `fbf0ba9`.

---

### 2026-05-06 (suite 2)

**Classement-séries — corrections UX** (`classement-series/ClassementSeriesTable.tsx`, `classement-series/page.tsx`, `gestion-series/playoff-pool-actions.ts`) :
- Cartes pooler expand/collapse ouvertes par défaut; nom cliquable pour toggler (nouveau Client Component `ClassementSeriesTable.tsx`)
- Plus de décimales : `Math.round` au lieu de `.toFixed(1)`
- Joueurs triés : points décroissants, actifs avant retirés à points égaux
- Retraits pré-deadline masqués : `removal_reason = null` → pas affiché (seuls `voluntary` / `elimination` apparaissent comme "retiré")
- Commits : `2a2f251`

**Fix — stats séries vides** (`statistiques/page.tsx`) :
`fetchStreaksForStats` sans timeout pouvait bloquer toute la `Promise.all` sur Vercel et faire croire que l'API NHL revenait vide. Fix : `Promise.race` avec timeout 5 s — si les game logs sont trop lents, la page charge quand même avec les joueurs (sans indicateurs). Commit : `e0822ad`.

**Indicateurs de séquence dans `/statistiques`** — batching game logs (`lib/streaks.ts`, `statistiques/page.tsx`) :
`fetchStreaks` accepte un `batchSize` optionnel. La page `/statistiques` utilise `batchSize=5` (traitement par lots de 5 requêtes game-log) pour éviter le rate-limiting NHL API. Actif dans les deux modes (saison et séries). Commit : `5a2bb51`.

**Navbar — titre et encodage** (`components/Navbar.tsx`) :
- `/gestion-series` renommé "Choix des joueurs" (desktop + mobile)
- Fix encodage `é` → `é` dans le lien admin mobile "Gestion/Création Pool des séries"
- Commit : `e0822ad`

**Notification admin — picks séries** (`gestion-series/playoff-pool-actions.ts`) :
`submitPlayoffPoolChangeAction` envoie maintenant `sendPushToAdmins` quand un pooler (non-admin) modifie ses choix séries. Message inclut le nom du pooler, lien vers `/admin/series`. Fire-and-forget. Commit : `37243ee`.

**Note — notification bug report** : le code `sendPushToAdmins` dans `signaler/actions.ts` est correct. L'admin doit avoir activé les notifications push dans `/compte` sur son appareil pour les recevoir.

---

### 2026-05-06 (suite)

**Fix — badges poolers dans `/statistiques` (mode Séries)** (`statistiques/page.tsx`) :
`fetchPlayoffPicksMap()` lisait encore les anciennes tables `playoff_seasons` et `playoff_rosters` (supprimées). Rebranché sur `pool_seasons` (is_playoff=true) + `series_round_rosters` de la ronde active. Les badges poolers en mode Séries reflètent maintenant correctement les picks du nouveau système. Commit : `954f897`.

**Indicateurs de séquence dans `/statistiques`** (`statistiques/page.tsx`, `statistiques/StatsTable.tsx`) :
Badge emoji (🔥✅🧊🚨📈📉) affiché inline après le nom du joueur, uniquement pour les joueurs dans un pool (pas les 333 joueurs) :
- Mode saison régulière → joueurs `actif` + `reserviste` du pool actif (config seuils depuis `pool_seasons`)
- Mode séries → picks de la ronde active (game-log playoffs)
Fetches en parallèle côté serveur, cache 30 min. Commit : `954f897`.

**Suppression — `transitionToNextRoundAction`** (`gestion-series/actions.ts`) :
Fonction jamais appelée (aucun UI ne l'utilisait) et devenue obsolète avec le nouveau mécanisme du pool des séries (fonctionnement proche de la saison régulière, sans copie d'alignement entre rondes). Supprimée avec son import. Commit : `c401365`.

**État des notifications — résumé** :
- Automatiques : ajout/retrait/changement type joueur (roster admin → pooler), élimination équipe séries (→ poolers impactés), feedback pooler (→ admin), mouvement d'effectifs (→ pooler)
- Manuelle admin : rappel deadline séries (→ tous poolers non-admin, usage à discrétion de l'admin)
- Pooler : toggle global ON/OFF par appareil dans `/compte`
- Intentionnellement absentes pour l'instant : notifications transactions inter-poolers, ouverture/fermeture gestion séries

---

### 2026-05-06

**Fichier de référence — indicateurs de séquence** (`docs/hockey-pool-indicators.md`) :
Nouveau fichier de référence documentant les idées de bonification des indicateurs (badges EN FEU/EN HAUSSE/EN FORME/EN FROID/EN BAISSE/EN CRISE, tendance haussière/baissière, formules, paramètres configurables). Sert de base pour une éventuelle itération future sur `lib/streaks.ts`.

**Brainstorm — réorganisation du menu Admin** :
Proposition de restructuration des items du menu d'administration en 9 catégories ordonnées :
1. Gestion des poolers
2. Gestion initiale des rosters
3. Configuration présaison
4. Assignation des recrues par pooler
5. Gestion d'effectifs — pooler
6. Transactions inter-poolers
7. Configuration des pools (saison et séries)
8. Suivi des activités
9. Boîte de réception

À discuter et implémenter dans `Navbar.tsx` (menu admin) — regroupement et ordre à valider avec l'admin.

**Brainstorm — clarification `/admin/presaison`** :
L'outil de présaison couvre trois étapes séquentielles :
1. **Repêchage des recrues** — ordre inverse du classement précédent.
2. **Ajustements d'alignement** — activations de recrues, libérations pour conformité cap, décisions recrues non protégées (règle 5 ans / ELC expiré). Peut chevaucher l'étape 3.
3. **Repêchage d'agents libres** — ordre inverse du classement précédent, minuteur configurable par tour (si temps expiré : le pooler perd son tour, glisse d'un rang; le prochain choisit, puis on revient à lui).

Les poolers doivent pouvoir suivre le repêchage en temps réel (rafraîchissement navigateur). L'admin contrôle le flux.

Point à valider : les saisons de séries ne doivent pas apparaître dans le menu de présaison.

---

### 2026-05-04 (suite)

**Suivi des activités — suppression de lignes**

Ajout d'un bouton ✕ par ligne dans le suivi admin (`/admin/suivi`), visible au hover. Supprime l'entrée de `roster_change_log` (catégorie Alignement) ou la transaction + ses items (catégorie Transaction). Utile pour nettoyer les entrées de test. Onglet "Séries" retiré des filtres (source de données déjà supprimée). Commit : `fa910af`

Note : le suivi est admin-only — les poolers n'y ont pas accès.

---

**Notification push — équipe éliminée (pool des séries)**

Ajout dans `markTeamEliminatedAction` (`admin/series/series-admin-actions.ts`) : quand l'admin marque une équipe comme éliminée, une notification push est envoyée à chaque pooler ayant un joueur actif de cette équipe. Message : "⚠️ Équipe éliminée — Pool des séries" avec lien vers `/gestion-series`. Les poolers sans abonnement push ou sans joueur impacté sont silencieusement ignorés.

---

**Sélecteur joueur pool des séries — liste + filtres**

Nouveau composant `PlayerPicker` remplace la barre de recherche simple dans `/gestion-series` :
- Charge tous les joueurs des équipes participantes au montage via `getAvailablePlayoffPlayersAction` (filtre sur `playoff_participating_teams`)
- Filtre position Tous/F/D/G (suit le slot actif par défaut, modifiable)
- Filtre équipe (dropdown des équipes participantes)
- Recherche par nom (filtre client-side)
- Liste scrollable avec nom, équipe, position, salaire, badge ÉL.
- Compteur de résultats en pied de liste

Commit : `8d549de`

---

**Validation alignement complet obligatoire**

Trois points de contrôle ajoutés pour s'assurer qu'un alignement incomplet ne compte pas :
- `GestionSeriesManager` : bannière ambre ⚠ visible au pooler quand F/D/G requis non atteints, avec détail par position
- `getPlayoffPoolStandingsAction` : poolers avec alignement incomplet exclus du classement (filtre sur `is_active` + comparaison vs `playoff_max_f/d/g`)
- `SeriesAdminManager` AlignmentsTab : badge ✓ Complet / ⚠ Incomplet par pooler

Commit : `6d065eb`

---

**Rappel deadline — bouton manuel push**

Bouton "🔔 Rappel deadline" dans la barre de résumé de `/admin/series`, visible uniquement quand une deadline est configurée. Envoie un push à tous les poolers (non-admin) avec la date limite et un lien vers `/gestion-series`. Confirmation inline après envoi. Commit : `52ac8a4`

---

**Onglet Équipes — sélection participantes + éliminations par grille**

Nouvelle table `playoff_participating_teams (pool_season_id, team_id)` créée en prod. Onglet "Éliminations" renommé "Équipes", restructuré en deux phases :
- **Phase 1** : grille des 32 équipes regroupées par division, sélection multiple pour désigner les participantes (typiquement 16), bouton Confirmer
- **Phase 2** : grille des équipes participantes uniquement — cliquer bascule le statut éliminée (rouge ✕) / active (vert ✓). Lien "Modifier la sélection" pour revenir à la phase 1.

La notification push lors d'une élimination est conservée. Commit : `62ad4e2`

---

**Corrections config pool des séries**

- `deleteSeasonAction` : autorise la suppression d'une saison playoff active (seules les saisons régulières actives sont protégées). Commit : `78ef408`
- `SeasonsManager` : bouton Supprimer visible pour toute saison playoff (active ou non). Commit : `78ef408`
- `ConfigForm` : ajout du champ "Cap du pool des séries ($)" dans la section Configuration — Séries. Commit : `78ef408`
- Labels "Max F / Max D / Max G" renommés en "Attaquants requis / Défenseurs requis / Gardiens requis" dans ConfigForm, SeriesAdminManager et la page gestion-series — ces valeurs définissent une composition exacte, pas un maximum. Commit : `f9fe01d`

---

**Suppression de l'ancien système de pool des séries**

Fichiers supprimés :
- `app/app/series/` (entier) : `page.tsx`, `PoolerSeriesCard.tsx`, `actions.ts`, `picks/page.tsx`, `picks/PicksManager.tsx`
- `app/app/admin/series/SeriesAdmin.tsx` (composant admin de l'ancien système)

Fichiers modifiés :
- `Navbar.tsx` : liens "Mes choix (ancien)" et "Classement (ancien)" retirés des menus desktop et mobile ; `isActive` du bouton Pool Séries mis à jour
- `admin/suivi/page.tsx` : requête `playoff_rosters` et section "Picks séries" retirées
- `app/page.tsx` : mode Séries (ancien système) retiré ; classement compact du nouveau système (`playoff_pool_rosters`) ajouté directement sur la page d'accueil quand une saison playoff est active ; toggle Saison/Séries supprimé

Le nouveau système (`/gestion-series`, `/classement-series`, `/admin/series`) est le seul actif.

---

**Fix build Vercel — `PlayoffPoolSaison` not defined**

Erreur à la build : `ReferenceError: PlayoffPoolSaison is not defined` sur `/admin/series`.

**Cause :** `app/admin/series/series-admin-actions.ts` est un fichier `'use server'`. Il re-exportait `export type { PlayoffPoolSaison, PlayoffPoolEntry }`. Turbopack génère des proxy runtime pour tous les exports d'un fichier `'use server'`, mais `export type` est effacé par TypeScript — la référence runtime manquait donc au chargement du module.

**Fix :** supprimé le `export type { PlayoffPoolSaison, PlayoffPoolEntry }` (re-export inutile — `SeriesAdminManager.tsx` importe déjà les types directement depuis `playoff-pool-actions.ts`). L'`import type { PlayoffPoolSaison }` est conservé pour l'annotation de type de retour interne.

Fichier modifié : `app/app/admin/series/series-admin-actions.ts`

**Installation code-context-engine (CCE)**

Outil installé via `uv tool install code-context-engine`. `cce init` exécuté : index de 1 981 chunks depuis 223 fichiers, hooks git, MCP server enregistré dans `.mcp.json`, bloc d'instructions ajouté dans `CLAUDE.md`.

---

### 2026-05-04

**Pool des séries — Scoring par ronde**

Migration BD exécutée :
```sql
CREATE TABLE series_round_snapshots (
  id serial PRIMARY KEY,
  round_id integer NOT NULL REFERENCES playoff_rounds(id) ON DELETE CASCADE,
  pooler_id uuid NOT NULL REFERENCES poolers(id),
  player_id integer NOT NULL REFERENCES players(id),
  snapshot_type varchar(5) NOT NULL CHECK (snapshot_type IN ('start', 'end')),
  goals integer NOT NULL DEFAULT 0,
  assists integer NOT NULL DEFAULT 0,
  goalie_wins integer NOT NULL DEFAULT 0,
  goalie_otl integer NOT NULL DEFAULT 0,
  goalie_shutouts integer NOT NULL DEFAULT 0,
  taken_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, pooler_id, player_id, snapshot_type)
);
```

**Mécanique snapshots :**
- Snapshot `start` avec zéros → pour la Ronde 1 (aucun match playoff avant)
- Snapshot `start` avec stats API → pour Rondes 2+ (stats cumulatives avant la ronde)
- Snapshot `end` avec stats API → en fin de ronde (stats cumulatives après)
- Points = (end − start) × valeurs `scoring_config` (`points_playoffs` si défini, sinon `points`)

**Nouveaux outils :**
- Onglet **Scoring** dans `/admin/series` : sélecteur de ronde, boutons snapshot, classement en direct
- Page publique `/classement-series` : classement cumulatif + détail par ronde
- Lien **Classement** dans le menu Pool Séries (visible si saison playoff active)

**Chantier E — Pool des séries : COMPLÉTÉ**
- ✅ Rondes + composition F/D/G + deadline + cap override
- ✅ Équipes actives par ronde (filtre picker)
- ✅ Picks libres avant deadline
- ✅ Changements discrétionnaires post-deadline
- ✅ Remplacements d'urgence (équipe éliminée)
- ✅ Scoring par ronde (snapshots + calcul)
- ✅ Classement cumulatif public
- ⬜ Snapshot automatique au changement post-deadline (optionnel, amélioration future)

Commit : `18eb4f6`

---

### 2026-05-03 (suite 4)

**Brainstorm → feuille de route**

Deux éléments du brainstorm (`docs/brainstorm.md`) intégrés au planning :

**Menu admin** — réordonné et restructuré (fait ce jour, commits `51feae1`, `57c1b5d`, `45c05c6`).

**Chantier 4 — Présaison enrichi** (feuille de route mise à jour dans `memory/roadmap.md`) :
- Flux en 3 étapes : repêchage recrues → ajustements alignements → repêchage agents libres
- Minuteur configurable par tour (AL), avec mécanique saut/glissement si temps expiré
- Vue observateur temps réel pour les poolers
- Ce qui est déjà en place dans `/admin/presaison` : file rotative, ordre drag & drop, décisions ELC, remise LTIR, reset
- Ce qui manque : minuteur, vue observateur, étape recrue structurée, validation conformité
- À planifier après la transition de saison 2025-26 → 2026-27

---

### 2026-05-03 (suite 3)

**Navbar admin — réorganisation et corrections**

- Menu Admin réordonné selon la logique métier : Poolers → Rosters → Présaison → Recrues → Effectifs → Transactions → Procédure MAJ → Configuration → Suivi → Boîte de réception
- Lien "Gestion/Création Pool des séries" déplacé du menu Admin vers le menu **Pool Séries** (visible admin seulement, avec séparateur)
- Fix : saisons `is_playoff = true` exclues du sélecteur de saison dans `/admin/presaison`

Commits : `51feae1`, `57c1b5d`, `45c05c6`

---

### 2026-05-03 (suite 2)

**Pool des séries — équipes actives par ronde**

Nouvelle table `playoff_round_teams (id, round_id, team_id)` — migration exécutée en prod.

Fonctionnement :
- Admin sélectionne les 16 équipes en séries lors de la création de la Ronde 1 (grille de cases à cocher dans `/admin/series`)
- Pour les rondes suivantes, l'admin coche les 8/4/2 équipes restantes
- Le picker de joueurs dans `/gestion-series` ne montre que les joueurs des équipes actives de la ronde courante
- `submitPlayoffChangeAction` rejette l'ajout d'un joueur dont l'équipe n'est pas dans la ronde

Commits : `da625da` (config page), `ca963a0` (équipes par ronde)

**État actuel du Chantier E (Pool des séries) :**
- ✅ Création de rondes (composition F/D/G, deadline, cap override)
- ✅ Équipes actives par ronde (filtre dans le picker)
- ✅ Picks libres avant deadline
- ✅ Changements discrétionnaires post-deadline (compteur)
- ✅ Remplacements d'urgence (équipe éliminée)
- ✅ Séparation saison régulière / séries (deux saisons actives simultanées)
- ✅ Config admin indépendante pour chaque type de pool
- ⬜ Snapshot au changement post-deadline (pour scoring)
- ⬜ Scoring / comptabilisation de ronde (bouton admin)
- ⬜ Page classement séries

---

### 2026-05-03

**Séparation Pool Saison / Pool Séries — saisons actives simultanées**

Correction d'architecture : les pages du Pool Saison retournaient les données de la saison playoff (2026-PO) quand celle-ci était la saison active.

**Cause :** `activateSeasonAction` désactivait toutes les saisons avant d'en activer une, empêchant la coexistence d'une saison régulière et d'une saison séries actives en même temps.

**Correction :**
- `admin/config/actions.ts` — `activateSeasonAction` ne désactive plus que les saisons du **même type** (`is_playoff` identique). Saison régulière et saison séries peuvent maintenant être actives simultanément.
- **16 fichiers Pool Saison** — `.eq('is_playoff', false)` ajouté sur toutes les requêtes `pool_seasons` avec `is_active = true` : pages poolers, joueurs, classement, statistiques, repêchage, calendrier, transactions, gestion-effectifs, et toutes les pages admin correspondantes.
- Les pages Pool Séries (`gestion-series/actions.ts`, `layout.tsx`) filtraient déjà `.eq('is_playoff', true)` — aucun changement requis.

**Note BD :** si la saison 2025-26 régulière a été désactivée lors de l'activation de 2026-PO, il faut la remettre `is_active = true` dans Supabase (table `pool_seasons`).

Commit : `ac96863`

---

### 2026-05-02 (suite 2)

**Pool des series - validation du cap a la soumission**

Clarification de regle : un pooler peut construire une selection qui depasse le cap pendant qu'il magasine ses choix, mais la soumission/sauvegarde doit etre refusee si le cap est depasse.

- Ancien outil `/series/picks` : le joueur n'est plus bloque a l'ajout quand il ferait depasser le cap; le bouton de sauvegarde et la server action refusent encore la selection si le cap est depasse.
- Server action `/series/actions.ts` : recalcul du cap par conference depuis les contrats en BD avant insertion des picks.
- Nouvel outil `/gestion-series` : validation serveur de la composition max de la ronde et du cap effectif avant insertion/remplacement.
- Configuration admin : libelles ajustes pour distinguer le cap de saison series (`pool_seasons.pool_cap`, cap par defaut des rondes) et les overrides par ronde.
- Admin des rondes : la creation d'une ronde 3 pre-remplit maintenant `6F / 4D / 2G`; les autres rondes restent a `3F / 2D / 1G`.

Validation : `npx tsc --noEmit` passe. Le lint global contient encore des erreurs existantes non liees; les fichiers touches hors `gestion-series/actions.ts` passent ESLint cible.

Fichiers modifies : `admin/config/ConfigForm.tsx`, `admin/config/SeasonsManager.tsx`, `admin/series/SeriesAdminManager.tsx`, `gestion-series/actions.ts`, `series/actions.ts`, `series/picks/PicksManager.tsx`.

---

### 2026-05-02 (suite)

**Composition variable par ronde — pool des séries**

Chaque ronde peut maintenant avoir sa propre composition et son propre cap.

| Ronde | Composition | Cap |
|---|---|---|
| 1–2 | 3F / 2D / 1G | Cap saison (défaut) |
| 3 | 6F / 4D / 2G | Cap override (ex : 60 M$) |
| 4 | 3F / 2D / 1G | Cap saison (défaut) |

**Migration BD (déjà exécutée) :**
```sql
ALTER TABLE playoff_rounds
  ADD COLUMN IF NOT EXISTS max_f integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_d integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_g integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cap_per_round numeric;
```

- `cap_per_round` nullable — si null, utilise le cap de la saison (`pool_seasons.pool_cap`)
- Admin : formulaires créer/modifier la ronde incluent maintenant les champs F/D/G et cap override
- Affichage info ronde en mode lecture : `3F / 2D / 1G · Cap : défaut saison`
- Pooler : bandeau de statut affiche `Cap : X $ / Y $` en rouge si dépassé

**NHL_SEASON hardcodé :** noté en mémoire — à rendre configurable avant la saison 2026-27 (lire depuis `pool_seasons.season` dynamiquement).

Fichiers modifiés : `gestion-series/actions.ts`, `GestionSeriesManager.tsx`, `gestion-series/page.tsx`, `SeriesAdminManager.tsx`

---

### 2026-05-02

**Corrections pool des séries — tables et cap**

**Conflit de table résolu :** Le pool des séries existant (`/series`) utilise déjà une table `playoff_rosters` avec son propre schéma (snapshots, picks_locked, etc.). Notre `CREATE TABLE IF NOT EXISTS` avait été silencieusement ignoré. Le nouvel outil `/gestion-series` utilise désormais `series_round_rosters` (nouvelle table distincte).

**Migration BD (à exécuter) :**
```sql
CREATE TABLE IF NOT EXISTS series_round_rosters (
  id serial PRIMARY KEY,
  round_id integer NOT NULL REFERENCES playoff_rounds(id) ON DELETE CASCADE,
  pooler_id uuid NOT NULL REFERENCES poolers(id),
  player_id integer NOT NULL REFERENCES players(id),
  position_slot varchar(1) NOT NULL CHECK (position_slot IN ('F', 'D', 'G')),
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removal_reason varchar(20) CHECK (removal_reason IN ('elimination', 'discretionary')),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (round_id, pooler_id, player_id)
);
ALTER TABLE series_round_rosters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique series_round_rosters" ON series_round_rosters FOR SELECT USING (true);
```

**Cap fixe par ronde pour les saisons séries :** Le formulaire de création de saison affiche maintenant un seul champ "Cap par ronde" (ex : 30 000 000 $) sans facteur multiplicatif ni colonne saison suivante. `createSeasonAction` force `cap_multiplier = 1` pour les saisons playoff. `ConfigForm` affiche une version simplifiée (orange) quand la saison active est de type séries.

**Saison séries distincte :** Le flow correct est de créer une saison `2025-PO` séparée (toggle "Saison de séries" dans le formulaire). Elle apparaît dans la liste avec un badge orange "Séries", sans bouton "Transitionner les rosters" (sans objet pour les séries).

Fichiers modifiés : `gestion-series/actions.ts`, `admin/series/SeriesAdminManager.tsx`, `admin/config/SeasonsManager.tsx`, `admin/config/actions.ts`, `admin/config/ConfigForm.tsx`

---

### 2026-05-01 (suite 3)

**Saison de séries distincte dans /admin/config**

Correction de conception : la saison playoff est maintenant une entrée distincte dans `pool_seasons` plutôt qu'un toggle sur la saison régulière. Les deux coexistent dans la liste, seule l'active est utilisée par les outils.

- Format dédié `YYYY-PO` (ex : `2025-PO`) validé côté serveur et client
- Toggle "Saison de séries" dans le formulaire de création → badge orange **Séries** dans la liste
- Pas de picks auto ni de saisons futures créées pour une saison séries
- Bouton "Transitionner les rosters" masqué pour les saisons séries (sans objet)
- `createSeasonAction` accepte `isPlayoff` en 4e paramètre

Fichiers modifiés : `admin/config/SeasonsManager.tsx`, `admin/config/actions.ts`, `admin/config/page.tsx`

---

### 2026-05-01 (suite 2)

**Toggle d'accès + Pool des séries (Phase 1)**

**Toggle `gestion_effectifs_ouvert`** : l'admin peut désactiver l'outil `/gestion-effectifs` pour les poolers depuis `/admin/config`. L'admin y a toujours accès. Message d'indisponibilité côté pooler.

**Toggle `is_playoff`** : marque une saison comme "séries" dans `/admin/config`. Déclenche les mécaniques spéciales dans l'outil séries.

**Migration BD (déjà exécutée) :**
```sql
ALTER TABLE pool_seasons
  ADD COLUMN IF NOT EXISTS gestion_effectifs_ouvert boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_playoff boolean NOT NULL DEFAULT false;
-- + playoff_rounds, playoff_rosters, playoff_eliminations (avec RLS)
```

**Pool des séries — Phase 1** (`/gestion-series` pooler, `/admin/series` admin) :

Mécaniques :
- Alignement par ronde : 3F / 2D / 1G
- Avant la deadline : modifications libres
- Après la deadline (gel automatique) : N changements discrétionnaires max (configurable par ronde)
- Remplacement d'urgence : joueur sur équipe éliminée remplaçable sans compter dans le budget, même après gel

Admin (`/admin/series`) — 3 onglets :
- **Rondes** : créer, modifier deadline/max changements, activer, transitionner vers la ronde suivante (copie des alignements)
- **Éliminations** : marquer/retirer des équipes éliminées (déclenche les slots d'urgence chez les poolers concernés)
- **Alignements** : vue en lecture seule de tous les alignements pour la ronde active

Fichiers créés :
- `app/app/gestion-series/actions.ts` : toutes les server actions (rondes, rosters, éliminations, search)
- `app/app/gestion-series/GestionSeriesManager.tsx` : composant pooler
- `app/app/gestion-series/page.tsx` : page pooler
- `app/app/admin/series/page.tsx` + `SeriesAdminManager.tsx` : page admin

Navbar : lien `/gestion-series` dans Pool Séries (desktop + mobile) + `/admin/series` dans Admin.

**Phase 2 (plus tard)** : changements discrétionnaires post-deadline avec approbation admin, snapshots d'activation/désactivation par ronde.

---

### 2026-05-01 (suite)

**Gestion d'effectifs — délai de réactivation + budget de signatures**

Deux nouvelles règles métier ajoutées à l'outil `/gestion-effectifs` et `/admin/mouvements` :

**Délai de réactivation** : un pooler ne peut pas réactiver un joueur avant N jours après l'avoir désactivé. L'UI affiche un avertissement et bloque le bouton d'ajout. La server action vérifie aussi côté serveur. L'admin est exempt.

**Budget de signatures** : limite le nombre de signatures d'agents libres par saison. Deux compteurs distincts — budget AL standard et budget LTIR. Les LTIR en excédent de budget LTIR débordent sur le budget AL. Des pastilles colorées affichent l'utilisation courante. Blocage côté UI et côté server action.

**Configuration admin** : les trois paramètres (`delai_reactivation_jours`, `max_signatures_al`, `max_signatures_ltir`) sont désormais configurables dans `/admin/config` via une nouvelle section "Règles de transactions" dans `ConfigForm`. Valeurs par défaut : 7 j, 10 AL, 2 LTIR.

**Migration BD requise (déjà exécutée) :**
```sql
ALTER TABLE pool_seasons
  ADD COLUMN IF NOT EXISTS delai_reactivation_jours integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS max_signatures_al integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_signatures_ltir integer NOT NULL DEFAULT 2;
```

Fichiers modifiés :
- `app/app/gestion-effectifs/actions.ts` : `RosterEntry` + `SaisonInfo` étendus ; `getSigningCountsAction` + `getActiveSaisonAction` mis à jour ; délai et budget validés dans `submitBatchAction`
- `app/app/gestion-effectifs/GestionEffectifsManager.tsx` : props `delaiReactivationJours`, `maxSignaturesAl`, `maxSignaturesLtir` ; pastilles budget ; avertissements délai ; `isAddReady()` bloque si règle violée
- `app/app/gestion-effectifs/page.tsx` : fetch + passage des nouveaux props
- `app/app/admin/mouvements/page.tsx` : idem
- `app/app/admin/config/ConfigForm.tsx` : section "Règles de transactions" + état + handleSubmit mis à jour
- `app/app/admin/config/actions.ts` : `updateCapAction` accepte `opts` avec les 3 nouveaux champs
- `app/app/admin/config/page.tsx` : `select` étendu aux 3 nouvelles colonnes

---

### 2026-05-01

**Gestion d'effectifs — outil multi-actions accessible aux poolers**

Refonte complète de l'outil `/admin/mouvements` :

**Accès poolers** : nouvelle page `/gestion-effectifs` accessible à tous les poolers connectés. Chaque pooler voit et modifie uniquement son propre roster (détection automatique via session). La date effective est fixée côté serveur au moment de la soumission (pas de champ date visible).

**Accès admin** : `/admin/mouvements` utilise désormais le même composant partagé avec `isAdmin=true`. L'admin peut sélectionner n'importe quel pooler et activer un toggle "Forcer une date effective" si nécessaire (rattrapage, entente convenue, etc.).

**Multi-actions (panier)** : l'utilisateur ajoute plusieurs actions une par une (chaque ajout remet le formulaire à zéro). Toutes les actions sont soumises en une seule opération. Les selects de chaque nouvelle action reflètent le roster projeté après les actions déjà en panier (ex. : un actif déplacé en réserviste par la première action disparaît de la liste des actifs pour la suivante).

**Validation en temps réel** :
- Masse salariale projetée (actifs + réservistes, LTIR exclus) vs cap du pool — barre visuelle, blocage si dépassement.
- Composition des actifs 12A / 6D / 2G — affichage coloré, blocage si incorrecte.
- Minimum 2 réservistes — blocage si non respecté.

**Actions disponibles** :
- Poolers : Ajustement (actif ↔ réserviste), Activation recrue, Signature agent libre, Libération.
- Admin uniquement (LTIR non implémenté côté pooler pour l'instant) : LTIR, Retour LTIR, LTIR + Signature.

**Sécurité** : la server action `submitBatchAction` vérifie l'identité de l'utilisateur — un pooler ne peut soumettre que pour son propre roster. Les écritures utilisent `createAdminClient()` (bypass RLS) mais l'autorisation est gérée applicativement.

**Notification push** : si c'est l'admin qui soumet, le pooler est notifié (message adapté selon le nombre d'actions).

Fichiers créés :
- `app/app/gestion-effectifs/actions.ts` : server actions partagées (roster avec `cap_number`, recherche joueurs, batch submit)
- `app/app/gestion-effectifs/GestionEffectifsManager.tsx` : composant principal (panier, projection, validation)
- `app/app/gestion-effectifs/page.tsx` : page pooler

Fichiers modifiés :
- `app/app/admin/mouvements/page.tsx` : utilise désormais `GestionEffectifsManager` avec `isAdmin=true`
- `app/components/Navbar.tsx` : "Gestion d'effectifs" ajouté dans Pool Saison (poolers connectés, desktop + mobile) ; renommé dans le menu Admin

---

### 2026-04-30 (suite 5)

**Nouvel outil admin — Mouvements d'alignement (`/admin/mouvements`)**

Outil parallèle au RosterManager, orienté action plutôt qu'orienté joueur. L'admin choisit d'abord le type de mouvement, puis les joueurs concernés. Chaque soumission est atomique (tous les changements ou aucun), journalisée avec snapshot NHL.

7 types de mouvements (extensibles) :
- **Ajustement d'alignement** : interchanger un actif et un réserviste
- **Activation recrue** : recrue → actif, actif → réserviste
- **Mise sur LTIR** : actif → LTIR (snapshot désactivation)
- **Retour LTIR** : LTIR → actif, actif → réserviste
- **Agent libre + LTIR** : joueur → LTIR + nouveau joueur signé actif
- **Signature agent libre** : nouveau joueur ajouté (actif ou réserviste)
- **Libération** : joueur retiré du roster

Détection automatique de la date effective :
- Si un joueur concerné a déjà joué aujourd'hui → avertissement + date = demain
- Sinon → date = aujourd'hui
- L'admin peut toujours surpasser la date (transactions historiques)

Notifications push supprimées pour les transactions historiques (date ≠ aujourd'hui).

Fichiers créés :
- `app/app/admin/mouvements/page.tsx`
- `app/app/admin/mouvements/MouvementsManager.tsx`
- `app/app/admin/mouvements/actions.ts`

Fichiers modifiés :
- `app/components/Navbar.tsx` : lien "Mouvements" ajouté dans le menu admin (desktop + mobile)

---

### 2026-04-30 (suite 4)

**Indicateurs de séquences chaudes/froides**

Pastille colorée avec le nombre de matchs consécutifs, affichée après le nom du joueur dans l'onglet Alignement de la fiche pooler et dans le classement du pool des séries. Orange = chaud, bleu = froid. Minimum 3 matchs pour afficher.

Logique (séquence consécutive réelle, pas de fenêtre fixe) :
- On remonte le game-log du match le plus récent vers le plus ancien et on compte les matchs consécutifs qui respectent le critère.
- Skaters : chaud si ≥ 1 pt/match consécutif ; froid si 0 pt consécutif
- Gardiens : pts pool = wins × 2 + OTL × 1 + shutouts × 2 ; mêmes seuils
- Tooltip au survol : description de la séquence

Pool saison → game-log gameType=2 (saison régulière). Pool des séries → gameType=3 (playoffs).
Cache 30 min (`revalidate: 1800`). Tous les joueurs d'une page sont fetchés en parallèle.

Fichiers créés :
- `app/lib/streaks.ts` : fetch game-log NHL + calcul chaud/froid

Fichiers modifiés :
- `app/app/poolers/[id]/page.tsx` : calcul streaks (gameType=2) passé à `PoolerPageTabs`
- `app/app/poolers/[id]/PoolerPageTabs.tsx` : prop `streaks`, composant `StreakBadge`, badge dans `PlayerStatsRow`
- `app/app/series/page.tsx` : `nhl_id` ajouté à la query, calcul streaks (gameType=3) passé aux cartes
- `app/app/series/PoolerSeriesCard.tsx` : `nhlId` dans `PlayerLine`, prop `streaks`, badge dans le tableau

---

### 2026-04-30 (suite 3)

**Correctif — PlayerLink non cliquable pour certains joueurs (nhl_id null)**

Symptôme : certains joueurs non cliquables dans la page organisation/contrats d'un pooler, alors qu'ils l'étaient dans la page statistiques.

Cause : `PlayerLink` ne génère un lien que si `nhl_id` est non-null. Dans la page stats, l'ID vient de l'API NHL directement (toujours présent). Dans la page pooler, il vient du champ `players.nhl_id` en base, qui était null pour certains.

Le `backfill_nhl_ids.py` (étape 4 du pipeline) avait deux bugs :
1. La query `player_contracts` n'était pas paginée → seulement les 1000 premières lignes lues, les joueurs plus loin (ex : Granlund, id=3) étaient ignorés même avec un contrat actif.
2. Le scope ne couvrait que les joueurs avec un contrat 2025-26, pas ceux dans un roster pool actif (recrues, LTIR, joueurs libérés récemment).

Corrections :
- Pagination ajoutée sur la query `player_contracts` dans le backfill.
- Le backfill cible maintenant aussi tous les joueurs des `pooler_rosters` actifs.
- 1ère passe (avant fix pagination) : 88 `nhl_id` mis à jour + Granlund corrigé manuellement (8475798).
- 2ème passe (après fix pagination) : 260 `nhl_id` supplémentaires mis à jour — dont Johnston, et la majorité des joueurs NHL actifs dans le pool.
- Total : ~348 joueurs corrigés. Les ~577 restants sans correspondance sont des prospects/AHL sans match NHL cette saison (comportement attendu).

Fichier modifié :
- `python_script/backfill_nhl_ids.py` : pagination + scope élargi aux rostres pool actifs

---

### 2026-04-30 (suite 2)

**Page Équipes — cartes sommaires par pooler**

La page `/poolers` (menu "Équipes") ne montre plus un doublon du classement. Elle affiche une grille de cartes (2 colonnes desktop, 1 mobile), une par pooler, avec :
- Rang + nom + total de points de la saison
- Barre de masse salariale (vert/orange/rouge selon proximité du cap) avec montant utilisé / cap du pool
- Liste compacte des noms de famille des joueurs actifs (triés A → D → G)
- Ligne secondaire : nombre de réservistes, recrues (banque protégée), LTIR (masqués si 0)
- Choix de repêchage non utilisés avec détail par saison (ex : `25-26: R1, R3`)

Clic sur une carte → page organisation du pooler (`/poolers/[id]`).

Fichier modifié :
- `app/app/poolers/page.tsx` : réécriture complète (suppression de `ClassementTable`, nouvelles queries roster + picks, agrégation par pooler, rendu en cartes)

---

### 2026-04-30 (suite)

**Pool des séries — vue mobile réduite + tri par points global**

Deux améliorations sur `/series` (classement du pool des séries) :

1. **Mobile** : le détail des joueurs est masqué par défaut. Cliquer sur la rangée d'un pooler bascule l'affichage (▲/▼). Sur desktop (`sm:`), le détail reste toujours visible.
2. **Tri** : les joueurs sont maintenant triés par points décroissants dans une liste plate, sans groupement par position (F/D/G supprimé) ni par conférence. Un seul classement : qui rapporte le plus de points parmi les sélections du pooler.

Architecture : logique de toggle extraite dans un nouveau composant client `PoolerSeriesCard.tsx` ; `page.tsx` reste un server component pur.

Fichiers créés :
- `app/app/series/PoolerSeriesCard.tsx` : composant client (toggle mobile + tableau trié)

Fichiers modifiés :
- `app/app/series/page.tsx` : `ConfTable` et groupement par position supprimés, remplacé par `<PoolerSeriesCard>`

---

### 2026-04-30

**Correctif sécurité — RLS manquant sur `scoring_config`**

Alerte Supabase reçue : table `scoring_config` publiquement accessible (RLS désactivé).

Cause : la migration `supabase_migrations/scoring_config.sql` avait créé la table sans `ENABLE ROW LEVEL SECURITY`, contrairement au `schema.sql` de référence qui l'incluait.

Diagnostic exécuté dans le SQL Editor :
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```
Résultat : seule `scoring_config` avait `rowsecurity = false`.

Correctif appliqué :
```sql
ALTER TABLE scoring_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique scoring" ON scoring_config FOR SELECT USING (true);
CREATE POLICY "Admin modifie scoring" ON scoring_config FOR ALL
  USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
```

Toutes les autres tables (`feedback`, `player_contracts`, `player_stat_snapshots`, `players`, `playoff_rosters`, `playoff_seasons`, `pool_draft_picks`, `pool_seasons`, `pooler_rosters`, `poolers`, `push_subscriptions`, `roster_change_log`, `roster_changes`, `teams`, `transaction_items`, `transactions`) avaient déjà RLS activé.

**Navigation — Classement fusionné dans Pool Saison**

Le bouton "Classement" séparé dans la navbar est retiré. Son contenu (Saison complète, Hebdomadaire/Mensuel à venir) est intégré dans le dropdown "Pool Saison" avec un séparateur et un titre de section. Lien "Équipes" (`/poolers`) ajouté au même dropdown (il n'était pas accessible directement). Mobile mis à jour en conséquence.

Fichier modifié : `app/components/Navbar.tsx`

---

**Corrections — Fiche joueur, positions, onglets**

- `StatsTable.tsx` : `PlayerLink` ajouté sur les noms d'attaquants et gardiens (utilise `s.id` / `g.id` = `nhlId` NHL)
- `PoolerPageTabs.tsx` + `ClassementTable.tsx` : `positionGroup` corrigé — utilise `includes('D')` au lieu d'égalité stricte, ce qui corrige les joueurs avec position combinée (ex: `LD,RD`) classés à tort comme attaquants (Lane Hutson)
- `PoolerPageTabs.tsx` : onglet **Alignement** déplacé en premier, ouvert par défaut
- `PlayerSlideOver.tsx` : photos de joueurs retirées (droits image NHL/NHLPA)

---

**Chantier I — Fiche joueur slide-over**

Panneau latéral global accessible au clic sur n'importe quel nom de joueur dans l'application. Architecture URL-based : `?joueur={nhlId}` contrôle l'affichage ; fermeture via ×, ESC ou backdrop.

Contenu : stats NHL saison régulière (8 dernières saisons max) — attaquants : MJ/B/A/PTS ; gardiens : MJ/V/BL/MB/%A. Photo de tête via NHL API.

Fichiers créés :
- `app/lib/nhl-player.ts` : server action fetch `api-web.nhle.com/v1/player/{id}/landing` (cache 1h)
- `app/components/PlayerLink.tsx` : bouton client qui ajoute `?joueur={nhlId}` à l'URL
- `app/components/PlayerSlideOver.tsx` : panneau client global

Fichiers modifiés :
- `app/app/layout.tsx` : `<PlayerSlideOver />` dans `<Suspense>` après `<main>`
- `app/lib/standings.ts` : `nhlId` ajouté à `PlayerContrib`
- `app/app/joueurs/page.tsx` + `JoueursTable.tsx` : `nhl_id` dans `PlayerRow` + `PlayerLink` sur les noms (LNH + prospects)
- `app/app/classement/ClassementTable.tsx` : `PlayerLink` sur les noms
- `app/app/poolers/[id]/PoolerPageTabs.tsx` : `PlayerLink` dans l'onglet Alignement
- `app/app/poolers/[id]/page.tsx` : `nhl_id` dans la query + `PlayerLink` dans `RosterTable`

---

**Chantier A — Vue masse salariale / organisation dans `/poolers/[id]`**

Nouveau composant `OrganisationToggle.tsx` (client) : toggle pill "Masse salariale / Organisation" dans l'onglet Organisation de la fiche pooler. Par défaut : vue masse salariale (actifs + réservistes uniquement). Clic sur "Organisation" révèle LTIR + banque de recrues + activation obligatoire. Cap bar et picks toujours visibles dans les deux vues.

Fichiers modifiés :
- `app/app/poolers/[id]/OrganisationToggle.tsx` : nouveau composant client (toggle)
- `app/app/poolers/[id]/page.tsx` : `organisationContent` découpé en `capAndPicksContent` + `masseSalarialeRosters` + `orgCompleteRosters`, passés à `OrganisationToggle`

**Date de transaction dans le TransactionBuilder**

Champ date ajouté au formulaire de soumission de transaction (admin). Pré-rempli avec aujourd'hui, modifiable pour les transactions historiques. Si la date est modifiée, elle écrase le `created_at` (midi UTC du jour sélectionné) plutôt que d'utiliser `NOW()`. Remis à aujourd'hui après chaque soumission réussie.

Fichiers modifiés :
- `app/app/admin/transactions/TransactionBuilder.tsx` : state `transactionDate`, input date dans le résumé, reset post-soumission
- `app/app/admin/transactions/actions.ts` : paramètre `transactionDate?` ajouté à `submitTransactionAction`, injecté dans le payload d'insert si fourni

---

**Analyse brainstorm — Actions self-service des poolers (Chantier 5)**

Chantier 5 reformulé et précisé dans la feuille de route. Portée : échanges, signatures et libérations sont tous self-service avec approbation admin. LTIR reste admin-only jusqu'à ce qu'un système de blessures existe dans l'app. Pour les échanges, flux en deux temps : acceptation du destinataire → approbation admin. Double validation cap. Nouvelles tables : `pooler_requests` + `pooler_request_items`. Dépendances : Chantier H (notifications) + Transition. Complexité haute — positionné post-transition.

---

### 2026-04-29 (session 3)

**Chantier B — snapshots dans `submitTransactionAction` (commit)**
- `app/app/admin/transactions/actions.ts` : intégration complète des snapshots fire-and-forget à chaque changement de statut actif. Le `nhl_id` est maintenant inclus dans les rosters virtuels de validation. Couvre tous les types : `transfer`, `promote`, `sign`, `reactivate`, `release`, `type_change`.

**Type `ballotage` — réclamation sans contrepartie**
- `ActionType` étendu avec `'ballotage'` : même logique que `transfer` joueur (déplacement de roster + snapshots activation/désactivation).
- `TransactionBuilder.tsx` : bouton "Ballotage" orange à côté de "Donner" dans chaque liste de joueurs. Section dédiée dans le résumé de transaction.
- `TransactionsClient.tsx` : nouvel onglet "Ballotage" (fond orange) entre Échanges et Signatures, classification et description propres.

**Menu Admin accessible partout**
- `Navbar.tsx` : dropdown "Admin" avec badge bleu ajouté dans la barre desktop pour les admins. Accès direct aux 9 sous-menus : Transactions, Rosters, Recrues, Pré-saison, Joueurs, Poolers, Configuration, Suivi, Boîte de réception. Menu hamburger mobile étendu de même. Liens admin retirés du dropdown de profil (doublons).

**Tri par points dans le pool des séries**
- `app/app/series/page.tsx` : dans `ConfTable`, les joueurs de chaque groupe (F/D/G) sont maintenant triés par `poolPoints` décroissant — les plus performants apparaissent en premier.

---

### 2026-04-29 (suite)

**Page `/transactions` — onglets par type de mouvement**

Remplacement du split grossier Échanges/Ajustements par 5 onglets avec compteur badge :
- **Tous** — toutes les transactions
- **Échanges** — transactions contenant au moins un item `transfer`
- **Signatures** — transactions `sign`
- **LTIR** — transactions `reactivate` ou `type_change` impliquant ltir
- **Gestion** — le reste (`promote`, `release`, `type_change` autres)

Couleurs par type : bleu (échanges), vert (signatures), ambré (LTIR), gris (gestion). Dans l'onglet Tous, chaque carte est colorée selon son type classifié.

Fichiers modifiés :
- `app/app/transactions/TransactionsClient.tsx` : nouveau composant client avec les onglets, logique de classification et rendu des cartes.
- `app/app/transactions/page.tsx` : simplifié au fetch Supabase uniquement, délègue à `TransactionsClient`.

**Nettoyage `docs/brainstorm.md`**
- Les deux idées (Chantier I — fiche joueur, Chantier J — classement en direct) retirées du brainstorm, déjà intégrées à la feuille de route.

---

### 2026-04-29

**Classement mobile — vue simplifiée**
- `app/app/classement/ClassementTable.tsx` : section "Détail par pooler" masquée sur mobile (`hidden sm:block`). Le `SummaryTable` suffit sur mobile (rang + nom + PTS).
- `app/components/SummaryTable.tsx` : converti en composant client. Toute la ligne du tableau est maintenant cliquable sur mobile (`onClick` → `router.push(/poolers/[id])`). Feedback tactile `active:bg-gray-100`.

**Calendrier LNH — refonte complète (`/calendrier`)**

Remplacement de la vue semaine + calendrier mensuel par deux onglets :

- **Onglet Matchs** (défaut) : vue journée avec navigation ← / Aujourd'hui / →, date picker, affichage de tous les matchs NHL du jour avec badges joueurs actifs. Navigation client-side dans la semaine chargée, URL (`?jour=YYYY-MM-DD`) uniquement aux frontières de semaine. Toggle Saison/Séries si pool des séries actif.
- **Onglet Analyse** : sélecteur d'horizon 2J–7J avec plage de dates affichée, filtre par type (Tous / Actifs / Réservistes / Recrues), grille de tous les joueurs de l'organisation triés par matchs dans l'horizon. Code couleur vert (5+), bleu (3-4), gris (1-2), pâle (0).

Fichiers modifiés :
- `app/app/calendrier/page.tsx` : `?jour=` remplace `?semaine=`, fetch 3 semaines (jour courant + today + today+7). Construit `schedule7` (7 jours depuis aujourd'hui) pour l'onglet Analyse. Fetch `allOrgPlayers` (actifs + réservistes + recrues) ; `myRoster` dérivé côté serveur.
- `app/app/calendrier/CalendrierClient.tsx` : réécriture complète avec les deux onglets.
- `app/app/calendrier/actions.ts` : supprimé (vue calendrier mensuel retirée).

**Idées ajoutées à la feuille de route**
- **Chantier I — Fiche joueur** : panneau slide-over accessible partout dans le site au clic sur un nom de joueur. Stats de carrière via `api-web.nhle.com/v1/player/{nhl_id}/landing`. Dépend de Chantier B (nhl_id intégré).
- **Chantier J — Classement en direct** : section page d'accueil avec revalidation 15 min (`revalidate: 900`), optionnellement `router.refresh()` toutes les 15 min côté client. Dépend de Chantier B.

**Constat — Chantier B déjà complet**
Tout le code du Chantier B est en place depuis une session précédente non documentée. La séquence en cours est donc à l'étape 3 (saisie des transactions historiques).

**Analyse — module transactions et préparation saisie historique**

Problème identifié : `submitTransactionAction` modifie les `pooler_rosters` mais **ne prend aucun snapshot**. Seul `admin/rosters/actions.ts` le fait. Les transactions saisies via `TransactionBuilder` (échanges, signatures, libérations) ne génèrent donc pas de snapshots → calcul de points par période incorrect pour ces mouvements.

Amélioration identifiée pour la page publique `/transactions` : découpage en onglets par type de mouvement au lieu du split grossier Échanges/Ajustements actuel :
- **Échanges** : `transfer` entre poolers (joueurs ou picks)
- **Signatures** : `sign` (agents libres)
- **LTIR** : `reactivate` + `type_change` impliquant ltir
- **Gestion de joueurs** : `promote`, `release`, `type_change` (autres)
- **Ballotage** : futur

**Snapshots dans `submitTransactionAction` — complété**

`app/app/admin/transactions/actions.ts` :
- `nhl_id` ajouté à la query roster et à la query `signPlayerMap`.
- `VEntry` enrichi avec `nhl_id: number | null`.
- `SnapshotTask` type ajouté (playerId, nhlId, poolerId, snapshotType).
- Collecte des tâches pendant la simulation : snapshot `activation` quand un joueur **devient actif**, snapshot `deactivation` quand il **quitte actif**, pour chaque `action_type` (`transfer`, `promote`, `sign`, `reactivate`, `release`, `type_change`).
- Exécution fire-and-forget après l'apply (ne bloque pas la réponse).
- Import de `takeSnapshot` depuis `@/lib/snapshot`.
- Paramètre `season` inutilisé retiré de `validateFinalRoster`.

---

### 2026-04-28 (suite 2)

**Chantier C — Page Calendrier LNH (`/calendrier`)**

Fichiers créés/modifiés :
- `app/app/calendrier/page.tsx` : server component. Fetch parallèle : semaine de navigation + 2 semaines pour l'analyse 7 jours. Calcul `next7Days: Record<teamCode, count>`. Roster actif du pooler connecté.
- `app/app/calendrier/CalendrierClient.tsx` : client component complet.
  - **Vue semaine** (défaut) : navigation prev/next semaine, filtre équipe (liste complète 32 équipes), badges joueurs actifs sur chaque match.
  - **Vue calendrier mensuel** : activée via toggle quand un filtre équipe est sélectionné. Charge la saison complète via server action (`club-schedule-season/{abbrev}/{saison}`). Grille 7 colonnes (lun–dim), score final avec indicateur V/D, heure si à venir, indicateur "En cours". Cellules du pooler connecté surlignées en bleu.
  - **Sélecteur de date** : `<input type="date">` — navigue à la semaine (vue semaine) ou au mois (vue calendrier).
  - **Section analyse** : bloc bleu affiché si roster non vide — une carte par joueur actif avec badge équipe, nom, position, nombre de matchs dans les 7 prochains jours (code couleur vert ≥4, bleu ≥2, gris 0).
- `app/app/calendrier/actions.ts` : server action `fetchTeamSeasonSchedule(abbrev)` → `api-web.nhle.com/v1/club-schedule-season`, cache 5 min.
- `app/components/Navbar.tsx` : lien "Calendrier" ajouté desktop (entre Repêchage et Pool Séries) et mobile (section Autre).

---

### 2026-04-28 (suite)

**Pool des séries — verrouillage des choix après comptabilisation**

Migration SQL exécutée :
```sql
ALTER TABLE playoff_seasons ADD COLUMN IF NOT EXISTS picks_locked BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE playoff_seasons SET picks_locked = TRUE WHERE scoring_start_at IS NOT NULL;
```

Comportement :
- Démarrage comptabilisation (`startScoringAction`) → `picks_locked = true` automatiquement.
- Avancement de ronde (`advanceRoundAction`) → `picks_locked = false` + `scoring_start_at = null` (réouverture auto pour la nouvelle ronde).
- `savePicksAction` : bloque avec message d'erreur si `picks_locked = true`.
- `togglePicksLockAction` : action admin pour basculer le verrou manuellement.
- `PicksManager` : bannière ambre + bouton "Modifier" masqué quand verrouillé.
- `SeriesAdmin` : bouton "Rouvrir les choix" / "Verrouiller les choix" visible dès que la comptabilisation est démarrée.

---

### 2026-04-28

**Suivi de l'activité — lien navbar + filtres**
- `Navbar.tsx` : lien "Suivi de l'activité" ajouté dans le dropdown profil (desktop) et menu hamburger (mobile), admin uniquement, juste sous "Boîte de réception".
- `admin/suivi/SuiviTable.tsx` (nouveau) : composant client avec onglets Tous / Alignement / Transaction / Séries (avec compteurs) et sélecteur de période 7j / 30j / Tout. Défaut : 30 derniers jours, tous types.
- `admin/suivi/page.tsx` : simplifié, délègue l'affichage et le filtrage à `SuiviTable`.

**Bugfix pipeline — FK violation `playoff_rosters` dans `_merge`**
- `import_supabase.py` : ajout de `playoff_rosters` dans `_merge()` avant la suppression du doublon. Évite la violation de contrainte FK quand un doublon est référencé dans le pool des séries.

**Idées traitées depuis brainstorm.md (2026-04-28) :**
- Suivi de l'activité dans le menu → implémenté
- Filtres par type et par date dans le suivi → implémenté

---

### 2026-04-26 (suite 2)

**Statistiques LNH — mode Séries adapté au pool des séries**

En mode "Séries", la colonne indicateur de disponibilité est remplacée par les initiales des poolers participants qui ont sélectionné ce joueur (plusieurs badges possibles, car plusieurs poolers peuvent choisir le même joueur). Le filtre "Disponibles" devient "Libres" (joueurs non sélectionnés par aucun participant). Le badge Recrue est masqué en mode séries. Le mode saison régulière est inchangé.

Fichiers modifiés :
- `app/app/statistiques/page.tsx` : ajout de `fetchPlayoffPicksMap()` — query `playoff_rosters` de la saison playoffs active, retourne `Record<string, string[]>` (nom normalisé → liste de poolers). Appelé uniquement en mode séries.
- `app/app/statistiques/StatsTable.tsx` : nouveau composant `PoolerBadges`, prop optionnel `playoffPicksMap`, logique `isAvailable`/`getPickedBy` adaptée selon le `gameMode`.

**Bug Jérôme — notifications push non reçues**

Subscription confirmée en BD (endpoint FCM valide). Cause probable : paramètres Android bloquant les notifications pour l'app PWA (canal de notification de l'app installée désactivé dans les réglages Android). Étapes suggérées à Jérôme : Paramètres → Applications → Chrome/DB Hockey Manager → Notifications → activer, et retirer l'app de l'optimisation de batterie.

---

### 2026-04-26 (suite)

**Navbar — Boîte de réception admin avec badge**
- `app/app/layout.tsx` : fetch du count de messages `nouveau` pour les admins, passé comme `initialUnreadCount` au Navbar.
- `app/components/Navbar.tsx` : lien "Boîte de réception" ajouté dans le dropdown profil (desktop) et le menu hamburger (mobile), visible uniquement pour les admins. Badge rouge affiche le nombre de messages non lus.

**Boîte de réception — bouton "Copier ce message" par carte**
- `FeedbackAdminView.tsx` : chaque carte a maintenant un bouton qui copie le type, pooler, date et description dans le presse-papier pour faciliter le transfert vers Claude.

**Fix — Suivi de l'activité : soumissions séries manquantes**
- Cause : `playoff_rosters` n'avait pas de colonne `created_at` — la requête retournait vide silencieusement.
- Migration SQL exécutée : `ALTER TABLE playoff_rosters ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`
- `admin/suivi/page.tsx` : requête corrigée (sans FK hint, filtre `created_at not null`). Les soumissions futures apparaîtront correctement dans le fil d'activité.

**Fix — Cache bracket NHL réduit à 5 minutes**
- `series/picks/page.tsx` : `revalidate: 3600` → `revalidate: 300`. Les équipes éliminées sont retirées du sélecteur au plus tard 5 min après la mise à jour de l'API NHL.

**Notification push — soumission retour pooler**
- `app/signaler/actions.ts` : push aux admins quand un pooler soumet un bug, suggestion ou commentaire (nom du pooler + type + 80 premiers caractères).

---

### 2026-04-26

**Boîte de réception — refonte du flux de traitement des retours poolers**

Migration SQL exécutée dans Supabase :
```sql
ALTER TABLE feedback DROP CONSTRAINT feedback_status_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_status_check
  CHECK (status IN ('nouveau', 'traité', 'archivé'));
UPDATE feedback SET status = 'traité' WHERE status IN ('lu', 'résolu');
```

Fichiers supprimés : `docs/retours-bruts.md` et `docs/retours-poolers.md` — remplacés par le flux dans l'app.

`app/app/admin/feedback/actions.ts` (nouveau) :
- `updateFeedbackStatusAction(id, status)` — change le statut d'un message.
- `deleteFeedbackAction(id)` — supprime définitivement un message (avec confirmation UI).

`app/app/admin/feedback/FeedbackAdminView.tsx` (réécrit) :
- 4 onglets : Nouveau / Traité / Archivé / Tous, avec compteur par onglet.
- Boutons par message selon le statut : Marquer traité, Rouvrir, Archiver, Supprimer.
- Export .md et Copier s'appliquent uniquement aux messages visibles (filtre actif).
- Bordure colorée par statut : bleu = nouveau, vert = traité, gris = archivé.

`app/app/admin/feedback/page.tsx` : renommé "Boîte de réception", affiche le sous-titre avec le nombre de nouveaux.

`app/app/admin/page.tsx` : carte renommée "Boîte de réception" + badge rouge avec le nombre de messages nouveaux.

**Workflow documentaire recommandé :**
1. Notification push reçue → ouvrir `/admin/feedback`.
2. Lire et traiter le message (code, note, réponse).
3. Cliquer "Marquer traité".
4. Pour les bugs réglés → documenter dans `SUIVI_PROJET.md`.
5. Périodiquement → archiver les messages traités.

---

### 2026-04-25 (suite 2)

**Bugfix — Activation notifications impossible pour les poolers non-admins**

Symptôme rapporté par Jérôme : `new row violates row-level security policy for table "push_subscriptions"` en tentant d'activer les notifications.

Cause : la table `push_subscriptions` avait été créée avec une policy RLS admin-only. Les poolers ordinaires ne pouvaient pas insérer leur propre abonnement.

Correction dans `app/app/compte/push-actions.ts` : utilisation de `createAdminClient()` dans `subscribePushAction`, `unsubscribePushAction` et `getSubscriptionStatusAction`. L'authentification de l'utilisateur est vérifiée avant chaque opération — le bypass RLS est sûr dans ce contexte serveur.

---

### 2026-04-25 (suite)

**Chantier H — Notifications push + page /admin/suivi**

`app/lib/push.ts` :
- `sendPushToAdmins` corrigé : filtre maintenant par `is_admin = true` (bug : envoyait à tous les abonnés).
- `sendPushToUser(userId, payload)` : nouvelle fonction pour envoyer un push ciblé à un pooler spécifique.
- Refactorisé avec helper interne `sendToSubscriptions` pour éviter la duplication.

`app/app/admin/rosters/actions.ts` :
- `addPlayerAction` → push pooler : "Dupont, Jean ajouté (actif)".
- `removePlayerAction` → push pooler : "Dupont, Jean retiré de votre alignement".
- `changeTypeAction` → push pooler : "Dupont, Jean : actif → LTIR".
- `submitRosterAction` → push synthèse : "L'admin a modifié votre alignement : 2 ajouts, 1 retrait".
- Les push sont fire-and-forget (`.catch(() => {})`) — ne bloquent jamais l'action principale.

`app/app/admin/suivi/page.tsx` (nouveau) :
- Fil d'activité chronologique pour l'admin.
- Trois sources : `roster_change_log` (100 derniers), `transactions` (50 dernières), `playoff_rosters` (100 derniers picks, regroupés par session pooler+ronde+minute).
- Tableau avec colonnes Date / Catégorie (point coloré) / Pooler / Action (badge) / Détail.
- Lien ajouté dans `admin/page.tsx`.

**Notifications pool des séries ajoutées dans `app/app/series/actions.ts` :**
- `advanceRoundAction` → push général à tous : "Ronde X démarrée — soumettez vos nouveaux choix !" + push ciblé aux poolers dont un pick est d'une équipe éliminée : "Action requise — mettez à jour vos choix".
- `startScoringAction` → push général à tous : "La comptabilisation des points de la ronde X est démarrée !".
- `lib/push.ts` : ajout de `sendPushToAll(payload)` pour les envois à tous les abonnés.

**Page `/aide` mise à jour :**
- Guide — Pool des séries : détection automatique des picks éliminés décrite (blocage de sauvegarde), participation optionnelle mentionnée.
- Règlements — Pool des séries : participation optionnelle ajoutée, blocage automatique décrit.
- Guide — Notifications : nouvelle section (activation par appareil, liste des 4 événements couverts).

**Règle métier notée :** La participation au pool des séries est optionnelle — tous les poolers ne participent pas nécessairement. Les notifications séries ciblent uniquement les poolers avec des picks actifs dans la saison playoffs courante.

**Ce qui reste pour Chantier H (phases futures) :**
- Préférences de notification par pooler (opt-out par type).
- Notifications poolers pour ballotage (bloquant, quand ballotage sera codé).
- Canal courriel en complément du push.

---

### 2026-04-25

**Pool des séries — Blocage des picks d'équipes éliminées**

Quand la comptabilisation n'est pas encore démarrée (`scoring_start_at = null`) et qu'une série est terminée, les joueurs des équipes éliminées sont désormais détectés et bloqués.

Comportement :
- Si un pick existant appartient à une équipe éliminée : mode édition forcé à l'ouverture + banner rouge + joueur barré avec badge "Éliminé" dans le panel + bouton Sauvegarder désactivé.
- Validation serveur dans `savePicksAction` : fetch du bracket NHL API, vérification de chaque joueur soumis — si un appartient à une équipe éliminée, la sauvegarde échoue avec message d'erreur.
- Le filtre UI existant (sélecteur de joueurs limité aux équipes actives) reste inchangé.

Fichiers modifiés :
- `app/app/series/picks/page.tsx` : ajout de `scoring_start_at` dans la query + prop `scoringStarted` passée.
- `app/app/series/picks/PicksManager.tsx` : calcul `eliminatedIds`, banner, mise en évidence dans `RosterPanel`, blocage de sauvegarde.
- `app/app/series/actions.ts` : validation côté serveur via bracket NHL.

---

### 2026-04-24 (suite)

**Bugfix — Doublons joueurs lors d'un changement d'équipe (`import_supabase.py`)**

Symptôme : `run_pipeline.py` créait 6 nouveaux enregistrements (ids 2508-2513 : Cam Fowler, Joonas Korpisalo, Jason Dickinson, Connor Ingram, Erik Karlsson, Nate Schmidt) pour des joueurs ayant changé d'équipe, puis `backfill_nhl_ids.py` échouait avec une violation de contrainte UNIQUE sur `nhl_id` (le bon enregistrement avait déjà un `nhl_id`).

Cause racine : le lookup utilisait `nom|équipe` comme clé primaire. Si l'équipe avait changé entre deux imports, aucun match → insertion d'un nouveau record. Le dict `existing_by_name` (par nom seul) était construit mais jamais utilisé.

Corrections apportées dans `python_script/import_supabase.py` :
- **Lookup (prévention)** : ajout d'un 3e fallback via `existing_by_name` quand ni `nom+équipe` ni `nom+null` ne matchent. Si un seul joueur porte ce nom en BD (non-ambigu), on met à jour au lieu d'insérer. La clé est aussi ajoutée à `existing_map` pour que la boucle contrats suive correctement.
- **`deduplicate_players` Cas 3 (nettoyage)** : détecte les paires avec le même nom, équipes différentes, un seul `nhl_id` → le record sans `nhl_id` est le doublon, fusionné dans l'autre. Nettoie les 6 doublons existants au prochain run.
- **`_merge`** : ajout de `roster_change_log` et `player_stat_snapshots` aux tables réassignées lors d'une fusion (évite les références orphelines vers les nouvelles tables).

Les homonymes (ex: deux Sebastian Aho avec deux `nhl_id` distincts) ne sont pas affectés : `len(existing_by_name[key]) > 1` → pas de fallback.

**Documentation maintenance**
- Nouveau fichier `docs/maintenance.md` : ordre des scripts Python, description de chaque étape, procédure SQL, tableau résumé.

---

### 2026-04-24

**Documentation — Règles métier et templates**
- Nouveau fichier `docs/regles-changements-alignement.md` : règles complètes des changements d'alignement (limite horaire, gel post-désactivation, LTIR, ballotage, club école, journalisation, notifications).
- Nouveau dossier `docs/templates/` + `invitation-pool-series.md` : template courriel d'invitation au pool des séries.
- Chantier H (Notifications + Suivi admin) ajouté à la feuille de route.
- Chantier G (Ballotage) enrichi avec les règles de processus et de priorité.

**Supabase — nouvelles tables**
- `player_stat_snapshots` : confirmée déjà existante (créée session précédente).
- `roster_change_log` : créée (player_id, pooler_id, pool_season_id, change_type, old_type, new_type, changed_at, changed_by). RLS activé.

**Chantier B — Classement + points saison (complété)**

Étape 1 — `app/lib/nhl-snapshot.ts` :
- `fetchPlayerStatsById(nhlId, gameType)` via `api-web.nhle.com/v1/player/{id}/landing`.
- Retourne `{ goals, assists, goalie_wins, goalie_otl, goalie_shutouts }` ou zéros si indisponible.

Étape 2 — `app/lib/snapshot.ts` :
- `takeSnapshot({ playerId, nhlId, poolerId, poolSeasonId, snapshotType, takenAt })` : fetch NHL + insert Supabase.
- `takeSeasonEndSnapshots(poolSeasonId)` : snapshot `season_end` pour tous les actifs.

Étape 3 — Journalisation automatique dans `roster_change_log` :
- `detectChangeType(oldType, newType, isRemoval)` : type détecté automatiquement.
- Types supportés : `activation`, `deactivation`, `ajout_reserviste`, `ajout_recrue`, `retrait`, `ltir`, `retour_ltir`, `changement_type`, `signature_agent_libre`.

Étape 4 — `app/app/admin/rosters/actions.ts` :
- Snapshots + journalisation intégrés dans `addPlayerAction`, `removePlayerAction`, `changeTypeAction`, `submitRosterAction`.
- `changed_by = null` (admin); champ prévu pour self-service pooler futur.

Étape 5 — `app/lib/standings.ts` refactorisé :
- Calcul par snapshots : points = Σ(deactivation − activation) par période.
- Période ouverte (joueur encore actif) : stats NHL actuelles − dernier snapshot d'activation.
- Fallback stats brutes si aucun snapshot d'activation (joueurs activés avant le système).
- `app/lib/nhl-stats.ts` : ajout de `fetchNhlSkatersByNhlId()` et `fetchNhlGoaliesByNhlId()` (map par nhl_id). Refactorisé pour éviter la duplication de code.

Étape 6 — `app/app/poolers/[id]/PoolerPageTabs.tsx` :
- Troisième onglet "Historique" ajouté.
- Compteurs agents libres (libres / LTIR) avec limites affichées.
- Tableau chronologique des changements avec badge coloré par type.
- `page.tsx` : query `roster_change_log` ajoutée et passée en props.

Étape 7 — `app/app/admin/config/SeasonEndSync.tsx` :
- Bouton admin avec confirmation, appel `seasonEndSyncAction`, affichage résultat (count + erreurs).
- `seasonEndSyncAction` ajoutée dans `admin/config/actions.ts`.
- Intégré dans `admin/config/page.tsx` (colonne droite, sous ScoringConfig).

**Prochaine étape**
- **AVANT les prochains chantiers** : amélioration pool des séries (voir ci-dessous).
- Étape 3 de la séquence : saisie manuelle des transactions historiques 2025-26 via l'interface existante.
- Valider que les rosters correspondent à la réalité de fin de saison.

**Modification pool des séries à faire en priorité**
Quand la comptabilisation des points d'une ronde n'est pas encore commencée ET qu'une série est terminée, les joueurs des deux équipes éliminées doivent devenir indisponibles pour la ronde en cours. Les poolers ayant déjà sélectionné un de ces joueurs doivent obligatoirement ajuster leur choix.
- Détecter les équipes éliminées via l'API NHL (bracket playoffs).
- Filtrer les joueurs disponibles dans le sélecteur de la ronde active.
- Afficher un avertissement aux poolers concernés et bloquer la sauvegarde si un joueur éliminé est encore dans leur sélection.

### 2026-04-23 (suite)

**Étape 1 — Scoring config (complétée)**
- Table `scoring_config` confirmée existante en Supabase avec 6 stats : goal, assist, goalie_win, goalie_otl, goalie_shutout, gwg.
- UI `ScoringConfig.tsx` et action `updateScoringAction` déjà en place — rien à coder.
- `schema.sql` mis à jour pour documenter la table et ses données initiales.

**Préalable Chantier B — nhl_id sur players**
- Décision : ajouter `nhl_id INTEGER UNIQUE` sur la table `players` pour un matching fiable (vs matching par nom).
- Migration SQL exécutée dans Supabase : `ALTER TABLE players ADD COLUMN IF NOT EXISTS nhl_id INTEGER UNIQUE`.
- `schema.sql` mis à jour.
- Nouveau script `python_script/backfill_nhl_ids.py` : utilise l'API stats NHL (même source que `nhl-stats.ts`) — 2 appels bulk au lieu d'un appel par joueur.
- Résultat du backfill : 639 nhl_id enregistrés, 7 doublons détectés (joueurs échangés) et fusionnés via SQL, 354 sans match (prospects/blessés — se rempliront au premier match LNH).
- `run_pipeline.py` : étape 4 ajoutée (`backfill_nhl_ids.py`, optionnelle — ne bloque pas le pipeline).
- `import_supabase.py` : ajout de la logique `is_available = False` pour les joueurs absents du run courant (rachetés, retraités, salaires retenus).
- `series/picks/page.tsx` : filtre `.eq('is_available', true)` ajouté sur la requête players.

**Prochaine étape — Chantier B (à reprendre)**
- Créer table `player_stat_snapshots` dans Supabase (SQL prêt, non encore exécuté) :
  ```sql
  CREATE TABLE player_stat_snapshots (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    pooler_id UUID NOT NULL REFERENCES poolers(id),
    pool_season_id INTEGER NOT NULL REFERENCES pool_seasons(id),
    snapshot_type VARCHAR(20) NOT NULL CHECK (snapshot_type IN ('activation', 'deactivation', 'season_end')),
    taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    goals INTEGER NOT NULL DEFAULT 0,
    assists INTEGER NOT NULL DEFAULT 0,
    goalie_wins INTEGER NOT NULL DEFAULT 0,
    goalie_otl INTEGER NOT NULL DEFAULT 0,
    goalie_shutouts INTEGER NOT NULL DEFAULT 0
  );
  ALTER TABLE player_stat_snapshots ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "lecture publique snapshots" ON player_stat_snapshots FOR SELECT USING (true);
  CREATE POLICY "admin modifie snapshots" ON player_stat_snapshots FOR ALL
    USING (EXISTS (SELECT 1 FROM poolers WHERE id = auth.uid() AND is_admin = true));
  ```
- Puis : capture de snapshot dans `submitTransactionAction` lors des changements actif/désactivation.
- Puis : mise à jour de `buildStandings()` pour utiliser les deltas snapshot.

### 2026-04-23

- Sécurité : suite à la brèche Vercel du 19 avril 2026, vérification des variables d'environnement locales (`app/.env.local`, `python_script/.env`) — non commitées, donc non exposées via git.
- Sécurité : email Supabase signalant RLS désactivé sur `transactions` et `transaction_items` (tables créées en avril 2026 sans activation du RLS).
- Correction : RLS activé sur les deux tables via SQL Editor Supabase (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
- Les policies de lecture publique et d'écriture admin existaient déjà.
- `schema.sql` mis à jour pour refléter l'état réel (RLS + policies déplacés dans la section sécurité).
- Nouvelle page `/aide` créée avec 3 onglets : Installation PWA (ordinateur, iPhone, Android), Guide d'utilisation (Mon équipe, Pool des séries, Classement, Transactions, Statistiques LNH), Règlements (alignement, cap, recrues, transactions, séries).
- Barre de recherche transversale : recherche sur l'ensemble du contenu de la page, affiche les résultats de tous les onglets avec une étiquette indiquant la section source.
- Lien « Aide & Règlements » ajouté dans le dropdown profil de la Navbar (desktop + mobile).
- Note de maintenance ajoutée dans `CLAUDE.md` : évaluer une mise à jour de `/aide` lors de chaque ajout de fonctionnalité pooler.
- Confirmé : nom de connexion (email) et nom d'affichage dans le classement (`poolers.name`) sont indépendants — déjà en place.
- Confirmé : Pool des séries non bloqué par le Chantier B — utilise les stats NHL API en temps réel.
- Correction pool des séries : filtre `years_remaining > 0` remplacé par `years_remaining == null || years_remaining > 0` — les contrats en fin de saison avec `years_remaining = null` n'étaient plus visibles dans le sélecteur.
- Onglet Alignement dans `/poolers/[id]` : placeholder remplacé par la vraie table MJ/B/A/V/DP/BL/PTS via `buildStandings()`, symétrique avec la vue détail du classement.
- Page `/aide` refaite en 3 onglets (Installation / Guide d'utilisation / Règlements) avec barre de recherche transversale — composant client `AideTabs.tsx`.
- Guide d'utilisation complété : Mon équipe, Pool des séries, Classement, Transactions, Statistiques LNH.
- Règlements : plafond salarial précisé — cap fixé et ajustable par l'admin.
- Idée future notée dans la feuille de route (Chantier A) : indicateurs joueurs dans Organisation et Alignement — joue ce soir, statut blessure, séquence chaude/froide (game-log NHL API, seuil N configurable selon feedback poolers).
- Rotation des clés Supabase non effectuée : projet non affecté par la brèche Vercel confirmé (aucun email reçu).

### 2026-04-01

- Prise de connaissance initiale du projet.
- Verification de la structure generale du depot.
- Constat: pas de depot git detecte a la racine.
- Creation de `SUIVI_PROJET.md` pour centraliser le contexte de travail et le suivi des modifications.
- Rapatriement du contenu utile de `C:\Users\david\OneDrive\Bureau\Projet_Python\PuckPedia_Update\` vers `python_script/`.
- Nouvelle organisation Python:
  - `source/` pour les CSV d'entree
  - `diagnostics/` pour les HTML de debug
  - `teams_offline/` pour les exports par equipe
  - `archive/legacy/` pour les anciens scripts et sorties conserves en reference
- Ajout de `python_script/README.md`, `python_script/requirements.txt` et `python_script/scrape_puckpedia.py`.
- Duplication des scripts vers des noms plus explicites:
  - `scrape_puckpedia.py` pour le scraping
  - `import_supabase.py` pour l'import Supabase
- Deplacement du projet hors de OneDrive vers `C:\Projet_Codex\Hockey_Pool_App`.
- Suppression des anciens scripts Python redondants (`main_BS.py`, `upload_supabase.py`, `archive/legacy/*.py`) dans le nouveau dossier.
- Correction de la logique des doublons dans `python_script/import_supabase.py`:
  - les doublons sont regroupes par joueur PuckPedia quand le lien joueur peut etre retrouve dans `diagnostics/`, ce qui evite de fusionner de vrais homonymes comme les deux Sebastian Aho;
  - on privilegie la ligne de l'equipe actuelle quand elle est connue via l'API NHL;
  - on somme les fragments de contrat quand ils correspondent a une retention salariale et que cela reproduit le `Cap Hit` de la page joueur PuckPedia;
  - on conserve seulement la ligne principale quand les doublons ressemblent plutot a un buyout ou a des lignes non additives.
- Validation locale des cas sensibles:
  - Erik Karlsson -> `11 500 000`
  - Seth Jones -> `9 500 000`
  - Matt Duchene -> `4 500 000`
  - Oliver Ekman-Larsson -> `3 500 000`
  - les deux Sebastian Aho restent distincts.
- Reimport complet vers Supabase execute avec succes depuis `python_script/import_supabase.py`:
  - `1591` joueurs mis a jour;
  - `4824` contrats upserted.

## Prochains sujets possibles

- valider visuellement dans l'application quelques cas de retained salary et de buyout apres le reimport;
- auditer plus finement certains doublons atypiques encore detectes lors de l'import complet;
- gestion admin des échanges de choix de repêchage (modifier `current_owner_id` dans `pool_draft_picks`) — sera couvert par le chantier 3 (transactions).

## Regle de maintenance

Lors de chaque modification importante, ajouter ici:
- la date;
- ce qui a ete change;
- les fichiers principaux touches;
- les decisions prises;
- les points a reprendre plus tard.

### 2026-04-03 (session 2)

- Refonte des regles d'alignement pour correspondre aux contraintes du pool.
- La structure du roster est maintenant:
  - `actif`
  - `reserviste`
  - `recrue` (banque de recrues seulement)
- Les contraintes d'alignement actif sont explicites:
  - `12` attaquants
  - `6` defenseurs
  - `2` gardiens
- La masse salariale compte uniquement les joueurs `actif` et `reserviste`.
- La banque de recrues n'entre pas dans la masse salariale.
- Un joueur recrue peut tout de meme etre place comme `actif` ou `reserviste`; dans ce cas, il compte bien dans la masse salariale.
- Les anciennes entrees `agent_libre` sont normalisees en `reserviste` dans l'affichage et les calculs.
- Fichiers principaux ajustes:
  - `app/app/admin/rosters/RosterManager.tsx`
  - `app/app/poolers/[id]/page.tsx`
  - `app/app/admin/poolers/page.tsx`

### 2026-04-03 (session 3)

Correction des points d'attention identifies lors de l'analyse initiale:

1. **Saison NHL hardcodee** (`python_script/import_supabase.py`):
   - Ajout d'une constante `NHL_SEASON = '20252026'` en haut du fichier.
   - La variable locale `saison = '20242025'` dans `charger_rosters_nhl()` utilise desormais cette constante.
   - Pour la prochaine saison, modifier uniquement `NHL_SEASON`.

2. **Contrainte CHECK `agent_libre`** (`schema.sql`):
   - Le CHECK sur `pooler_rosters.player_type` est corrige: `'agent_libre'` remplace par `'reserviste'`.
   - Une migration SQL commentee est ajoutee dans `schema.sql` (section MIGRATIONS) pour mise a jour de la base existante dans Supabase.
   - A executer manuellement dans le SQL Editor Supabase.

3. **Validation serveur du RosterManager**:
   - Creation de `app/app/admin/rosters/actions.ts` (Server Actions Next.js).
   - Les trois mutations (ajout, retrait, changement de type) passent desormais par le serveur.
   - Les regles metier (limite recrue, limites positionnelles 12F/6D/2G) sont verifiees cote serveur avant ecriture en base.
   - Le RosterManager conserve la validation cote client pour le feedback immediat (UX), mais le serveur est l'arbitre final.

4. **Error Boundary**:
   - Creation de `app/components/ErrorBoundary.tsx` (composant de classe React).
   - Applique sur `app/app/admin/rosters/page.tsx` autour du `RosterManager`.

5. **Fichiers morts supprimes**:
   - `app/app/admin/joueurs/PlayerActions.tsx` (non importe nulle part depuis la desactivation des routes manuelles).
   - `app/app/admin/joueurs/PlayerForm.tsx` (idem).
   - Les routes `/admin/joueurs/nouveau` et `/admin/joueurs/[id]` redirigent toujours vers `/admin/joueurs` et sont conservees comme filets de securite.

### 2026-04-03 (session 4)

Bug: contrainte CHECK en base (`pooler_rosters_player_type_check`) pas encore migree dans Supabase.
- La migration SQL est documentee dans `schema.sql` (section MIGRATIONS).
- A executer manuellement dans le SQL Editor Supabase.
- En attendant, les inserts de type `reserviste` echouent (l'ancienne contrainte avait `agent_libre` a la place).

Nouvelle page `/admin/recrues`:
- Creation de `app/app/admin/recrues/page.tsx` et `BanqueRecruesManager.tsx`.
- Interface dediee a la gestion de la banque de recrues, separee de la gestion des alignements.
- Affiche les recrues (`is_rookie = true`) disponibles, permet d'assigner/retirer par pooler.
- Reutilise les Server Actions `addPlayerAction` et `removePlayerAction` depuis `../rosters/actions`.
- Lien ajoute dans le panneau admin (`/admin/page.tsx`), grille passee a 4 colonnes.

### 2026-04-03 (session 5)

Deux types de recrues eligibles a la banque de recrues:
1. **Repêchés (proteges)**: eligibles 5 saisons a partir de l'annee de repechage, meme sans contrat PuckPedia.
2. **ELC agent libre**: eligibles uniquement pendant leur ELC, pas proteges.
PuckPedia a priorite sur les donnees du repechage (contrat, equipe, position). L'annee de repechage est preservee.

Changements schema (`schema.sql` + migration Supabase a executer):
- `players.draft_year INTEGER`
- `players.draft_round INTEGER`
- `players.draft_overall INTEGER`

Nouveau script `python_script/import_drafts.py`:
- Fetch les repechages des 5 dernieres annees depuis `records.nhl.com/site/api/draft`.
- Fenetre calculee dynamiquement selon la saison courante.
- Pour un joueur deja en base: ajoute `draft_year/round/overall` + `is_rookie=True` si pas encore renseigne.
- Pour un joueur absent de PuckPedia: cree un enregistrement minimal (nom, position, equipe, draft info).
- A executer APRES `import_supabase.py` pour que PuckPedia ait la priorite.

Mise a jour `python_script/import_supabase.py`:
- `existing_map` stocke maintenant `{id, draft_year}` au lieu du seul `id`.
- Logique `is_rookie`: `status == 'ELC'` OU `draft_year` deja present en base.
- PuckPedia ne peut plus ecraser `is_rookie=True` d'un repêché n'ayant plus de statut ELC.

### 2026-04-05 (session 6)

Corrections UI suite aux ajustements de la banque de recrues:

1. **`/joueurs` — JoueursTable.tsx**:
   - Les joueurs sans contrat (`player_contracts` vide) et `is_rookie=true` sont exclus du tableau principal.
   - Une section accordion "Prospects repêchés sans contrat" est ajoutée en bas de page.
   - Cette section affiche: nom, equipe, position, annee de repechage, ronde, rang global.
   - Tri: annee DESC, ronde ASC, rang ASC.
   - La recherche par nom s'applique aussi aux prospects.
   - Type `PlayerRow` enrichi avec `draft_year`, `draft_round`, `draft_overall`.

2. **`/admin/recrues` — BanqueRecruesManager.tsx**:
   - Filtre par equipe ajouté (comme le RosterManager).
   - Tri des recrues disponibles: annee de repechage DESC, ronde ASC, rang ASC.
   - Affichage de l'annee de repechage (`2024 R1 #3`) dans la liste disponible et dans la banque.
   - Banque triée selon le même ordre.
   - Requête `fetchBank` enrichie pour inclure `draft_year, draft_round, draft_overall`.
   - Requête page.tsx: suppression du `.order('last_name')` remplacé par le tri côté client.

### 2026-04-06 (session 7)

Infos de repêchage dans les vues d'alignement:
- `poolers/[id]/page.tsx`: requête enrichie (`draft_year/round/overall`); `RosterTable` accepte `showDraft`; la banque de recrues affiche colonne "Rep." au lieu de "Cap".
- `admin/rosters/RosterManager.tsx`: types enrichis, requête fetch mise à jour, `draftLabel` affiché en vert pour les recrues dans l'alignement.
- `admin/rosters/page.tsx`: sélection `draft_year/round/overall` ajoutée dans la requête joueurs.

Nouvelle page `/repechage` (publique):
- Fichiers: `app/app/repechage/page.tsx` + `RepechageTable.tsx`.
- Données: tous les joueurs avec `draft_year` en base, croisées avec les banques de recrues actives.
- Affichage groupé par année (DESC) puis ronde (ASC), trié par rang dans la ronde.
- Badge pooler en vert si protégé, "Non protégé" sinon.
- Filtres: année, ronde, protégé/non-protégé, recherche texte.
- Lien "Repêchage" ajouté dans la Navbar (entre Joueurs LNH et Poolers).

### 2026-04-12 (session 9)

Chantier 2 — Création et gestion des saisons:
- `/admin/config` restructuré: liste de toutes les saisons à gauche, formulaire cap à droite.
- Nouveau composant `SeasonsManager.tsx`: créer une saison, voir toutes les saisons, activer une saison.
- `createSeasonAction`: crée la saison demandée + les 2 suivantes comme placeholders (même cap estimé, inactives).
- Les picks de repêchage (4 rondes × N poolers) sont générés pour les 3 saisons à la création.
- `activateSeasonAction`: désactive toutes les saisons, active la cible.
- `poolers/[id]`: picks groupés par saison, badge "Active" sur la saison courante; les picks des saisons futures sont visibles dès maintenant (échangeables avant la saison).
- Migration SQL ajoutée dans `schema.sql` (section MIGRATIONS): `draft_pick_id` sur `pooler_rosters`.

Ordre d'execution recommande du pipeline complet:
1. `scrape_puckpedia.py`
2. `import_supabase.py`
3. `import_drafts.py`

### 2026-04-13 (session 10)

Mise en place du versionnement Git et de la sauvegarde distante:
- Creation d'un depot Git local a la racine de `C:\Projet_Codex\Hockey_Pool_App`.
- Ajout d'un `.gitignore` racine pour exclure notamment:
  - `app/node_modules/`
  - `app/.next/`
  - `app/.env*`
  - `python_script/venv/`
  - `python_script/.env*`
  - `python_script/diagnostics/`
- Configuration d'un remote GitHub:
  - `origin = git@github.com:boucherdavid/DB_Hockey_Manager.git`
- Generation d'une cle SSH locale sans mot de passe pour GitHub:
  - `C:\Users\david\.ssh\id_ed25519`
  - remote Git bascule de HTTPS vers SSH
- Premier commit cree localement:
  - `8ce2b56` - `Initial commit`
- Branche par defaut renommee en `main`.
- Push force effectue vers le depot GitHub pour aligner le remote avec l'etat local courant.

Impact:
- le projet est maintenant historise localement avec Git;
- le code est sauvegarde sur GitHub;
- les prochains `git push` peuvent se faire via SSH sans repasser par l'authentification HTTPS.

Configuration locale GitHub completee:
- `GitHub CLI (gh)` installe sur la machine.
- Authentification `gh` validee avec le compte `boucherdavid`.
- Protocole Git confirme en `ssh`.
- L'environnement local permet maintenant:
  - `git push` via SSH;
  - usage de `gh` pour consulter le repo, les PR, les issues et les workflows.

### 2026-04-13 (session 11)

Mise a jour du suivi pour refleter l'etat reel du code dans `app/`:

Chantier 3 - Transactions admin et historique public:
- Nouvelle page admin `app/app/admin/transactions/page.tsx`.
- Nouveau composant `app/app/admin/transactions/TransactionBuilder.tsx`.
- Nouvelles Server Actions `app/app/admin/transactions/actions.ts`.
- Nouvelle page publique `app/app/transactions/page.tsx`.
- Lien `Transactions` visible dans la Navbar publique.

Fonctionnellement, le module transactions permet maintenant:
- d'effectuer des echanges de joueurs entre deux poolers;
- d'effectuer des transferts de choix de repechage;
- de promouvoir une recrue vers `actif` ou `reserviste`;
- de reactiver un joueur `ltir`;
- de signer un agent libre;
- de liberer un joueur;
- de changer le type d'un joueur dans le roster.

Validation cote serveur du builder de transactions:
- reconstitution d'un roster virtuel par pooler avant application;
- validation des limites `12F / 6D / 2G`;
- validation du minimum de `2` reservistes;
- validation de la masse salariale par rapport au `pool_cap`;
- verification de la possession des picks avant transfert;
- persistance de la transaction dans `transactions` et `transaction_items`.

Historique public des transactions:
- affichage des transactions de la saison active;
- separation entre:
  - `Echanges`
  - `Ajustements`

Extension du chantier saisons:
- `app/app/admin/config/actions.ts` contient maintenant des actions supplementaires de transition de saison:
  - `previewTransitionAction`
  - `transitionSeasonAction`
  - `deleteSeasonAction`
- `app/app/admin/config/SeasonsManager.tsx` permet maintenant:
  - de previsualiser la copie des rosters de la saison active vers une saison future;
  - d'identifier les joueurs sans contrat dans la saison cible;
  - de confirmer la transition;
  - de supprimer une saison non active.

Note de suivi:
- ces fonctionnalites etaient deja presentes dans le code mais n'etaient pas encore documentees dans `SUIVI_PROJET.md`;
- le suivi est maintenant aligne avec l'etat applicatif observe localement.

### 2026-04-09 (session 8)

Toutes les migrations SQL en attente exécutées dans Supabase:
- `players`: colonnes `draft_year`, `draft_round`, `draft_overall` ajoutées.
- `pooler_rosters`: contrainte CHECK mise à jour pour inclure `actif`, `reserviste`, `recrue`, `ltir`.
- `player_contracts`: colonne `is_elc BOOLEAN NOT NULL DEFAULT false` ajoutée.
- `pooler_rosters`: colonnes `rookie_type` et `pool_draft_year` ajoutées.
- `pool_seasons`: colonne `cap_multiplier DECIMAL(5,4) DEFAULT 1.24` ajoutée; `pool_cap` recréé comme colonne générée `CEIL(nhl_cap * cap_multiplier / 1000000) * 1000000`; `nhl_cap` de la saison 2025-26 corrigé à `95 500 000`.

Nouvelle table `pool_draft_picks` (choix de repêchage échangeables):
- Colonnes: `pool_season_id`, `original_owner_id`, `current_owner_id`, `round` (1-4), `is_used`.
- FK avec `ON DELETE SET NULL` sur les deux colonnes pooler (pas de blocage si pooler retiré).
- Contrainte UNIQUE `(pool_season_id, original_owner_id, round)`.
- RLS activé: lecture publique, écriture admin seulement.
- Trigger `trigger_picks_on_new_pooler`: tout nouveau pooler reçoit automatiquement 4 choix pour chaque saison active.
- Seed exécuté pour les poolers existants (4 rondes × N poolers).
- Affichage dans `/poolers/[id]`: section "Choix de repêchage" avec badge par ronde; affiche "Propre" ou "De: [nom]" si choix reçu en échange.

Refonte du RosterManager en mode "brouillon + soumission":
- Les ajouts, retraits et changements de type modifient uniquement le state local (aucune écriture BD).
- Nouveaux joueurs non soumis marqués d'une bordure bleue.
- Bouton "Soumettre" envoie le diff complet à `submitRosterAction` (Server Action).
- `submitRosterAction` reconstitue l'état final, valide toutes les règles (min 2 réservistes, limites 12F/6D/2G), puis applique en BD.
- Bouton "Annuler" remet le state à l'état BD.
- Changement de pooler avec modifications en cours demande confirmation.
- Règle minimum 2 réservistes : visible dans le widget de conformité, bloquante uniquement à la soumission.

Toutes les migrations SQL en attente exécutées dans Supabase:
- `players`: colonnes `draft_year`, `draft_round`, `draft_overall` ajoutées.
- `pooler_rosters`: contrainte CHECK mise à jour pour inclure `actif`, `reserviste`, `recrue`, `ltir`.
- `player_contracts`: colonne `is_elc BOOLEAN NOT NULL DEFAULT false` ajoutée.
- `pooler_rosters`: colonnes `rookie_type` et `pool_draft_year` ajoutées.
- `pool_seasons`: colonne `cap_multiplier DECIMAL(5,4) DEFAULT 1.24` ajoutée; `pool_cap` recréé comme colonne générée `CEIL(nhl_cap * cap_multiplier / 1000000) * 1000000`; `nhl_cap` de la saison 2025-26 corrigé à `95 500 000`.
- Note: la base contenait déjà une ligne `ltir` (test), ce qui a nécessité d'adapter le script pour inclure `ltir` dès la recréation de la contrainte.

### 2026-04-13 (session 12)

Correctifs module transactions (`app/app/admin/transactions/`):

1. **Atomicité**: l'enregistrement `transactions` + `transaction_items` est maintenant inséré AVANT la boucle de mutations afin que la trace d'audit existe même si une mutation échoue partiellement. (Vrai atomicité nécessiterait une fonction PostgreSQL RPC.)
2. **Unicité des signatures**: vérification serveur avant simulation — si un joueur signé est déjà actif dans un roster cette saison, la transaction est refusée.
3. **Filtre pooler dans le builder**: correction d'un bug UI où changer le pooler A ne retirait pas les items déjà associés à l'ancien pooler. L'ID précédent est capturé avant la mise à jour du state.
4. **Corruption de l'historique lors d'un transfert**: `UPDATE pooler_rosters` de désactivation manquait `.eq('is_active', true)`, ce qui pouvait désactiver d'anciennes lignes d'un joueur ayant changé de pooler. Corrigé.

Fichiers touchés: `actions.ts`, `TransactionBuilder.tsx`.

Nouveau module pré-saison (`app/app/admin/presaison/`):

Fichiers créés:
- `types.ts`: types `PoolerCapInfo`, `RosterEntry` et constante `FREE_AGENT_THRESHOLD = 500_000`. Séparé de `actions.ts` car `'use server'` interdit les exports non-async.
- `actions.ts`: Server Actions — `loadPresaisonDataAction`, `resetLtirToActifAction`, `saveDraftOrderAction`, `resetPresaisonDraftAction`.
- `page.tsx`: page serveur avec garde admin, chargement de la liste des saisons.
- `PresaisonManager.tsx`: composant client principal.

Logique de `loadPresaisonDataAction`:
- Les recrues protégées sont **exclues** du calcul de masse et de l'affichage:
  - `rookie_type = 'draft'`: protégée si `(seasonStartYear - pool_draft_year) < 5`.
  - `rookie_type = 'elc'`: protégée si `is_elc = true` sur le contrat courant.
- Les recrues dont la protection est expirée sont traitées comme `actif`.
- Les joueurs `ltir` sont inclus dans le roster (ils peuvent être remis sur LTIR manuellement).

Fonctionnalités du `PresaisonManager`:
- **Aperçu des rosters**: joueurs groupés par position (Attaquants / Défenseurs / Gardiens / Réservistes / LTIR). Libération multi-sélection par cases à cocher. Changement de type joueur par joueur.
- **Remise LTIR → Actif en lot**: bouton pour remettre tous les joueurs LTIR de la saison en `actif` d'un seul coup (`resetLtirToActifAction`). Utile en début de saison.
- **Ordre du repêchage**: glisser-déposer (ou liste ordonnée) des poolers; sauvegardé dans `pool_seasons.presaison_draft_order` (JSONB).
- **Draft actif**: file rotative — le pooler courant signe un agent libre, puis passe en fin de file s'il reste éligible (espace cap ≥ 500 000 $). Les poolers sous le seuil sont retirés automatiquement. L'admin peut clore manuellement.
- **Zone de test — Réinitialiser le repêchage**: annule toutes les transactions `'Repêchage pré-saison'` de la saison, désactive les joueurs signés dans `pooler_rosters`, supprime les items et transactions. Protégé par `window.confirm`.

Lien ajouté dans `app/app/admin/page.tsx` vers `/admin/presaison`.

Migration SQL exécutée dans Supabase:
```sql
ALTER TABLE pool_seasons ADD COLUMN IF NOT EXISTS presaison_draft_order JSONB;
```

Transition de saison — correction dans `transitionSeasonAction` (`admin/config/actions.ts`):
- Les joueurs en `ltir` dans la saison source sont copiés comme `actif` dans la saison cible (règle métier: LTIR se remet à actif en début de saison).

### 2026-04-15 (session 13)

**Page Statistiques LNH** (`app/app/statistiques/`):
- Nouveau fichier `page.tsx`: fetch des stats depuis l'API publique NHL (`api.nhle.com/stats/rest`).
  - Patineurs triés par points, gardiens par victoires.
  - Croisement avec les noms de la saison active pour marquer les joueurs déjà dans un pool.
- Nouveau composant `StatsTable.tsx`: tableau client interactif, tri par colonne, filtre texte.
- Lien "Statistiques" ajouté dans la `Navbar` (entre "Contrats LNH" et "Repêchage").
- Nouveau fichier `app/lib/nhl-colors.ts`: palettes de couleurs primaire + secondaire pour les 32 équipes NHL.

**Page Contrats LNH — refonte visuelle** (`app/app/joueurs/JoueursTable.tsx`):
- Renommée "Joueurs LNH" → "Contrats LNH" (titre et lien Navbar).
- En-têtes d'équipes colorées avec dégradé aux couleurs NHL (via `teamColor`).
- Sous-groupement par position dans chaque équipe : Attaquants → Défenseurs → Gardiens.
- Point de couleur de l'équipe dans la colonne équipe.
- Tri ajusté : équipe → position (F/D/G) → cap DESC → nom.

**RosterManager — améliorations** (`app/app/admin/rosters/`):
- Nouvelle prop `allTakenPlayerIds` passée depuis `page.tsx` : un joueur déjà dans le roster d'un autre pooler disparaît de la liste de recherche.
- Sous-groupement par position (Attaquants / Défenseurs / Gardiens) dans la section "Actif", triée par cap DESC.
- Auto-détection du `rookie_type` (`'repcheche'` si `draft_year` présent, sinon `'agent_libre'`) à l'ajout d'un joueur recrue.
- Sélecteur `rookie_type` inline sous chaque recrue dans le roster; persistance immédiate via `updateRookieTypeAction`.

**Module pré-saison — Décisions ELC** (`app/app/admin/presaison/`):
- Nouveau type `ElcDecisionEntry` dans `types.ts`.
- `loadPresaisonDataAction` détecte les recrues repêchées placées en `actif`/`reserviste` dont le contrat ELC est échu.
- Nouvelle action `resolveElcDecisionAction` : deux options par joueur concerné :
  - **Garder actif** : efface `rookie_type` et `pool_draft_year` — le joueur devient actif permanent.
  - **Mettre en banque** : change `player_type` en `'recrue'` — retour à la banque pour le début de saison.
- Section dédiée dans `PresaisonManager.tsx` avec bandeau violet et boutons par joueur.
- Correction terminologie interne `rookie_type` : `'draft'` → `'repcheche'`, `'elc'` → `'agent_libre'`.
- Correction bug : `setDraftQueue` → `setQueue` dans le reset du draft.

**Scripts Python** (`python_script/`):
- Normalisation des noms dans `import_supabase.py` et `import_drafts.py` : ajout de `.replace('-', ' ')` pour gérer les noms avec tiret (ex: Marc-Édouard Vlasic).
- `existing_map` dans `import_supabase.py` utilise maintenant les noms normalisés comme clé (évite les doublons causés par les accents + tirets).
- `is_rookie` dans `import_supabase.py` : uniquement `status == 'ELC'`; les repêchés sans contrat ELC sont gérés exclusivement par `import_drafts.py`.
- `import_drafts.py` : la synchronisation `is_rookie=True` exclut désormais les joueurs `RFA`/`UFA` (statut établi → plus recrue éligible).

### 2026-04-16 (session 15)

**Toggle Saison régulière / Séries dans Statistiques LNH**:
- `statistiques/page.tsx`: `buildUrl`, `fetchSkaters`, `fetchGoalies` acceptent maintenant un paramètre `gameType` (2 = saison régulière, 3 = séries).
- Le `gameType` est déterminé par le search param `?saison=series` dans l'URL.
- `statistiques/StatsTable.tsx`: toggle "Saison régulière / Séries" ajouté dans le coin supérieur droit du titre. Navigation via `useRouter` vers `?saison=series` ou sans paramètre.
- La disponibilité (point vert) et le badge recrue (R) restent fonctionnels dans les deux modes.
- À tester lorsque les séries débuteront.

---

### 2026-04-16 (session 16)

**Chantier INIT — finalisation**:
- Nouveau composant `app/app/admin/config/InitTabs.tsx`: regroupe `PicksEditor` et `RookieOverrideManager` dans un panneau à onglets ("Choix de repêchage" / "Banque de recrues").
- Les deux composants enfants perdent leur propre `bg-white rounded-lg shadow`; le wrapper est maintenant dans `InitTabs`.
- `page.tsx` mis à jour pour utiliser `InitTabs` à la place des deux composants séparés.

**Décisions d'architecture — validées en session**:

Pool des séries (Chantier E) et Bracket (Chantier F) ajoutés à la feuille de route:
- **Pool des séries**: 3 attaquants, 2 défenseurs, 1 gardien par ronde; cap ~25 M$; self-service pooler; réassignation obligatoire si équipe éliminée; points via scoring_config.
- **Bracket**: picks entre chaque ronde (équipes pas connues d'avance); 2 pts bon gagnant + 1 pt bon nombre de matchs; bris d'égalité sur le total de buts par ronde.

Scoring configurable (transversal):
- Le scoring s'applique à la saison régulière ET aux séries via la même table `scoring_config`.
- Stats: `goal`, `assist`, `goalie_win`, `goalie_otl`; scope: `regular | playoffs | both`.

Stats joueurs — architecture snapshots retenue:
- Jamais de game-by-game logs en BD.
- Table `player_stat_snapshots` (player_id, date, goals, assists, goalie_wins, goalie_otl): snapshot cumulatif NHL capturé automatiquement à chaque activation/désactivation admin.
- Points pooler = snapshot_désactivation − snapshot_activation.
- Fin de saison = sync finale pour tous les joueurs actifs.
- Cette mécanique est nécessaire pour gérer correctement les transactions intra-saison dans le classement.

Séquence de travail avant transition:
1. Scoring config ✓ (cette session)
2. Chantier B — Classement + NHL API + snapshots
3. Saisie des transactions historiques 2025-26
4. Validation classement vs outil Excel
5. Chantier TRANSITION

**Scoring config — implémentation**:
- Migration SQL: `supabase_migrations/scoring_config.sql` (à exécuter dans Supabase).
- Valeurs par défaut: but=1 pt, passe=1 pt, victoire gardien=2 pts, défaite prol./fusillade=1 pt.
- Nouveau composant `app/app/admin/config/ScoringConfig.tsx`: formulaire d'édition des points par stat.
- Nouvelle action `updateScoringAction` dans `actions.ts`.
- `page.tsx`: query `scoring_config` ajoutée, `ScoringConfig` affiché sous `ConfigForm` dans la colonne droite.

**Migration à exécuter dans Supabase**:
```sql
-- Fichier: supabase_migrations/scoring_config.sql
CREATE TABLE scoring_config (
  id SERIAL PRIMARY KEY,
  stat_key VARCHAR(30) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  points DECIMAL(5,2) NOT NULL DEFAULT 1,
  scope VARCHAR(20) NOT NULL DEFAULT 'both'
    CHECK (scope IN ('regular', 'playoffs', 'both'))
);
INSERT INTO scoring_config (stat_key, label, points, scope) VALUES
  ('goal', 'But', 1, 'both'),
  ('assist', 'Passe', 1, 'both'),
  ('goalie_win', 'Victoire (gardien)', 2, 'both'),
  ('goalie_otl', 'Défaite en prol./fusillade (gardien)', 1, 'both');
```

### 2026-04-20 (sessions 17-18)

**Corrections diverses et chantier cap N+1**

**Correctifs techniques**:
- `app/lib/nhl-stats.ts`: `normName` enrichi avec décomposition NFD + suppression des diacritiques — corrige les points manquants pour les joueurs avec accents (ex: Stützle dans la base sans accent).
- `app/app/statistiques/page.tsx` et `StatsTable.tsx`: même normalisation appliquée pour le croisement noms NHL API ↔ base.
- `python_script/import_supabase.py`: deuxième appel `deduplicate_players()` ajouté APRÈS tous les inserts — corrige les doublons créés lors de l'import (ex: Simashev).
- `.github/workflows/import.yml`: `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` ajouté au niveau workflow — supprime l'avertissement de dépréciation Node.js 20.

**Typo `repcheche` → `repeche`** (renommage complet):
- Fichiers code corrigés: `actions.ts`, `RookieOverrideManager.tsx`, `BanqueRecruesManager.tsx`, `RosterManager.tsx`, `poolers/[id]/page.tsx`, `schema.sql` et tous les `actions.ts` concernés.
- Migration SQL exécutée dans Supabase:
  ```sql
  ALTER TABLE pooler_rosters DROP CONSTRAINT IF EXISTS pooler_rosters_rookie_type_check;
  UPDATE pooler_rosters SET rookie_type = 'repeche' WHERE rookie_type = 'repcheche';
  ALTER TABLE pooler_rosters ADD CONSTRAINT pooler_rosters_rookie_type_check CHECK (rookie_type IN ('repeche', 'agent_libre'));
  ```

**Page Repêchage — correction "Non protégé"**:
- Requête filtrée sur `rookie_type IS NOT NULL` (au lieu de `player_type = 'recrue'`) pour inclure les recrues actives (ex: Schaefer promu `actif`).
- Fallback nom ajouté: si le joueur trouvé par `draft_year/overall` n'est pas dans un roster, on tente la correspondance par nom normalisé.
- `export const dynamic = 'force-dynamic'` ajouté pour éviter le cache Next.js.

**PWA — bannière d'installation**:
- `InstallBanner.tsx`: texte corrigé de "Hockey Pool" à "DB Hockey Manager".

**Page Classement** (`app/app/classement/`):
- Nouveau composant `SummaryTable`: tableau récapitulatif toujours visible (rang, pooler cliquable, PTS, B, A, V, DP, BL).
- Noms des poolers cliquables vers `/poolers/[id]` dans la table résumé ET dans l'accordéon.
- `type Mode = 'saison'` en place comme base pour les futurs modes (mensuel, journée, série).

**Page alignement pooler** (`app/app/poolers/[id]/page.tsx`):
- `getYearsRemaining`: filtre `cap_number > 0` pour exclure les lignes RFA/UFA du compte d'années.
- Recrues triées par année de repêchage ASC puis alphabétique dans toutes les vues (alignement, RosterManager, BanqueRecruesManager).
- Joueurs LTIR: `salaryCounts={true}` — le salaire est affiché mais n'est pas comptabilisé dans la masse.
- Note de bas de page mise à jour pour mentionner LTIR.

**Chantier cap N+1** — nouveau champ plafond saison suivante:

Migration SQL à exécuter dans Supabase (si pas encore fait):
```sql
ALTER TABLE pool_seasons ADD COLUMN IF NOT EXISTS next_nhl_cap DECIMAL(12,2);
```

Fichiers modifiés:
- `app/app/admin/config/actions.ts`: `updateCapAction` accepte maintenant `nextNhlCap?` en 4e paramètre.
- `app/app/admin/config/page.tsx`: `next_nhl_cap` ajouté à la requête select.
- `app/app/admin/config/ConfigForm.tsx`: redesign complet en 2 colonnes (saison active | saison suivante). Chaque colonne affiche plafond NHL (input), facteur effectif (% du cap NHL), et cap du pool calculé. La colonne N+1 met à jour son aperçu en temps réel quand le facteur change.
- `app/app/poolers/[id]/page.tsx`:
  - Colonne "Cap N+1" ajoutée dans la table Banque de recrues (et Activation obligatoire).
  - Barre de masse salariale N+1 affichée sous la barre courante si `next_nhl_cap` est configuré.
  - Badge "⚠ Dépassement" visible si la somme des salaires N+1 (actifs + réservistes) dépasse le cap N+1 du pool.

### 2026-05-05

**Indicateurs de performance — page alignement pooler** (`lib/streaks.ts`, `poolers/[id]/PoolerPageTabs.tsx`, `poolers/[id]/page.tsx`, `admin/config/ConfigForm.tsx`, `admin/config/actions.ts`):
- 6 badges affichés dans l'onglet Alignement de `/poolers/[id]` : 🔥 EN FEU · ✅ EN FORME · 🧊 EN FROID · 🚨 EN CRISE · 📈 EN HAUSSE · 📉 EN BAISSE.
- `lib/streaks.ts` : refonte complète — anciens types `StreakType`/`MIN_STREAK` supprimés, remplacés par `BadgeType` + `IndicatorConfig` configurable. Calcul de tendance ajouté (pts/match fenêtre récente vs précédente). Gardiens scorés sur V×2 + DP + BL×2.
- Seuils configurables par saison via 3 nouvelles colonnes `pool_seasons` (`indicator_streak_chaud=3`, `indicator_streak_froid=5`, `indicator_fenetre_tendance=5`, migration SQL exécutée).
- Section "Indicateurs de performance" ajoutée dans `/admin/config` (saisons régulières seulement).
- Priorité : streak > tendance. Streak froid + 3 = EN CRISE.
- Commit : `e4b259d`.

**Fix — classement-series rebranché + stats en direct** (`classement-series/page.tsx`, `playoff-pool-actions.ts`):
- La page `/classement-series` lisait les anciennes tables (`series_round_snapshots`, `series_round_rosters`) — vides pour la saison 2026-PO gérée via `/gestion-series`. Fix en deux parties :
  1. `getPlayoffPoolStandingsAction` : nouveau paramètre `fetchLive` (défaut `false`). Quand `true`, fetche les stats LNH séries pour chaque joueur actif en parallèle (déduplication par player_id), ce qui donne un classement en direct sans intervention admin.
  2. `/classement-series` : rebranché sur `getPlayoffPoolSaisonAction` + `getPlayoffPoolStandingsAction(id, true)`. Layout : tableau synthèse + détail par pooler avec stats en direct. Joueurs retirés en gris.
- Commit : `39f57a9`.

**Bugfix — compteur de changements volontaires incorrect** (`playoff-pool-actions.ts`):
- Les changements effectués avant la deadline étaient enregistrés avec `removal_reason = 'voluntary'` et comptaient dans le budget post-deadline. Fix : `removal_reason = null` quand `!isLocked` — le compteur `getPlayoffChangeCountsAction` ignore les `null`. Les entrées existantes corrigées via SQL (`UPDATE ... SET removal_reason = NULL WHERE removed_at < deadline AND removal_reason = 'voluntary'`). Commit : `c35b694`.

**Bugfix — sélecteur joueurs vide dans /gestion-series** (`playoff-pool-actions.ts`):
- `getAvailablePlayoffPlayersAction` retournait 0 joueur à cause de deux bugs combinés :
  1. `playoff_participating_teams` a RLS activé sans aucune politique → deny all pour les clients authentifiés. Fix : utiliser `createAdminClient()` pour lire cette table (et `playoff_eliminations` par cohérence).
  2. Le filtre `.eq('is_available', true)` bloquait tous les joueurs : le script Python met `is_available = false` pour les joueurs absents du dernier run de scraping, et certains joueurs en séries se retrouvaient ainsi bloqués. Fix : quand des équipes participantes sont configurées, le filtre `team_id IN [...]` est suffisant — `is_available` n'est pertinent qu'en saison régulière. `is_available` est conservé comme garde-fou uniquement quand aucune équipe n'est configurée.
- Commit : `5d62ada`.

---

### 2026-04-21 (sessions 22-23)

**Widget "Joueurs en action" — refonte complète**:
- Remplace l'affichage per-pooler par un tableau avec TOUS les poolers : Pooler | Nb | Détail (2A · 1D · 1G).
- Trié par nombre de joueurs décroissant; le pooler connecté est mis en évidence (fond bleu + "(toi)").
- Fonctionne en mode Saison (depuis `standings`) et en mode Séries (depuis `playoff_rosters` avec join `teams.code`).
- Visible uniquement s'il y a des matchs ce soir.
- Composants séparés : `ScheduleList` et `ActivityTable`.

**Switcher de pooler dans l'alignement**:
- Nouveau `app/components/PoolerSwitcher.tsx`: `<select>` client-side, navigue vers `/poolers/{id}` via `useRouter`.
- `poolers/[id]/page.tsx`: fetch de tous les poolers ajouté; `PoolerSwitcher` affiché dans l'en-tête (flex row avec le nom du pooler).
- Visible uniquement si 2+ poolers existent.

**Refonte Navbar — menu Classement séparé**:
- `Classement` extrait du dropdown "Pool Saison" et transformé en son propre dropdown.
- Entrées: "Saison complète" (actif), Hebdomadaire / Mensuel / Meilleurs disponibles (badges "À venir").
- "Pool Saison" conserve seulement: Mon alignement, Transactions.
- Menu mobile mis à jour avec la section "Classement" correspondante.

**Page d'accueil — refonte complète**:
- Remplace les cartes de liens par: classement compact + calendrier du soir + tableau d'activité des poolers.
- Détection automatique du mode (Saison / Séries) selon les saisons actives.
- Toggle Saison/Séries affiché uniquement si les deux sont actives simultanément.
- `ScheduleList`: matchs du jour via `api-web.nhle.com/v1/schedule/now`.
- `ActivityTable`: tous les poolers avec nombre de joueurs ce soir au format "2A · 1D · 1G".
- `app/lib/standings.ts`: nouveau fichier partagé avec `buildStandings()` et types `PlayerContrib`/`PoolerStanding`.
- `app/components/SummaryTable.tsx`: tableau compact partagé (utilisé par accueil et `/classement`).

**Pool des Séries — corrections**:
- Tri des joueurs dans le sélecteur: équipe ASC puis salaire DESC.
- Correction conférence NULL: fallback statique `EASTERN_TEAMS` pour les joueurs dont `teams.conference` est vide en BD.
- Correction filtre `position IS NULL`: le filtre `!p.position` est retiré pour ne plus exclure les joueurs sans position.
- Types `Player`, `ActivePick`, `PickInput` mis à jour pour accepter `position: string | null`.
- `posGroup()` dans `PicksManager.tsx` gère `null` (retourne `'F'` par défaut).
- Correction limite 1000 rangées Supabase: `fetchAllPages` appliqué sur `player_contracts` (1575 contrats en 2025-26). Johnston/DAL, Schmaltz/UTA, Wedgewood/COL maintenant visibles dans le sélecteur.

**Diagnostic positions NULL**:
- 24 joueurs avec `position IS NULL` et contrat actif en 2025-26 identifiés.
- Cause: le scraper `scrape_puckpedia.py` échoue à détecter la position pour certains joueurs (section HTML différente sur PuckPedia).
- Constat: `teams_offline/MTL.csv` avait Jakub Dobes (id=713) en 1ère ligne avant l'en-tête, le rendant invisible à `fusionner_equipes()`. Corrigé manuellement en BD.
- Nouveau script `python_script/fix_null_positions.py`:
  - Requête Supabase: tous les joueurs `position IS NULL` avec contrat actif.
  - Recherche par nom via `search.d3.nhle.com/api/v1/search/player`.
  - Mapping des codes NHL (`C/L/R/LW/RW` → `F`, `D/LD/RD` → `D`, `G` → `G`).
  - Option `--dry-run` pour prévisualiser sans modifier la BD.
  - Loggue les joueurs sans résultat NHL pour correction manuelle.
- Script lancé avec succès; positions corrigées en BD.

**PWA — Notifications push**:
- Nouveau `app/lib/push.ts`: `sendPushToAdmins(payload)` — envoie une notification Web Push à tous les admins abonnés. Supprime automatiquement les subscriptions invalides (410/404).
- Nouvelles Server Actions `app/app/compte/push-actions.ts`: `subscribePushAction`, `unsubscribePushAction`, `getSubscriptionStatusAction`.
- Nouveau composant client `app/app/compte/PushToggle.tsx`: toggle d'abonnement/désabonnement dans la page "Mon compte".
- `app/public/sw.js` mis à jour (v4): handlers `push` et `notificationclick` ajoutés.
- `app/app/series/actions.ts`: `sendPushToAdmins` appelé après soumission des choix séries.
- Table `push_subscriptions` créée dans Supabase (endpoint, p256dh, auth; RLS admin only).
- Package `web-push` installé (`npm install web-push`); variables d'env `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` à configurer dans Vercel.

**Contraste — suppression du mode sombre**:
- `app/app/globals.css`: bloc `@media (prefers-color-scheme: dark)` supprimé.
- Fond et texte forcés en blanc/noir, les titres restent lisibles sur mobile.

**Restructuration `/poolers/[id]` — Mon Équipe**:
- Nouveau `app/app/poolers/[id]/PoolerPageTabs.tsx`: composant client avec deux onglets — "Organisation" (contenu actuel) et "Alignement" (placeholder pour Chantier B — points séries).
- `page.tsx` mis à jour: le contenu de la page devient `organisationContent` dans `PoolerPageTabs`.
- Navbar: "Mon alignement" → "Mon équipe" (desktop + mobile).

**Pool des Séries — correctifs sélecteur (session suivante)**:
- `posGroup` gère maintenant les positions composées (ex: `"LD,RD"`, `"C,RW"`): split sur virgule + vérification par partie. Lane Hutson (`"LD,RD"`) classé correctement comme défenseur.
- Positions attaquants explicites: `C`, `LW`, `RW`, `W`, `F` vérifiés individuellement (symétrie avec D et G).
- Retrait du `slice(0, 150)` dans la liste de sélection: la liste défile maintenant jusqu'au bout.

**Pool des Séries — filtre équipes actives (bracket NHL)**:
- `picks/page.tsx`: fetch `api-web.nhle.com/v1/playoff-bracket/{année}` au chargement (année dérivée de `ps.season`, ex: `"2025-26"` → 2026).
- Équipes actives = toutes les équipes du bracket dont l'ID n'est pas un `losingTeamId` dans une série terminée.
- Filtre appliqué côté serveur avant de passer la liste à `PicksManager`.
- Fallback silencieux si l'API est indisponible (liste complète affichée sans filtre).
- `PicksManager`: affiche «N équipes actives» dans le sous-titre si le filtre est actif.
- Cache de 1h (`revalidate: 3600`) sur la réponse du bracket.

Commits: `a3c0311` (corrections séries/positions), `263c820` (restructuration Mon Équipe), `17a33ad` / `a997c77` (posGroup + défilement), `d5c22f5` (filtre équipes actives).

---

### 2026-04-21 (session 21)

**Navbar — Classement en dropdown indépendant**:
- `Classement` retiré du sous-menu `Pool Saison`; `Pool Saison` conserve seulement `Mon alignement` et `Transactions`.
- Nouveau dropdown `Classement` avec: `Saison complète` (→ /classement) + `Hebdomadaire`, `Mensuel`, `Meilleurs disponibles` (badges "À venir").
- Même structure dans le menu mobile.

**Page d'accueil — Toggle Saison/Séries**:
- Mode détecté via `?mode=saison` ou `?mode=series`; défaut = Séries si `playoff_season` active, sinon Saison.
- Toggle Saison/Séries affiché uniquement quand les deux modes sont actifs simultanément.
- **Mode Saison**: classement régulier (`SummaryTable`) + widget matchs du jour + joueurs actifs.
- **Mode Séries**: classement playoff compact (rang/nom/pts) OU état "en attente" si `scoring_start_at` null + widget matchs + picks actifs.
- Widget "joueurs en action" reformaté: `2A · 1D · 1G` (comptage par position, sans pastilles d'équipes). Noms listés en dessous.
- `buildPlayoffStandingsCompact()` inline dans page.tsx: utilise `fetchNhlSkaters(3)/fetchNhlGoalies(3)` + snapshots pour calculer les pts séries.

**Architecture répondue (non implémentée)**:
- Bloquant si pas tous les poolers participent aux séries: non — poolers sans picks ont 0 pts, pas d'erreur.
- Vues classement futures (hebdo, mensuel, meilleurs pointeurs disponibles) → dépendent du Chantier B (snapshots); dropdown navbar prêt.

Commit: `bb3db48`.

---

### 2026-04-21 (session 20)

**Page d'accueil — refonte**:
- Suppression des cartes de liens (Joueurs LNH, Alignements, Mon équipe) et de la grille des poolers.
- Nouveau layout 2 colonnes (desktop): classement compact à gauche, widget matchs du jour à droite.
- Widget matchs du jour: fetch `api-web.nhle.com/v1/schedule/now`, date en heure de l'Est, badge "En cours/Terminé" ou heure de début.
- Widget joueurs actifs: pour le pooler connecté, liste les joueurs actifs dont l'équipe joue ce soir + badge bleu avec compte.

**Refactoring classement**:
- Nouveau `app/lib/standings.ts`: types `PoolerStanding` + `PlayerContrib` + fonction `buildStandings()`. Partagé par home, `/classement` et `/poolers`.
- Nouveau `app/components/SummaryTable.tsx`: table résumé du classement (rang, nom cliquable, pts, B/A/V/DP/BL). Partagée par home et classement.
- `app/app/classement/ClassementTable.tsx`: retire la définition locale de `SummaryTable`, importe le composant partagé.
- `app/app/classement/page.tsx` et `app/app/poolers/page.tsx`: simplifiés pour utiliser `buildStandings()`.

**Pool des séries — corrections**:
- `series/picks/page.tsx`: tri des joueurs dans le sélecteur = équipe ASC puis salaire DESC (cohérent avec les autres pages).
- Fallback statique Est/Ouest via `EASTERN_TEAMS` set: les joueurs dont la colonne `conference` est vide en BD (ex: Dobes MTL) apparaissent maintenant correctement.

**Vision classement (future, non implémenté)**:
- Classement de la soirée précédente, classement mensuel, meilleurs pointeurs des poolers, meilleurs pointeurs disponibles avec filtres position/équipe/recrue.
- Dépend du Chantier B (snapshots), planifié à l'Étape 2 de la séquence de validation.

Commit: `984d652`.

---

### 2026-04-21 (session 19)

**Refonte Navbar — menus déroulants groupés**:
- `app/components/Navbar.tsx`: restructuration complète avec 3 menus déroulants + 2 liens directs.
  - **Pool Saison** → Mon alignement (`/dashboard`), Classement (`/poolers`), Transactions (`/transactions`)
  - **Statistiques** → LNH (`/statistiques`), AHL (badge "À venir")
  - **Contrats LNH** → lien direct `/joueurs`
  - **Repêchage** → lien direct `/repechage`
  - **Pool Séries** → Mes choix (`/series/picks`), Classement (`/series`)
- Composant `Chevron` ajouté (flèche animée dans les boutons de menu).
- `DropdownKey` union type pour gérer quel menu est ouvert (`pool-saison | statistiques | series | profile | null`).
- `navRef` unique sur `<nav>` pour fermer tous les dropdowns au clic externe (remplace `profileRef`).
- Menu mobile: sections nommées correspondant aux groupes desktop.
- Commit: `193a77a`.

**Mémo de collaboration**: mise à jour automatique de `SUIVI_PROJET.md` en fin de session dorénavant, sans attendre la demande explicite.

---

### 2026-04-15 (session 14)

**Responsive mobile — pages de consultation**:
- `Navbar.tsx`: menu hamburger sur mobile, liens desktop cachés (`hidden md:flex`), fermeture automatique au changement de route.
- `poolers/[id]/page.tsx`: `overflow-x-auto` sur tous les conteneurs de tables `RosterTable`.
- `repechage/RepechageTable.tsx`: `overflow-x-auto` sur les tables de rondes et ELC.
- `statistiques/StatsTable.tsx`: colonnes secondaires masquées sur mobile (`hidden sm:table-cell`) — Tps/M, Pts/MJ pour patineurs; D, DP, B, A pour gardiens.
- Règle responsive documentée dans `CLAUDE.md`: pages admin desktop-only, pages consultation responsive.

**Déploiement Vercel**:
- App déployée sur `https://db-hockeypool-manager.vercel.app/`.
- Toutes les pages protégées derrière une connexion obligatoire via `proxy.ts` (Next.js 16).
- `proxy.ts`: redirection vers `/login` si non connecté, redirection vers `/` si connecté sur `/login`.
- `layout.tsx`: fetch de l'utilisateur côté serveur, état auth passé en props à `Navbar` (élimine le flash "Connexion" au premier chargement).
- Navbar: déconnexion via `window.location.href` pour forcer un rechargement complet et vider les cookies de session.

**Améliorations UI — Statistiques et Contrats LNH**:
- `StatsTable.tsx`: filtre Attaquants / Défenseurs / Tous ajouté pour l'onglet Patineurs.
- `JoueursTable.tsx`: bandeaux de position (Attaquants/Défenseurs/Gardiens) en pleine largeur avec couleur secondaire de l'équipe (repli sur primaire si trop pâle). Point de disponibilité déplacé à gauche du nom du joueur; colonne "Dispo" supprimée.
- Inputs et selects des filtres: ajout de `text-gray-800 bg-white` pour lisibilité sur mobile.

**Pipeline Python — corrections et automatisation**:
- `scrape_puckpedia.py`: les sections "Buyout & Cap Charges" sont ignorées au scraping (joueurs rachetés non actifs). Les sections "Retained Salary" sont conservées pour reconstituer le cap hit complet des joueurs échangés avec rétention.
- `import_supabase.py`: `csv_path` rendu relatif à `BASE_DIR` (fix GitHub Actions).
- Nouveau script `run_pipeline.py`: lance scrape → import_supabase → import_drafts en séquence. Option `--no-scrape` pour import seul.
- Nouveau workflow `.github/workflows/import.yml`: import automatique chaque lundi 6h UTC + déclenchement manuel. Requiert les secrets `SUPABASE_URL` et `SUPABASE_SERVICE_KEY` dans GitHub.
