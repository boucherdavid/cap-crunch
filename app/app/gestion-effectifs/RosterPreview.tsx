'use client'

import type { RosterEntry, RosterForPooler } from './actions'

/**
 * Colonne « Alignement » de Gestion d'effectifs (David, 2026-10-02) — occupe l'espace libre à
 * droite du formulaire avec ce qui manquait : l'alignement du pooler, joueur par joueur. Dès que
 * le panier contient une action, elle montre l'alignement tel qu'il sera après la soumission,
 * changements surlignés (ajout, retrait, changement de statut). Remplace l'ancien bloc « État
 * projeté », qui ne donnait que des compteurs.
 */

const TYPE_LABEL: Record<string, string> = { actif: 'actif', reserviste: 'réserviste', ltir: 'LTIR', recrue: 'recrue' }

const capFmt = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

function bucket(position: string | null): 'F' | 'D' | 'G' {
  const p = (position ?? '').toUpperCase()
  if (p.includes('G')) return 'G'
  if (p.includes('D')) return 'D'
  return 'F'
}

const byCap = (a: RosterEntry, b: RosterEntry) => (Number(b.capNumber) || 0) - (Number(a.capNumber) || 0) || a.lastName.localeCompare(b.lastName)

function Row({ e, previousType, isNew, removed }: { e: RosterEntry; previousType?: string; isNew?: boolean; removed?: boolean }) {
  return (
    <li className={`flex items-center justify-between gap-2 py-1 text-sm ${removed ? 'opacity-50' : ''} ${isNew ? 'bg-green-50 -mx-2 px-2 rounded' : previousType ? 'bg-amber-50 -mx-2 px-2 rounded' : ''}`}>
      <span className="min-w-0 truncate">
        <span className="text-xs text-gray-400 mr-1.5">{e.position ?? '—'}</span>
        <span className={removed ? 'line-through text-gray-500' : 'text-gray-800'}>{e.lastName}, {e.firstName}</span>
        {isNew && <span className="ml-2 text-[10px] font-bold text-green-700">AJOUT</span>}
        {previousType && <span className="ml-2 text-[10px] font-semibold text-amber-700">était {TYPE_LABEL[previousType] ?? previousType}</span>}
        {removed && <span className="ml-2 text-[10px] font-bold text-red-600">RETIRÉ</span>}
        {e.injury && !removed && <span className="ml-2 text-[10px] font-semibold text-red-500">{e.injury.backInAction ? 'de retour au jeu' : e.injury.eligible ? 'admissible LTIR' : 'blessé'}</span>}
      </span>
      <span className={`shrink-0 tabular-nums text-xs ${removed ? 'line-through text-gray-400' : 'text-gray-600'}`}>
        {capFmt(e.capNumber)}{e.isEstimatedCap && <span className="ml-1 text-amber-700">estimé</span>}
      </span>
    </li>
  )
}

function Group({ title, count, target, entries, original }: {
  title: string
  count: number
  target?: number  // nombre exact attendu (12/6/2) — le compteur passe au rouge s'il diffère
  entries: RosterEntry[]
  original: Map<number, RosterEntry>
}) {
  if (entries.length === 0 && target === undefined) return null
  const off = target !== undefined && count !== target
  return (
    <div>
      <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500 border-b pb-1 mb-1">
        <span>{title}</span>
        <span className={off ? 'text-red-600' : 'text-gray-400'}>{count}{target !== undefined && ` / ${target}`}</span>
      </p>
      {entries.length === 0
        ? <p className="text-xs text-gray-400 py-1">Aucun</p>
        : (
          <ul>
            {entries.map(e => {
              const before = original.get(e.id)
              return <Row key={e.id} e={e} isNew={!before} previousType={before && before.playerType !== e.playerType ? before.playerType : undefined} />
            })}
          </ul>
        )}
    </div>
  )
}

export default function RosterPreview({
  roster, projected, poolCap, capUsed, hasCart, messages, previewTitle, removedTitle,
}: {
  roster: RosterForPooler
  projected: RosterForPooler
  poolCap: number
  capUsed: number
  hasCart: boolean            // un aperçu est affiché (panier de mouvements, ou échange en préparation)
  messages?: React.ReactNode  // avertissements de conformité, affichés sous le sommaire
  previewTitle?: string       // titre de l'aperçu — par défaut celui du panier de mouvements
  removedTitle?: string
}) {
  const original = new Map<number, RosterEntry>()
  for (const e of [...roster.actifs, ...roster.reservistes, ...roster.ltir, ...roster.recrues]) original.set(e.id, e)
  const keptIds = new Set([...projected.actifs, ...projected.reservistes, ...projected.ltir, ...projected.recrues].map(e => e.id))
  const removed = [...original.values()].filter(e => !keptIds.has(e.id)).sort(byCap)

  const actifs = (b: 'F' | 'D' | 'G') => projected.actifs.filter(e => bucket(e.position) === b).sort(byCap)
  const capOver = capUsed > poolCap
  const remaining = poolCap - capUsed

  return (
    <div className="bg-white rounded-lg shadow p-5 space-y-4 min-w-0">
      <div>
        <p className="text-sm font-semibold text-gray-700">{hasCart ? (previewTitle ?? 'Alignement après les mouvements du panier') : 'Alignement actuel'}</p>
        {hasCart && <p className="text-xs text-gray-400 mt-0.5">Aperçu : rien n&apos;est enregistré pour l&apos;instant.</p>}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Masse salariale</span>
          <span className={capOver ? 'text-red-600 font-semibold' : 'text-gray-700'}>{capFmt(capUsed)} / {capFmt(poolCap)}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${capOver ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min((capUsed / poolCap) * 100, 100)}%` }} />
        </div>
        <p className={`text-xs text-right ${capOver ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
          {capOver ? `Dépassement de ${capFmt(-remaining)}` : `Espace restant : ${capFmt(remaining)}`}
        </p>
      </div>

      {messages}

      <Group title="Attaquants" count={actifs('F').length} target={12} entries={actifs('F')} original={original} />
      <Group title="Défenseurs" count={actifs('D').length} target={6} entries={actifs('D')} original={original} />
      <Group title="Gardiens" count={actifs('G').length} target={2} entries={actifs('G')} original={original} />
      <Group title="Réservistes (minimum 2)" count={projected.reservistes.length} entries={[...projected.reservistes].sort(byCap)} original={original} />
      <Group title="LTIR" count={projected.ltir.length} entries={[...projected.ltir].sort(byCap)} original={original} />
      <Group title="Banque de recrues" count={projected.recrues.length} entries={[...projected.recrues].sort(byCap)} original={original} />

      {removed.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600 border-b pb-1 mb-1">{removedTitle ?? 'Retirés par le panier'}</p>
          <ul>{removed.map(e => <Row key={e.id} e={e} removed />)}</ul>
        </div>
      )}
    </div>
  )
}
