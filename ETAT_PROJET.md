# État du projet — Cap Crunch

> **Instantané « où on en est »**, réécrit à chaque fin de session (pas un journal).
> L'historique détaillé est dans `SUIVI_PROJET.md` ; la référence stable dans `CLAUDE.md`.
> Si un point ci-dessous est réglé, le retirer ou le déplacer — ne jamais l'empiler.

**Dernière mise à jour :** 2026-09-27

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
| Projections (NHL.com / CBS / Pool Pro / Hockey Mag, colonne Moyenne) | ✅ | ✅ importé | Identiques staging/prod (406-407 / 966 / 400 / 422). ⚠ Page prod vide tant que 2025-26 est la saison active en prod : sélecteur de saison à fusionner sur `main`, ou activer 2026-27 |
| « Mes listes » (agents libres + recrues 2026, privées) | ✅ validé | migré, code pas encore sur `main` | Fusion sur `main` |
| Scénarios de simulation privés (admin compris) | ✅ migré | ✅ migré | — |
| `/poolers/[id]` : sélecteur de pooler visible + onglet conservé | À valider | — | Changer de pooler depuis Masse salariale doit rester sur Masse salariale |
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

## 4 bis. À lancer par David — remise à neuf de 2026-27 en staging

2026-27 en staging mélange les vrais alignements et des tests (la transition ne fait
qu'ajouter les joueurs absents, elle ne remplace rien). Suppression bloquée pour Claude (mode
auto) — depuis `python_script/` :

```powershell
python reset_saison_staging.py 2026-27            # simulation (déjà vérifiée)
python reset_saison_staging.py 2026-27 --apply    # « oui » pour confirmer
```

Puis refaire la transition 2025-26 → 2026-27 (désormais bloquée tant que la saison cible
n'est pas vide — à tester au passage : l'aperçu doit montrer le bloc rouge AVANT le script,
et plus rien APRÈS) (Admin > Gestion du pool > Configuration >
Saisons), puis le repêchage des recrues. Simulation : 400 lignes d'alignement, 71
transactions, 23 changements de statut, 3 ballotages, 1 échange, 3 surveillances cap, 8
« prêt », 32 choix remis à neuf (dont 6 réassignés), saison remise à « non démarrée ».

## 4 ter. Bug pipeline — fiches joueurs en double (corrigé en staging)

- Cause : `import_supabase.py` (PuckPedia « Mitch Marner ») et `import_drafts.py` (API
  repêchage : « Matt Savoie », « Dmitriy Simashev », « Matty Beniers », « J.J. Moser »)
  jumelaient par nom exact → fiches orphelines, dont une avec contrats en double (Marner).
- Correctif : alias de prénoms partagés (`python_script/name_aliases.py`) + fusion
  automatique des doublons d'alias au début de `import_supabase.py`. Homonymes réels gardés
  distincts (Matt Murray SEA / Matthew Murray NSH).
- ✅ Validé en staging (`run_pipeline_staging.ps1 --no-scrape`) : 5 fusions, 0 fiche créée.
- Prod : se corrigera au premier pipeline prod après fusion sur `main` (simulation : 7
  fusions). Projections déjà corrigées par David (`fix_projections_doublons.py`, 2026-09-26).

## 5. Décisions en attente de David

- Délais LTIR (14 / 14 / 3 / 5 / 2 jours) : à discuter avec les poolers — ajustables dans
  `/admin/effectifs?tab=approbation`, aucune modif de code requise.
- Panneau d'aide contextuel pour les poolers (façon `AdminGuidePanel`) : en attente d'un
  retour de pooler sur `/aide` et `/a-propos`.

## 6. Prochains chantiers possibles (backlog)

- Échanges pré-saison dans l'outil pooler (aujourd'hui : filet admin `/admin/transactions`).
- Compléter la couverture ESPN des projections (joueurs de profondeur) si jugé utile.
- Yahoo comme 3ᵉ source de blessures (validé techniquement, pas branché).
