/**
 * Adresse publique de l'app, pour les liens des courriels et des redirections d'authentification
 * (David, 2026-10-03). Un lien de courriel doit être absolu : avec un chemin seul
 * (« /gestion-effectifs »), le client de courriel l'affiche comme du texte non cliquable — c'est
 * ce qui arrivait quand NEXT_PUBLIC_SITE_URL n'était pas défini.
 *
 * Ordre : NEXT_PUBLIC_SITE_URL si défini ; sinon le domaine de production du projet Vercel
 * (VERCEL_PROJECT_PRODUCTION_URL — cap-crunch.vercel.app en prod, cap-crunch-staging.vercel.app
 * en staging) ; sinon l'adresse du déploiement (VERCEL_URL) ; sinon le serveur local.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

/** Lien absolu vers une page de l'app (`path` commence par « / »). */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path}`
}

/** Paragraphe « Voir sur Cap Crunch » des courriels, avec un lien absolu et cliquable. */
export function emailLinkHtml(path: string, label = 'Voir sur Cap Crunch'): string {
  return `<p><a href="${absoluteUrl(path)}">${label}</a></p>`
}
