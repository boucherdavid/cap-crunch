# Cap Crunch — Règles Next.js / app/

Ce fichier complète le `CLAUDE.md` racine avec les règles spécifiques
au code dans le dossier `app/`. En cas de conflit, ce fichier a priorité
pour tout ce qui concerne le code Next.js/TypeScript.

---

## Architecture des dossiers

```text
app/
├── proxy.ts               ← Auth + redirections (NE PAS renommer en middleware.ts)
├── next.config.ts
├── app/                   ← App Router Next.js
│   ├── layout.tsx         ← Layout global (Navbar, auth côté serveur)
│   ├── page.tsx           ← Page d'accueil
│   ├── components/        ← Composants partagés entre pages
│   ├── lib/               ← Logique métier, clients Supabase, utilitaires
│   │   ├── supabase/
│   │   │   ├── server.ts  ← Client Supabase serveur (cookies)
│   │   │   └── client.ts  ← Client Supabase navigateur
│   │   ├── standings.ts   ← buildStandings() — classement saison
│   │   └── streaks.ts     ← fetchStreaks() — badges indicateurs
│   ├── admin/             ← Pages admin (desktop-only)
│   ├── series/            ← Pool des séries playoffs
│   └── ...autres pages
└── ...config files
```

---

## Règles composants

**Server Components par défaut**
- Utiliser `async` Server Components pour tous les fetches de données
- Ajouter `"use client"` uniquement si le composant utilise : hooks React, événements browser, state local

**Nommage des fichiers**
- Pages : `page.tsx` (convention Next.js App Router)
- Composants client extraits : `NomComposant.tsx` (PascalCase)
- Actions serveur : `actions.ts` ou `nom-feature-actions.ts`
- Utilitaires : `kebab-case.ts`

**Séparation Server / Client**
```tsx
// ✅ Pattern recommandé : page serveur + composant client extrait
// page.tsx (Server Component)
import { MonComposantClient } from './MonComposantClient'
const data = await fetchData()
return <MonComposantClient data={data} />

// MonComposantClient.tsx
"use client"
export function MonComposantClient({ data }) { ... }
```

---

## Supabase — règles d'usage

```typescript
// Côté serveur (pages, layouts, actions)
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()

// Côté client (composants "use client" seulement)
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()
```

- Ne jamais utiliser le client `browser` dans un Server Component
- RLS : `is_admin()` est en `SECURITY DEFINER` — modifier avec prudence
- Legacy anon key préférable à `sb_publishable_` dans ce projet

---

## Gestion des erreurs et performance

```typescript
// Fetches parallèles avec timeout (pattern établi dans ce projet)
const [data1, data2] = await Promise.all([fetch1(), fetch2()])

// Avec timeout pour éviter le blocage (ex: NHL API)
const result = await Promise.race([
  fetchAvecTimeout(),
  new Promise((_, reject) => setTimeout(() => reject(), 5000))
])
```

- Cache Supabase : utiliser `revalidate` approprié selon la fraîcheur requise
- NHL API : utiliser `batchSize` dans `fetchStreaks` pour éviter le rate-limiting
- Pages admin : pas d'optimisation de performance requise (desktop-only)

---

## Notifications push

- Table `push_subscriptions` dans Supabase (RLS admin only)
- Variables d'env requises (noms exacts lus par `initVapid()` dans `app/lib/push.ts`) :
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (préfixe requis — aussi lue côté client par
  `app/app/compte/PushToggle.tsx` pour `pushManager.subscribe()`), `VAPID_PRIVATE_KEY`,
  `VAPID_MAILTO`. Si l'une des 3 manque, `initVapid()` retourne `false` et l'envoi est
  silencieusement ignoré (aucune erreur visible) — à vérifier en premier si les push ne
  partent pas.
- Package `web-push` installé
- Pattern : fire-and-forget (`sendPushToAdmins`) — ne pas awaiter dans les Server Actions critiques
- L'admin doit activer les notifications dans `/compte` sur son appareil

---

## Tailwind CSS 4

- Classes utilitaires uniquement — pas de CSS inline ni de `style={}`
- Responsive : préfixes `sm:` `md:` `lg:` selon les besoins
- Pages admin : pas de responsive requis
- Tableaux : toujours `overflow-x-auto` sur le conteneur parent
- Colonnes à masquer sur mobile : `hidden sm:table-cell` (et le `<th>` correspondant)

---

## Règles à ne pas oublier

| Situation | Règle |
|---|---|
| Modifier une page de consultation | Rendre responsive en même temps |
| Ajouter une fonctionnalité pooler | Évaluer mise à jour `/aide` |
| Nouvelle route admin | Desktop-only, pas de responsive |
| Fetch NHL API | Ajouter timeout + fallback silencieux |
| Nouvelle migration Supabase | Ajouter le fichier dans `supabase_migrations/` |
| Modifier `is_admin()` ou RLS | Valider avec prudence, documenter dans SUIVI_PROJET.md |
