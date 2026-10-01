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

À titre indicatif, les mêmes alignements avec les contrats 2026-27 coûteraient en moyenne
134,8 M$ (1,297 × le plafond LNH ; de 1,170 à 1,466 selon l'équipe), contre 129 M$ permis avec 1,24
et 132 M$ avec 1,26. Ce calcul retire déjà les 20 recrues encore protégées qui retourneront en
banque à la transition (101,9 M$ de contrats). Les poolers devront donc faire des choix l'été
prochain, quel que soit le facteur retenu : c'est l'effet normal des fins de contrats d'entrée.

### Référence historique : 2013-14 à 2015-16

Calculé avec `calcul_salaire/calcul_facteur_historique.py`, à partir des fichiers Excel de gestion
du pool (« Pool LT - 2013-2014.xls », « 2014-2015.xlsx », « 2015-2016.xlsx » ; le pool a commencé
en 2011-12 à 6 poolers) : contrats de tous les joueurs LNH (feuille Données), alignements réels
de chaque pooler, classement sur les deux saisons précédentes.

```
python_script/venv/Scripts/python -m pip install xlrd openpyxl
python_script/venv/Scripts/python calcul_salaire/calcul_facteur_historique.py
```

| Saison | Plafond LNH | Plafond du pool | Poolers | Naturel (poolers réels) | Naturel (8 poolers) | Réalisé | Taux de pression (8 poolers) |
|---|---|---|---|---|---|---|---|
| 2013-14 | 64,3 M$ | 80 M$ (1,244) | 6 | 1,786 | 1,714 | 1,198 | **73 %** |
| 2014-15 | 69,0 M$ | 85 M$ (1,232) | 6 | 1,714 | 1,587 | 1,225 | **78 %** |
| 2015-16 | 71,4 M$ | 88 M$ (1,232) | 7 | 1,692 | 1,641 | 1,230 | **75 %** |

**D'où vient le 1,24** : le bloc « Calcul Plafond Salarial » des fichiers 2014-15 et 2015-16
montre que le plafond du pool est parti de 80 M$ et a été maintenu en proportion du plafond LNH
(80 ÷ 64,9 = 1,2327, appliqué à 69 M$ puis à 71,4 M$), puis arrondi à 1,24 par la suite.

Le nombre de poolers compte : avec moins d'équipes, chacune a de meilleurs joueurs, donc plus
chers. Pour comparer les époques, on ramène toujours le calcul à 8 équipes.

### Lecture : le « taux de pression »

Le plus parlant est le **taux de pression** : la part d'une équipe idéale qu'on peut se payer
avec le plafond du pool.

```
Taux de pression = facteur du pool ÷ facteur naturel (8 poolers)
```

| Saison | Facteur naturel (8 poolers) | Facteur du pool | Taux de pression |
|---|---|---|---|
| 2013-14 | 1,714 | 1,244 | 73 % (classement faussé par le lock-out de 2012-13) |
| 2014-15 | 1,587 | 1,232 | 78 % |
| 2015-16 | 1,641 | 1,232 | 75 % |
| **Débuts du pool (moyenne)** | | | **≈ 75-76 %** |
| 2025-26 | 1,597 | 1,24 | 78 % |
| 2026-27 | 1,628 | 1,24 | **76 %** |

1. **La difficulté du pool est remarquablement stable depuis le début** : entre 73 % et 78 %
   selon les années, autour de 75-76 % en moyenne.
2. **2025-26 était une année plus facile que la moyenne (78 %)** ; en 2026-27, la hausse des
   salaires ramène le pool à 76 %, soit **exactement son niveau historique**.
3. **Les équipes ont toujours dépensé presque tout le plafond** : facteur réalisé de 1,20 à 1,23
   (97 à 99 % du plafond du pool), en 2013-16 comme en 2025-26.

### Suggestions pour améliorer la formule

1. **Fixer un taux de pression plutôt qu'un facteur.** La règle devient : « chaque été, le
   facteur = taux de pression × facteur naturel ». On décide une fois quel niveau de difficulté on
   veut (ex. : 76 %, la moyenne historique), et le facteur suit le marché tout seul. C'est plus
   facile à expliquer qu'une « marge » négative.
2. **Comparer à nombre de poolers constant (8).** Sinon, un changement de taille du pool fausse la
   comparaison entre les années.
3. **Classer sur les points par match** (minimum 40 matchs) plutôt que sur les totaux de saison :
   une blessure ou un lock-out ne fait plus sortir un bon joueur du classement (2013-14 l'illustre).
4. **Lisser et borner plus serré** : moyenne des deux dernières saisons et variation limitée à
   ±0,03 par année (le facteur naturel bouge de 2 à 7 % par année ; ±0,05 permet des sauts plus
   gros que nécessaire).
5. **Garder un indicateur de « douleur »** : le coût des alignements réels avec les contrats de la
   saison suivante, recrues protégées retirées (1,297 pour 2026-27, contre 1,24 permis). Ce n'est
   pas la règle, mais ça dit d'avance combien d'équipes devront couper.
6. **Annoncer l'arrondi** : arrondir le plafond au million supérieur ajoute jusqu'à 1 M$ (~1 %).

### La période de transition : les contrats « d'avant »

Le calcul ci-dessus utilise les contrats **en vigueur**. Or beaucoup ont été signés quand le
plafond LNH était bien plus bas (ex. : Cale Makar, 9 M$ signé en 2021 avec un plafond de 81,5 M$,
soit 11 % du plafond de l'époque et 8,7 % aujourd'hui ; à son renouvellement, il sera payé au prix
du marché actuel). Tant que ces contrats ne sont pas tous renouvelés, le coût du pool monte plus
vite que le plafond : c'est la transition actuelle.

Mesure (`calcul_salaire/prix_du_marche.py`) : le « prix du marché » d'un joueur est la médiane, en %
du plafond LNH, des contrats commençant en 2026-27 des joueurs de même position et de même niveau
de talent. Si toute l'équipe idéale était payée à ce prix :

| Équipe idéale 2026-27 | Facteur naturel |
|---|---|
| Contrats en vigueur | 1,634 |
| Tous au prix du marché 2026-27 | **1,743 (+6,7 %)** |

Il reste donc **environ 7 % de hausse à venir**, qui arrivera au fil des renouvellements, sur 3 à
4 ans (durée typique d'un contrat). Estimation prudente : pour les grandes vedettes, le prix du
marché repose sur peu de contrats récents, et un cas comme Makar le dépassera.

Du côté des jeunes (`calcul_salaire/analyse_jeunes.py`) : un joueur sur son deuxième contrat coûte
en moyenne 7,5 % du plafond LNH aujourd'hui, contre 6,8 % en 2014-16. Surtout, les jeunes vedettes
obtiennent leur gros contrat plus tôt et plus cher : 6 jeunes (7 ans ou moins depuis leur
repêchage) coûtent 10 % du plafond ou plus en 2026-27, contre 2 ou 3 en 2014-16, et le plus cher
est à 17,3 % (Carlsson) contre 13,0 % (Subban) à l'époque.

### Options pour 2026-27

La règle du taux de pression (76 %, la moyenne historique) suit **automatiquement** la transition :
recalculée chaque été avec les contrats en vigueur, elle fera monter le facteur à mesure que les
contrats sont renouvelés, vers environ 1,32 une fois la transition terminée. Pas besoin d'inventer
une courbe (logarithmique ou autre) : la forme de la courbe est dictée par les renouvellements
réels, mesurés chaque année.

La seule vraie question est : **attend-on les renouvellements, ou donne-t-on la marge d'avance ?**

| Choix | Calcul | Facteur 2026-27 | Plafond du pool (104 M$) |
|---|---|---|---|
| Attendre (règle stricte) | 76 % × contrats en vigueur | 1,24 | 129 M$ |
| **Anticiper la moitié de la transition** | 1,24 × (1 + 6,7 % ÷ 2) | **1,28** | **134 M$** (133,12 M$ arrondi) |
| Anticiper toute la transition | 1,24 × 1,067 | 1,32 | 138 M$ (137,28 M$ arrondi) |

**Recommandation : 1,28 pour 2026-27.** C'est défendable chiffres en main : on donne dès
maintenant la moitié d'une hausse que les renouvellements vont amener de toute façon. La hausse
(+0,04) respecte la borne de ±0,05 par année de la règle proposée au groupe ; avec la borne plus
serrée de ±0,03 suggérée plus haut, 2026-27 serait limité à 1,27. Le pooler qui reconstruit a de
l'air pendant la transition. Ensuite, recalculer chaque été : le facteur devrait continuer de monter doucement vers
1,32, puis se stabiliser.

### Suggestions ciblées pour les poolers qui reconstruisent

Le facteur aide tout le monde également. Pour aider précisément celui qui a misé sur des jeunes :

1. **La banque de recrues fait déjà une partie du travail** : un repêché reste protégé 5 saisons,
   même avec un gros deuxième contrat (Carlsson, Bedard, Fantilli peuvent rester en banque à 0 $
   en 2026-27). C'est à rappeler aux poolers : ils peuvent choisir le moment d'activer.
2. **Rabais de développement (option)** : un joueur repêché par le pool, activé pendant sa
   protection ou dans les deux saisons qui suivent, compte au maximum pour **12 % du plafond
   LNH** (12,48 M$ en 2026-27). Base
   tangible : c'était à peu près le coût maximal d'un jeune aux débuts du pool (Subban 13,0 %,
   Stamkos 10,9 %, Tarasenko 10,5 % ; Dahlin 11,5 % en 2025-26). En 2026-27, ça toucherait
   Carlsson (18 M$), Bedard (15 M$), Fantilli (13,75 M$) et Gauthier (13,5 M$) s'ils sont activés. Récompense directement le pooler qui a bien repêché, sans
   changer la règle pour les autres.
3. **Indicateur de douleur publié chaque été** (voir plus haut) : chaque pooler voit d'avance ce que
   lui coûtera son alignement la saison suivante, et peut planifier au lieu de subir.

### Limites à mentionner

- Saisons historiques : le barème actuel est supposé identique à celui de l'époque ; le
  classement de 2013-14 et 2014-15 inclut la saison écourtée de 2012-13 ; environ 65 % des
  contrats ont été jumelés à des stats (les autres n'avaient pas joué dans la LNH ces saisons-là :
  recrues, ligue mineure, blessés).
- Le classement par points ignore la valeur « keeper » (âge, potentiel) : un jeune joueur peu
  productif mais prometteur n'est pas dans l'équipe idéale.
- Les gardiens et les patineurs sont classés ensemble pour les réservistes, avec des barèmes
  différents.

## Sources

- [Yahoo Sports – Plafond LNH 2026-27](https://sports.yahoo.com/articles/nhls-maximum-allowed-player-salary-221344470.html)
- [Red Men Hockey – NHL Salary Cap Explained](https://redmenhockey.com/guides/nhl-salary-cap-explained)
- [NGSC Sports – Projection du plafond à 127,5 M$](https://ngscsports.com/2026/09/26/nhl-salary-cap-could-soar-to-127-5-million/)