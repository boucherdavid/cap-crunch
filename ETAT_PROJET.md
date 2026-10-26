# État du projet — Cap Crunch

> **Instantané « où on en est »**, réécrit à chaque fin de session (pas un journal).
> L'historique détaillé est dans `SUIVI_PROJET.md` ; la référence stable dans `CLAUDE.md`.
> Si un point ci-dessous est réglé, le retirer ou le déplacer — ne jamais l'empiler.

**Dernière mise à jour :** 2026-10-25

---

## 1. Où en est la saison

- **Saison 2026-27 démarrée en prod** le 4 octobre au soir (`season_started=true`). Gestion
  d'effectifs, ballotage, échanges et LTIR sont ouverts aux poolers.
- **Staging** : copie de la prod datant du 2026-10-06. À rafraîchir avant chaque séance de test
  (Admin → Mise à jour de données, sur staging). Ses blessures et ses mouvements sont donc en
  retard sur la prod.
- **Salaires et contrats** : rafraîchis le 2026-10-13 (pipeline local, CSV poussés sur `main`).
  Le scraping de PuckPedia reste **manuel** (`./run_pipeline_staging.ps1`) ; le bouton de l'admin
  et la tâche du lundi ne font que réimporter les CSV du dépôt.
- Classement validé contre Marqueur.com ; seul écart de points connu, Ryan Leonard (Vincent) —
  1 pt selon la LNH, 2 sur Marqueur (erreur de Marqueur).
- **Base de prod (Supabase, machine Nano)** : « Unhealthy » le 14 au matin (incident chez Supabase
  + CPU à 86-92 %, en hausse depuis le 8). Redémarrée par David, revenue « Healthy ». Corrigé le
  même jour : requête « dernier match des blessés » bornée par date (la plus coûteuse), classement
  et blessures en cache (`data_versions`). **À faire vers le 15-16 octobre** : relancer
  `pg_stat_statements` (requête dans `SUIVI_PROJET.md`, 2026-10-14) et regarder le CPU.

## 2. Branches / déploiement

| Branche | État |
|---|---|
| `staging` | = `main` |
| `main` (prod) | À jour au 2026-10-26 — ballotage : l'admin ne voit les réclamations qu'à la fin du délai (résumé à l'attribution), validé par David ; échanges : joueur reçu encore protégé envoyé directement en banque, étiquette recrue conservée (à voir sur l'échange Connelly) ; Hellebuyck à 8,5 M$ via `source/cap_overrides.csv` (import prod refait). Le 25 : avis push à l'admin pour les mouvements d'alignement des poolers et les réclamations au ballotage (confidentialité respectée), validé par David — à observer au prochain ballotage ; classement quotidien (`/classement/quotidien`, hier par défaut), cartes officielles de la soirée sur l'accueil (avec filtre par pooler) une fois les points importés, bandeau de fin de soirée sur En direct, validé par David ; blanchissages : règle « seul gardien à avoir joué » au lieu de 60:00 + valeur officielle du game-log LNH (Kochetkov, Oettinger corrigés), validé par David. Le 24 : stats avancées des gardiens (% arr. danger élevé, rebonds évités, part des départs de l'équipe, xB % et xBA/60 de l'équipe) et onglet Échanges avec l'alignement en colonne étroite, validés par David. Le 23 : vérifications de l'accueil une fois par heure pour tout le site (`lib/homeSyncs.ts`), validé par David ; à observer : pics d'IOwait aux 10–15 min dans Supabase (s'ils persistent, ils viennent de Supabase). échanges : propriétaire d'origine affiché sur les choix de repêchage (« Choix ronde 3 (2027) de Sébastien F. »), validé par David. Le 21 : classement : vue « Par position » (totaux attaquants/défenseurs/gardiens par pooler), validé par David ; onglet Marqueur : écarts regroupés par panier, sorties jumelées aux entrées par position, validé par David. Le 19 : délai de réclamation au ballotage réglé dans Configuration → Général, `/aide` qui affiche la valeur en vigueur, validé par David (valeur en prod : 2, à décider avec les poolers) ; fiche joueur : boutons « Simuler dans mon alignement », « Simuler une transaction » et « Proposer un échange » (demande d'un pooler), validé par David ; périodes actives : aller-retour du même jour sans match fusionné en une seule période, fenêtre active vide du même jour masquée (Marchenko/Hryckowian), validé par David. Le 18 : Journal des activités : filtre pooler ligne par ligne et compteurs des onglets selon les filtres (validé par David) ; Journal des activités : filtre par joueur + encadré « Périodes actives » (matchs comptés vs LNH) ; imports qui ignorent les gardiens substituts (toi 0:00), nettoyage roulé en prod (253 lignes en 2026-27, 2404 en 2025-26 ; Wedgewood = 2 MJ) ; onglet Alignement : colonne « Aujourd'hui » (match du jour) et lignes colorées réserviste/LTIR, validé par David. Le 17 : délai de réactivation compté en jours civils (désactivé le 17 → activable le 20 dès 0 h) ; onglet « Prochains matchs » : filtre par position, recrues hors de « Tous » ; « Journal des activités » (renommé) avec filtre pooler en liste déroulante ; liens Marqueur retirés des menus (comparaison = onglet admin seulement, message clair pendant les mises à jour de Marqueur) ; bouton Marqueur.com et sélecteur de pooler en guise de titre sur chaque alignement — tout validé par David en staging. Le 16 : délai de réactivation après une remise en banque et journal des lots de Gestion d'effectifs (journal reconstitué en prod), gardiens partants (page qui se met à jour seule + carte de l'accueil), groupe de menu « Soir de match », carte des blessures en cache, rappels avant les dates limites (ballotage, échanges, plafond) et réponses au ballotage pour l'admin, validés par David en staging. Inclut aussi, en plus du 13 : fausse page « Pas de connexion » corrigée (service worker), requête des blessés bornée, classement et blessures en cache, protection recrue unifiée (règle unique, correction et révision des étiquettes, recrue sans contrat bloquée en banque, années de repêchage en une seule année), échange effectif le lendemain si un match d'un joueur impliqué est commencé, pointage de la soirée selon l'alignement à l'heure du match |

- Migrations `data_versions.sql` (2026-10-14) et `deadline_reminders.sql` (2026-10-16) roulées en staging et en prod.
- Variables Vercel : prod `CRON_SECRET`, `GITHUB_WORKFLOW_TOKEN` ; staging `GITHUB_WORKFLOW_TOKEN`,
  `EMAIL_REDIRECT_TO` (jamais en prod). Le jeton GitHub « Cap Crunch Vercel » **expire** : à
  renouveler dans les deux projets, sinon l'import de nuit et les boutons de mise à jour cessent.
- `trade_offer_messages.sql` (2026-10-10), `ltir_requests_batch.sql` et `trade_offer_revised_at.sql` (2026-10-11) roulées en staging et en prod.
- Migrations des 8 et 9 octobre roulées en staging et en prod : `delai_reactivation_defaut_3.sql`,
  `poolers_notif_push.sql`, `ltir_relapse_games.sql`.
- **À confirmer** : `nhl_transaction_alerts.sql` en prod (roulée en staging, où la carte
  s'affiche). Sans elle, la carte des signatures et les avis restent inactifs en prod.
- Pousser des CSV sur `staging` déclenche aussi un import en prod (`import.yml` n'est pas limité à
  `main`) : sans gravité, mais deux imports tournent alors en parallèle. Correctif proposé, pas fait.

## 3. Livré le 16 octobre 2026 (tout est en prod)

| Fonctionnalité | Où | Validation |
|---|---|---|
| Gardiens partants (Daily Faceoff + Goaliepost, cache 10 min par site, page qui se met à jour seule aux 5 min) | `/statistiques/gardiens-partants`, carte « Gardiens du pool ce soir » sur l'accueil | Validé par David en staging |
| Groupe de menu « Soir de match » : En direct, Gardiens partants, Trios et paires | Menu, bandeau, cartes de l'accueil | Validé par David |
| Carte « Blessures dans le pool » en cache (version des alignements) | Accueil | Validé par David en staging |
| Ballotage et échanges réglés aussi depuis l'accueil (plus seulement à l'ouverture de l'onglet) | Accueil (`syncDeadlines`) | Validé par David en staging |
| Rappels push + courriel : ballotage (dernier jour), ballotage remporté (24 h avant), échange (1 jour avant), plafond (2 jours avant) ; avis aux admins pour un ballotage bloqué | Notifications | Pas encore vu partir en vrai — surveiller au prochain ballotage |
| Réponses au ballotage pour l'admin (après son refus ; toujours dans l'historique) | Gestion d'effectifs → Ballotage | Validé par David en staging |

- Le 14 octobre (aussi en prod) : cache du classement et des blessures, protection recrue unifiée,
  échange effectif le lendemain si un match est commencé, pointage de la soirée selon l'alignement
  à l'heure du match — détails dans `SUIVI_PROJET.md`.

## 4. À faire / à vérifier

### ▶ Prochaine session — commencer ici

- **`pg_stat_statements`** : remettre à zéro en prod (`select pg_stat_statements_reset();`) si pas
  déjà fait, puis relancer la requête de diagnostic vers le 18-19 octobre (carte des blessures et
  `syncDeadlines` depuis l'accueil).
- **Premiers rappels de délai** : vérifier au prochain ballotage ou échange qu'un seul rappel part,
  au bon moment, aux bons poolers.
- **Page « Pas de connexion »** : confirmer sur téléphone qu'elle n'apparaît plus à tort.
- **Blake et Poitras** : étiquetés « agent libre » en 2025-26, ELC terminé, donc non protégés —
  corriger avec ✎ seulement si l'un des deux avait été repêché par le pool.
- **Bilecki** (staging seulement) : actif sans contrat depuis le test du 14 ; le remettre en banque.
- **Nate Danielson** ajouté à la main dans la banque de Vincent en prod le 2026-10-11 (oubli de
  l'initialisation), comme recrue repêchée en 2023 : confirmer l'année avec Vincent.
- **Scraping PuckPedia** : `chromedriver` 155 plante encore par moments. À chaque run, lire la fin
  du scraping : aucune équipe « PÉRIMÉE », aucune fiche « cap hit RÉDUIT conservé ». Sinon, ne pas
  importer et relancer.
- **Date effective forcée (admin, Gestion d'effectifs)** : note et avertissement promus sans essai
  à l'écran — à regarder au prochain changement daté.
- **LTIR avec panier** : l'approbation d'une demande avec panier n'a pas encore tourné.
- **Demande n° 14 de Paule** (Eklund sur LTIR + Tom Wilson, ancienne mécanique) : à approuver telle
  quelle, ou à faire annuler et refaire.
- **Marchand (LTIR de Vincent)** : un nouveau délai de 14 jours doit partir à son prochain match ;
  vérifier que l'avis arrive. Samoskevich (Steve) : échéance de retour vers le 19 octobre.
- **Tests à faire par David** : délai de réactivation avec un compte pooler ; notifications sur
  téléphone après avoir vidé les données du site.
- **Déconnexions sur Android** signalées par un pooler : cause non trouvée.
- **Vidéos de l'Aide** : David enregistre sur staging, téléverse sur YouTube en « Non répertoriée »
  et envoie les liens avec la section visée.
- **Comparaison Marqueur les soirs de matchs** : garde-fou en place, cause du 6 octobre non établie.
- **Import de nuit par Vercel Cron** : jamais confirmé qu'une exécution part bien vers 2 h-3 h ET
  (panneau « Mises à jour automatiques »).
- **Courriels manquants, à décider** : plafond dépassé après une signature (push seulement) et
  proposition d'échange acceptée (aucun avis au proposeur).

### Toujours ouverts (sessions précédentes)

- **Elias Pettersson le défenseur** (fiche 3720) sans contrat en base. Sans effet tant que
  personne ne le possède.
- **Tâches GitHub planifiées** : 3 à 8 heures de retard. Seul l'import des points passe par
  Vercel ; blessures, stats avancées et trios gardent l'horaire GitHub (boutons manuels).
- **`credentials/poolers-prod.md` périmé** pour 6 poolers ; mot de passe de `david@staging.test`
  périmé dans `poolers-staging.md`.
- **Lag du repêchage** et **file des agents libres** (correctifs du 2026-10-03) : à valider au
  prochain repêchage.
- **Facteur de plafond** : 1,28 en vigueur pour 2026-27 (134 M$). Le prix du marché est fragile
  (1 à 6 contrats par palier du haut) — à rendre plus robuste avant l'été 2027. Avis du pooler
  actuaire toujours attendu.
- Tests réels encore à faire avec de vrais poolers : ballotage en saison, demande de LTIR de bout
  en bout, courriels de commentaires.
- Pages pas encore passées au mobile : `/statistiques/ahl`, `/calendrier`,
  `/repechage-agents-libres`, `/repechage-recrues`.

## 5. Décisions en attente de David

- **Base de prod en manque de mémoire** (2026-10-23) : swap ~380 Mo permanent sur la Nano, alerte Disk IO. Décision de David : rester sur Supabase (Neon/Aiven écartés — migration trop lourde). Pro + Micro (25 $ US/mois) seulement si les poolers contribuent ; sinon gratuit, et Pro autour du pool (monter la taille pour la soirée). Staging déjà déplacé dans une organisation gratuite séparée. À surveiller : Log Ingestion (1,25 Go / 1 Go, facturé dès début 2027), taille de la base (500 Mo max). Si la prod redevient « Unhealthy » : la redémarrer dans Supabase.

- Délais LTIR (14 / 14 / 3 / 5 / 2 jours, 2 matchs pour la rechute) : à discuter avec les poolers,
  ajustables dans `/admin/effectifs?tab=approbation`.
- Limiter `import.yml` à la branche `main` (voir section 2).
- Panneau d'aide contextuel pour les poolers : en attente d'un retour sur `/aide` et `/a-propos`.
- Échange n° 11 (Yurov, David → Jérôme) : confirmé pendant un match commencé, laissé tel quel
  (recrue des deux côtés, aucun point) — à corriger seulement si David le souhaite.

## 6. Prochains chantiers possibles (backlog)

- Simulation sur téléphone : ajouter la simulation d'un échange entre poolers, seulement si un
  pooler la demande.
- Lancer le scraping de PuckPedia par une tâche planifiée de Windows sur le poste de David.
- Courriel quotidien des écarts avec Marqueur (demanderait une tâche planifiée).
- Marché des échanges : sauvegarder une proposition comme scénario.
- `/signaler` : section « Mes demandes » avec l'état et la réponse de l'admin.
- Outil d'analyse : pointage du pool plutôt que points LNH.
- Compléter la couverture ESPN des projections ; Yahoo comme source de blessures supplémentaire.
- `/statistiques/blessures` : sa propre lecture n'est pas en cache (bornée par date, légère).
