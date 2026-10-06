# État du projet — Cap Crunch

> **Instantané « où on en est »**, réécrit à chaque fin de session (pas un journal).
> L'historique détaillé est dans `SUIVI_PROJET.md` ; la référence stable dans `CLAUDE.md`.
> Si un point ci-dessous est réglé, le retirer ou le déplacer — ne jamais l'empiler.

**Dernière mise à jour :** 2026-10-06

---

## 1. Où en est la saison

- Saison active : **2026-27 en prod et en staging**, pas encore démarrée en prod
  (`season_started=false`). Pool du 2026-10-03 : repêchage des recrues fait, **repêchage des
  agents libres en cours** en prod.
- **Prod** : vidée volontairement le 2026-09-20, puis **alignements 2025-26 ressaisis par David
  (Mode init) — terminé le 2026-09-29**, 326 lignes pour les 8 poolers. **Revalidation par David
  le 2026-09-30** (voir section 4). Historique complet reconstruit en **staging** seulement.
- Backup hors-ligne (`backup/pool_backup.html`) régénéré chaque dimanche depuis la prod.
- Points de la nuit (`regular_stats.yml`) : 3 passages, 1 h 23 / 3 h 23 / 5 h 23 ET (2026-10-05) —
  à vérifier demain matin que le classement est à jour avant 8 h. L'import lie maintenant les
  `nhl_id` manquants et retraite les 3 derniers jours (2026-10-05, en prod). Classement validé
  contre Marqueur : écarts restants = erreurs de Marqueur (Dahlin, Guentzel, Leonard).
- En prod le 2026-10-05 (`5f737da`) : pastille « disponible » par `nhl_id` et page Meilleurs
  joueurs disponibles (menu Le pool).
- **Retour au jeu des joueurs sur LTIR (2026-10-05) — en prod** (`aa2bbf5`), migration roulée dans les deux bases.
- Bouton « À faire » des poolers et redirection des courriels de test : en prod le 2026-10-05.
  `EMAIL_REDIRECT_TO` est définie dans le projet Vercel de staging seulement (courriel de test reçu).
- Joueurs sur LTIR au marché et échangeables : en prod le 2026-10-05 (`5deebd1`).
- Règle « a rejoué depuis moins de 7 jours → pas admissible au LTIR » (badge « De retour au jeu ») :
  en prod le 2026-10-05, migration roulée dans les deux bases.
- **À valider sur staging (David)** : onglet Marqueur de Gestion des effectifs (écarts + liste à
  reporter). Vidéos de l'Aide : envoyer les liens YouTube (non répertoriés) à ajouter par entrée.
- **Import des points par Vercel Cron — en prod le 2026-10-06.** À vérifier le 7 au matin : un
  import « workflow_dispatch » parti vers 2 h-3 h ET, classement à jour au réveil.
- **Copie prod → staging par bouton — en prod le 2026-10-06** (bouton sur `/admin/donnees` de
  staging). Premier clic de David = premier vrai test de la copie réelle.
- Jeton `GITHUB_WORKFLOW_TOKEN` (« Cap Crunch Vercel ») : il expire — à renouveler dans les deux
  projets Vercel à l'échéance, sinon l'import de nuit retombe sur l'horaire GitHub (~8 h ET).
- Onglet Comparaison Marqueur : en prod, pas encore validé à l'écran par David.
- **Elias Pettersson le défenseur — bloqué en prod** : rouler dans le SQL Editor de prod
  `ALTER TABLE players DROP CONSTRAINT players_name_team_unique;` (contrainte absente de staging),
  puis créer sa fiche. Correctif de l'import sur staging, à valider par un pipeline staging.
- Après le prochain pipeline du lundi : vérifier qu'une fiche distincte a été créée pour Elias
  Pettersson le défenseur (`nhl_id` 8483678).

## 2. Branches / déploiement

| Branche | État |
|---|---|
| `staging` | = `main` |
| `main` (prod) | À jour — 2026-10-03 : Marché des échanges + « Je cherche », allègement du repêchage, fonctions Vercel en Oregon, correctif de la file des agents libres, copie de secours, résumé des choix |

Livré en prod le 2026-09-28 (fin de journée, `6d3c801`) : recoupement ESPN via l'API JSON +
détail des sources par blessure, correctif de saut d'écran du repêchage admin, renvoi en banque
des recrues encore protégées à la transition, hub Nouvelle saison à 6 étapes, LTIR et activation
de recrues dans le hub AL, bandeau admin du hub AL quand la saison active est déjà démarrée.

Livré plus tôt le même jour : « Mes listes », scénarios de simulation privés, sélecteur de
pooler + onglet conservé, sélecteur de saison des projections, correctif pipeline (alias de
prénoms), transition de saison bloquée si la cible est remplie, chantier mobile + largeur
desktop.

## 3. Fonctionnalités récentes — état de validation

| Fonctionnalité | Staging | Prod | Reste à faire |
|---|---|---|---|
| Chantier mobile : paysage débloqué (PWA), 10 pages adaptées, largeur desktop | ✅ validé | ✅ | Poolers : réinstaller l'app si le paysage reste bloqué |
| « Mes listes » (agents libres + recrues 2026, privées, 5 pages) | ✅ validé | ✅ | — |
| Scénarios de simulation privés (admin compris) | ✅ migré | ✅ migré | — |
| `/poolers/[id]` : sélecteur de pooler visible + onglet conservé | ✅ validé | ✅ | — |
| Sélecteur de saison sur `/statistiques/projections` | ✅ validé | ✅ | En prod, choisir 2026-27 (saison active prod encore 2025-26) |
| Projections (NHL.com / CBS / Pool Pro / Hockey Mag, Moyenne) | ✅ | ✅ importé | — |
| Transition de saison refusée si la saison cible a déjà des alignements | ✅ validé (bloc rouge) | ✅ | — |
| Rechargement auto du repêchage des recrues (60 s, jamais pendant la saisie) | ✅ | ✅ | — |
| Suivi des blessures + admissibilité LTIR + seuils paramétrables | ✅ | ✅ | — |
| Repêchage admin : plus de saut d'écran à chaque sélection | ✅ validé | ✅ | — |
| Hub AL : LTIR (admin direct / pooler sur demande) + activer une recrue au nom d'un pooler | ⏳ à valider | ✅ déployé | Après activation de 2026-27 : bouton → LTIR sur un blessé admissible, Demander LTIR côté pooler, → Actif dans la banque |
| Hub Nouvelle saison : étape « Banque de recrues » retirée (6 étapes) | ⏳ à valider | ✅ déployé | Regarder `/admin/nouvelle-saison` |
| Transition de saison : recrues encore protégées renvoyées en banque | ⏳ code | ✅ déployé | Tester lors de la remise à neuf de 2026-27 en staging (bandeau bleu dans l'aperçu + banque de chaque pooler) |
| Détail des sources (CBS / ESPN) par blessure, `/statistiques/blessures` | ✅ validé | ✅ | — |
| Recoupement ESPN des blessures (API JSON `site.web.api.espn.com`) | ✅ | ✅ 70/76 | Confirmer dans le log du cron du 2026-09-29 (midi ET) : « [ESPN] N/M recoupés » avec N > 0 |
| Demandes de LTIR avec approbation admin | ✅ code | ✅ code | Tester de bout en bout avec un vrai compte pooler |
| Transactions entre poolers (échanges + approbation) | ✅ | ✅ | Test réel à deux poolers |
| Ballotage (réclamer / refuser / compléter) | ✅ | ✅ | Test réel à plusieurs poolers en saison |

## 4. À faire / à vérifier

### ▶ Prochaine session — commencer ici

- **Points du 2026-09-29** : corrigés en prod et en staging (vieilles lignes supprimées par David).
  Correctif du script sur staging, à fusionner sur `main`.
- **Pointage en direct** (`/en-direct` + cartes de l'accueil) et **Marqueur.com** (carte + menu) :
  sur staging, à valider pendant des matchs avant `main`.
- **Pointage en direct + Marqueur.com** : validés par David le 2026-10-04 (points identiques à
  Marqueur.com) et **fusionnés sur `main`**, avec la saison des game-logs tirée du match et l'étape
  staging de la tâche de nuit (premier passage : nuit du 4 au 5 oct., à vérifier dans GitHub Actions).
- **Staging = prod** : alignements copiés et stats rattrapées. Écart restant : Jérôme 34 en staging
  contre 35 en prod (7 joueurs absents de la table `players` de staging, 189 lignes contre 196 le
  29 sept.) — un `./run_pipeline_staging.ps1 --no-scrape` devrait l'aligner.
- **Charge de la base pendant le hub** : diagnostic et plan d'allègement en suspens (2026-10-04),
  en attente des chiffres Supabase (plan, Reports → Database, 3 oct. 21 h-23 h UTC).
- **File des agents libres** (correctif en prod, non testé) : un double clic sur « Passer » ne doit
  plus sauter de pooler. À surveiller pendant la suite du repêchage.
- **Base prod lente le soir du pool** (17 h-19 h, cause non confirmée) : si ça revient, regarder
  Supabase → Reports → Database (CPU, connexions) et `pg_stat_activity` ; redémarrer le projet au
  besoin. Envisager un plan Supabase supérieur si la base sature avec 8 poolers connectés.
- **7 repêchés encore protégés** (Slafkovský, Carlsson, Bedard, Fantilli, Gauthier, Nazar, Hutson) :
  statut recrue rétabli en prod — les poolers peuvent les mettre en banque (★) avant le démarrage.
- **`credentials/poolers-prod.md` périmé** pour 6 poolers (ils ont changé leur mot de passe).
- **Copie de secours** : un nouvel export propose maintenant ses données au lieu de l'état local
  (en prod, fichier régénéré le 2026-10-03 19 h).
- **Lag du repêchage** (2026-10-03, en prod sans validation staging) : rechargements des poolers réduits et étalés.
  À valider au prochain repêchage avec plusieurs poolers connectés. Fonctions Vercel déplacées
  en Oregon (`pdx1`, `app/vercel.json`), à côté de la base prod (`us-west-2`) — vérifié en prod.
- **Résumé des choix de repêchage** (`/admin/init?tab=choix`, en prod sans validation staging) : se resynchronise
  après chaque changement — à valider.
- **Marché des échanges** : en prod (2026-10-03). Suite possible : sauvegarder une proposition
  d'échange comme scénario de simulation.
- **Prod** : vérifier un vrai courriel (lien cliquable) depuis la fusion du 2026-10-03.

- **Outil d'analyse** : suites possibles — pointage du pool plutôt que points LNH, mémoriser le
  graphique masqué.
- **Fiche joueur / API LNH** : si « saisons LNH pas pu être chargées » revient, le motif est
  affiché entre parenthèses dans la fiche (ex : « la LNH a répondu 403 »).

- **Facteur de plafond** : analyse faite (`calcul_salaire/calcul_facteur.md`, résumé
  `calcul_salaire/resume_facteur.md`, page partageable
  https://claude.ai/artifact/VNqLbSxDLySgAg8zSbyLht). Recommandation : 1,28 pour 2026-27
  (P̄ = 0,76, λ = ½), règle recalculée chaque été ; option « rabais de développement » (12 % du
  plafond LNH). **En attente** : avis du pooler actuaire, puis décision du groupe ; si le facteur
  change, le modifier pour 2026-27 dans Configuration → Saisons. Pour relancer les scripts
  historiques : `pip install xlrd openpyxl` (fichiers Excel de David hors git).



0. **Prod — saisie Mode init 2025-26 : terminée et conforme** (vérifié le 2026-09-30) — les
   8 poolers ont 12 attaquants, 6 défenseurs, 2 gardiens actifs et au moins 2 réservistes ;
   doublons Ekman-Larsson supprimés.
1. **Activer 2026-27** (hub `/admin/nouvelle-saison`, étape 2) là où David prépare la saison —
   sa capture du hub montrait « Actuellement active : 2025-26 ». Tant que ce n'est pas fait,
   `/repechage-agents-libres` lit 2025-26 (déjà démarrée) : panneau admin et libre-service
   masqués (un bandeau ambre l'explique maintenant), et Räty/Svechkov (protection expirée,
   banque de 2026-27) ne sont pas activés — ils le seront au premier chargement de la page
   une fois 2026-27 active.
2. Valider ensuite dans le hub AL : → LTIR / → Actif (admin), Demander LTIR (pooler) puis
   approbation dans `/admin/effectifs?tab=approbation`, → Actif dans la banque d'un pooler.
3. Vérifier le log de `injuries.yml` du 2026-09-29 (recoupement ESPN > 0).
4. `credentials/poolers-staging.md` : mot de passe de `david@staging.test` périmé — le mettre à
   jour pour que Claude puisse tester l'interface staging en automatisé (Playwright).

Petit défaut connu : la notification « demande LTIR approuvée » pointe vers
`/gestion-effectifs`, encore fermée aux poolers en pré-saison (cosmétique).

- [ ] **Staging — remise à neuf de 2026-27** (si pas encore fait) : 2026-27 mélange vrais
      alignements et tests. Depuis `python_script/` :
      `python reset_saison_staging.py 2026-27 --apply` (« oui »), puis refaire la transition
      2025-26 → 2026-27 (Admin > Gestion du pool > Configuration > Saisons), puis le
      repêchage des recrues. Suppression bloquée pour Claude (mode auto).
- [ ] Repêchage des agents libres : terminaison + « Démarrer la saison » (conformité +
      déclarations « prêt ») en staging, de bout en bout.
- [ ] Notifications courriel des commentaires (babillard / planification) avec deux vrais
      comptes distincts.
- [ ] Pages pas encore passées au mobile (si les poolers s'en plaignent) : `/statistiques/ahl`,
      `/calendrier`, `/repechage-agents-libres`, `/repechage-recrues`, `/simulation`.

## 5. Décisions en attente de David

- Délais LTIR (14 / 14 / 3 / 5 / 2 jours) : à discuter avec les poolers — ajustables dans
  `/admin/effectifs?tab=approbation`, aucune modif de code requise.
- Panneau d'aide contextuel pour les poolers (façon `AdminGuidePanel`) : en attente d'un
  retour de pooler sur `/aide` et `/a-propos`.

## 6. Prochains chantiers possibles (backlog)

- Échanges pré-saison dans l'outil pooler (aujourd'hui : filet admin `/admin/transactions`).
- Compléter la couverture ESPN des projections (joueurs de profondeur) si jugé utile.
- Yahoo comme 3ᵉ source de blessures (validé techniquement, pas branché).
