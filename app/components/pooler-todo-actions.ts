'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Ce qui attend une action du pooler connecté (David, 2026-10-03) — alimente le bouton « À faire »
 * de la barre du haut et son panneau, les pastilles du menu et des onglets de Gestion d'effectifs.
 *
 * Échanges : proposition reçue sans réponse, ou échange approuvé que le pooler n'a pas encore
 * confirmé. Une proposition envoyée qui attend l'autre pooler ne compte pas.
 * Ballotage : joueur remporté à ajouter à l'alignement (toujours compté), et joueurs au ballotage
 * ni réclamés ni refusés **libérés depuis la dernière visite de l'onglet Ballotage** (`seenSince`,
 * gardé dans le navigateur) — comme un « non lu », pour que la pastille ne reste pas allumée
 * toute la saison sur des joueurs sans intérêt (choix de David).
 *
 * `items` (David, 2026-10-05) : le détail de chaque chose à faire pour le panneau — s'y ajoutent
 * les joueurs sur LTIR de retour au jeu, le plafond dépassé après une signature et, pour
 * information seulement (`info`, hors compteur), les demandes de LTIR en attente d'approbation.
 * Calculé en direct à partir de l'état du pool : ce n'est pas un historique de notifications.
 */
export type PoolerTodoItem = {
  key: string
  title: string
  detail: string
  href: string
  /** Délai dépassé : affiché en rouge. */
  urgent?: boolean
  /** Rien à faire pour le pooler (attente de l'admin) : hors compteur. */
  info?: boolean
}

export type PoolerTodo = { trades: number; waivers: number; total: number; items: PoolerTodoItem[] }

const EFFECTIFS = '/gestion-effectifs'

/** Instant → « 19 octobre » en heure de l'Est. `endOfDay` : l'instant est le minuit qui suit le
 * dernier jour permis (ballotage, retour de LTIR), on affiche donc la veille. */
function fmtDay(iso: string | null, endOfDay = false): string {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() - (endOfDay ? 60_000 : 0))
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', timeZone: 'America/Toronto' })
}

function fullName(p: { first_name: string; last_name: string } | null): string {
  return p ? `${p.first_name} ${p.last_name}` : 'Un joueur'
}

export async function getPoolerTodoAction(seenSince: string | null): Promise<PoolerTodo> {
  const empty: PoolerTodo = { trades: 0, waivers: 0, total: 0, items: [] }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  const db = createAdminClient()
  const { data: season } = await db
    .from('pool_seasons').select('id').eq('is_active', true).eq('is_playoff', false).maybeSingle()
  if (!season) return empty
  const me = user.id

  const [{ data: offers }, { data: claims }, { data: myRequests }, { data: returns }, { data: ltirPending }, { data: capFlags }] = await Promise.all([
    db.from('trade_offers')
      .select('id, status, proposer_pooler_id, target_pooler_id, proposer_ready_at, target_ready_at, completion_deadline, proposer:poolers!proposer_pooler_id (name), target:poolers!target_pooler_id (name)')
      .eq('pool_season_id', season.id)
      .in('status', ['pending_target', 'pending_completion'])
      .or(`proposer_pooler_id.eq.${me},target_pooler_id.eq.${me}`),
    db.from('waiver_claims')
      .select('id, status, released_by_pooler_id, released_at, awarded_to_pooler_id, players (first_name, last_name)')
      .eq('pool_season_id', season.id)
      .in('status', ['open', 'awarded']),
    db.from('waiver_claim_requests').select('waiver_claim_id').eq('pooler_id', me),
    // Une erreur (migration absente) donne simplement `data: null` → aucun élément.
    db.from('ltir_return_watch')
      .select('id, deadline_at, first_game_date, players (first_name, last_name)')
      .eq('pool_season_id', season.id).eq('pooler_id', me).eq('reason', 'played').is('resolved_at', null),
    db.from('ltir_requests')
      .select('id, submitted_at, ltir_player:players!ltir_player_id (first_name, last_name)')
      .eq('pool_season_id', season.id).eq('pooler_id', me).eq('status', 'pending'),
    db.from('cap_signing_watch')
      .select('id, deadline_at, players (first_name, last_name)')
      .eq('pool_season_id', season.id).eq('pooler_id', me).eq('status', 'flagged'),
  ])

  type Named = { first_name: string; last_name: string } | null
  type OfferRow = {
    id: number; status: string; proposer_pooler_id: string; target_pooler_id: string
    proposer_ready_at: string | null; target_ready_at: string | null; completion_deadline: string | null
    proposer: { name: string } | null; target: { name: string } | null
  }
  type ClaimRow = {
    id: number; status: string; released_by_pooler_id: string | null; released_at: string
    awarded_to_pooler_id: string | null; players: Named
  }
  const items: PoolerTodoItem[] = []
  const now = Date.now()

  // Retours de LTIR en premier : c'est ce qui a une date limite ferme.
  for (const r of (returns ?? []) as unknown as { id: number; deadline_at: string | null; players: Named }[]) {
    const overdue = !!r.deadline_at && now >= new Date(r.deadline_at).getTime()
    items.push({
      key: `ltir-return-${r.id}`,
      title: `De retour au jeu : ${fullName(r.players)}`,
      detail: overdue
        ? `Délai dépassé (${fmtDay(r.deadline_at, true)}) : remets-le dans ton alignement dès que possible.`
        : `À remettre dans ton alignement d'ici le ${fmtDay(r.deadline_at, true)}, 23 h 59.`,
      href: EFFECTIFS,
      urgent: overdue,
    })
  }

  for (const c of (capFlags ?? []) as unknown as { id: number; deadline_at: string | null; players: Named }[]) {
    const overdue = !!c.deadline_at && now >= new Date(c.deadline_at).getTime()
    items.push({
      key: `cap-${c.id}`,
      title: `Plafond dépassé : contrat de ${fullName(c.players)}`,
      detail: overdue
        ? `Délai dépassé (${fmtDay(c.deadline_at)}) : ajuste ton alignement dès que possible.`
        : `Ajuste ton alignement d'ici le ${fmtDay(c.deadline_at)}.`,
      href: EFFECTIFS,
      urgent: overdue,
    })
  }

  let trades = 0
  for (const o of (offers ?? []) as unknown as OfferRow[]) {
    if (o.status === 'pending_target' && o.target_pooler_id === me) {
      trades++
      items.push({
        key: `trade-${o.id}`,
        title: `Échange proposé par ${o.proposer?.name ?? 'un pooler'}`,
        detail: 'Accepte ou refuse la proposition.',
        href: `${EFFECTIFS}?tab=echanges`,
      })
    } else if (o.status === 'pending_completion'
      && ((o.proposer_pooler_id === me && !o.proposer_ready_at) || (o.target_pooler_id === me && !o.target_ready_at))) {
      trades++
      const other = o.proposer_pooler_id === me ? o.target?.name : o.proposer?.name
      items.push({
        key: `trade-${o.id}`,
        title: `Échange avec ${other ?? 'un pooler'} approuvé`,
        detail: `Confirme ta part d'ici le ${fmtDay(o.completion_deadline)}, sinon l'échange est annulé.`,
        href: `${EFFECTIFS}?tab=echanges`,
      })
    }
  }

  const answered = new Set((myRequests ?? []).map(r => r.waiver_claim_id as number))
  const since = seenSince ? new Date(seenSince).getTime() : null
  let waivers = 0
  let newWaivers = 0
  for (const c of (claims ?? []) as unknown as ClaimRow[]) {
    if (c.status === 'awarded' && c.awarded_to_pooler_id === me) {
      waivers++
      items.push({
        key: `waiver-won-${c.id}`,
        title: `Ballotage remporté : ${fullName(c.players)}`,
        detail: 'Ajoute-le à ton alignement (48 h pour agir).',
        href: EFFECTIFS,
      })
    } else if (c.status === 'open' && c.released_by_pooler_id !== me && !answered.has(c.id)
      && (since === null || new Date(c.released_at).getTime() > since)) {
      waivers++
      newWaivers++
    }
  }
  if (newWaivers > 0) {
    items.push({
      key: 'waiver-new',
      title: newWaivers > 1 ? `${newWaivers} nouveaux joueurs au ballotage` : 'Un nouveau joueur au ballotage',
      detail: newWaivers > 1 ? 'Réclame-les ou refuse-les.' : 'Réclame-le ou refuse-le.',
      href: `${EFFECTIFS}?tab=ballotage`,
    })
  }

  for (const r of (ltirPending ?? []) as unknown as { id: number; submitted_at: string; ltir_player: Named }[]) {
    items.push({
      key: `ltir-pending-${r.id}`,
      title: `Demande de LTIR : ${fullName(r.ltir_player)}`,
      detail: `Soumise le ${fmtDay(r.submitted_at)}, en attente de l'approbation de l'admin.`,
      href: EFFECTIFS,
      info: true,
    })
  }

  return { trades, waivers, total: items.filter(i => !i.info).length, items }
}
