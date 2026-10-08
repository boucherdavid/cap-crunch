/**
 * Signatures et échanges de la LNH (David, 2026-10-08) — deux sources lisibles par un serveur :
 * le flux public d'ESPN (signatures, prolongations, échanges annoncés) et les alignements de
 * l'API de la LNH comparés à `players.team_id` (changement d'équipe). Les deux sont nécessaires :
 * ESPN n'a jamais listé l'échange Marchenko–Knies d'octobre 2026, que les alignements montraient.
 *
 * But premier : avertir l'admin qu'il faut rafraîchir les salaires. Le scraping de PuckPedia ne
 * tourne qu'en local (Cloudflare bloque toute lecture par un serveur), et l'import GitHub ne fait
 * que relire les CSV du dépôt : sans signal indépendant, un échange ou une signature passe
 * inaperçu jusqu'au prochain pipeline manuel.
 *
 * Détection paresseuse (accueil, `after()`), pas de tâche planifiée. Chaque transaction est
 * insérée une seule fois dans `nhl_transaction_alerts` (clé primaire = verrou contre les
 * notifications en double) ; la carte de l'accueil lit cette table, donc elle reste affichée
 * même si ESPN ne répond pas.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToAdmins } from '@/lib/push'
import { sendEmailToIds, escapeHtml } from '@/lib/email'
import { emailLinkHtml } from '@/lib/siteUrl'
import { getAppEnv } from '@/lib/appEnv'

const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/transactions?limit=100'
const SYNC_THROTTLE_MS = 10 * 60_000
// Au-delà, une transaction n'est plus une nouvelle : ni insérée ni notifiée.
const MAX_AGE_DAYS = 4
const CARD_DAYS = 7
const CARD_LIMIT = 10
const PIPELINE_PATH = '/admin/donnees'

// Phrases gardées : signatures, prolongations, échanges. Le reste (rappels de la Ligue
// américaine, liste des blessés, ballotage) ne change ni un contrat ni une équipe.
// La description est gardée entière (la découper en phrases casserait « J.T. Miller ») dès
// qu'elle contient plus de gestes retenus que d'essais professionnels.
const KEEP = /(?:^|\.\s+)(?:signed|re-signed|acquired|traded|agreed to terms)\b|contract extension/gi
const DROP = /tryout|\bPTO\b|\bATO\b/gi

type EspnTransaction = { date?: string; description?: string; team?: { abbreviation?: string; displayName?: string } }

export type NhlTransaction = { key: string; txDate: string; team: string; description: string }

function isRelevant(description: string): boolean {
  const keep = description.match(KEEP)?.length ?? 0
  const drop = description.match(DROP)?.length ?? 0
  return keep > drop
}

async function fetchEspnTransactions(): Promise<NhlTransaction[]> {
  const res = await fetch(ESPN_URL, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`ESPN ${res.status}`)
  const json = await res.json() as { transactions?: EspnTransaction[] }
  const minDate = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10)
  const out: NhlTransaction[] = []
  const seen = new Set<string>()
  for (const t of json.transactions ?? []) {
    const txDate = (t.date ?? '').slice(0, 10)
    const team = t.team?.abbreviation ?? ''
    const description = (t.description ?? '').trim()
    if (!txDate || txDate < minDate || !isRelevant(description)) continue
    const key = `${txDate}|${team}|${description}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ key, txDate, team, description })
  }
  return out
}

// ── Changements d'équipe : alignements de la LNH comparés à notre base ───────────────────────

type NhlRosterPlayer = { id: number; firstName?: { default?: string }; lastName?: { default?: string } }

async function fetchNhlRoster(code: string): Promise<{ code: string; players: NhlRosterPlayer[] }> {
  const res = await fetch(`https://api-web.nhle.com/v1/roster/${code}/current`, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`LNH ${code} ${res.status}`)
  const json = await res.json() as Record<string, NhlRosterPlayer[] | undefined>
  return { code, players: [...(json.forwards ?? []), ...(json.defensemen ?? []), ...(json.goalies ?? [])] }
}

/** Joueurs présents dans l'alignement d'une équipe de la LNH alors que notre base les place
 * ailleurs. La clé ne contient pas la date : un même changement n'est signalé qu'une fois, même
 * si la base reste périmée plusieurs jours. */
async function detectTeamChanges(admin: ReturnType<typeof createAdminClient>): Promise<NhlTransaction[]> {
  const { data: teams } = await admin.from('teams').select('code')
  const codes = (teams ?? []).map(t => t.code as string).filter(Boolean)
  if (codes.length === 0) return []

  const rosters: { code: string; players: NhlRosterPlayer[] }[] = []
  for (let i = 0; i < codes.length; i += 8) {
    const batch = await Promise.allSettled(codes.slice(i, i + 8).map(fetchNhlRoster))
    for (const r of batch) if (r.status === 'fulfilled') rosters.push(r.value)
  }
  const nhlTeamById = new Map<number, string>()
  for (const r of rosters) for (const p of r.players) nhlTeamById.set(p.id, r.code)
  const ids = [...nhlTeamById.keys()]
  if (ids.length === 0) return []

  const today = new Date().toISOString().slice(0, 10)
  const out: NhlTransaction[] = []
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin
      .from('players')
      .select('nhl_id, first_name, last_name, teams (code)')
      .in('nhl_id', ids.slice(i, i + 300))
    for (const p of (data ?? []) as unknown as {
      nhl_id: number; first_name: string; last_name: string; teams: { code: string } | null
    }[]) {
      const now = nhlTeamById.get(p.nhl_id)
      const ours = p.teams?.code
      if (!now || !ours || now === ours) continue
      out.push({
        key: `equipe|${p.nhl_id}|${now}`,
        txDate: today,
        team: now,
        description: `${p.first_name} ${p.last_name} : ${ours} → ${now} (changement d'équipe selon l'alignement de la LNH)`,
      })
    }
  }
  return out
}

let lastSyncAt = 0

/** Lit les deux sources, enregistre les nouveautés et avertit les admins. Silencieux en
 * cas d'échec (source indisponible, migration pas roulée) : le prochain passage réessaiera. */
export async function syncNhlTransactions(force = false): Promise<void> {
  if (!force && Date.now() - lastSyncAt < SYNC_THROTTLE_MS) return
  lastSyncAt = Date.now()
  try {
    const admin = createAdminClient()
    // Chaque source est lue à part : une panne d'ESPN ne masque pas un changement d'équipe.
    const [espn, teamChanges] = await Promise.allSettled([fetchEspnTransactions(), detectTeamChanges(admin)])
    const found = [
      ...(espn.status === 'fulfilled' ? espn.value : []),
      ...(teamChanges.status === 'fulfilled' ? teamChanges.value : []),
    ]
    if (found.length === 0) return

    // Toute première lecture : on enregistre sans avertir, sinon plusieurs jours de transactions
    // arriveraient d'un coup.
    const { count, error: countError } = await admin
      .from('nhl_transaction_alerts').select('key', { count: 'exact', head: true })
    if (countError) return
    const firstRun = (count ?? 0) === 0

    const { data: inserted, error } = await admin
      .from('nhl_transaction_alerts')
      .upsert(
        found.map(t => ({ key: t.key, tx_date: t.txDate, team: t.team, description: t.description })),
        { onConflict: 'key', ignoreDuplicates: true },
      )
      .select('team, description')
    if (error || firstRun || !inserted || inserted.length === 0) return
    // En local, la base est celle de staging : pas d'avis envoyés depuis un poste de développement.
    if (getAppEnv() === 'local') return

    const n = inserted.length
    const title = n === 1 ? 'LNH : 1 signature ou échange' : `LNH : ${n} signatures ou échanges`
    const lines = inserted.map(t => `${t.team} — ${t.description}`)
    const reminder = 'Pense à lancer le pipeline PuckPedia pour mettre les salaires à jour.'
    const { data: admins } = await admin.from('poolers').select('id').eq('is_admin', true)
    await Promise.allSettled([
      sendPushToAdmins({ title, body: `${lines.slice(0, 3).join('\n')}${n > 3 ? `\n… et ${n - 3} de plus` : ''}`, url: PIPELINE_PATH }),
      sendEmailToIds((admins ?? []).map(a => a.id as string), {
        subject: title,
        html: `<ul>${lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul><p>${reminder}</p>${emailLinkHtml(PIPELINE_PATH)}`,
      }),
    ])
  } catch {
    // Sources indisponibles : rien à faire, prochain passage.
  }
}

export type NhlTransactionView = { key: string; txDate: string; team: string; description: string; owners: string[] }

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Transactions récentes pour la carte de l'accueil, avec les poolers qui possèdent un joueur
 * nommé dans la description (nom complet retrouvé dans le texte, accents ignorés). */
export async function loadRecentNhlTransactions(poolSeasonId: number | null): Promise<NhlTransactionView[]> {
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - CARD_DAYS * 86_400_000).toISOString().slice(0, 10)
    const { data: rows, error } = await admin
      .from('nhl_transaction_alerts')
      .select('key, tx_date, team, description')
      .gte('tx_date', since)
      .order('tx_date', { ascending: false })
      .order('key')
      .limit(CARD_LIMIT)
    if (error || !rows || rows.length === 0) return []

    let owned: { name: string; pooler: string }[] = []
    if (poolSeasonId) {
      const { data: rosters } = await admin
        .from('pooler_rosters')
        .select('players (first_name, last_name), poolers (name)')
        .eq('pool_season_id', poolSeasonId)
        .eq('is_active', true)
      owned = ((rosters ?? []) as unknown as {
        players: { first_name: string; last_name: string } | null; poolers: { name: string } | null
      }[])
        .filter(r => r.players && r.poolers)
        .map(r => ({ name: normalize(`${r.players!.first_name} ${r.players!.last_name}`), pooler: r.poolers!.name }))
    }

    return rows.map(r => {
      const text = normalize(r.description as string)
      const owners = [...new Set(owned.filter(o => text.includes(o.name)).map(o => o.pooler))]
      return { key: r.key as string, txDate: r.tx_date as string, team: r.team as string, description: r.description as string, owners }
    })
  } catch {
    return []
  }
}
