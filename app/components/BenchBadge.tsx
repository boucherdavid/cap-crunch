/** Badge « laissé de côté » (David, 2026-11-04) — icône de banc + nombre de matchs consécutifs
 * de son équipe qu'il n'a pas joués, sans être blessé (voir lib/lineupStatus.ts). Mis à jour une
 * fois par jour. Accepte des valeurs simples pour servir aussi dans les composants client. */
export default function BenchBadge({ games, lastPlayed }: { games: number; lastPlayed?: string | null }) {
  const last = lastPlayed
    ? ` Dernier match : ${new Date(lastPlayed + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}.`
    : ''
  return (
    <span
      className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold bg-slate-200 text-slate-700 rounded px-1 py-0.5 align-middle cursor-help"
      title={`Laissé de côté : n'a joué aucun des ${games} derniers matchs de son équipe, sans être blessé.${last} Vérifié une fois par jour.`}
      aria-label={`Laissé de côté depuis ${games} matchs`}
    >
      <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M2 7h12M3 7V4.5h10V7M3 7v5M13 7v5M2 9.5h12" />
      </svg>
      {games}
    </span>
  )
}
