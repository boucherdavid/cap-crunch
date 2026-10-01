/**
 * Légende / définitions repliées par défaut (David, 2026-10-01) — l'explication reste lisible
 * sur la page (pas seulement au survol) sans alourdir le visuel : à utiliser pour toute légende
 * de plus d'une ligne plutôt qu'un bloc toujours déplié.
 */
export default function CollapsibleLegend({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-gray-100 bg-gray-50 px-4 py-2">
      <summary className="text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700">
        {title}
      </summary>
      <div className="pt-2 pb-1">{children}</div>
    </details>
  )
}
