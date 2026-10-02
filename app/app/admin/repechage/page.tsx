import { redirect } from 'next/navigation'

// Hub unique depuis le 2026-10-02 (David) : l'admin fait les sélections et gère le chrono
// directement sur /repechage-recrues, comme pour les agents libres. Ancienne adresse conservée
// (menu, hub Nouvelle saison, liens existants) — le paramètre de saison est transmis.
export default async function RepechageAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saisonId?: string }>
}) {
  const { saisonId } = await searchParams
  redirect(saisonId ? `/repechage-recrues?saisonId=${encodeURIComponent(saisonId)}` : '/repechage-recrues')
}
