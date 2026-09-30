'use client'

import { useState } from 'react'
import { updateCapAction } from './actions'

type Saison = {
  id: number
  season: string
  nhl_cap: number
  cap_multiplier: number
  pool_cap: number
  next_nhl_cap?: number | null
  delai_reactivation_jours?: number | null
  max_signatures_al?: number | null
  max_signatures_ltir?: number | null
  duree_min_ltir_jours?: number | null
  gestion_effectifs_ouvert?: boolean | null
  is_playoff?: boolean | null
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

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const getNextSeasonLabel = (s: string) => {
  const y = parseInt(s.split('-')[0]) + 1
  return `${y}-${String(y + 1).slice(-2)}`
}

export default function SeasonConfigForm({ saison }: { saison: Saison }) {
  const [nhlCap, setNhlCap] = useState(String(saison.nhl_cap))
  const [multiplier, setMultiplier] = useState(String(saison.cap_multiplier))
  const [nextNhlCap, setNextNhlCap] = useState(String(saison.next_nhl_cap ?? ''))
  const [delaiReactivation, setDelaiReactivation] = useState(String(saison.delai_reactivation_jours ?? 7))
  const [maxAl, setMaxAl] = useState(String(saison.max_signatures_al ?? 10))
  const [maxLtir, setMaxLtir] = useState(String(saison.max_signatures_ltir ?? 2))
  const [dureeMinLtir, setDureeMinLtir] = useState(String(saison.duree_min_ltir_jours ?? 21))
  const [draftRounds, setDraftRounds] = useState(String(saison.draft_rounds ?? 4))
  const [toolOuvert, setToolOuvert] = useState(saison.gestion_effectifs_ouvert ?? true)
  const [indStreakChaud, setIndStreakChaud] = useState(String(saison.indicator_streak_chaud ?? 3))
  const [indStreakForme, setIndStreakForme] = useState(String(saison.indicator_streak_forme ?? 2))
  const [indStreakFroid, setIndStreakFroid] = useState(String(saison.indicator_streak_froid ?? 5))
  const [indStreakCrise, setIndStreakCrise] = useState(String(saison.indicator_streak_crise ?? 8))
  const [indFenetre, setIndFenetre] = useState(String(saison.indicator_fenetre_tendance ?? 5))
  const [indGoalieWins, setIndGoalieWins] = useState(String(saison.indicator_goalie_wins_streak ?? 3))
  const [indGoalieSvPct, setIndGoalieSvPct] = useState(
    saison.indicator_goalie_sv_pct != null
      ? String(Math.round(saison.indicator_goalie_sv_pct * 1000) / 10)
      : '93.0'
  )
  const [indGoalieGaa, setIndGoalieGaa] = useState(String(saison.indicator_goalie_gaa ?? 2.50))
  const [indGoalieMinGames, setIndGoalieMinGames] = useState(String(saison.indicator_goalie_min_games ?? 3))
  const [saisonStartDate, setSaisonStartDate] = useState(saison.saison_start_date ?? '')
  const [saisonEndDate, setSaisonEndDate] = useState(saison.saison_end_date ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const nhlCapNum = parseFloat(nhlCap) || 0
  const multiplierNum = parseFloat(multiplier) || 0
  const poolCapPreview = nhlCapNum > 0 && multiplierNum > 0
    ? Math.ceil((nhlCapNum * multiplierNum) / 1_000_000) * 1_000_000
    : 0
  const nextNhlCapNum = parseFloat(nextNhlCap) || 0
  const nextPoolCapPreview = nextNhlCapNum > 0 && multiplierNum > 0
    ? Math.ceil((nextNhlCapNum * multiplierNum) / 1_000_000) * 1_000_000
    : 0
  const nextSeasonLabel = getNextSeasonLabel(saison.season)

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const result = await updateCapAction(
      saison.id,
      nhlCapNum,
      multiplierNum,
      nextNhlCapNum > 0 ? nextNhlCapNum : null,
      {
        delaiReactivationJours: Math.max(0, parseInt(delaiReactivation) || 0),
        maxSignaturesAl: Math.max(0, parseInt(maxAl) || 0),
        maxSignaturesLtir: Math.max(0, parseInt(maxLtir) || 0),
        dureeMinLtirJours: Math.max(0, parseInt(dureeMinLtir) || 0),
        draftRounds: Math.max(1, parseInt(draftRounds) || 4),
        gestionEffectifsOuvert: toolOuvert,
        indicatorStreakChaud: Math.max(1, parseInt(indStreakChaud) || 3),
        indicatorStreakForme: Math.max(1, parseInt(indStreakForme) || 2),
        indicatorStreakFroid: Math.max(1, parseInt(indStreakFroid) || 5),
        indicatorStreakCrise: Math.max(1, parseInt(indStreakCrise) || 8),
        indicatorFenetreTendance: Math.max(1, parseInt(indFenetre) || 5),
        indicatorGoalieWinsStreak: Math.max(1, parseInt(indGoalieWins) || 3),
        indicatorGoalieSvPct: Math.min(1, Math.max(0, parseFloat(indGoalieSvPct) / 100) || 0.930),
        indicatorGoalieGaa: Math.max(0, parseFloat(indGoalieGaa) || 2.50),
        indicatorGoalieMinGames: Math.max(1, parseInt(indGoalieMinGames) || 3),
        saisonStartDate: saisonStartDate || null,
        saisonEndDate: saisonEndDate || null,
      },
    )
    setSaving(false)
    if (result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: 'Configuration mise à jour.' })
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">

      {/* Plafonds salariaux */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold text-gray-700 mb-4">Plafonds salariaux</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Saison courante */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-blue-600 px-3 py-2 flex items-center gap-2">
              <span className="text-white text-sm font-bold">{saison.season}</span>
              <span className="text-xs bg-white text-blue-600 px-1.5 py-0.5 rounded font-bold leading-none">Active</span>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="px-3 py-3">
                <p className="text-xs text-gray-500 mb-1">Plafond LNH</p>
                <input type="number" min={1000000} step={100000} value={nhlCap}
                  onChange={e => setNhlCap(e.target.value)} className={inputCls} />
              </div>
              <div className="px-3 py-3">
                <p className="text-xs text-gray-500 mb-1">Facteur</p>
                <input type="number" min={1} max={2} step={0.01} value={multiplier}
                  onChange={e => setMultiplier(e.target.value)} className={inputCls} />
                {multiplierNum > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{(multiplierNum * 100).toFixed(0)} % du cap LNH</p>
                )}
              </div>
              <div className="px-3 py-3 bg-blue-50">
                <p className="text-xs text-gray-500 mb-1">Cap du pool</p>
                <p className="text-base font-bold text-blue-700 tabular-nums">
                  {poolCapPreview > 0 ? fmt(poolCapPreview) : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Saison suivante */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-3 py-2">
              <span className="text-slate-600 text-sm font-bold">{nextSeasonLabel}</span>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="px-3 py-3">
                <p className="text-xs text-gray-500 mb-1">Plafond LNH <span className="text-gray-400">(optionnel)</span></p>
                <input type="number" min={1000000} step={100000} value={nextNhlCap}
                  onChange={e => setNextNhlCap(e.target.value)} placeholder="ex : 104 000 000" className={inputCls} />
              </div>
              <div className="px-3 py-3">
                <p className="text-xs text-gray-500 mb-1">Facteur</p>
                <p className="text-sm text-gray-700 font-medium tabular-nums">
                  {multiplierNum > 0 ? multiplierNum.toFixed(2) : '—'}
                </p>
                {multiplierNum > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{(multiplierNum * 100).toFixed(0)} % du cap LNH</p>
                )}
              </div>
              <div className={`px-3 py-3 ${nextPoolCapPreview > 0 ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                <p className="text-xs text-gray-500 mb-1">Cap du pool <span className="text-gray-400">(estimé)</span></p>
                <p className={`text-base font-bold tabular-nums ${nextPoolCapPreview > 0 ? 'text-indigo-600' : 'text-gray-300'}`}>
                  {nextPoolCapPreview > 0 ? fmt(nextPoolCapPreview) : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Règles de transactions */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-slate-100 px-4 py-3 border-b">
          <span className="text-sm font-semibold text-gray-700">Règles de transactions</span>
        </div>
        <div className="divide-y divide-gray-100">
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Outil gestion d&apos;effectifs ouvert</p>
              <p className="text-xs text-gray-400 mt-0.5">Si désactivé, seul l&apos;admin y a accès.</p>
            </div>
            <button type="button" onClick={() => setToolOuvert(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${toolOuvert ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${toolOuvert ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">Délai de réactivation <span className="text-gray-400">(jours)</span></p>
            <input type="number" min={0} step={1} value={delaiReactivation}
              onChange={e => setDelaiReactivation(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">
              Nombre de jours avant qu&apos;un pooler puisse réactiver un joueur qu&apos;il vient de désactiver. L&apos;admin est exempt.
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">Date de début de saison <span className="text-gray-400">(optionnel)</span></p>
            <input type="date" value={saisonStartDate} onChange={e => setSaisonStartDate(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">
              Avant cette date : pré-saison. Les mouvements n&apos;apparaissent pas dans l&apos;historique
              et tous les joueurs reçoivent cette date comme <code>added_at</code>.
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">Date de fin de saison <span className="text-gray-400">(optionnel)</span></p>
            <input type="date" value={saisonEndDate} onChange={e => setSaisonEndDate(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Les mouvements après cette date n&apos;apparaissent pas dans l&apos;historique du pooler.</p>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Max signatures AL</p>
              <input type="number" min={0} step={1} value={maxAl}
                onChange={e => setMaxAl(e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Max signatures LTIR</p>
              <input type="number" min={0} step={1} value={maxLtir}
                onChange={e => setMaxLtir(e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Durée minimale LTIR <span className="text-gray-400">(jours)</span></p>
              <input type="number" min={0} step={1} value={dureeMinLtir}
                onChange={e => setDureeMinLtir(e.target.value)} className={inputCls} />
              <p className="text-xs text-gray-400 mt-1">
                Avertissement (non bloquant) dans l&apos;onglet Historique si un joueur quitte LTIR avant ce délai.
              </p>
            </div>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">Rondes de repêchage recrues</p>
            <input type="number" min={1} step={1} value={draftRounds}
              onChange={e => setDraftRounds(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Nombre de rondes lors du repêchage annuel des recrues.</p>
          </div>
        </div>
      </div>

      {/* Indicateurs de performance */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-slate-100 px-4 py-3 border-b">
          <span className="text-sm font-semibold text-gray-700">Indicateurs de performance</span>
          <p className="text-xs text-gray-400 mt-0.5">Seuils pour les badges affichés dans l&apos;onglet Alignement des poolers.</p>
        </div>
        <div className="px-4 py-4 grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">🔥 EN FEU <span className="text-gray-400">(matchs)</span></p>
            <input type="number" min={1} max={20} step={1} value={indStreakChaud}
              onChange={e => setIndStreakChaud(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Matchs consécutifs avec ≥1 pt.</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">✅ EN FORME <span className="text-gray-400">(matchs)</span></p>
            <input type="number" min={1} max={20} step={1} value={indStreakForme}
              onChange={e => setIndStreakForme(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Matchs consécutifs avec ≥1 pt.</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">🧊 EN PANNE <span className="text-gray-400">(matchs)</span></p>
            <input type="number" min={1} max={20} step={1} value={indStreakFroid}
              onChange={e => setIndStreakFroid(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Matchs consécutifs sans pt.</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">🚨 EN CRISE <span className="text-gray-400">(matchs)</span></p>
            <input type="number" min={1} max={20} step={1} value={indStreakCrise}
              onChange={e => setIndStreakCrise(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Matchs consécutifs sans pt.</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">📈 Fenêtre tendance <span className="text-gray-400">(matchs)</span></p>
            <input type="number" min={1} max={20} step={1} value={indFenetre}
              onChange={e => setIndFenetre(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Fenêtre pour comparer période récente vs précédente.</p>
          </div>
        </div>
      </div>

      {/* Indicateurs de performance — Gardiens */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-slate-100 px-4 py-3 border-b">
          <span className="text-sm font-semibold text-gray-700">Indicateurs de performance — Gardiens</span>
          <p className="text-xs text-gray-400 mt-0.5">Seuils pour les badges spécifiques aux gardiens (victoires consécutives, sv%, GAA).</p>
        </div>
        <div className="px-4 py-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">🏒 Victoires consécutives</p>
            <input type="number" min={1} max={20} step={1} value={indGoalieWins}
              onChange={e => setIndGoalieWins(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Départs consécutifs gagnants pour le badge victoires.</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">🎯 Matchs minimum (fenêtre sv%/GAA)</p>
            <input type="number" min={1} max={20} step={1} value={indGoalieMinGames}
              onChange={e => setIndGoalieMinGames(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Nombre minimum de départs requis pour calculer sv% et GAA.</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">📊 Sv% minimum (%)</p>
            <input type="number" min={80} max={100} step={0.1} value={indGoalieSvPct}
              onChange={e => setIndGoalieSvPct(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Sv% moyen sur la fenêtre de tendance. Ex : 93.0</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">📉 GAA maximale</p>
            <input type="number" min={0} max={10} step={0.05} value={indGoalieGaa}
              onChange={e => setIndGoalieGaa(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">GAA moyenne sur la fenêtre de tendance. Ex : 2.50</p>
          </div>
        </div>
      </div>

      <button type="submit" disabled={saving || nhlCapNum < 1_000_000 || multiplierNum <= 0}
        className="w-full max-w-2xl bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>

      {message && (
        <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>
      )}
    </form>
  )
}
