# État du projet — Cap Crunch

> **Instantané « où on en est »**, réécrit à chaque fin de session (pas un journal).
> L'historique détaillé est dans `SUIVI_PROJET.md` ; la référence stable dans `CLAUDE.md`.
> Si un point ci-dessous est réglé, le retirer ou le déplacer — ne jamais l'empiler.

**Dernière mise à jour :** 2026-09-26

---

## 1. Où en est la saison

- Saison active : **2026-27** (pré-saison / démarrage).
- **Prod** : vidée volontairement le 2026-09-20 → 0 alignement, ressaisie manuelle des
  alignements par David en cours. Historique complet reconstruit en **staging** seulement.
- Backup hors-ligne (`backup/pool_backup.html`) régénéré chaque dimanche depuis la prod.

## 2. Branches / déploiement

| Branche | État |
|---|---|
| `staging` | À jour — tout le code récent |
| `main` (prod) | À jour sauf le commit de doc `12d025c` (aucun impact fonctionnel) |

Dernier chantier livré en prod : blessures LNH + demandes LTIR + seuils paramétrables,
projections (colonne Moyenne), salaires PuckPedia.

## 3. Fonctionnalités récentes — état de validation

| Fonctionnalité | Staging | Prod | Reste à faire |
|---|---|---|---|
| Suivi des blessures (CBS + ESPN, cron quotidien) | ✅ validé | ✅ | — |
| Admissibilité LTIR (IR LNH, période tampon, garde-fous scraper) | ✅ | ✅ | — |
| Seuils LTIR paramétrables (`app_settings`) | ✅ migré | ✅ migré | — |
| Marqueur désaccord CBS≠ESPN (`espn_est_return_date`) | ✅ (aucun cas actuel) | ✅ migré | Colonne prod vide jusqu'au prochain cron `injuries.yml` (dernier run avant la fusion) — vérifier qu'elle se remplit. Marqueur invisible tant qu'aucun écart ≥ 5 j |
| Demandes de LTIR avec approbation admin | ✅ code | ✅ code | Tester de bout en bout (pooler soumet → admin approuve) avec un vrai compte pooler |
| Projections (NHL.com / CBS / Pool Pro / Hockey Mag, colonne Moyenne) | ✅ | ? | ⚠ Import Pool Pro / Hockey Mag / correctifs de doublons : confirmer qu'ils ont été répliqués en prod |
| Sidebar de navigation + onglet « Prochains matchs » | ✅ | ✅ validé (mobile inclus) | — |
| Transactions entre poolers (échanges + approbation) | ✅ | ✅ | Test réel à deux poolers |
| Ballotage (réclamer / refuser / compléter) | ✅ | ✅ | Test réel à plusieurs poolers en saison |
| Import salaires PuckPedia (`import.yml`) | ✅ | déclenché | Vérifier que le workflow GitHub a réussi |

## 4. Tests encore à faire (non bloquants mais à ne pas oublier)

- [ ] Repêchage des agents libres : terminaison du repêchage + « Démarrer la saison »
      (conformité + déclarations « prêt ») en staging, de bout en bout.
- [ ] Notifications courriel des commentaires (babillard / planification) avec deux vrais
      comptes distincts.
- [ ] Rendu mobile des pages de consultation récentes (blessures, projections, AHL).

## 5. Décisions en attente de David

- Délais LTIR (14 / 14 / 3 / 5 / 2 jours) : à discuter avec les poolers — ajustables dans
  `/admin/effectifs?tab=approbation`, aucune modif de code requise.
- Panneau d'aide contextuel pour les poolers (façon `AdminGuidePanel`) : en attente d'un
  retour de pooler sur `/aide` et `/a-propos`.

## 6. Prochains chantiers possibles (backlog)

- Échanges pré-saison dans l'outil pooler (aujourd'hui : filet admin `/admin/transactions`).
- Compléter la couverture ESPN des projections (joueurs de profondeur) si jugé utile.
- Yahoo comme 3ᵉ source de blessures (validé techniquement, pas branché).
