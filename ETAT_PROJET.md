# Ã‰tat du projet â€” Cap Crunch

> **InstantanÃ© Â« oÃ¹ on en est Â»**, rÃ©Ã©crit Ã  chaque fin de session (pas un journal).
> L'historique dÃ©taillÃ© est dans `SUIVI_PROJET.md` ; la rÃ©fÃ©rence stable dans `CLAUDE.md`.
> Si un point ci-dessous est rÃ©glÃ©, le retirer ou le dÃ©placer â€” ne jamais l'empiler.

**DerniÃ¨re mise Ã  jour :** 2026-10-14

---

## 1. OÃ¹ en est la saison

- **Saison 2026-27 dÃ©marrÃ©e en prod** le 4 octobre au soir (`season_started=true`). Gestion
  d'effectifs, ballotage, Ã©changes et LTIR sont ouverts aux poolers.
- **Staging** : copie de la prod datant du 2026-10-06. Ã€ rafraÃ®chir avant chaque sÃ©ance de test
  (Admin â†’ Mise Ã  jour de donnÃ©es, sur staging). Ses blessures et ses mouvements sont donc en
  retard sur la prod.
- **Salaires et contrats** : rafraÃ®chis le 2026-10-13 (pipeline local, CSV poussÃ©s sur `main`).
  Le scraping de PuckPedia reste **manuel** (`./run_pipeline_staging.ps1`) ; le bouton de l'admin
  et la tÃ¢che du lundi ne font que rÃ©importer les CSV du dÃ©pÃ´t.
- Classement validÃ© contre Marqueur.com ; seul Ã©cart de points connu, Ryan Leonard (Vincent) â€”
  1 pt selon la LNH, 2 sur Marqueur (erreur de Marqueur).

- **Limite d'I/O disque Supabase atteinte en prod (2026-10-12)** : causÃ©e par les imports qui
  rÃ©Ã©crivaient tout. Correctif en prod le 2026-10-12, statistiques remises Ã  zÃ©ro le 2026-10-12 Ã  18 h 54 UTC :
  relancer la requÃªte de diagnostic vers le 15 octobre.
  **2026-10-14 : la prod ne rÃ©pond de nouveau plus** (requÃªtes en timeout, import des points en
  Ã©chec deux fois). Cause Ã  confirmer dans le tableau de bord Supabase.
- **Correctifs du 2026-10-14 en prod** : service worker (fausse page Â« Pas de connexion Â») et
  requÃªte Â« dernier match des blessÃ©s Â» bornÃ©e par date. Ã€ surveiller : CPU de la prod (86-92 % le
  14 au matin) â€” relancer `pg_stat_statements` dans 1-2 jours. Mise en cache du classement et des
  blessures sur staging (voir Branches).

## 2. Branches / dÃ©ploiement

| Branche | Ã‰tat |
|---|---|
| `staging` | `main` + échange effectif le lendemain si un match d’un joueur impliqué est commencé, à valider |
| `main` (prod) | Ã€ jour au 2026-10-13 â€” inclut la date effective forcÃ©e (note et avertissement), les correctifs du scraping PuckPedia, les notifications de l'admin classÃ©es par type, le calcul du facteur de plafond (admin) et son explication dans l'aide, la simulation pour un autre pooler (admin), les faits saillants sur l'accueil (bandeau sous le logo), le dÃ©tail des Ã©changes et l'effacement des mouvements annulÃ©s sur l'accueil, l'annulation le jour mÃªme d'une mise en rÃ©serve, l'activitÃ© du pool basÃ©e sur les vrais mouvements et l'annonce Ã  tous des signatures et Ã©changes, la discussion et la modification des offres d'Ã©change, le LTIR avec panier complet, MJ et PTS/MJ, l'avis de demande traitÃ©e |

- Variables Vercel : prod `CRON_SECRET`, `GITHUB_WORKFLOW_TOKEN` ; staging `GITHUB_WORKFLOW_TOKEN`,
  `EMAIL_REDIRECT_TO` (jamais en prod). Le jeton GitHub Â« Cap Crunch Vercel Â» **expire** : Ã 
  renouveler dans les deux projets, sinon l'import de nuit et les boutons de mise Ã  jour cessent.
- `trade_offer_messages.sql` (2026-10-10), `ltir_requests_batch.sql` et `trade_offer_revised_at.sql` (2026-10-11) roulÃ©es en staging et en prod.
- Migrations des 8 et 9 octobre roulÃ©es en staging et en prod : `delai_reactivation_defaut_3.sql`,
  `poolers_notif_push.sql`, `ltir_relapse_games.sql`.
- **Ã€ confirmer** : `nhl_transaction_alerts.sql` en prod (roulÃ©e en staging, oÃ¹ la carte
  s'affiche). Sans elle, la carte des signatures et les avis restent inactifs en prod.
- Pousser des CSV sur `staging` dÃ©clenche aussi un import en prod (`import.yml` n'est pas limitÃ© Ã 
  `main`) : sans gravitÃ©, mais deux imports tournent alors en parallÃ¨le. Correctif proposÃ©, pas fait.

## 3. LivrÃ© les 8 et 9 octobre 2026 (tout est en prod)

| FonctionnalitÃ© | OÃ¹ | Validation |
|---|---|---|
| DÃ©lai de rÃ©activation levÃ© pour remplacer un actif blessÃ© ou combler un poste vacant aprÃ¨s un LTIR ; dÃ©lai Ã  3 jours par dÃ©faut | Gestion d'effectifs | Pas testÃ© avec un compte pooler |
| Notifications mÃ©morisÃ©es sur le compte et rÃ©tablies automatiquement ; bandeau Â« Activer Â» ; mot de passe rempli automatiquement Ã  la connexion | Partout, `/compte`, `/login` | Pas testÃ© sur un appareil |
| Budgets de signatures d'agents libres expliquÃ©s (standard, LTIR, dÃ©bordement) | Gestion d'effectifs, Aide â†’ RÃ¨glements | ValidÃ© par David |
| Avis de signatures et d'Ã©changes de la LNH (ESPN + alignements de la LNH) : push et courriel aux admins, carte sur l'accueil | Accueil | Carte validÃ©e en staging ; aucun avis rÃ©el reÃ§u encore |
| IcÃ´nes et couleurs par famille du menu ; bandeau de titre sur toutes les pages du menu (titres en double retirÃ©s) | Menu, accueil, toutes les pages | Accueil et bandeaux validÃ©s ; les ~30 pages touchÃ©es n'ont pas toutes Ã©tÃ© revues |
| Mobile : accueil avec cartes secondaires repliÃ©es, Contrats LNH (colonne Contrat, filtres repliÃ©s), Trios et paires, Simulation simplifiÃ©e avec scÃ©narios | TÃ©lÃ©phone | Simulation et Trios validÃ©s par David |
| Retour de LTIR : une rechute de 2 matchs consÃ©cutifs manquÃ©s annule le retour obligatoire (seuil rÃ©glable) | Approbation â†’ seuils LTIR | Jamais exÃ©cutÃ©e sur un cas rÃ©el |
| Comparaison Marqueur : heure d'effet de chaque mouvement Ã  reporter | Admin et page des poolers | Pas confirmÃ© par David |
| Badge Â« BlessÃ© Â» uniforme pour les joueurs dÃ©jÃ  sur le LTIR | Page d'un pooler | ValidÃ© par David |

## 4. Ã€ faire / Ã  vÃ©rifier

### â–¶ Prochaine session â€” commencer ici

- **Nate Danielson** ajoutÃ© Ã  la main dans la banque de Vincent en prod le 2026-10-11 (oubli de
  l'initialisation), comme recrue repÃªchÃ©e en 2023 : confirmer l'annÃ©e avec Vincent.
- **Scraping PuckPedia** : `chromedriver` 155 plante encore par moments (9 relances de fenÃªtre
  au run du 2026-10-13). Le script s'en remet (fenÃªtres fermÃ©es, fiches joueurs relues), mais Ã 
  chaque run, lire la fin du scraping : aucune Ã©quipe Â« PÃ‰RIMÃ‰E Â», aucune fiche Â« cap hit RÃ‰DUIT
  conservÃ© Â». Sinon, ne pas importer et relancer. Ã€ revoir si une mise Ã  jour de Chrome rÃ¨gle le plantage.
- **Date effective forcÃ©e (admin, Gestion d'effectifs)** : note et avertissement de rÃ©troactivitÃ©
  en prod depuis le 2026-10-13, promus sans essai Ã  l'Ã©cran â€” Ã  regarder au prochain changement datÃ©.



- **LTIR avec panier** (statut de l'agent libre au choix, tout le panier joint Ã  la demande,
  composition affichÃ©e prÃ¨s de Soumettre) : en prod depuis le 2026-10-11, validÃ© par David en
  staging jusqu'Ã  la soumission ; l'approbation d'une demande avec panier n'a pas encore tournÃ©.
- **Demande nÂ° 14 de Paule** (Eklund sur LTIR + Tom Wilson, ancienne mÃ©canique) : Ã  approuver telle
  quelle (Wilson arrive rÃ©serviste, elle l'active ensuite), ou Ã  faire annuler et refaire aprÃ¨s la
  promotion.

- **Ã‰changes** (message, contre-offre, retrait, discussion) : validÃ©s en staging par David et en
  prod depuis le 2026-10-10 ; Ã  surveiller au premier vrai Ã©change entre poolers.

- **Marchand (LTIR de Vincent)** : son dÃ©lai de retour a Ã©tÃ© annulÃ© le 9 octobre par la premiÃ¨re
  version de la rÃ¨gle de rechute, et David a choisi de le laisser ainsi. Un nouveau dÃ©lai de
  14 jours doit partir Ã  son prochain match (retour estimÃ© le 10 octobre) : vÃ©rifier que l'avis
  arrive. Samoskevich (Steve) : Ã©chÃ©ance de retour vers le 19 octobre, inchangÃ©e.
- **Pipeline du lundi 12 octobre** : confirmer que les deux Elias Pettersson restent distincts.
- **Tests Ã  faire par David** : dÃ©lai de rÃ©activation avec un compte pooler (dÃ©sactiver un joueur,
  puis le rÃ©activer dans le mÃªme lot qu'un actif blessÃ© envoyÃ© en rÃ©serve) ; notifications sur
  tÃ©lÃ©phone aprÃ¨s avoir vidÃ© les donnÃ©es du site.
- **DÃ©connexions sur Android** signalÃ©es par un pooler : cause non trouvÃ©e. Lui demander si c'est
  aprÃ¨s avoir vidÃ© les donnÃ©es du navigateur ou sans rien faire.
- **VidÃ©os de l'Aide** : David enregistre sur staging, tÃ©lÃ©verse sur YouTube en Â« Non rÃ©pertoriÃ©e Â»
  et envoie les liens avec la section visÃ©e.
- **Comparaison Marqueur les soirs de matchs** : le 6 octobre, Marqueur a renvoyÃ© des pages sans
  alignements Ã  Vercel. Garde-fou en place (Â« Lecture de Marqueur impossible Â») ; cause non
  Ã©tablie. Ã€ surveiller.
- **Import de nuit par Vercel Cron** : jamais confirmÃ© qu'une exÃ©cution part bien vers 2 h-3 h ET
  (panneau Â« Mises Ã  jour automatiques Â», ligne Â« Points de la veille Â»).
- **Courriels manquants, Ã  dÃ©cider** : plafond dÃ©passÃ© aprÃ¨s une signature (push seulement) et
  proposition d'Ã©change acceptÃ©e (aucun avis au proposeur). ProposÃ© le 6 octobre, sans rÃ©ponse.

### Toujours ouverts (sessions prÃ©cÃ©dentes)

- **Types de recrue** : 127 recrues Â« repÃªchÃ© Â» de 2026-27 sans choix du pool rattachÃ© ; David
  corrige au cas par cas avec le âœŽ de `/admin/init?tab=recrues`.
- **Elias Pettersson le dÃ©fenseur** (fiche 3720) sans contrat en base. Sans effet tant que
  personne ne le possÃ¨de.
- **TÃ¢ches GitHub planifiÃ©es** : 3 Ã  8 heures de retard. Seul l'import des points passe par
  Vercel ; blessures, stats avancÃ©es et trios gardent l'horaire GitHub (boutons manuels).
- **Charge de la base pendant le hub** : diagnostic en suspens, en attente des chiffres Supabase.
- **`credentials/poolers-prod.md` pÃ©rimÃ©** pour 6 poolers ; mot de passe de `david@staging.test`
  pÃ©rimÃ© dans `poolers-staging.md`.
- **Lag du repÃªchage** et **file des agents libres** (correctifs du 2026-10-03) : Ã  valider au
  prochain repÃªchage.
- **Facteur de plafond** : 1,28 en vigueur pour 2026-27 (134 M$). Calcul maintenant dans l'app
  (Configuration â†’ Saisons, Â« Calculer le facteur Â») et expliquÃ© dans l'aide. Le prix du marchÃ©
  est fragile (1 Ã  6 contrats par palier du haut : +3,1 % sur staging, +6,2 % sur la prod) â€” Ã 
  rendre plus robuste avant l'Ã©tÃ© 2027 (2 saisons de contrats ou modÃ¨le continu). Avis du pooler
  actuaire toujours attendu.
- Tests rÃ©els encore Ã  faire avec de vrais poolers : ballotage en saison, Ã©change complet (y
  compris un joueur sur LTIR), demande de LTIR de bout en bout, courriels de commentaires.
- Pages pas encore passÃ©es au mobile : `/statistiques/ahl`, `/calendrier`,
  `/repechage-agents-libres`, `/repechage-recrues`.

## 5. DÃ©cisions en attente de David

- DÃ©lais LTIR (14 / 14 / 3 / 5 / 2 jours, 2 matchs pour la rechute) : Ã  discuter avec les poolers,
  ajustables dans `/admin/effectifs?tab=approbation`.
- Limiter `import.yml` Ã  la branche `main` (voir section 2).
- Panneau d'aide contextuel pour les poolers : en attente d'un retour sur `/aide` et `/a-propos`.

## 6. Prochains chantiers possibles (backlog)

- Simulation sur tÃ©lÃ©phone : ajouter la simulation d'un Ã©change entre poolers, seulement si un
  pooler la demande (les blocs existent, seule la mise en page est Ã  revoir).
- Lancer le scraping de PuckPedia par une tÃ¢che planifiÃ©e de Windows sur le poste de David.
- Courriel quotidien des Ã©carts avec Marqueur (demanderait une tÃ¢che planifiÃ©e).
- MarchÃ© des Ã©changes : sauvegarder une proposition comme scÃ©nario.
- Banque de recrues : ajout rÃ©servÃ© Ã  l'admin mÃªme saison dÃ©marrÃ©e (aujourd'hui, script en prod).
- `/signaler` : section Â« Mes demandes Â» avec l'Ã©tat et la rÃ©ponse de l'admin (version simple livrÃ©e le 2026-10-11).
- Outil d'analyse : pointage du pool plutÃ´t que points LNH.
- ComplÃ©ter la couverture ESPN des projections ; Yahoo comme source de blessures supplÃ©mentaire.
