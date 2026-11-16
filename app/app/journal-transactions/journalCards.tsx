// Cartes du Journal des activités (David, 2026-11-16) — partagées par /journal-transactions et
// l'onglet Marqueur de Gestion des effectifs (« À saisir depuis ta dernière mise à jour »).
// Aucun hook : utilisable dans un composant serveur comme dans un composant client.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { poolDraftYear } from '@/lib/poolDraftYear'
import { JOURNAL_NOTES_BALLOTAGE } from '@/lib/transactionJournal'

export const DASH = '—'

export const typeLabel: Record<string, string> = {
  actif: 'Actif', reserviste: 'Réserviste', ltir: 'LTIR', recrue: 'Recrue',
}

export type TabKey = 'tous' | 'echanges' | 'ballotage' | 'signatures' | 'ltir' | 'gestion'


export function classifyTx(items: any[], notes: string | null): TabKey {
  const types = items.map((i: any) => i.action_type)
  if (types.includes('ballotage') || notes === JOURNAL_NOTES_BALLOTAGE) return 'ballotage'
  if (types.includes('transfer')) return 'echanges'
  if (types.includes('sign')) return 'signatures'
  if (
    types.includes('reactivate') ||
    items.some((i: any) => i.action_type === 'type_change' && (i.old_player_type === 'ltir' || i.new_player_type === 'ltir'))
  ) return 'ltir'
  return 'gestion'
}

export function itemDescription(item: any): string {
  const from = item.from_pooler?.name
  const to = item.to_pooler?.name
  const player = item.players
    ? `${item.players.last_name}, ${item.players.first_name} (${item.players.teams?.code ?? DASH}) ${item.players.position ?? ''}`
    : null
  const oldT = item.old_player_type ? typeLabel[item.old_player_type] ?? item.old_player_type : null
  const newT = item.new_player_type ? typeLabel[item.new_player_type] ?? item.new_player_type : null

  switch (item.action_type) {
    case 'ballotage':
      return `${from} cède ${player} à ${to} (ballotage)`
    case 'transfer': {
      if (item.pick) {
        const isOwn = item.pick.original_owner?.name === from
        const pickLabel = `Ronde ${item.pick.round} ${poolDraftYear(item.pick.pool_seasons?.season)}${!isOwn ? ` (de ${item.pick.original_owner?.name})` : ''}`
        return `${from} donne ${pickLabel} à ${to}`
      }
      return `${from} donne ${player} à ${to}`
    }
    case 'sign':
      return `${to} signe ${player} (${newT})`
    case 'promote':
      return `${to} promeut ${player} → ${newT}`
    case 'reactivate':
      return `${to} réactive ${player} (LTIR → ${newT})`
    case 'release':
      return `${from} libère ${player}`
    case 'type_change':
      return `${from ?? to} : ${player} ${oldT} → ${newT}`
    default:
      return item.action_type
  }
}

// Affichage deux colonnes pour un échange entre poolers (David, 2026-09-22) — même patron que
// l'onglet Échanges de Gestion d'effectifs ("Tu donnes"/"Tu reçois"), plus lisible que la liste
// à plat d'origine. Les items 'transfer' (joueurs/choix qui changent de main) vont dans la
// colonne du pooler qui les donne ; les ajustements de la même transaction (retour en banque,
// activation de recrue, libération — ajoutés par un pooler pour rester conforme) s'affichent
// en petit sous la colonne du pooler concerné, sans confondre les deux catégories.
 
export function TradeCard({ items }: { items: any[] }) {
  const transfers = items.filter(i => i.action_type === 'transfer')
  const adjustments = items.filter(i => i.action_type !== 'transfer')

  const poolerNames = Array.from(new Set(transfers.flatMap(i => [i.from_pooler?.name, i.to_pooler?.name]).filter(Boolean)))
  if (poolerNames.length !== 2) {
    // Cas limite (ex: aucun item 'transfer' trouvable) — repli sur la liste à plat habituelle.
    return (
      <ul className="space-y-1">
        {items.map(item => (
          <li key={item.id} className="text-sm text-gray-700 bg-blue-50 px-3 py-1.5 rounded">{itemDescription(item)}</li>
        ))}
      </ul>
    )
  }

   
  function transferLabel(item: any): string {
    if (item.pick) {
      const isOwn = item.pick.original_owner?.name === item.from_pooler?.name
      return `Ronde ${item.pick.round} ${poolDraftYear(item.pick.pool_seasons?.season)}${!isOwn ? ` (de ${item.pick.original_owner?.name})` : ''}`
    }
    const p = item.players
    return p ? `${p.last_name}, ${p.first_name} (${p.teams?.code ?? DASH}) ${p.position ?? ''}` : '?'
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {poolerNames.map(name => (
          <div key={name}>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{name} donne</p>
            <ul className="space-y-1">
              {transfers.filter(i => i.from_pooler?.name === name).map(item => (
                <li key={item.id} className="text-sm text-gray-700 bg-blue-50 px-3 py-1.5 rounded">{transferLabel(item)}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {adjustments.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
          {adjustments.map(item => (
            <p key={item.id} className="text-xs text-gray-500">{itemDescription(item)}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export const TAB_LABEL: Record<TabKey, string> = {
  tous: '', echanges: 'Échange', ballotage: 'Ballotage', signatures: 'Signature', ltir: 'LTIR', gestion: "Gestion d'effectifs",
}
export const TAB_BORDER: Record<TabKey, string> = {
  tous: 'border-slate-300', echanges: 'border-blue-400', ballotage: 'border-orange-400',
  signatures: 'border-green-400', ltir: 'border-amber-400', gestion: 'border-slate-400',
}

export type Pos = 'A' | 'D' | 'G'
function posOf(position: string | null | undefined): Pos {
  const first = (position ?? '').split(',')[0].trim().toUpperCase()
  if (first === 'G') return 'G'
  if (first === 'D' || first === 'LD' || first === 'RD') return 'D'
  return 'A'
}
const POS_LABEL: Record<Pos, string> = { A: 'attaquant', D: 'défenseur', G: 'gardien' }

// Moment d'effet du panier (David, 2026-11-15) : midi UTC pile = date sans heure (date forcée ou
// mouvement reporté au lendemain), effectif avant les matchs du jour — même convention que
// l'onglet Marqueur. Sinon l'heure exacte, heure de l'Est.
export function formatMoment(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' })
  if (d.getUTCHours() === 12 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return `${day}, avant les matchs du jour`
  const [h, m] = d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Toronto' }).split(/[: h]+/)
  return `${day} à ${Number(h)} h ${m} (heure de l'Est)`
}

// Un mouvement d'un panier, vu par le pooler concerné : d'où il part et où il arrive.
export type BasketLine = { id: number; player: string; pos: Pos; from: string | null; to: string | null; label: string; playerId: string | null }

 
export function toBasketLine(item: any): BasketLine {
  const p = item.players
  const player = p ? `${p.last_name}, ${p.first_name} (${p.teams?.code ?? DASH}) ${p.position ?? ''}` : '?'
  const from: string | null = item.action_type === 'sign' || item.action_type === 'ballotage' ? null : item.old_player_type ?? null
  const to: string | null = item.action_type === 'release' ? null : item.new_player_type ?? null
  const t = (x: string | null) => (x ? typeLabel[x] ?? x : null)
  let label: string
  switch (item.action_type) {
    case 'sign': label = `Signature (${t(to) ?? '?'})`; break
    case 'ballotage': label = `Ballotage (${t(to) ?? '?'})`; break
    case 'release': label = from ? `Libération (était ${t(from)?.toLowerCase()})` : 'Libération'; break
    case 'promote': label = `Banque de recrues → ${t(to)}`; break
    case 'reactivate': label = `LTIR → ${t(to)}`; break
    default: label = `${t(from) ?? '?'} → ${t(to) ?? '?'}`
  }
  return { id: item.id, player, pos: posOf(p?.position), from, to, label, playerId: p ? String(p.id) : null }
}

function BasketLineView({ l, highlight }: { l: BasketLine; highlight: boolean }) {
  return (
    <div className={`text-sm rounded px-1 -mx-1 ${highlight ? 'bg-yellow-100' : ''}`}>
      <span className="font-medium text-gray-800">{l.player}</span>
      <p className="text-xs text-gray-500">{l.label}</p>
    </div>
  )
}

/**
 * Un panier soumis, pour un pooler (David, 2026-11-15) : qui sort des actifs, qui y entre,
 * jumelés par position, et si le compte des actifs balance — pour recouper avec Marqueur.
 */
export function BasketCard({ lines, highlightPlayer }: { lines: BasketLine[]; highlightPlayer: string }) {
  const outs = lines.filter(l => l.from === 'actif' && l.to !== 'actif')
  const ins = lines.filter(l => l.to === 'actif' && l.from !== 'actif')
  const others = lines.filter(l => !outs.includes(l) && !ins.includes(l))
  const pairs: { out: BasketLine | null; in: BasketLine | null }[] = []
  const insLeft = [...ins]
  for (const out of outs) {
    const i = insLeft.findIndex(x => x.pos === out.pos)
    pairs.push({ out, in: i >= 0 ? insLeft.splice(i, 1)[0] : null })
  }
  for (const left of insLeft) pairs.push({ out: null, in: left })

  const net = (['A', 'D', 'G'] as Pos[]).map(pos => ({
    pos, diff: ins.filter(l => l.pos === pos).length - outs.filter(l => l.pos === pos).length,
  })).filter(x => x.diff !== 0)
  const hl = (l: BasketLine) => !!highlightPlayer && l.playerId === highlightPlayer

  return (
    <div className="space-y-2">
      {pairs.length > 0 && (
        <div>
          <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-x-3 text-[11px] font-semibold text-gray-400 uppercase mb-1">
            <span>Sort des actifs</span><span /><span>Entre dans les actifs</span>
          </div>
          <ul className="space-y-1.5">
            {pairs.map((pair, i) => (
              <li key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-0.5 items-start">
                <div>{pair.out ? <BasketLineView l={pair.out} highlight={hl(pair.out)} /> : <span className="text-xs text-gray-400">Aucune sortie</span>}</div>
                <span className="hidden sm:inline text-gray-400 pt-0.5">⇄</span>
                <div className="pl-3 sm:pl-0 border-l-2 sm:border-l-0 border-gray-100">
                  {pair.in ? <BasketLineView l={pair.in} highlight={hl(pair.in)} /> : <span className="text-xs text-gray-400">Aucune entrée</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {others.length > 0 && (
        <div className={pairs.length > 0 ? 'pt-2 border-t border-gray-100' : ''}>
          {pairs.length > 0 && <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Autres mouvements</p>}
          <ul className="space-y-1.5">
            {others.map(l => <li key={l.id}><BasketLineView l={l} highlight={hl(l)} /></li>)}
          </ul>
        </div>
      )}
      {pairs.length > 0 && (
        net.length === 0 ? (
          <p className="text-xs font-medium text-emerald-700">✓ Le compte des actifs balance</p>
        ) : (
          <p className="text-xs font-medium text-amber-700">
            ⚠ Actifs :{' '}
            {net.map(x => `${x.diff > 0 ? '+' : '−'}${Math.abs(x.diff)} ${POS_LABEL[x.pos]}${Math.abs(x.diff) > 1 ? 's' : ''}`).join(', ')}
          </p>
        )
      )}
    </div>
  )
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

// Colonnes structurées pour l'affichage tabulaire (David, 2026-09-22) — même données que
// itemDescription() mais en morceaux séparés plutôt qu'en phrase, pour un tableau compact
// (Signatures/LTIR/Gestion/Ballotage — pas Échanges, qui garde son affichage deux colonnes).
 
export function rowInfo(item: any): { pooler: string; player: string; detail: string } {
  const from = item.from_pooler?.name ?? DASH
  const to = item.to_pooler?.name ?? DASH
  const player = item.players
    ? `${item.players.last_name}, ${item.players.first_name} (${item.players.teams?.code ?? DASH}) ${item.players.position ?? ''}`
    : '?'
  const oldT = item.old_player_type ? typeLabel[item.old_player_type] ?? item.old_player_type : null
  const newT = item.new_player_type ? typeLabel[item.new_player_type] ?? item.new_player_type : null

  switch (item.action_type) {
    case 'ballotage':
      return { pooler: `${from} → ${to}`, player, detail: 'Ballotage' }
    case 'sign':
      return { pooler: to, player, detail: `Signature (${newT})` }
    case 'promote':
      return { pooler: to, player, detail: `Promotion → ${newT}` }
    case 'reactivate':
      return { pooler: to, player, detail: `Retour LTIR → ${newT}` }
    case 'release':
      return { pooler: from, player, detail: 'Libération' }
    case 'type_change':
      return { pooler: item.from_pooler?.name ?? to, player, detail: `${oldT} → ${newT}` }
    default:
      return { pooler: from !== DASH ? from : to, player, detail: item.action_type }
  }
}

/** Découpe une transaction en paniers, un par pooler concerné (une transaction peut en toucher
 * plusieurs, ex. activation automatique des recrues). */
export function splitByOwner(items: any[]): { owner: string; items: any[] }[] {
  const byOwner = new Map<string, any[]>()
  for (const item of items) {
    const owner = rowInfo(item).pooler
    if (!byOwner.has(owner)) byOwner.set(owner, [])
    byOwner.get(owner)!.push(item)
  }
  return [...byOwner].map(([owner, its]) => ({ owner, items: its }))
}
