/** Badge « AHL » (David, 2026-11-04) — joueur dans l'alignement d'un club de la Ligue américaine
 * et dans aucun alignement de la LNH. Mis à jour une fois par jour (voir lib/ahlAssignments.ts).
 * Pas de date dans l'infobulle : `since` vaut le jour du premier import pour tous les joueurs
 * déjà en AHL à ce moment-là. */
export default function AhlBadge({ teamName }: { teamName: string }) {
  return (
    <span
      className="ml-1.5 inline-block text-[10px] font-bold bg-violet-100 text-violet-700 rounded px-1 py-0.5 align-middle cursor-help"
      title={`Dans la Ligue américaine : ${teamName} (vérifié une fois par jour)`}
    >
      AHL
    </span>
  )
}
