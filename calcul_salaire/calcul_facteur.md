# Facteur de plafond salarial du pool

## Contexte

Le pool est un pool à long terme (keeper) basé sur les cap hits des joueurs.
Depuis le début, le plafond du pool est fixé à :

```
Plafond du pool = 1,24 × plafond LNH
```

Le facteur 1,24 a été choisi arbitrairement. Avec la hausse rapide des salaires,
on veut le réviser à l'aide d'une méthode logique, mesurable et reproductible.

## Pourquoi un facteur supérieur à 1

Une équipe de la LNH compte des joueurs de profondeur à bas salaire. Une équipe
de pool ne contient que des joueurs dignes du pool. Le facteur représente donc
le ratio entre le coût d'une équipe de pool et celui d'une équipe LNH.

## Pourquoi le facteur doit être revu même si le plafond LNH monte

| Saison | Plafond LNH |
|---|---|
| 2025-26 | 95,5 M$ |
| 2026-27 | 104 M$ |
| 2027-28 | 113,5 M$ |
| 2028-29 | ~127,5 M$ (estimation de la ligue, non confirmée) |

- Les vedettes qui renouvellent maintenant signent des contrats calibrés sur le
  plafond **futur**, pas sur le plafond actuel.
- Le salaire minimum ne monte qu'à 850 000 $ en 2026-27 : la croissance va
  surtout aux meilleurs joueurs, soit exactement ceux qu'on retrouve dans le pool.
- Résultat : la part du plafond occupée par les joueurs de calibre pool augmente
  plus vite que le plafond lui-même.

## Règles d'alignement du pool

Minimum obligatoire par équipe, comptant dans la masse salariale :

| Position | Minimum |
|---|---|
| Attaquants | 12 |
| Défenseurs | 6 |
| Gardiens | 2 |
| Réservistes (toute position, gardiens inclus) | 2 |
| **Total** | **22** |

Les réservistes sont illimités au-delà du minimum, tant que la masse salariale
entre sous le plafond.

Avec 8 poolers : **176 joueurs** au minimum dans le pool.

## La formule

```
Facteur = (masse moyenne d'une équipe de pool ÷ plafond LNH) × (1 + marge)
```

- **Masse moyenne d'une équipe de pool** : somme des cap hits des joueurs qui
  composeraient le pool (voir le calcul par position ci-dessous), divisée par 8.
- **Marge** : degré de contrainte voulu. 0 % = une équipe moyenne est pile au
  plafond. 5 à 10 % laisse de l'espace pour échanger et gérer.

### Calcul par position

Le calcul se fait par position, car les structures salariales diffèrent.

| Groupe | Par équipe | × 8 poolers | Joueurs retenus |
|---|---|---|---|
| Attaquants | 12 | 96 | Top 96 attaquants |
| Défenseurs | 6 | 48 | Top 48 défenseurs |
| Gardiens | 2 | 16 | Top 16 gardiens |
| Réservistes | 2 | 16 | Les 16 meilleurs joueurs restants, toute position |

Le classement se fait selon le système de points du pool : la saison précédente,
ou idéalement une moyenne sur deux saisons pour réduire le bruit.

### Requête DuckDB

Hypothèse : une table `joueurs` alimentée par le pipeline PuckPedia, avec les
colonnes `player_id`, `position` (`F`, `D`, `G`), `cap_hit` et `pool_pts`.

```sql
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY position ORDER BY pool_pts DESC) AS rk
  FROM joueurs
),
partants AS (
  SELECT * FROM ranked
  WHERE (position = 'F' AND rk <= 96)
     OR (position = 'D' AND rk <= 48)
     OR (position = 'G' AND rk <= 16)
),
reserves AS (
  SELECT * FROM ranked
  WHERE player_id NOT IN (SELECT player_id FROM partants)
  ORDER BY pool_pts DESC
  LIMIT 16
)
SELECT SUM(cap_hit) / 8 / 104000000 AS facteur_naturel
FROM (
  SELECT cap_hit FROM partants
  UNION ALL
  SELECT cap_hit FROM reserves
);
```

Remplacer `104000000` par le plafond LNH de la saison analysée.

## Deux chiffres à comparer

1. **Facteur naturel** (requête ci-dessus) : ce que coûte le talent disponible,
   sans contrainte.
2. **Facteur réalisé** : somme des masses actuelles des 8 équipes ÷ 8 ÷ plafond
   LNH. C'est ce que les équipes dépensent réellement sous le 1,24.

Interprétation :

- Si le facteur naturel dépasse nettement 1,24, le plafond force des choix de
  plus en plus durs : c'est l'argument pour augmenter le facteur.
- L'écart entre les deux montre à quel point le plafond « mord » actuellement.

## Calibrer la marge

### Retrouver la marge d'origine

Faire rouler la même requête avec les données et le plafond LNH de la saison où
le 1,24 a été adopté :

```
Marge d'origine = 1,24 ÷ facteur naturel (année d'adoption) − 1
```

Réappliquer cette marge au facteur naturel d'aujourd'hui permet de dire :
**« on ne change pas la règle, on garde la même pression qu'au départ ».**

### Traduire la marge en réservistes

La formule couvre le **minimum obligatoire** (22 joueurs). Tout ce qui dépasse
(3e ou 4e réserviste, espoir gardé, joueur blessé protégé) sort de la marge.

Pour permettre en moyenne deux réservistes de plus par équipe, ajouter au calcul
les 16 joueurs suivants (rangs 17 à 32 des réservistes). La différence donne la
marge nécessaire, exprimée concrètement en « espace pour X réservistes de plus ».

### Nuance sur le coût des réservistes

En pratique, les poolers choisissent souvent des réservistes bon marché
(contrats d'entrée, espoirs) plutôt que les meilleurs disponibles. Le « top 16
suivant » surestime alors leur coût. Alternative réaliste : utiliser le cap hit
médian des réservistes actuellement dans les équipes pour cette portion.

## Règle proposée au groupe

- **Une règle, pas un chiffre** : le facteur est recalculé chaque été avec la
  même méthode et les mêmes données (PuckPedia).
- **Lissage** : moyenne sur deux saisons, variation limitée à ±0,05 par année
  pour éviter les chocs.
- **Annonce un an d'avance** : les gestionnaires peuvent planifier leurs keepers
  en conséquence.

## Résultats (calcul du 2026-09-30)

Calculé avec `calcul_salaire/calcul_facteur.py` (données de l'app en prod + statistiques
officielles de la LNH), à relancer chaque été :

```
python_script/venv/Scripts/python calcul_salaire/calcul_facteur.py
```

Choix de mise en œuvre :

- **Points** : barème du pool tiré de l'app (but 1, passe 1, victoire 2, défaite en prolongation 1,
  blanchissage 2), moyenne des deux saisons précédentes.
- **Cap hits** : contrats PuckPedia de la saison visée. Un joueur sans contrat pour cette saison
  compte pour 1,20 × son contrat précédent (même règle que l'app).
- **Positions** : gardien si « G », défenseur si seulement LD/RD, sinon attaquant.

### Facteur naturel (équipe de pool « idéale », 22 joueurs)

| Saison | Plafond LNH | Classement sur | Masse moyenne | Facteur naturel | + 2 réservistes | Réservistes au coût médian réel (2,2 M$) |
|---|---|---|---|---|---|---|
| 2025-26 | 95,5 M$ | 2023-24 + 2024-25 | 152,5 M$ | **1,597** | 1,719 | 1,540 |
| 2026-27 | 104,0 M$ | 2024-25 + 2025-26 | 169,3 M$ | **1,628** | 1,738 | 1,562 |

2027-28 n'est pas retenu : beaucoup de contrats n'existent pas encore (31 des 176 joueurs sont
estimés) et la saison 2026-27 qui servirait au classement vient de commencer.

### Facteur réalisé (alignements réels du pool, 2025-26)

| Contrats de | Plafond LNH | Masse moyenne | Facteur réalisé | Plus bas / plus haut |
|---|---|---|---|---|
| 2025-26 | 95,5 M$ | 115,3 M$ | **1,208** | 1,147 / 1,242 |

Les équipes utilisent en moyenne 97 % du plafond de 1,24 : le plafond « mord ».

À titre indicatif, les mêmes alignements avec les contrats 2026-27 coûteraient 1,405 × le plafond
LNH (146 M$ en moyenne, contre 129 M$ permis), surtout à cause de fins de contrats d'entrée
(Carlsson, Bedard, Fantilli, Gauthier…). Ce chiffre est surévalué : une partie de ces joueurs
retourneront en banque à la transition s'ils sont encore protégés.

### Lecture

1. **Le plafond du pool est volontairement plus serré que l'équipe idéale.** En 2025-26, le
   facteur de 1,24 correspond à 78 % du coût d'une équipe idéale (1,24 ÷ 1,597) : la marge est
   négative (−22 %). C'est ce qui force les choix.
2. **La pression a augmenté, mais modérément, en 2026-27.** L'équipe idéale coûte 1,628 × le
   plafond LNH au lieu de 1,597 (+1,9 %) : les salaires des bons joueurs montent un peu plus vite
   que le plafond, pas beaucoup plus.
3. **Garder la même pression qu'en 2025-26** (méthode « marge d'origine », avec 2025-26 comme
   année de référence faute de contrats plus anciens dans l'app) :

   ```
   1,24 × (1,628 ÷ 1,597) = 1,264
   ```

   Les deux variantes donnent presque la même chose : 1,254 (avec 2 réservistes de plus) et 1,258
   (réservistes au coût médian réel).

### Recommandation

| Facteur | Plafond du pool 2026-27 (104 M$) | Écart avec 1,24 |
|---|---|---|
| 1,24 (actuel) | 129 M$ | — |
| **1,26** (même pression qu'en 2025-26) | **132 M$** (131,04 M$ arrondi au million supérieur) | +3 M$ |
| 1,27 | 133 M$ (132,08 M$ arrondi) | +4 M$ |

Un facteur de **1,26** garde exactement la même contrainte qu'en 2025-26 ; il respecte la règle
de lissage (±0,05 par année). Le recalculer chaque été avec le même script.

### Limites à mentionner

- La « marge d'origine » est calculée sur 2025-26, pas sur l'année où le 1,24 a été adopté
  (l'app ne contient pas de contrats plus anciens).
- Le classement par points ignore la valeur « keeper » (âge, potentiel) : un jeune joueur peu
  productif mais prometteur n'est pas dans l'équipe idéale.
- Les gardiens et les patineurs sont classés ensemble pour les réservistes, avec des barèmes
  différents.

## Sources

- [Yahoo Sports – Plafond LNH 2026-27](https://sports.yahoo.com/articles/nhls-maximum-allowed-player-salary-221344470.html)
- [Red Men Hockey – NHL Salary Cap Explained](https://redmenhockey.com/guides/nhl-salary-cap-explained)
- [NGSC Sports – Projection du plafond à 127,5 M$](https://ngscsports.com/2026/09/26/nhl-salary-cap-could-soar-to-127-5-million/)