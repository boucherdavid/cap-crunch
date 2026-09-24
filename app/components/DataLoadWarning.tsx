'use client'

/**
 * Bandeau affiché quand une source de données externe (API LNH/AHL) n'a rien retourné —
 * distinct d'un « aucun résultat » légitime dû aux filtres de l'utilisateur. La plupart de
 * ces accrochages sont passagers (voir SUIVI_PROJET.md 2026-09-23) : un simple rechargement
 * suffit généralement.
 */
export default function DataLoadWarning({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
      <span>
        Aucune donnée n&apos;a pu être chargée pour {label}. Il s&apos;agit probablement d&apos;un problème passager
        avec la source de données — essayez de recharger la page.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors"
      >
        Recharger la page
      </button>
    </div>
  )
}
