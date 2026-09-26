# État du projet — Cap Crunch

> **Instantané « où on en est »**, réécrit à chaque fin de session (pas un journal).
> L'historique détaillé est dans `SUIVI_PROJET.md` ; la référence stable dans `CLAUDE.md`.
> Si un point ci-dessous est réglé, le retirer ou le déplacer — ne jamais l'empiler.

**Dernière mise à jour :** 2026-09-26

---

## 1. Où en est la saison

- Saison active : **2026-27 en staging**, mais **encore 2025-26 en prod** (2026-27 pas encore
  activée là-bas) — les scripts qui prennent « la saison active » ciblent donc 2025-26 en prod.
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
| Projections (NHL.com / CBS / Pool Pro / Hockey Mag, colonne Moyenne) | ✅ | ⚠ incomplet | Prod : Pool Pro / Hockey Mag absents, CBS partiel — **à lancer par David**, voir section 4 bis |
| Sélecteur de saison sur `/statistiques/projections` | À valider | — | Saison active par défaut ; une seule option tant que seule 2026-27 a des projections |
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

## 4 bis. À lancer par David — projections en prod

Écritures prod bloquées pour Claude (mode auto) — à lancer toi-même, dans cet ordre, depuis
`python_script/` (chaque `--apply` demande « oui ») :

```powershell
python import_projections_cbs.py ..\excel\CBS_Proj_2026-2027.xlsx --season 2026-27 --apply
python import_projections_pool_pro.py --season 2026-27 --apply
python import_projections_hockey_magazine.py --season 2026-27 --apply
python fix_projections_doublons.py --env prod --apply      # APRÈS les imports
python fix_projections_doublons.py --env staging --apply   # staging aussi (orphelins recréés le 25/09)
```

⚠ `--season 2026-27` obligatoire : sans lui, les scripts ciblent 2025-26 (saison active prod).
Simulations déjà faites (lecture seule) : Pool Pro 400/400, Hockey Mag 422/422, CBS 966 +
~60 retraités non trouvés (normal).

## 4 ter. Bug pipeline — fiches joueurs en double

- `import_supabase.py` (PuckPedia) jumelle par nom : PuckPedia écrit maintenant « Marner,
  Mitch » → fiche « Mitch Marner » créée **avec ses propres contrats**, en double de
  « Mitchell Marner » (staging et prod).
- `import_drafts.py` recrée « Matt Savoie » / « Dmitriy Simashev » à chaque exécution.
- Correctif à décider : table d'alias de prénoms (ou jumelage par `nhl_id`) dans les deux
  scripts, puis fusion de la fiche Mitch Marner dans la vraie.

## 5. Décisions en attente de David

- Délais LTIR (14 / 14 / 3 / 5 / 2 jours) : à discuter avec les poolers — ajustables dans
  `/admin/effectifs?tab=approbation`, aucune modif de code requise.
- Panneau d'aide contextuel pour les poolers (façon `AdminGuidePanel`) : en attente d'un
  retour de pooler sur `/aide` et `/a-propos`.

## 6. Prochains chantiers possibles (backlog)

- Échanges pré-saison dans l'outil pooler (aujourd'hui : filet admin `/admin/transactions`).
- Compléter la couverture ESPN des projections (joueurs de profondeur) si jugé utile.
- Yahoo comme 3ᵉ source de blessures (validé techniquement, pas branché).
