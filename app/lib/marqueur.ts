/**
 * Comparaison avec notre pool sur Marqueur.com (David, 2026-10-05) — David y tient les alignements
 * à la main, en parallèle de Cap Crunch, pour repérer nos bogues. Ce fichier lit les pages
 * **publiques** du pool (aucune connexion, aucune écriture) et les compare à Cap Crunch :
 * alignements (actifs et réservistes) et points par joueur. Volontairement à sens unique — si
 * Cap Crunch alimentait Marqueur, Marqueur reproduirait nos erreurs au lieu de les révéler.
 *
 * Les écarts d'alignement servent aussi de liste « à reporter sur Marqueur » : elle se vide
 * d'elle-même dès que la saisie est faite là-bas, sans case à cocher.
 *
 * Fragile par nature (HTML de Marqueur, pas une API) : toute erreur de lecture est remontée
 * dans `error`, jamais transformée en faux écarts.
 */

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildStandings } from '@/lib/standings'
import { CHANGE_LABEL } from '@/lib/rosterChangeLabels'
import { toNhlSeasonId } from '@/lib/nhl-stats'

const POOL_ID = 76938
const BASE = 'https://www.marqueur.com/hockey/mbr/tools/pool/stats_03.php'

// 'inactif' : ligne rouge (`trr`) — joueur qui a été actif puis retiré des actifs. Marqueur le garde
// affiché avec sa période (« 29 sep - 4 oct ») et ses points, sans dire s'il est réserviste ou parti.
type Status = 'actif' | 'reserviste' | 'inactif'
type MarqueurPlayer = { name: string; status: Status; points: number }

export type MarqueurRosterGap = {
  player: string
  /** Ce qu'il faut faire sur Marqueur pour rejoindre Cap Crunch. */
  action: string
  /** État dans Cap Crunch et dernier mouvement connu, pour juger de quel côté est l'erreur. */
  context: string
}

/** Preuve tirée de l'API de la LNH (David, 2026-10-06) : les matchs de la saison du joueur, pour
 * trancher un écart de points — et répondre à un pooler qui remettrait Cap Crunch en question. */
export type NhlProof = {
  total: number  // points du pool sur toute la saison (pointage de scoring_config)
  games: { date: string; detail: string; points: number }[]
  url: string    // fiche du joueur sur nhl.com
}

export type MarqueurPointsGap = {
  player: string
  capCrunch: number
  marqueur: number
  nhlId: number | null
  /** null : joueur sans nhl_id ou LNH injoignable. */
  nhl: NhlProof | null
}

type Scoring = { goal: number; assist: number; goalie_win: number; goalie_otl: number; goalie_shutout: number }

async function fetchNhlProof(nhlId: number, nhlSeason: string, sc: Scoring): Promise<NhlProof | null> {
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/player/${nhlId}/game-log/${nhlSeason}/2`, { cache: 'no-store' })
    if (!res.ok) return null
    type Game = { gameDate: string; goals?: number; assists?: number; decision?: string; shutouts?: number; gamesStarted?: number }
    const log = ((await res.json()) as { gameLog?: Game[] }).gameLog ?? []
    const games = log.map(g => {
      const goals = g.goals ?? 0
      const assists = g.assists ?? 0
      const isGoalie = g.gamesStarted !== undefined || g.decision !== undefined
      const win = g.decision === 'W' ? 1 : 0
      const otl = g.decision === 'O' ? 1 : 0
      const so = g.shutouts ?? 0
      const points = goals * sc.goal + assists * sc.assist + (isGoalie ? win * sc.goalie_win + otl * sc.goalie_otl + so * sc.goalie_shutout : 0)
      const detail = isGoalie
        ? [win ? 'victoire' : otl ? 'défaite en prolongation' : 'sans décision ou défaite', so ? 'blanchissage' : null, goals + assists ? `${goals} B, ${assists} A` : null].filter(Boolean).join(', ')
        : `${goals} B, ${assists} A`
      return { date: g.gameDate, detail, points }
    }).sort((a, b) => a.date.localeCompare(b.date))
    return { total: games.reduce((s, g) => s + g.points, 0), games, url: `https://www.nhl.com/fr/player/${nhlId}` }
  } catch {
    return null
  }
}

export type MarqueurPoolerReport = {
  poolerName: string
  marqueurLabel: string | null  // null = pooler introuvable sur Marqueur
  capCrunchTotal: number
  marqueurTotal: number | null
  rosterGaps: MarqueurRosterGap[]
  pointsGaps: MarqueurPointsGap[]
}

export type MarqueurReport = { error?: string; fetchedAt: string; poolers: MarqueurPoolerReport[] }

function decodeEntities(s: string): string {
  return s
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&([EeAa])(acute|grave|circ);/g, (_, l: string, a: string) =>
      ({ Eacute: 'É', eacute: 'é', Egrave: 'È', egrave: 'è', Ecirc: 'Ê', ecirc: 'ê', Acirc: 'Â', acirc: 'â', Agrave: 'À', agrave: 'à' } as Record<string, string>)[l + a] ?? l)
    .replace(/&[OoIiUuCc](circ|cedil|uml);/g, m => ({ '&Ocirc;': 'Ô', '&ocirc;': 'ô', '&Icirc;': 'Î', '&icirc;': 'î', '&ccedil;': 'ç', '&Ccedil;': 'Ç', '&uuml;': 'ü', '&Uuml;': 'Ü' } as Record<string, string>)[m] ?? m)
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function fetchPage(no?: string): Promise<string> {
  const url = `${BASE}?nyx=${POOL_ID}${no ? `&no=${encodeURIComponent(no)}` : ''}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Cap Crunch, comparaison de pool)' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Marqueur a répondu ${res.status}`)
  return res.text()
}

/** Poolers du menu déroulant : valeur du paramètre `no` + libellé (« DAVID (DAVID BOUCHER) »). */
function parsePoolerOptions(html: string): { no: string; label: string; selected: boolean }[] {
  const select = html.match(/<select name='id_pooler'[\s\S]*?<\/select>/)?.[0] ?? ''
  return [...select.matchAll(/<option value='([^']+)'\s*(SELECTED)?\s*>([^<]+)<\/option>/gi)]
    .map(m => ({ no: m[1], selected: !!m[2], label: decodeEntities(m[3]).trim() }))
}

/** Joueurs d'une page de pooler, avant le sommaire : lignes `tr` (actifs), `trj` (réservistes
 * depuis le début) et `trr` (anciens actifs, en rouge — voir Status). */
function parsePlayers(html: string): MarqueurPlayer[] {
  const body = html.split('SOMMAIRE')[0]
  const players: MarqueurPlayer[] = []
  for (const m of body.matchAll(/<tr class='(tr|trj|trr)'>([\s\S]*?)<\/tr>/g)) {
    const name = m[2].match(/\/player\/[^']*'[^>]*>([^<]+)<\/a>/)?.[1]
    if (!name) continue
    const cells = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim())
    const total = cells[cells.length - 2] ?? '-'
    players.push({
      name: decodeEntities(name).trim(),
      status: m[1] === 'trj' ? 'reserviste' : m[1] === 'trr' ? 'inactif' : 'actif',
      points: total === '-' || total === '' ? 0 : Number(total.replace(',', '.')) || 0,
    })
  }
  return players
}

/** « Sébastien S. » ↔ « SÉBASTIEN ST-L. (SÉBASTIEN ST-LOUIS) » : même prénom, puis même initiale. */
function matchPooler<T extends { label: string }>(poolerName: string, options: T[]): T | null {
  const [first, second] = norm(poolerName).split(' ')
  const sameFirst = options.filter(o => norm(o.label).split(' ')[0] === first)
  if (sameFirst.length <= 1) return sameFirst[0] ?? null
  return sameFirst.find(o => (norm(o.label).split(' ')[1] ?? '')[0] === (second ?? '')[0]) ?? null
}

const STATUS_LABEL: Record<string, string> = { actif: 'actif', reserviste: 'réserviste', inactif: 'retiré des actifs', recrue: 'recrue (banque)', ltir: 'LTIR' }

export async function buildMarqueurReport(): Promise<MarqueurReport> {
  const fetchedAt = new Date().toISOString()
  const admin = createAdminClient()
  const { data: season } = await admin
    .from('pool_seasons').select('id, season').eq('is_active', true).eq('is_playoff', false).maybeSingle()
  if (!season) return { error: 'Aucune saison régulière active.', fetchedAt, poolers: [] }

  let options: { no: string; label: string; selected: boolean }[]
  const pages = new Map<string, MarqueurPlayer[]>()
  try {
    const first = await fetchPage()
    options = parsePoolerOptions(first)
    if (options.length === 0) throw new Error('liste des poolers introuvable (la page a peut-être changé)')
    const rest = await Promise.all(options.filter(o => !o.selected).map(async o => [o.no, parsePlayers(await fetchPage(o.no))] as const))
    for (const o of options.filter(o => o.selected)) pages.set(o.no, parsePlayers(first))
    for (const [no, players] of rest) pages.set(no, players)
    if ([...pages.values()].every(p => p.length === 0)) throw new Error('aucun joueur lu (la page a peut-être changé)')
  } catch (e) {
    return { error: `Lecture de Marqueur impossible : ${e instanceof Error ? e.message : String(e)}`, fetchedAt, poolers: [] }
  }

  const [standings, { data: rosterRows }, { data: logRows }] = await Promise.all([
    buildStandings(admin, season.id),
    // Alignements lus directement : buildStandings() omet les recrues jamais activées.
    admin.from('pooler_rosters')
      .select('pooler_id, player_type, added_at, players (first_name, last_name, nhl_id)')
      .eq('pool_season_id', season.id).eq('is_active', true),
    admin.from('roster_change_log')
      .select('pooler_id, change_type, changed_at, players (first_name, last_name)')
      .eq('pool_season_id', season.id)
      .order('changed_at'),
  ])

  // Dernier mouvement connu par (pooler, joueur) — le journal est trié, le dernier écrase.
  // La date compte : Marqueur demande la date de chaque changement, et c'est elle qui décide des
  // points comptés là-bas quand un report est fait en retard.
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', timeZone: 'America/Toronto' })
  const lastMove = new Map<string, string>()
  for (const r of (logRows ?? []) as unknown as { pooler_id: string; change_type: string; changed_at: string; players: { first_name: string; last_name: string } | null }[]) {
    if (!r.players) continue
    lastMove.set(`${r.pooler_id}::${norm(`${r.players.first_name} ${r.players.last_name}`)}`, `${CHANGE_LABEL[r.change_type] ?? r.change_type} le ${fmtDay(r.changed_at)}`)
  }

  type RosterRow = { pooler_id: string; player_type: string; added_at: string | null; players: { first_name: string; last_name: string; nhl_id: number | null } | null }
  const rosterByPooler = new Map<string, { name: string; status: string; nhlId: number | null }[]>()
  for (const r of (rosterRows ?? []) as unknown as RosterRow[]) {
    if (!r.players) continue
    if (!rosterByPooler.has(r.pooler_id)) rosterByPooler.set(r.pooler_id, [])
    const name = `${r.players.first_name} ${r.players.last_name}`
    rosterByPooler.get(r.pooler_id)!.push({ name, status: r.player_type, nhlId: r.players.nhl_id })
    // Aucun mouvement journalisé (placé avant le démarrage de la saison) : la date d'arrivée dans
    // l'alignement tient lieu de date à saisir.
    const k = `${r.pooler_id}::${norm(name)}`
    if (!lastMove.has(k) && r.added_at) lastMove.set(k, `dans cet état depuis le ${fmtDay(r.added_at)}`)
  }

  const poolers: MarqueurPoolerReport[] = standings.map(st => {
    const option = matchPooler(st.poolerName, options)
    const base = { poolerName: st.poolerName, capCrunchTotal: st.totalPoints }
    if (!option) return { ...base, marqueurLabel: null, marqueurTotal: null, rosterGaps: [], pointsGaps: [] }

    const mq = pages.get(option.no) ?? []
    type Ours = { name: string; status: string; points: number; nhlId: number | null }
    const pointsByName = new Map(st.players.filter(p => p.stillRostered).map(p => [norm(`${p.firstName} ${p.lastName}`), p.poolPoints]))
    const ours: Ours[] = (rosterByPooler.get(st.poolerId) ?? []).map(r => ({ ...r, points: pointsByName.get(norm(r.name)) ?? 0 }))
    // Marqueur n'a pas de LTIR : David y place ces joueurs comme réservistes. Un joueur sur LTIR
    // ici et réserviste là-bas concorde donc ; s'il n'y est pas du tout, on ne le réclame pas.
    const inLineup = (o: Ours) => o.status === 'actif' || o.status === 'reserviste'
    // Un ancien actif de Marqueur ('inactif') concorde avec tout ce qui n'est pas actif ici
    // (réserviste, LTIR, banque) — David, 2026-10-06 : Sanderson, désactivé le 5 octobre.
    const sameStatus = (m: MarqueurPlayer, o: Ours) => m.status === o.status
      || (o.status === 'ltir' && m.status === 'reserviste')
      || (m.status === 'inactif' && o.status !== 'actif')

    // Jumelage par nom exact, puis par nom de famille s'il n'en reste qu'un de chaque côté
    // (« Mitch »/« Mitchell » Marner, « Zach »/« Zachary » Werenski...).
    const pairs: { m: MarqueurPlayer; o: Ours }[] = []
    const mqLeft = [...mq]
    const oursLeft = [...ours]
    const take = (pick: (m: MarqueurPlayer, o: Ours) => boolean, unique: boolean) => {
      for (const m of [...mqLeft]) {
        const candidates = oursLeft.filter(o => pick(m, o))
        if (candidates.length === 0 || (unique && candidates.length > 1)) continue
        if (unique && mqLeft.filter(x => pick(x, candidates[0])).length > 1) continue
        // À égalité, préférer la ligne encore dans l'alignement (un joueur parti puis revenu).
        const o = candidates.find(inLineup) ?? candidates[0]
        pairs.push({ m, o })
        mqLeft.splice(mqLeft.indexOf(m), 1)
        oursLeft.splice(oursLeft.indexOf(o), 1)
      }
    }
    const lastName = (s: string) => norm(s).split(' ').slice(1).join(' ')
    take((m, o) => norm(m.name) === norm(o.name), false)
    take((m, o) => lastName(m.name) !== '' && lastName(m.name) === lastName(o.name), true)

    const moveOf = (name: string) => lastMove.get(`${st.poolerId}::${norm(name)}`)
    const rosterGaps: MarqueurRosterGap[] = []
    const pointsGaps: MarqueurPointsGap[] = []

    for (const { m, o } of pairs) {
      const move = moveOf(o.name)
      if (sameStatus(m, o)) {
        // Seuls les joueurs qui ont été actifs ont des points : actifs, et anciens actifs de Marqueur.
        if ((o.status === 'actif' || m.status === 'inactif') && m.points !== o.points) pointsGaps.push({ player: o.name, capCrunch: o.points, marqueur: m.points, nhlId: o.nhlId, nhl: null })
        continue
      }
      if (!inLineup(o)) {
        rosterGaps.push({
          player: o.name,
          action: o.status === 'ltir'
            ? `Passer réserviste sur Marqueur (${STATUS_LABEL[m.status]} là-bas)`
            : `Retirer de l'alignement sur Marqueur (${STATUS_LABEL[m.status]} là-bas)`,
          context: `Dans Cap Crunch : ${STATUS_LABEL[o.status] ?? o.status}${move ? ` — ${move}` : ''}`,
        })
        continue
      }
      {
        rosterGaps.push({
          player: o.name,
          action: `Changer le statut sur Marqueur : ${STATUS_LABEL[m.status]} → ${STATUS_LABEL[o.status]}`,
          context: `Dans Cap Crunch : ${STATUS_LABEL[o.status]}${move ? ` — ${move}` : ''}`,
        })
      }
    }
    for (const o of oursLeft.filter(inLineup)) {
      const move = moveOf(o.name)
      rosterGaps.push({
        player: o.name,
        action: `Ajouter sur Marqueur (${STATUS_LABEL[o.status]})`,
        context: `Dans Cap Crunch : ${STATUS_LABEL[o.status]}${move ? ` — ${move}` : ''}`,
      })
    }
    for (const m of mqLeft) {
      if (m.status === 'inactif') continue  // ancien actif là-bas, parti d'ici : concordant
      rosterGaps.push({
        player: m.name,
        action: `Retirer de l'alignement sur Marqueur (${STATUS_LABEL[m.status]} là-bas)`,
        context: `Dans Cap Crunch : absent de cet alignement${moveOf(m.name) ? ` — ${moveOf(m.name)}` : ''}`,
      })
    }

    return {
      ...base,
      marqueurLabel: option.label,
      marqueurTotal: mq.reduce((s, p) => s + p.points, 0),
      rosterGaps: rosterGaps.sort((a, b) => a.player.localeCompare(b.player)),
      pointsGaps: pointsGaps.sort((a, b) => a.player.localeCompare(b.player)),
    }
  })

  // Preuve LNH pour chaque écart de points (peu nombreux : un appel par joueur concerné).
  const gaps = poolers.flatMap(p => p.pointsGaps).filter(g => g.nhlId)
  if (gaps.length > 0) {
    const { data: scoringRows } = await admin.from('scoring_config').select('stat_key, points').in('scope', ['regular', 'both'])
    const sc: Record<string, number> = {}
    for (const r of scoringRows ?? []) sc[r.stat_key] = Number(r.points)
    const scoring: Scoring = {
      goal: sc.goal ?? 1, assist: sc.assist ?? 1, goalie_win: sc.goalie_win ?? 2, goalie_otl: sc.goalie_otl ?? 1, goalie_shutout: sc.goalie_shutout ?? 2,
    }
    const nhlSeason = toNhlSeasonId(season.season)
    await Promise.all(gaps.map(async g => { g.nhl = await fetchNhlProof(g.nhlId!, nhlSeason, scoring) }))
  }

  return { fetchedAt, poolers: poolers.sort((a, b) => a.poolerName.localeCompare(b.poolerName)) }
}

class MarqueurReadError extends Error {}

const cachedReport = unstable_cache(async () => {
  const report = await buildMarqueurReport()
  // Une lecture ratée ne doit pas rester en cache : on la fait sortir par une exception.
  if (report.error) throw new MarqueurReadError(report.error)
  return report
}, ['marqueur-report-v1'], { revalidate: 300 })

/** Rapport en cache 5 minutes, pour la page des poolers (/comparaison-marqueur) : 8 poolers qui
 * consultent ne doivent pas déclencher 9 requêtes vers Marqueur chacun. Les erreurs ne sont
 * jamais mises en cache. L'onglet admin garde `buildMarqueurReport()`, toujours frais. */
export async function getMarqueurReportCached(): Promise<MarqueurReport> {
  try {
    return await cachedReport()
  } catch (e) {
    if (e instanceof MarqueurReadError) return { error: e.message, fetchedAt: new Date().toISOString(), poolers: [] }
    throw e
  }
}
