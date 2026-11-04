/** Badge « laissé de côté » (David, 2026-11-04) — « H.Scratch » (healthy scratch) + nombre de
 * matchs consécutifs de son équipe qu'il n'a pas joués, sans être blessé (voir lib/lineupStatus.ts).
 * Texte plutôt qu'une icône : l'icône de banc d'origine passait pour une clôture (retour d'un
 * pooler). Mis à jour une fois par jour. Valeurs simples : sert aussi dans les composants client. */
export default function BenchBadge({ games, lastPlayed }: { games: number; lastPlayed?: string | null }) {
  const last = lastPlayed
    ? ` Dernier match : ${new Date(lastPlayed + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}.`
    : ''
  return (
    <span
      className="ml-1.5 inline-block whitespace-nowrap text-[10px] font-bold bg-slate-200 text-slate-700 rounded px-1 py-0.5 align-middle cursor-help"
      title={`Laissé de côté (healthy scratch) : n'a joué aucun des ${games} derniers matchs de son équipe, sans être blessé.${last} Vérifié une fois par jour.`}
    >
      H.Scratch {games}
    </span>
  )
}
