import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SaisonSelectNav } from '../init/SaisonSelectNav'
import DemarrerSaisonCard from './DemarrerSaisonCard'

export const dynamic = 'force-dynamic'

type Saison = {
  id: number; season: string; is_active: boolean; pool_cap: number
  season_started: boolean; saison_start_date: string | null
}

type Step = {
  n: number
  title: string
  description: string
  href: (saisonId: number) => string
  status: string | null
  emphasize?: boolean
}

export default async function NouvelleSaisonPage({
  searchParams,
}: {
  searchParams: Promise<{ saisonId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) redirect('/')

  const { saisonId } = await searchParams

  const { data: allSaisons } = await supabase
    .from('pool_seasons')
    .select('id, season, is_active, pool_cap, season_started, saison_start_date')
    .eq('is_playoff', false)
    .order('season', { ascending: true })

  const saisons = (allSaisons ?? []) as Saison[]

  if (saisons.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Nouvelle saison</h1>
        <p className="text-gray-400">Aucune saison disponible. Créez-en une dans Configuration → Saisons.</p>
      </div>
    )
  }

  const activeSaison = saisons.find(s => s.is_active) ?? null
  const activeIndex = activeSaison ? saisons.findIndex(s => s.id === activeSaison.id) : -1
  const defaultTarget = saisons[activeIndex + 1] ?? saisons.find(s => !s.is_active) ?? activeSaison ?? saisons[saisons.length - 1]

  const parsedId = saisonId ? parseInt(saisonId, 10) : NaN
  const saison = (!isNaN(parsedId) && saisons.find(s => s.id === parsedId)) || defaultTarget

  const [
    { count: rosterCount },
    { count: recrueCount },
    { count: pickTotal },
    { count: pickUsed },
  ] = await Promise.all([
    supabase.from('pooler_rosters').select('id', { count: 'exact', head: true }).eq('pool_season_id', saison.id).eq('is_active', true),
    supabase.from('pooler_rosters').select('id', { count: 'exact', head: true }).eq('pool_season_id', saison.id).eq('is_active', true).eq('player_type', 'recrue'),
    supabase.from('pool_draft_picks').select('id', { count: 'exact', head: true }).eq('pool_season_id', saison.id),
    supabase.from('pool_draft_picks').select('id', { count: 'exact', head: true }).eq('pool_season_id', saison.id).eq('is_used', true),
  ])

  const steps: Step[] = [
    {
      n: 1,
      title: 'Configuration & transition des rosters',
      description: "Créer/configurer la saison (cap, dates) si besoin, puis « Transitionner les rosters → » depuis la saison encore active.",
      href: () => `/admin/pool?tab=config`,
      status: rosterCount && rosterCount > 0 ? `${rosterCount} joueurs déjà copiés` : 'Pas encore transitionné',
    },
    {
      n: 2,
      title: 'Activer la saison',
      description: "Rend la saison consultable par tous les poolers (alignements, classement, calendrier, banque de recrues) pendant que tu termines la préparation. Personne ne peut modifier son alignement avant l'étape 7.",
      href: () => `/admin/pool?tab=config`,
      status: saison.is_active ? 'Déjà active' : (activeSaison ? `Actuellement active : ${activeSaison.season}` : null),
    },
    {
      n: 3,
      title: 'Choix de repêchage',
      description: 'Ajuster les picks échangés hors-app avant le repêchage des recrues.',
      href: id => `/admin/init?tab=choix&saisonId=${id}`,
      status: pickTotal ? `${pickTotal} choix créés` : 'Choix pas encore initialisés',
    },
    {
      n: 4,
      title: 'Repêchage des recrues',
      description: 'Repêchage annuel en direct — assigne la nouvelle cohorte de recrues.',
      href: id => `/admin/repechage?saisonId=${id}`,
      status: pickTotal ? `${pickUsed ?? 0}/${pickTotal} sélections faites` : null,
    },
    {
      n: 5,
      title: 'Banque de recrues',
      description: "Assigner les recrues pas encore activées à la banque de chaque pooler.",
      href: id => `/admin/init?tab=recrues&saisonId=${id}`,
      status: `${recrueCount ?? 0} recrue(s) en banque`,
    },
    {
      n: 6,
      title: 'Pré-saison',
      description: 'Décisions ELC, libérations/ajustements, et repêchage guidé des agents libres.',
      href: id => `/admin/init?tab=presaison&saisonId=${id}`,
      status: null,
    },
  ]

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-800">Nouvelle saison</h1>
        <SaisonSelectNav saisons={saisons} selectedId={saison.id} baseHref="/admin/nouvelle-saison" />
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Séquence recommandée pour préparer <strong>{saison.season}</strong>{saison.is_active ? ' (déjà active)' : ''} — chaque
        étape se fait sur cette saison sans devoir l&apos;activer, jusqu&apos;au dernier geste.
      </p>

      <ol className="space-y-3">
        {steps.map(step => (
          <li
            key={step.n}
            className={`bg-white rounded-lg shadow p-4 border-l-4 ${step.emphasize ? 'border-emerald-500' : 'border-gray-200'}`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                <span className={`shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${step.emphasize ? 'bg-emerald-600' : 'bg-gray-800'}`}>
                  {step.n}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 text-sm">{step.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{step.description}</p>
                  {step.status && (
                    <p className={`text-xs mt-1 ${step.emphasize ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>{step.status}</p>
                  )}
                </div>
              </div>
              <a
                href={step.href(saison.id)}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg ${
                  step.emphasize
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                Ouvrir →
              </a>
            </div>
          </li>
        ))}
        <DemarrerSaisonCard
          saisonId={saison.id}
          seasonStarted={saison.season_started}
          saisonStartDate={saison.saison_start_date}
        />
      </ol>
    </div>
  )
}
