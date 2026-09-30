# Facteur de plafond du pool — résumé

*Pool keeper · 8 poolers · document de travail, 30 septembre 2026*

**Question** : quel facteur `f` appliquer au plafond de la LNH pour fixer celui du pool, en pleine
période de hausse du plafond et des salaires ? Le pool utilise 1,24 depuis ses débuts.

## Contexte

- Plafond du pool = `f` × plafond LNH, arrondi au million supérieur. Le 1,24 vient d'un plafond
  de 80 M$ choisi en 2013-14 (plafond LNH 64,3 M$), puis maintenu en proportion.
- Alignement par équipe, compté dans la masse : 12 attaquants, 6 défenseurs, 2 gardiens et au
  moins 2 réservistes. La banque de recrues (protection de 5 saisons pour un repêché) et le LTIR
  ne comptent pas.
- Objectif : garder un niveau de difficulté stable et éviter qu'un pooler qui reconstruit
  décroche quand ses jeunes signent leur deuxième contrat.

## Définitions

**Facteur naturel**

```
N(t) = Σ cap(i, t) ÷ (8 × C(t))     pour i dans E(t)
```

`E(t)` est l'équipe « idéale » du pool : les 96 meilleurs attaquants, 48 défenseurs et
16 gardiens, plus les 16 meilleurs joueurs restants (réservistes), classés selon les points du
pool (moyenne des deux saisons précédentes). `C(t)` est le plafond LNH. Toujours calculé pour
8 équipes, pour comparer les époques.

**Facteur réalisé**

```
R(t) = masse moyenne réelle des alignements ÷ C(t)
```

Ce que les équipes dépensent vraiment (actifs + réservistes).

**Taux de pression**

```
P(t) = f(t) ÷ N(t)
```

La part d'une équipe idéale qu'on peut se payer. C'est la mesure de difficulté du pool.

**Facteur naturel au prix du marché**

```
N*(t) = Σ m(position(i), palier(i)) ÷ 8     pour i dans E(t)
```

`m` est la médiane, en fraction de `C(t)`, des contrats débutant à la saison `t` pour la même
position et le même palier de talent. Les contrats d'entrée gardent leur valeur réelle. L'écart
`N*(t) ÷ N(t) − 1` mesure la hausse encore à venir, à mesure que les contrats signés sous
d'anciens plafonds sont renouvelés.

**Règle proposée** (recalculée chaque été)

```
f(t) = P̄ × N(t) × [1 + λ × (N*(t) ÷ N(t) − 1)]
```

`P̄` est le taux de pression cible (0,76, la moyenne historique) ; `λ` ∈ [0, 1] est la part de la
transition qu'on accorde d'avance. Variation bornée à ±0,05 par année.

## Données

- Contrats 2025-26 et 2026-27 : PuckPedia (base de l'application du pool). Un joueur sans contrat
  compte pour 1,20 × son contrat précédent.
- 2013-14 à 2015-16 : fichiers Excel de gestion du pool (contrats de tous les joueurs LNH et
  alignements réels).
- Statistiques : API officielle de la LNH. Barème du pool : but 1, passe 1, victoire 2, défaite en
  prolongation 1, blanchissage 2.

## Résultats

| Saison | C(t) | Poolers | N(t) (8) | f(t) | P(t) | R(t) |
|---|---|---|---|---|---|---|
| 2013-14 | 64,3 M$ | 6 | 1,714 | 1,244 | 73 % | 1,198 |
| 2014-15 | 69,0 M$ | 6 | 1,587 | 1,232 | 78 % | 1,225 |
| 2015-16 | 71,4 M$ | 7 | 1,641 | 1,232 | 75 % | 1,230 |
| 2025-26 | 95,5 M$ | 8 | 1,597 | 1,24 | 78 % | 1,208 |
| **2026-27** | **104,0 M$** | **8** | **1,628** | **1,24** | **76 %** | — |

Moyenne de `P(t)` sur 2013-16 : environ 75-76 % (2013-14 est tiré vers le bas par la saison
écourtée de 2012-13 dans son classement). Les équipes ont toujours dépensé 97 à 99 % de leur
plafond.

**Transition 2026-27** : `N` = 1,634 avec les contrats en vigueur, `N*` = 1,743 au prix du
marché, soit **+6,7 %** encore à venir. Les jeunes vedettes pèsent plus lourd qu'avant : 6 joueurs
repêchés il y a 7 ans ou moins coûtent au moins 10 % du plafond LNH (2 ou 3 en 2014-16), jusqu'à
17,3 % (13,0 % au maximum à l'époque).

## Options pour 2026-27

| λ | f(2026-27) | Plafond du pool | Lecture |
|---|---|---|---|
| 0 | 1,24 | 129 M$ | Attendre les renouvellements. |
| **½** | **1,28** | **134 M$** | Accorder d'avance la moitié de la hausse à venir. |
| 1 | 1,32 | 138 M$ | Accorder toute la transition d'un coup. |

## Recommandation

**`P̄` = 0,76 et `λ` = ½, soit `f` = 1,28 en 2026-27**, puis la même règle recalculée chaque été.
Le facteur devrait monter vers 1,32 au fil des renouvellements, puis se stabiliser.

Mesure ciblée possible pour ceux qui reconstruisent : un joueur repêché par le pool et activé
pendant sa protection (ou dans les deux saisons suivantes) compte au maximum pour 12 % de `C(t)`,
le coût maximal observé d'un jeune aux débuts du pool.

## Points à valider

1. **Estimation de `P̄`** : 4 observations (2013-16 et 2025-26), dont une biaisée par le lock-out.
   Faut-il pondérer, ou exclure 2013-14 ?
2. **`m` par palier** : la médiane repose sur 2 à 6 contrats récents pour les meilleurs paliers.
   Un modèle continu (cap en % de `C` selon les points par match) serait-il plus robuste ?
3. **Choix de `λ` et vitesse de convergence** : faut-il le relier à la durée résiduelle des
   contrats en vigueur plutôt que de le fixer à ½ ?
4. **Classement** : totaux moyens sur 2 saisons ; des points par match (minimum 40 matchs)
   réduiraient l'effet des blessures.
5. **Structure de `E(t)`** : les réservistes sont classés toutes positions confondues, avec des
   barèmes différents pour les gardiens et les patineurs, et la valeur keeper (âge, potentiel) est
   ignorée.
6. **Borne de variation** : ±0,05 ou ±0,03 par année ? Avec ±0,03, 2026-27 serait limité à 1,27.

---

Calculs reproductibles : scripts `calcul_facteur.py`, `calcul_facteur_historique.py`,
`prix_du_marche.py` et `analyse_jeunes.py` (dossier `calcul_salaire` du projet), avec le détail
dans `calcul_facteur.md`.
