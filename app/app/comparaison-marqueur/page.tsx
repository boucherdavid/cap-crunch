import { redirect } from 'next/navigation'

/**
 * Ex-page des poolers (2026-10-06 → 2026-10-17). La comparaison avec Marqueur est redevenue un
 * outil admin (David, 2026-10-17 — menu Le pool trop chargé) : redirection volontaire vers l'onglet
 * admin, pour les liens existants. Les poolers gardent un lien vers Marqueur.com sur l'accueil et
 * sur la page d'alignement de chaque pooler.
 */
export default function ComparaisonMarqueurPage() {
  redirect('/admin/effectifs?tab=marqueur')
}
