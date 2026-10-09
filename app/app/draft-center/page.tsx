import { createClient } from '@/lib/supabase/server'
import DraftCenterTable from './DraftCenterTable'
import DraftYearSelect from './DraftYearSelect'
import { DRAFT_SOURCES_INFOONLY } from '@/lib/draft-sources'

export const dynamic = 'force-dynamic'

const INFO_ONLY_KEYS = new Set(DRAFT_SOURCES_INFOONLY.map(s => s.key))

export default async function DraftCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const supabase = await createClient()
  const { year } = await searchParams

  const { data: yearRows } = await supabase
    .from('draft_prospects')
    .select('draft_year')
    .order('draft_year', { ascending: false })

  const years = Array.from(new Set((yearRows ?? []).map(r => r.draft_year))) as number[]
  const latestYear = years[0] ?? new Date().getFullYear()
  const parsedYear = year ? parseInt(year, 10) : NaN
  const draftYear = (!isNaN(parsedYear) && years.includes(parsedYear)) ? parsedYear : latestYear

  const { data: prospects } = await supabase
    .from('draft_prospects')
    .select('id, first_name, last_name, position, team, games_played, goals, assists, points, pim, draft_prospect_rankings(source, rank, source_url)')
    .eq('draft_year', draftYear)

  const rows = (prospects ?? []).map(p => {
    const rankings = (p.draft_prospect_rankings as { source: string; rank: number; source_url: string | null }[])
    const ranked = rankings.filter(r => !INFO_ONLY_KEYS.has(r.source as never))
    const avg = ranked.length > 0 ? ranked.reduce((s, r) => s + r.rank, 0) / ranked.length : null
    return { ...p, rankings, avgRank: avg, sourceCount: ranked.length }
  }).sort((a, b) => (a.avgRank ?? 9999) - (b.avgRank ?? 9999))

  return (
    <div className="mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <p className="text-sm text-gray-500">Repêchage {draftYear}</p>
        {years.length > 1 && <DraftYearSelect years={years} selectedYear={draftYear} />}
      </div>
      <DraftCenterTable prospects={rows} draftYear={draftYear} />
    </div>
  )
}
