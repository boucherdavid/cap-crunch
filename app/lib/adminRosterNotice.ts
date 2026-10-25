import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToAdmins } from '@/lib/push'
import { playerNames, poolerName } from '@/lib/poolAnnouncements'

// Avis aux admins quand un pooler ajuste lui-même son alignement (David, 2026-10-25) : lots de
// Gestion d'effectifs et libre-service de la pré-saison. Jamais pour un admin qui agit (lui-même
// ou au nom d'un pooler). Un seul avis par lot, envoyé après la réponse (after()).

export type RosterMove = { playerId: number; oldType: string | null; newType: string | null }

export const ADMIN_MOVES_TITLE = 'Cap Crunch — Mouvement d’alignement'
const MAX_LINES = 4

const TYPE_LABEL: Record<string, string> = {
  actif: 'actif', reserviste: 'réserviste', recrue: 'banque de recrues', ltir: 'LTIR',
}

function describe(name: string, m: RosterMove): string {
  if (m.newType === null) return `libère ${name}`
  if (m.oldType === null) return `ajoute ${name} (${TYPE_LABEL[m.newType] ?? m.newType})`
  return `${name} : ${TYPE_LABEL[m.oldType] ?? m.oldType} → ${TYPE_LABEL[m.newType] ?? m.newType}`
}

export async function notifyAdminsOfRosterMoves(actorId: string, poolerId: string, moves: RosterMove[]) {
  if (moves.length === 0) return
  const db = createAdminClient()
  const { data: actor } = await db.from('poolers').select('is_admin').eq('id', actorId).maybeSingle()
  if (actor?.is_admin) return

  const [names, who] = await Promise.all([playerNames([...new Set(moves.map(m => m.playerId))]), poolerName(poolerId)])
  const lines = moves.map(m => describe(names.get(m.playerId) ?? 'un joueur', m))
  const shown = lines.slice(0, MAX_LINES).join(' · ')
  const more = lines.length > MAX_LINES ? ` · et ${lines.length - MAX_LINES} de plus` : ''
  await sendPushToAdmins({ title: ADMIN_MOVES_TITLE, body: `${who} : ${shown}${more}.`, url: '/journal-transactions' }, actorId)
}
