# État du projet — Cap Crunch

> **Instantané « où on en est »**, réécrit à chaque fin de session (pas un journal).
> L'historique détaillé est dans `SUIVI_PROJET.md` ; la référence stable dans `CLAUDE.md`.
> Si un point ci-dessous est réglé, le retirer ou le déplacer — ne jamais l'empiler.

**Dernière mise à jour :** 2026-10-10

---

## 1. Où en est la saison

- **Saison 2026-27 démarrée en prod** le 4 octobre au soir (`season_started=true`). Gestion
  d'effectifs, ballotage, échanges et LTIR sont ouverts aux poolers.
- **Staging** : copie de la prod datant du 2026-10-06. À rafraîchir avant chaque séance de test
  (Admin → Mise à jour de données, sur staging). Ses blessures et ses mouvements sont donc en
  retard sur la prod.
- **Salaires et contrats** : rafraîchis le 2026-10-08 (pipeline local, CSV poussés sur `main`).
  Le scraping de PuckPedia reste **manuel** (`./run_pipeline_staging.ps1`) ; le bouton de l'admin
  et la tâche du lundi ne font que réimporter les CSV du dépôt.
- Classement validé contre Marqueur.com ; seul écart de points connu, Ryan Leonard (Vincent) —
  1 pt selon la LNH, 2 sur Marqueur (erreur de Marqueur).

## 2. Branches / déploiement

| Branche | État |
|---|---|
| `staging` | En avance sur `main` : échanges avec message, contre-offre, retrait et discussion (2026-10-10), à valider |
| `main` (prod) | À jour au 2026-10-09 — tout ce qui est décrit en section 3 est en prod |

- Variables Vercel : prod `CRON_SECRET`, `GITHUB_WORKFLOW_TOKEN` ; staging `GITHUB_WORKFLOW_TOKEN`,
  `EMAIL_REDIRECT_TO` (jamais en prod). Le jeton GitHub « Cap Crunch Vercel » **expire** : à
  renouveler dans les deux projets, sinon l'import de nuit et les boutons de mise à jour cessent.
- **`trade_offer_messages.sql`** (2026-10-10) : roulée en staging, **à rouler en prod avant de
  promouvoir** — sans elle, l'onglet Échanges paraît vide.
- Migrations des 8 et 9 octobre roulées en staging et en prod : `delai_reactivation_defaut_3.sql`,
  `poolers_notif_push.sql`, `ltir_relapse_games.sql`.
- **À confirmer** : `nhl_transaction_alerts.sql` en prod (roulée en staging, où la carte
  s'affiche). Sans elle, la carte des signatures et les avis restent inactifs en prod.
- Pousser des CSV sur `staging` déclenche aussi un import en prod (`import.yml` n'est pas limité à
  `main`) : sans gravité, mais deux imports tournent alors en parallèle. Correctif proposé, pas fait.

## 3. Livré les 8 et 9 octobre 2026 (tout est en prod)

| Fonctionnalité | Où | Validation |
|---|---|---|
| Délai de réactivation levé pour remplacer un actif blessé ou combler un poste vacant après un LTIR ; délai à 3 jours par défaut | Gestion d'effectifs | Pas testé avec un compte pooler |
| Notifications mémorisées sur le compte et rétablies automatiquement ; bandeau « Activer » ; mot de passe rempli automatiquement à la connexion | Partout, `/compte`, `/login` | Pas testé sur un appareil |
| Budgets de signatures d'agents libres expliqués (standard, LTIR, débordement) | Gestion d'effectifs, Aide → Règlements | Validé par David |
| Avis de signatures et d'échanges de la LNH (ESPN + alignements de la LNH) : push et courriel aux admins, carte sur l'accueil | Accueil | Carte validée en staging ; aucun avis réel reçu encore |
| Icônes et couleurs par famille du menu ; bandeau de titre sur toutes les pages du menu (titres en double retirés) | Menu, accueil, toutes les pages | Accueil et bandeaux validés ; les ~30 pages touchées n'ont pas toutes été revues |
| Mobile : accueil avec cartes secondaires repliées, Contrats LNH (colonne Contrat, filtres repliés), Trios et paires, Simulation simplifiée avec scénarios | Téléphone | Simulation et Trios validés par David |
| Retour de LTIR : une rechute de 2 matchs consécutifs manqués annule le retour obligatoire (seuil réglable) | Approbation → seuils LTIR | Jamais exécutée sur un cas réel |
| Comparaison Marqueur : heure d'effet de chaque mouvement à reporter | Admin et page des poolers | Pas confirmé par David |
| Badge « Blessé » uniforme pour les joueurs déjà sur le LTIR | Page d'un pooler | Validé par David |

## 4. À faire / à vérifier

### ▶ Prochaine session — commencer ici

- **Échanges (staging)** : tester avec deux comptes pooler : proposition avec message, contre-offre,
  retrait, abandon après acceptation, discussion et partage avec l'admin (section « Discussions
  d'échange partagées » de l'onglet Approbation). Puis migration en prod et promotion.

- **Marchand (LTIR de Vincent)** : son délai de retour a été annulé le 9 octobre par la première
  version de la règle de rechute, et David a choisi de le laisser ainsi. Un nouveau délai de
  14 jours doit partir à son prochain match (retour estimé le 10 octobre) : vérifier que l'avis
  arrive. Samoskevich (Steve) : échéance de retour vers le 19 octobre, inchangée.
- **Pipeline du lundi 12 octobre** : confirmer que les deux Elias Pettersson restent distincts.
- **Tests à faire par David** : délai de réactivation avec un compte pooler (désactiver un joueur,
  puis le réactiver dans le même lot qu'un actif blessé envoyé en réserve) ; notifications sur
  téléphone après avoir vidé les données du site.
- **Déconnexions sur Android** signalées par un pooler : cause non trouvée. Lui demander si c'est
  après avoir vidé les données du navigateur ou sans rien faire.
- **Vidéos de l'Aide** : David enregistre sur staging, téléverse sur YouTube en « Non répertoriée »
  et envoie les liens avec la section visée.
- **Comparaison Marqueur les soirs de matchs** : le 6 octobre, Marqueur a renvoyé des pages sans
  alignements à Vercel. Garde-fou en place (« Lecture de Marqueur impossible ») ; cause non
  établie. À surveiller.
- **Import de nuit par Vercel Cron** : jamais confirmé qu'une exécution part bien vers 2 h-3 h ET
  (panneau « Mises à jour automatiques », ligne « Points de la veille »).
- **Courriels manquants, à décider** : plafond dépassé après une signature (push seulement) et
  proposition d'échange acceptée (aucun avis au proposeur). Proposé le 6 octobre, sans réponse.

### Toujours ouverts (sessions précédentes)

- **Types de recrue** : 127 recrues « repêché » de 2026-27 sans choix du pool rattaché ; David
  corrige au cas par cas avec le ✎ de `/admin/init?tab=recrues`.
- **Elias Pettersson le défenseur** (fiche 3720) sans contrat en base. Sans effet tant que
  personne ne le possède.
- **Tâches GitHub planifiées** : 3 à 8 heures de retard. Seul l'import des points passe par
  Vercel ; blessures, stats avancées et trios gardent l'horaire GitHub (boutons manuels).
- **Charge de la base pendant le hub** : diagnostic en suspens, en attente des chiffres Supabase.
- **`credentials/poolers-prod.md` périmé** pour 6 poolers ; mot de passe de `david@staging.test`
  périmé dans `poolers-staging.md`.
- **Lag du repêchage** et **file des agents libres** (correctifs du 2026-10-03) : à valider au
  prochain repêchage.
- **Facteur de plafond** : recommandation 1,28 pour 2026-27, en attente de l'avis du pooler
  actuaire puis du groupe.
- Tests réels encore à faire avec de vrais poolers : ballotage en saison, échange complet (y
  compris un joueur sur LTIR), demande de LTIR de bout en bout, courriels de commentaires.
- Pages pas encore passées au mobile : `/statistiques/ahl`, `/calendrier`,
  `/repechage-agents-libres`, `/repechage-recrues`.

## 5. Décisions en attente de David

- Délais LTIR (14 / 14 / 3 / 5 / 2 jours, 2 matchs pour la rechute) : à discuter avec les poolers,
  ajustables dans `/admin/effectifs?tab=approbation`.
- Limiter `import.yml` à la branche `main` (voir section 2).
- Panneau d'aide contextuel pour les poolers : en attente d'un retour sur `/aide` et `/a-propos`.

## 6. Prochains chantiers possibles (backlog)

- Simulation sur téléphone : ajouter la simulation d'un échange entre poolers, seulement si un
  pooler la demande (les blocs existent, seule la mise en page est à revoir).
- Lancer le scraping de PuckPedia par une tâche planifiée de Windows sur le poste de David.
- Courriel quotidien des écarts avec Marqueur (demanderait une tâche planifiée).
- Marché des échanges : sauvegarder une proposition comme scénario.
- Outil d'analyse : pointage du pool plutôt que points LNH.
- Compléter la couverture ESPN des projections ; Yahoo comme source de blessures supplémentaire.
