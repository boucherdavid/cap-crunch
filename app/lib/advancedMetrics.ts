/**
 * Mesures dérivées des stats avancées MoneyPuck (`player_advanced_stats`, ligne « toutes
 * situations ») — David, 2026-10-01. Source unique pour l'outil d'analyse
 * (/analytique/analyse) et l'historique par saison de la fiche joueur (PlayerSlideOver), pour
 * que les deux calculent exactement la même chose.
 */

export type AdvancedKind = 'skater' | 'goalie'

export type AdvancedStatRow = {
  games_played: number
  icetime: number  // secondes
  stats: Record<string, number | null>
}

export type Metric = { key: string; label: string; short: string; help: string; d: number; signed?: boolean }

const div = (a: number, b: number) => (b ? a / b : null)

/** Mesures d'un patineur. `capM` (salaire en M$) et `age` viennent du pool, pas de MoneyPuck —
 * passer `null` pour une saison passée (historique, évolution). */
export function skaterMetrics(r: AdvancedStatRow, capM: number | null, age: number | null): Record<string, number | null> {
  const s = (k: string) => r.stats[k] ?? 0
  const hours = r.icetime / 3600
  const onSh = div(s('gf'), s('sf'))
  const onSvA = div(s('ga'), s('sa'))
  return {
    cap: capM,
    age,
    gp: r.games_played,
    toi: div(r.icetime / 60, r.games_played),
    pts: s('points'),
    goals: s('goals'),
    ptsGp: div(s('points'), r.games_played),
    pts60: div(s('points'), hours),
    ptsPerM: capM ? s('points') / capM : null,
    xg: s('xg'),
    gax: s('goals') - s('xg'),
    shPct: div(s('goals') * 100, s('shots')),
    xg60: div(s('xg'), hours),
    xgPct: r.stats.xg_pct != null ? r.stats.xg_pct * 100 : null,
    xgRel: r.stats.xg_pct != null && r.stats.xg_pct_off != null ? (r.stats.xg_pct - r.stats.xg_pct_off) * 100 : null,
    cfPct: r.stats.cf_pct != null ? r.stats.cf_pct * 100 : null,
    pdo: onSh === null || onSvA === null ? null : (onSh + 1 - onSvA) * 100,
    gsGp: div(s('game_score'), r.games_played),
    hits: s('hits'),
    blocks: s('blocks'),
  }
}

/** Mesures d'un gardien. Victoires, blanchissages et départs viennent de la LNH (ajoutés au
 * JSONB par python_script/import_advanced_stats.py) — `null` si l'import ne les avait pas. */
export function goalieMetrics(r: AdvancedStatRow, capM: number | null, age: number | null): Record<string, number | null> {
  const s = (k: string) => r.stats[k] ?? 0
  const hours = r.icetime / 3600
  const ga = div(s('ga'), s('sa'))
  const wins = r.stats.wins ?? null
  const starts = r.stats.starts ?? null
  return {
    cap: capM,
    age,
    gp: r.games_played,
    starts,
    min: r.icetime / 60,
    wins,
    so: r.stats.shutouts ?? null,
    winPct: wins !== null && starts ? (wins / starts) * 100 : null,
    winsPerM: wins !== null && capM ? wins / capM : null,
    sa: s('sa'),
    ga: s('ga'),
    svPct: ga === null ? null : (1 - ga) * 100,
    gaa: div(s('ga'), hours),
    xga: s('xga'),
    gsax: s('xga') - s('ga'),
    gsax60: div(s('xga') - s('ga'), hours),
    hdGsax: s('hd_xga') - s('hd_ga'),
  }
}

export const SKATER_METRICS: Metric[] = [
  { key: 'cap', label: 'Salaire (M$)', short: 'M$', help: 'Impact sur le plafond pour la saison active du pool, en millions', d: 2 },
  { key: 'age', label: 'Âge', short: 'Âge', help: 'Âge du joueur', d: 0 },
  { key: 'gp', label: 'Parties jouées', short: 'PJ', help: 'Parties jouées dans la saison de stats choisie', d: 0 },
  { key: 'toi', label: 'Temps de glace / match (min)', short: 'TG/PJ', help: 'Temps de glace moyen par match, toutes situations', d: 1 },
  { key: 'pts', label: 'Points', short: 'Pts', help: 'Points (buts + passes)', d: 0 },
  { key: 'goals', label: 'Buts', short: 'B', help: 'Buts', d: 0 },
  { key: 'ptsGp', label: 'Points / match', short: 'Pts/PJ', help: 'Points par partie jouée', d: 2 },
  { key: 'pts60', label: 'Points / 60 min', short: 'Pts/60', help: 'Points par 60 minutes de jeu : compare des joueurs au temps de glace différent', d: 2 },
  { key: 'ptsPerM', label: 'Points par M$', short: 'Pts/M$', help: 'Points divisés par le salaire en millions : le rendement brut', d: 1 },
  { key: 'xg', label: 'Buts attendus (xB)', short: 'xB', help: 'Qualité des tirs du joueur selon le modèle MoneyPuck', d: 1 },
  { key: 'gax', label: 'Buts − buts attendus', short: 'B−xB', help: 'Très positif : finition au-dessus de la moyenne… ou chance qui pourrait ne pas durer', d: 1, signed: true },
  { key: 'shPct', label: '% de réussite au tir', short: '% tirs', help: 'Buts / tirs au but', d: 1 },
  { key: 'xg60', label: 'xB / 60 min', short: 'xB/60', help: 'Buts attendus individuels par 60 minutes', d: 2 },
  { key: 'xgPct', label: 'xB % sur la glace', short: 'xB %', help: 'Part des buts attendus en faveur de son équipe quand il joue (50 = neutre)', d: 1 },
  { key: 'xgRel', label: 'xB % relatif', short: 'xB % rel', help: 'xB % avec lui moins xB % sans lui : impact par rapport à ses coéquipiers', d: 1, signed: true },
  { key: 'cfPct', label: 'Corsi %', short: 'CF %', help: 'Part des tentatives de tir en faveur de son équipe quand il joue', d: 1 },
  { key: 'pdo', label: 'PDO', short: 'PDO', help: "% de tirs + % d'arrêts de son équipe quand il joue. Tend vers 100 : au-dessus = chance probable", d: 1 },
  { key: 'gsGp', label: 'Game Score / match', short: 'GS/PJ', help: 'Synthèse de la contribution par match (buts, passes, tirs, différentiel…)', d: 2 },
  { key: 'hits', label: 'Mises en échec', short: 'MÉ', help: 'Mises en échec', d: 0 },
  { key: 'blocks', label: 'Tirs bloqués', short: 'TB', help: 'Tirs bloqués', d: 0 },
]

export const GOALIE_METRICS: Metric[] = [
  { key: 'cap', label: 'Salaire (M$)', short: 'M$', help: 'Impact sur le plafond pour la saison active du pool, en millions', d: 2 },
  { key: 'age', label: 'Âge', short: 'Âge', help: 'Âge du gardien', d: 0 },
  { key: 'gp', label: 'Parties jouées', short: 'PJ', help: 'Parties jouées dans la saison de stats choisie', d: 0 },
  { key: 'starts', label: 'Départs', short: 'Dép.', help: 'Matchs commencés devant le filet', d: 0 },
  { key: 'min', label: 'Minutes jouées', short: 'Min', help: 'Minutes jouées', d: 0 },
  { key: 'wins', label: 'Victoires', short: 'V', help: 'Victoires — ce qui rapporte dans le pool', d: 0 },
  { key: 'so', label: 'Blanchissages', short: 'BL', help: 'Blanchissages', d: 0 },
  { key: 'winPct', label: '% de victoires par départ', short: '% V', help: 'Victoires divisées par les départs', d: 1 },
  { key: 'winsPerM', label: 'Victoires par M$', short: 'V/M$', help: 'Victoires divisées par le salaire en millions : le rendement brut', d: 1 },
  { key: 'sa', label: 'Tirs reçus', short: 'Tirs', help: 'Tirs au but reçus : la charge de travail', d: 0 },
  { key: 'ga', label: 'Buts alloués', short: 'BA', help: 'Buts alloués', d: 0 },
  { key: 'svPct', label: "% d'arrêts", short: '% arr.', help: "Pourcentage d'arrêts", d: 1 },
  { key: 'gaa', label: 'Moyenne de buts alloués', short: 'Moy.', help: 'Buts alloués par 60 minutes', d: 2 },
  { key: 'xga', label: 'Buts attendus contre (xBA)', short: 'xBA', help: 'Buts attendus selon la qualité des tirs reçus', d: 1 },
  { key: 'gsax', label: 'Buts sauvés au-dessus des attentes', short: 'BSxB', help: 'xBA − BA : la meilleure mesure du gardien lui-même, indépendante de sa défense', d: 1, signed: true },
  { key: 'gsax60', label: 'Buts sauvés au-dessus des attentes / 60 min', short: 'BSxB/60', help: 'Buts sauvés au-dessus des attentes par 60 minutes', d: 2, signed: true },
  { key: 'hdGsax', label: 'Buts sauvés, tirs de danger élevé', short: 'BSxB DÉ', help: 'Buts sauvés au-dessus des attentes sur les tirs de danger élevé', d: 1, signed: true },
]

export const metricsFor = (kind: AdvancedKind) => (kind === 'goalie' ? GOALIE_METRICS : SKATER_METRICS)
export const computeMetrics = (kind: AdvancedKind, r: AdvancedStatRow, capM: number | null, age: number | null) =>
  kind === 'goalie' ? goalieMetrics(r, capM, age) : skaterMetrics(r, capM, age)

export function formatMetric(m: Metric, v: number | null, forceSign = false): string {
  if (v === null) return '—'
  const sign = (m.signed || forceSign) && v > 0 ? '+' : ''
  return `${sign}${v.toLocaleString('fr-CA', { minimumFractionDigits: m.d, maximumFractionDigits: m.d })}`
}

export const seasonLabel = (startYear: number) => `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
