import type { InjuryInfo } from '@/lib/injuries'

/** Badge "Blessé"/"Admissible LTIR" réutilisé partout où une blessure est affichée (David,
 * 2026-09-23) — le vert remplace le rouge dès que la blessure croise le seuil de 14 jours
 * (voir app/lib/ltirEligibility.ts), pour distinguer d'un coup d'œil un joueur qui justifie
 * une demande de LTIR d'un simple "day-to-day" tout frais. */
export default function InjuryBadge({ injury }: { injury: InjuryInfo }) {
  if (injury.eligible) {
    return (
      <span
        className="ml-1.5 inline-block text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded px-1 py-0.5 align-middle cursor-help"
        title={`${injury.injuryType || injury.status} — admissible au LTIR (source : CBS Sports/ESPN)`}
      >
        Admissible LTIR
      </span>
    )
  }
  return (
    <span
      className="ml-1.5 inline-block text-[10px] font-bold bg-red-100 text-red-600 rounded px-1 py-0.5 align-middle cursor-help"
      title={`${injury.injuryType} — ${injury.status} (source : CBS Sports)`}
    >
      Blessé
    </span>
  )
}
