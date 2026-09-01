'use client'

import { useState } from 'react'
import SeasonsManager from './SeasonsManager'
import SeasonConfigForm from './SeasonConfigForm'
import PlayoffConfigForm from './PlayoffConfigForm'
import ScoringConfigSaison from './ScoringConfigSaison'
import ScoringConfigSeries from './ScoringConfigSeries'
import { type ScoringRow } from './ScoringConfigSaison'

type Saison = {
  id: number
  season: string
  nhl_cap: number
  cap_multiplier: number
  pool_cap: number
  is_active: boolean
  is_public: boolean
  is_playoff: boolean
  next_nhl_cap?: number | null
  delai_reactivation_jours?: number | null
  max_signatures_al?: number | null
  max_signatures_ltir?: number | null
  gestion_effectifs_ouvert?: boolean | null
  playoff_submission_deadline?: string | null
  playoff_max_changes?: number | null
  playoff_max_elim_changes?: number | null
  playoff_max_f?: number | null
  playoff_max_d?: number | null
  playoff_max_g?: number | null
  indicator_streak_chaud?: number | null
  indicator_streak_forme?: number | null
  indicator_streak_froid?: number | null
  indicator_streak_crise?: number | null
  indicator_fenetre_tendance?: number | null
  indicator_goalie_wins_streak?: number | null
  indicator_goalie_sv_pct?: number | null
  indicator_goalie_gaa?: number | null
  indicator_goalie_min_games?: number | null
  draft_rounds?: number | null
  saison_start_date?: string | null
  saison_end_date?: string | null
}

type Props = {
  saisons: Saison[]
  activeRegSaison: Saison | null
  activePlayoffSaison: Saison | null
  scoringRows: ScoringRow[]
}

type Tab = 'saisons' | 'pool-saison' | 'pool-series' | 'pointage-saison' | 'pointage-series'

// Pool Séries / Pointage Séries retirés des onglets visibles (David, 2026-08-31) — cohérent
// avec le retrait de Pool Séries de la nav admin et pooler (voir CLAUDE.md section 5).
// Code et logique conservés (PlayoffConfigForm, ScoringConfigSeries) ; simplement plus
// atteignables via ces onglets tant qu'aucune saison séries n'est en préparation.
const TABS: { id: Tab; label: string }[] = [
  { id: 'saisons',          label: 'Saisons' },
  { id: 'pool-saison',      label: 'Général' },
  { id: 'pointage-saison',  label: 'Pointage Saison' },
]

export default function ConfigTabsClient({ saisons, activeRegSaison, activePlayoffSaison, scoringRows }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('saisons')

  const tabCls = (id: Tab) =>
    `px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
      activeTab === id
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`

  return (
    <div>
      {/* Onglets */}
      <div className="flex border-b border-gray-200 mb-8 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} type="button" className={tabCls(t.id)} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {activeTab === 'saisons' && (
        <SeasonsManager saisons={saisons} />
      )}

      {activeTab === 'pool-saison' && (
        activeRegSaison
          ? <SeasonConfigForm saison={activeRegSaison} />
          : <div className="text-gray-400 text-sm bg-white rounded-lg shadow p-6">Aucune saison régulière active.</div>
      )}

      {activeTab === 'pool-series' && (
        activePlayoffSaison
          ? <PlayoffConfigForm saison={activePlayoffSaison} />
          : <div className="text-gray-400 text-sm bg-white rounded-lg shadow p-6">Aucune saison séries active.</div>
      )}

      {activeTab === 'pointage-saison' && (
        scoringRows.length > 0
          ? <ScoringConfigSaison rows={scoringRows} />
          : <div className="text-gray-400 text-sm bg-white rounded-lg shadow p-6">Aucune configuration de pointage.</div>
      )}

      {activeTab === 'pointage-series' && (
        scoringRows.length > 0
          ? <ScoringConfigSeries rows={scoringRows} />
          : <div className="text-gray-400 text-sm bg-white rounded-lg shadow p-6">Aucune configuration de pointage.</div>
      )}
    </div>
  )
}
