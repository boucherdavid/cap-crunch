# État du projet — Cap Crunch

> **Instantané « où on en est »**, réécrit à chaque fin de session (pas un journal).
> L'historique détaillé est dans `SUIVI_PROJET.md` ; la référence stable dans `CLAUDE.md`.
> Si un point ci-dessous est réglé, le retirer ou le déplacer — ne jamais l'empiler.

**Dernière mise à jour :** 2026-10-09

---

## 1. Où en est la saison

- **Saison 2026-27 démarrée en prod** le 4 octobre au soir (`season_started=true`). Gestion
  d'effectifs, ballotage, échanges et LTIR sont ouverts aux poolers.
- **Staging** : copie de la prod faite le 2026-10-06 (14 h 45) par le nouveau bouton. À rafraîchir
  avant chaque séance de test (Admin → Mise à jour de données, sur staging).
- Classement validé contre Marqueur.com : alignements concordants ; seul écart de points connu,
  Ryan Leonard (Vincent) — 1 pt selon la LNH, 2 sur Marqueur (erreur de Marqueur).

## 2. Branches / déploiement

| Branche | État |
|---|---|
| `staging` | `main` + icônes et bandes de couleur du menu et de l'accueil (2026-10-09, à valider) |
| `main` (prod) | À jour au 2026-10-08 (délai de réactivation levé pour un blessé, notifications rétablies automatiquement, budgets de signatures expliqués) ; 2026-10-09 : avis de signatures et d'échanges de la LNH |

Variables Vercel ajoutées les 5 et 6 octobre :
- `cap-crunch` (prod) : `CRON_SECRET`, `GITHUB_WORKFLOW_TOKEN`.
- `cap-crunch-staging` : `GITHUB_WORKFLOW_TOKEN`, `EMAIL_REDIRECT_TO` (jamais en prod).
- Le jeton GitHub « Cap Crunch Vercel » **expire** : le renouveler dans les deux projets à
  l'échéance, sinon l'import de nuit retombe sur l'horaire GitHub (~8 h ET) et les boutons de
  mise à jour cessent de fonctionner.

Migrations roulées dans les deux bases : `ltir_return_watch.sql`, `ltir_recent_game_days.sql`.
Contrainte `players_name_team_unique` retirée en prod (elle n'existait pas en staging).

## 3. Livré les 5 et 6 octobre 2026 (tout est en prod)

| Fonctionnalité | Où | Reste à faire |
|---|---|---|
| Import des points : lie les `nhl_id` manquants, refait les 3 derniers jours, déclenché par Vercel Cron (~2 h ET) | `/api/cron/stats` | **Vérifier le 7 au matin** qu'une exécution est partie vers 2 h-3 h ET |
| Panneau « Mises à jour automatiques » : dernière exécution + bouton par tâche | Admin → Mise à jour de données | — |
| Copie prod → staging par bouton (avec blessures et demandes de LTIR) | Même page, sur staging seulement | — (premier essai réussi) |
| Pastille « disponible » par `nhl_id` ; joueurs libérés de nouveau disponibles | Statistiques, Projections, AHL | — |
| Meilleurs joueurs disponibles | Menu Le pool | — |
| Retour au jeu d'un joueur sur LTIR : détection, délai de 14 jours, notifications, retour par le pooler | Gestion d'effectifs, Approbations | Suivre Marchand (Vincent) et Samoskevich (Steve) : échéance vers le 19 octobre |
| Règle « a rejoué depuis moins de 7 jours → pas admissible au LTIR » | Badges, page Blessures | — |
| Joueurs sur LTIR au marché et échangeables (arrivent actif ou réserviste) | Marché, onglet Échanges | Test réel entre deux poolers |
| Bouton « À faire » des poolers | Barre du haut | — |
| Courriels de staging redirigés vers David | `EMAIL_REDIRECT_TO` | — |
| Comparaison avec Marqueur (écarts, liste à reporter avec dates, preuve LNH) | Admin → Comparaison Marqueur ; menu Le pool pour les poolers | Voir « Prochaine session » : lecture ratée le soir du 6 octobre |
| Vidéos dans l'Aide (champ `video` par entrée) | `/aide` | David : enregistrer sur staging, envoyer les liens YouTube « non répertoriés » |
| Deux Elias Pettersson distincts ; l'import ne fusionne plus deux `nhl_id` différents | Pipeline | **Confirmer au pipeline du lundi 12 octobre** que les deux fiches restent distinctes |
| Pastille des non-lus sur le lien Communauté | Menu Admin | — |

## 4. À faire / à vérifier

### ▶ Prochaine session — commencer ici

- **Icônes et bandes de couleur** (staging seulement, 2026-10-09) : menu de gauche et en-têtes des
  cartes de l'accueil. À valider par David ; suite possible : colorer davantage, puis étendre aux
  titres de page.
- **Avis de signatures et d'échanges de la LNH** (en prod depuis le 2026-10-09, carte validée en
  staging) : rouler
  `supabase_migrations/nhl_transaction_alerts.sql` dans les deux bases, puis ouvrir l'accueil. La
  première lecture remplit la carte sans avis ; les suivantes avertissent les admins. À valider :
  la carte sur l'accueil et la réception d'un premier avis. Rappel : le scraping PuckPedia reste
  manuel (`./run_pipeline_staging.ps1`), l'avis sert à savoir quand le lancer.

- **Délai de réactivation levé pour remplacer un blessé** (en prod depuis le 2026-10-08) : à tester avec un
  compte pooler — désactiver un joueur, puis le réactiver dans le même lot qu'un actif blessé
  envoyé en réserve (message vert, soumission acceptée) ; sans blessé, toujours bloqué. Aussi : un
  poste vacant après une mise sur LTIR approuvée se comble par un joueur verrouillé.
- Migrations du 2026-10-08 roulées en staging et en prod : `delai_reactivation_defaut_3.sql`
  (délai de réactivation à 3 jours par défaut) et `poolers_notif_push.sql`. Aucune en attente.
- **Notifications rétablies automatiquement** (en prod depuis le 2026-10-08) : à tester
  sur un téléphone — activer, puis vider les données du site : à la reconnexion, l'abonnement
  revient seul ou le bandeau « Activer » s'affiche. Vérifier aussi que le mot de passe se remplit
  tout seul à la connexion.
- **Déconnexions sur Android** signalées par un pooler : cause non trouvée. Lui demander si c'est
  après avoir vidé les données du navigateur ou sans rien faire.

- **Types de recrue** : Protas et Kantserov corrigés en prod par David (2026-10-07). 127 recrues
  « repêché » de 2026-27 n'ont aucun choix du pool rattaché (alignements entrés en Mode init) :
  impossible de distinguer par la base un vrai repêché d'un agent libre mal classé. David corrige
  au cas par cas avec le ✎ de `/admin/init?tab=recrues`.
- **7 octobre au matin** : panneau « Mises à jour automatiques » → ligne « Points de la veille ».
  Si rien n'est parti vers 2 h-3 h ET, le cron Vercel ne fonctionne pas (cliquer « Lancer
  maintenant » en attendant, puis diagnostiquer).
- **Comparaison Marqueur — à surveiller les soirs de matchs.** Le 6 octobre à 17 h 57, Marqueur a
  renvoyé à Vercel des pages sans alignements (254 faux écarts affichés aux poolers). Garde-fou en
  prod : la page affiche maintenant « Lecture de Marqueur impossible ». Cause non établie (page
  complète depuis le poste de David au même moment). Si l'erreur revient chaque soir de matchs,
  Marqueur répond autrement à Vercel le soir : lire la page autrement (autre heure, autre source).
- **Courriels manquants, à décider** : plafond dépassé après une signature (push seulement, alors
  qu'il y a une date limite) et proposition d'échange acceptée par l'autre pooler (aucun avis au
  proposeur). Proposé à David le 6 octobre, sans réponse.
- **Elias Pettersson le défenseur** (fiche 3720) n'a pas de contrat en base : PuckPedia ne liste
  qu'un seul Elias Pettersson. Sans effet tant que personne ne le possède.
- **Tâches GitHub planifiées** : toutes partent avec 3 à 8 heures de retard. Seul l'import des
  points passe par Vercel ; blessures, stats avancées et trios gardent l'horaire GitHub (boutons
  manuels disponibles). À basculer sur Vercel si le retard dérange.
- Courriel quotidien des écarts avec Marqueur : pas fait (demanderait une tâche planifiée).

### Toujours ouverts (sessions précédentes)

- **Charge de la base pendant le hub** : diagnostic en suspens (2026-10-04), en attente des
  chiffres Supabase (Reports → Database, 3 oct. 21 h-23 h UTC). Envisager un plan supérieur si
  la base sature avec 8 poolers connectés.
- **`credentials/poolers-prod.md` périmé** pour 6 poolers ; dans `poolers-staging.md`, le mot de
  passe de `david@staging.test` est périmé aussi.
- **Lag du repêchage** et **file des agents libres** (correctifs du 2026-10-03, en prod) : à
  valider au prochain repêchage avec plusieurs poolers connectés.
- **Résumé des choix de repêchage** (`/admin/init?tab=choix`) : resynchronisation à valider.
- **Marché des échanges** : suite possible — sauvegarder une proposition comme scénario.
- **Outil d'analyse** : suites possibles — pointage du pool plutôt que points LNH.
- **Facteur de plafond** : analyse faite (`calcul_salaire/resume_facteur.md`), recommandation
  1,28 pour 2026-27. En attente de l'avis du pooler actuaire, puis décision du groupe.
- Tests réels encore à faire avec de vrais poolers : ballotage en saison, échange complet,
  demande de LTIR de bout en bout, courriels de commentaires (babillard / planification).
- Pages pas encore passées au mobile : `/statistiques/ahl`, `/calendrier`,
  `/repechage-agents-libres`, `/repechage-recrues`, `/simulation`.

## 5. Décisions en attente de David

- Délais LTIR (14 / 14 / 3 / 5 / 2 jours) : à discuter avec les poolers — ajustables dans
  `/admin/effectifs?tab=approbation`, aucune modif de code requise.
- Panneau d'aide contextuel pour les poolers (façon `AdminGuidePanel`) : en attente d'un
  retour de pooler sur `/aide` et `/a-propos`.

## 6. Prochains chantiers possibles (backlog)

- Compléter la couverture ESPN des projections (joueurs de profondeur) si jugé utile.
- Yahoo comme 3ᵉ source de blessures (validé techniquement, pas branché).
