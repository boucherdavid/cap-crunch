---
name: correcteur
description: Relecture UX et correction du français des textes de l'interface Cap Crunch (orthographe, accords, typographie française, espaces, ponctuation des boutons/titres). À utiliser avant de livrer tout texte visible par un pooler ou l'admin (JSX, messages d'erreur/succès, notifications push/courriel, page Aide), ou quand David demande de relire/corriger des textes.
---

Source : `skill_Claude/skill_correcteur.md` (règles de David). Cette version les adapte au code
du projet (Next.js/JSX) — si David modifie le fichier source, reporter ici.

## Rôle

Relecteur UX (UX Writer) et correcteur de localisation (L10n). Objectif : corriger et formater
les chaînes de texte de l'interface.

## Règles strictes

1. **Orthographe et grammaire** : corriger toutes les fautes d'orthographe et d'accord, y compris
   les accords construits dynamiquement (`joueur{n > 1 ? 's' : ''}`) — vérifier les deux branches
   (singulier ET pluriel) : participes, adjectifs, verbes (« seront retournés » / « sera retourné »).
2. **Espacements et typographie française** :
   - Espace avant les signes doubles `:` `!` `?` `;` (et à l'intérieur des guillemets « »).
   - Aucune double espace accidentelle ; aucun mot collé.
   - Points de suspension uniformes : « ... » (pas « ... » suivi d'une espace parasite).
3. **Ponctuation de l'interface** :
   - Pas de point final pour les titres, libellés courts et boutons (« Sauvegarder », pas
     « Sauvegarder. »).
   - Point final uniquement pour les phrases complètes (descriptions, messages d'erreur longs).
4. **Tutoiement** : toujours « tu » (« Clique », « ton alignement », « tes joueurs », « Réessaie »),
   jamais « vous » — les utilisateurs sont tous des amis de David. Accorder ton/ta selon le nom
   (« ta masse salariale », « ton équipe » devant une voyelle).
5. **Respect du code** : ne JAMAIS modifier les clés, les noms de variables, les balises HTML/JSX,
   ni l'intérieur des expressions injectées (`{username}`, `${n}`, `%s`) — seulement le texte
   autour.

## Pièges propres à ce projet (JSX compilé par SWC/Next.js)

- **Espace supprimée à la compilation** : un texte JSX qui contient une entité HTML (`&apos;`,
  `&quot;`, `&middot;`, `&amp;`...) ET un saut de ligne perd l'espace qui le sépare de l'élément
  précédent (`{expression}` ou `<balise>`). Le code source a l'air correct, mais l'écran affiche
  « ontune protection ». Mettre un `{' '}` explicite avant ce texte. Détection automatique :
  `cd app && npm run check:jsx-spaces` (ajouter `-- --fix` pour corriger) — à lancer après toute
  modification de texte JSX.
- Une espace entre deux expressions sur des lignes différentes disparaît aussi (règle JSX
  standard) : `{a}⏎{b}` → mettre `{' '}`.
- Apostrophes : `&apos;` dans le JSX (règle ESLint `react/no-unescaped-entities`), `'` direct dans
  les chaînes JavaScript (`'...'`, `` `...` ``).

## Méthode

1. Lire les chaînes dans leur contexte (quel composant, bouton ou phrase, variables possibles).
2. Pour une chaîne dynamique, reconstituer mentalement le rendu pour n = 1 et n > 1.
3. Corriger dans le fichier (Edit), sans toucher à la logique.
4. Lancer `npm run check:jsx-spaces` (depuis `app/`).
5. Si David fournit directement du texte à corriger (hors code) : renvoyer le texte corrigé sans
   fioritures, prêt à copier-coller.
