# Workflow — Initialisation d'une nouvelle saison

Ce document décrit les étapes à suivre pour initialiser une nouvelle saison de pool,
que ce soit pour entrer un historique ou démarrer une saison en temps réel.

> 🧭 **Pour une transition saison → saison normale** (le cas courant, pas le bootstrap
> historique initial), le point d'entrée recommandé est **Admin > Nouvelle saison**
> (`/admin/nouvelle-saison`) — un hub qui séquence les étapes 1, 3, 6, 5 puis l'activation
> dans le bon ordre, avec un lien direct vers chaque outil pour la bonne saison déjà
> sélectionnée. Ce document reste la référence détaillée pour chaque étape, et la seule
> à suivre pour un bootstrap historique complet (étape 4 ci-dessous). Depuis le
> 2026-08-27, les 4 onglets d'**Initialisation** acceptent un `?saisonId=` — plus besoin
> d'activer une saison pour commencer à la préparer.

---

## 1. Créer la saison dans la configuration

**Admin > Gestion du pool > Configuration > Saisons**

- Cliquer **+ Nouvelle saison**
- Entrer l'identifiant (ex. `2026-27`), le plafond NHL et le facteur
- La création génère automatiquement **cette saison + les 2 suivantes** avec leurs picks initiaux

> ⚠️ Si des picks ont été échangés avant le repêchage, aller à l'étape 3 pour les ajuster.

---

## 2. Configurer la saison

**Admin > Gestion du pool > Configuration > Pool Saison**

- Ajuster le cap NHL, le facteur, les dates de début/fin de saison
- Renseigner la **date de début de saison** (`saison_start_date`) — critique :
  les mouvements entrés avant cette date sont considérés pré-saison
  et n'apparaissent pas dans l'historique des poolers
- Vérifier les rondes de repêchage (`draft_rounds`, défaut : 4)

---

## 3. Ajuster les choix de repêchage échangés

**Admin > Initialisation > Choix de repêchage**

- Sélectionner la saison dans le dropdown
- Si les picks ont été auto-créés à l'étape 1 → ils apparaissent directement
- Si la saison n'a pas de picks → cliquer **Initialiser** (crée N rondes × tous les poolers)
- Ajuster le **propriétaire actuel** pour les picks échangés hors-application
- Les picks avec un propriétaire différent de l'original s'affichent en surbrillance amber

---

## 4. Rosters initiaux

> ⚠️ **Cette étape sert au bootstrap historique initial (premier lancement de l'app) ou à
> une reconstruction manuelle complète — pas à une transition saison → saison normale.**
> Pour reporter les alignements finaux d'une saison à la suivante, utiliser plutôt
> **« Transitionner les rosters → »** à l'étape 1 (Config > Saisons) : ça copie
> automatiquement les rosters actifs de la saison active (LTIR redevient actif), sans
> ressaisie manuelle. Cette étape 4 reste disponible ensuite pour des corrections
> ponctuelles au besoin.

**Admin > Initialisation > Rosters initiaux**

- Activer le **Mode init** (bouton orange en haut à droite)
- En mode init : aucune validation de cap ou de positions, pas de snapshots
- Sélectionner chaque pooler et construire son alignement de départ
- Cliquer **Soumettre** pour chaque pooler
- Si des données incorrectes existent déjà → cliquer **Vider tous les rosters** avant de commencer

> 💡 Les recrues actives (hors banque) peuvent être ajoutées ici avec le type `Recrue`.

> 💡 Le mode init applique automatiquement `added_at = saison_start_date` (12h UTC)
> sur chaque ajout, tant que cette date est renseignée à l'étape 2. Aucune correction
> SQL manuelle n'est requise. Si `saison_start_date` est vide au moment de la
> soumission, `added_at` prend la date réelle de saisie — la renseigner avant de
> commencer les rosters initiaux.

---

## 5. Banque de recrues pré-saison

**Admin > Initialisation > Banque de recrues**

- Assigner les recrues dans la banque de chaque pooler
- Ce sont les recrues qui n'ont pas encore été activées (hors-roster)
- La banque ne compte pas dans la masse salariale

---

## 6. Repêchage des recrues

**Admin > Repêchage recrues**

- Sélectionner la bonne saison dans le dropdown (haut droite)
- Régler l'**ordre de sélection** dans le panneau gauche (`pool_draft_picks.draft_order`) et cliquer **Sauvegarder**
- L'ordre est le même à chaque ronde (pas de serpentin) — le pooler en position 1 choisit en premier à toutes les rondes
- Raccourci : dans **Admin > Pré-saison > Ordre du repêchage**, le bouton
  **"Initialiser à partir du classement précédent (inversé)"** pré-remplit
  à la fois `presaison_draft_order` (agents libres) et `pool_draft_picks.draft_order`
  (recrues, toutes rondes) à partir du classement inversé de la saison précédente.
  L'admin peut ensuite ajuster manuellement avant de sauvegarder dans chaque page.
- Faire les picks ronde par ronde via les dropdowns
- Cliquer **Soumettre** pour valider les choix
- Les picks soumis apparaissent en vert ; on peut annuler un pick avec le bouton **Annuler**

> 📺 Les poolers peuvent suivre en temps réel sur **Repêchage > Repêchage recrues** (page publique, rafraîchir le navigateur)

---

## 7. Transactions de la saison

**Admin > Gestion du pool > Transactions** (ou via Gestion des effectifs)

- Entrer les moves dans l'ordre chronologique
- Activations, désactivations, signatures AL, LTIR, etc.
- Les moves datés avant `saison_start_date` n'apparaissent pas dans l'historique pooler
- Les moves datés après `saison_end_date` non plus

---

## Récapitulatif rapide

```
1. Config > Saisons          → créer la saison (+ 2 suivantes auto)
                                puis « Transitionner les rosters → » depuis la saison active
2. Config > Pool Saison      → cap, dates, rondes de repêchage
3. Init > Choix repêchage    → ajuster picks échangés
4. Init > Rosters initiaux   → SEULEMENT si bootstrap historique ou correction manuelle
                                (transition normale déjà couverte par l'étape 1)
5. Init > Banque de recrues  → recrues hors-roster
6. Admin > Repêchage recrues → faire le draft
7. Admin > Transactions      → entrer l'historique de la saison (dont pré-saison : ELC,
                                libérations, repêchage des agents libres — voir Pré-saison)
```

Ou, plus simple : suivre **Admin > Nouvelle saison** qui enchaîne 1 → 3 → 6 → 5 → pré-saison
→ activation avec un lien direct sur chaque étape.

---

## Notes importantes

- **`saison_start_date`** : tous les mouvements avant cette date sont ignorés dans
  l'historique pooler. Les joueurs reçoivent cette date comme `added_at`.
- **Mode init** : bypass complet des validations. Ne pas utiliser en saison active.
- **Vider tous les rosters** : supprime définitivement toutes les entrées `pooler_rosters`
  de la saison. Irréversible — utiliser seulement pour repartir à zéro.
- Les picks échangés lors de la saison **N** concernent les picks de la saison **N+1**.
  Ex. : un échange en 2025-26 impliquant un "choix de 1re ronde 2026" → ajuster
  dans Choix de repêchage de la saison **2026-27**.
