# État du projet — Cap Crunch

> **Instantané « où on en est »**, réécrit à chaque fin de session (pas un journal).
> L'historique détaillé est dans `SUIVI_PROJET.md` ; la référence stable dans `CLAUDE.md`.
> Si un point ci-dessous est réglé, le retirer ou le déplacer — ne jamais l'empiler.

**Dernière mise à jour :** 2026-09-30

---

## 1. Où en est la saison

- Saison active : **2026-27 en staging**, mais **encore 2025-26 en prod** (2026-27 pas encore
  activée là-bas) — les scripts qui prennent « la saison active » ciblent donc 2025-26 en prod
  (ex : imports de projections → toujours passer `--season 2026-27`).
- **Prod** : vidée volontairement le 2026-09-20, puis **alignements 2025-26 ressaisis par David
  (Mode init) — terminé le 2026-09-29**, 326 lignes pour les 8 poolers. **Revalidation par David
  le 2026-09-30** (voir section 4). Historique complet reconstruit en **staging** seulement.
- Backup hors-ligne (`backup/pool_backup.html`) régénéré chaque dimanche depuis la prod.

## 2. Branches / déploiement

| Branche | État |
|---|---|
| `staging` | En avance sur `main` : tri unique (`order('id')`) dans les requêtes paginées des scripts Python — à fusionner (les workflows GitHub tournent depuis `main`) |
| `main` (prod) | À jour — dernière fusion le 2026-09-29 (`c7b17b7`, correctif doublons recherche Mode init) |

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

0. **Prod — saisie Mode init 2025-26 : alignements conformes** (vérifié le 2026-09-30, après
   correction par David des alignements de David et Vincent) — les 8 poolers ont 12 attaquants,
   6 défenseurs, 2 gardiens actifs et au moins 2 réservistes. Reste à faire :
   - **Oliver Ekman-Larsson en triple en prod** — SQL pas encore roulé (fiches 3050 UTA et 3051
     VAN à supprimer, 2502 TOR = la vraie ; + contrat 2029-30 périmé de 2502 à 2 126 667 $) :
     ```sql
     DELETE FROM player_contracts WHERE player_id IN (3050, 3051);
     DELETE FROM players WHERE id IN (3050, 3051);
     DELETE FROM player_contracts WHERE player_id = 2502 AND season = '2029-30';
     ```
     Avant : vérifier qu'aucun alignement ne pointe vers 3050/3051
     (`SELECT * FROM pooler_rosters WHERE player_id IN (3050, 3051);` → 0 ligne).
   - Fusionner `staging` → `main` (tri unique des scripts Python, `900be24`) après le go de David.
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
