# État du projet — Cap Crunch

> **Instantané « où on en est »**, réécrit à chaque fin de session (pas un journal).
> L'historique détaillé est dans `SUIVI_PROJET.md` ; la référence stable dans `CLAUDE.md`.
> Si un point ci-dessous est réglé, le retirer ou le déplacer — ne jamais l'empiler.

**Dernière mise à jour :** 2026-09-28

---

## 1. Où en est la saison

- Saison active : **2026-27 en staging**, mais **encore 2025-26 en prod** (2026-27 pas encore
  activée là-bas) — les scripts qui prennent « la saison active » ciblent donc 2025-26 en prod
  (ex : imports de projections → toujours passer `--season 2026-27`).
- **Prod** : vidée volontairement le 2026-09-20 → 0 alignement, ressaisie manuelle des
  alignements par David en cours. Historique complet reconstruit en **staging** seulement.
- Backup hors-ligne (`backup/pool_backup.html`) régénéré chaque dimanche depuis la prod.

## 2. Branches / déploiement

| Branche | État |
|---|---|
| `staging` | À jour |
| `main` (prod) | À jour — dernière fusion le 2026-09-28 (`da263a7`, chantier mobile) |

Livré en prod le 2026-09-28 : « Mes listes », scénarios de simulation privés, sélecteur de
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
| Marqueur désaccord CBS≠ESPN (`espn_est_return_date`) | ✅ (aucun cas actuel) | ✅ migré | ⚠ Vérifier que la colonne prod se remplit (cron `injuries.yml`) |
| Demandes de LTIR avec approbation admin | ✅ code | ✅ code | Tester de bout en bout avec un vrai compte pooler |
| Transactions entre poolers (échanges + approbation) | ✅ | ✅ | Test réel à deux poolers |
| Ballotage (réclamer / refuser / compléter) | ✅ | ✅ | Test réel à plusieurs poolers en saison |

## 4. À faire / à vérifier

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
