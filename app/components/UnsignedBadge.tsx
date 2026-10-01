import type { UnsignedStatus } from '@/lib/capUtils'

/** Mention à côté du salaire d'un joueur sans contrat pour la saison (David, 2026-10-01) — le
 * statut est affiché pour que les poolers sachent d'où vient le montant : un RFA reçoit un
 * salaire estimé, un UFA sans contrat compte 0 $ (voir getEffectiveCap, lib/capUtils.ts). */
export default function UnsignedBadge({ status }: { status: UnsignedStatus }) {
  if (!status) return null
  return status === 'RFA' ? (
    <span
      className="ml-1 text-amber-700 bg-amber-50 rounded px-1 py-0.5 text-[10px] font-medium align-middle whitespace-nowrap"
      title="Joueur autonome avec compensation sans contrat pour cette saison : salaire estimé à partir de son dernier contrat, en attendant le vrai."
    >
      RFA (estimé)
    </span>
  ) : (
    <span
      className="ml-1 text-gray-500 bg-gray-100 rounded px-1 py-0.5 text-[10px] font-medium align-middle whitespace-nowrap"
      title="Joueur autonome sans compensation, sans contrat pour cette saison : il ne compte pas dans la masse salariale."
    >
      UFA (sans contrat)
    </span>
  )
}
