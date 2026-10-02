/**
 * Trios, paires et unités spéciales actuels (David, 2026-10-02) — table `team_line_combos`,
 * alimentée chaque jour par python_script/scrape_line_combos.py (source : Daily Faceoff).
 * Libellés et petit résumé « où joue-t-il » partagés par la page /analytique/trios et la fiche
 * joueur.
 */

export type LineComboRow = {
  team_code: string
  group_id: string     // f1-f4, d1-d3, g, pp1-pp2, pk1-pk2, ir
  slot: number
  position_id: string | null
  player_id: number | null
  player_name: string
  injury_status: string | null
}

const ORDINAL: Record<string, string> = { '1': '1er', '2': '2e', '3': '3e', '4': '4e' }
const ORDINAL_F: Record<string, string> = { '1': '1re', '2': '2e', '3': '3e', '4': '4e' }

/** Libellé d'un groupe : « 1er trio », « 2e paire », « 1re unité d'avantage numérique »… */
export function groupLabel(groupId: string): string {
  const n = groupId.slice(-1)
  if (groupId.startsWith('f')) return `${ORDINAL[n] ?? n} trio`
  if (groupId.startsWith('d')) return `${ORDINAL_F[n] ?? n} paire`
  if (groupId.startsWith('pp')) return `${ORDINAL_F[n] ?? n} unité d'avantage numérique`
  if (groupId.startsWith('pk')) return `${ORDINAL_F[n] ?? n} unité de désavantage numérique`
  if (groupId === 'g') return 'Gardiens'
  if (groupId === 'ir') return 'Blessés'
  return groupId
}

export const POSITION_LABEL: Record<string, string> = {
  lw: 'AG', c: 'C', rw: 'AD', ld: 'DG', rd: 'DD', g1: 'Partant', g2: 'Adjoint',
}

export const INJURY_STATUS_LABEL: Record<string, string> = {
  out: 'Absent', dtd: 'Au jour le jour', ir: 'Liste des blessés', 'ir-lt': 'LTIR', 'ir-nr': 'Liste des blessés',
}

/** Résumé d'une ligne pour la fiche d'un joueur : son trio ou sa paire avec ses partenaires, et
 * son unité d'avantage numérique. `rows` = toutes les lignes de son équipe. */
export function summarizePlayerUsage(rows: LineComboRow[], playerId: number): string | null {
  const mine = rows.filter(r => r.player_id === playerId)
  if (mine.length === 0) return null
  const parts: string[] = []
  const lastName = (full: string) => full.split(' ').slice(1).join(' ') || full

  const ev = mine.find(r => /^[fd]\d$/.test(r.group_id))
  if (ev) {
    const mates = rows.filter(r => r.group_id === ev.group_id && r.player_id !== playerId).map(r => lastName(r.player_name))
    parts.push(`${groupLabel(ev.group_id)}${mates.length ? ` avec ${mates.join(' et ')}` : ''}`)
  }
  const goalie = mine.find(r => r.group_id === 'g')
  if (goalie) parts.push(goalie.position_id === 'g1' ? 'Gardien partant' : 'Gardien adjoint')
  const pp = mine.find(r => r.group_id.startsWith('pp'))
  if (pp) parts.push(groupLabel(pp.group_id))
  if (mine.some(r => r.group_id === 'ir')) parts.push('sur la liste des blessés')
  return parts.length ? parts.join(' · ') : null
}
