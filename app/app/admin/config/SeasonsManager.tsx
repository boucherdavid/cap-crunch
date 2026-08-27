'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSeasonAction, activateSeasonAction, deactivateSeasonAction, previewTransitionAction, transitionSeasonAction, deleteSeasonAction, setSeasonVisibilityAction } from './actions'

type Saison = {
  id: number
  season: string
  nhl_cap: number
  cap_multiplier: number
  pool_cap: number
  is_active: boolean
  is_public: boolean
  is_playoff: boolean
}

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export default function SeasonsManager({ saisons }: { saisons: Saison[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [season, setSeason] = useState('')
  const [nhlCap, setNhlCap] = useState('')
  const [multiplier, setMultiplier] = useState('1.24')
  const [isPlayoff, setIsPlayoff] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState<number | null>(null)
  const [deactivating, setDeactivating] = useState<number | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  type TransitionPreview = {
    playerCount: number
    poolerCount: number
    noContract: { playerName: string; poolerName: string; playerType: string }[]
  }
  const [transitioning, setTransitioning] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ toId: number; data: TransitionPreview } | null>(null)
  const [applyingTransition, setApplyingTransition] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [togglingVisibility, setTogglingVisibility] = useState<number | null>(null)

  const poolCapPreview = isPlayoff
    ? parseFloat(nhlCap) || 0
    : Math.ceil((parseFloat(nhlCap) || 0) * (parseFloat(multiplier) || 0) / 1_000_000) * 1_000_000

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleCreate = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    const result = await createSeasonAction(season, parseFloat(nhlCap), parseFloat(multiplier), isPlayoff)
    setSaving(false)
    if (result.error) {
      showMsg('error', result.error)
    } else {
      showMsg('success', `Saison ${season} créée.`)
      setSeason('')
      setNhlCap('')
      setMultiplier('1.24')
      setIsPlayoff(false)
      setShowForm(false)
      router.refresh()
    }
  }

  const handlePreviewTransition = async (toId: number) => {
    const activeSaison = saisons.find(s => s.is_active)
    if (!activeSaison) return showMsg('error', 'Aucune saison active à copier.')
    setTransitioning(toId)
    const result = await previewTransitionAction(activeSaison.id, toId)
    setTransitioning(null)
    if (result.error) return showMsg('error', result.error)
    setPreview({ toId, data: result as TransitionPreview })
  }

  const handleConfirmTransition = async () => {
    if (!preview) return
    const activeSaison = saisons.find(s => s.is_active)
    if (!activeSaison) return
    setApplyingTransition(true)
    const result = await transitionSeasonAction(activeSaison.id, preview.toId)
    setApplyingTransition(false)
    setPreview(null)
    if (result.error) {
      showMsg('error', result.error)
    } else {
      showMsg('success', `${result.copied} entrées copiées vers la nouvelle saison.`)
      router.refresh()
    }
  }

  const handleDelete = async (saisonId: number, saisonLabel: string) => {
    if (!window.confirm(`Supprimer la saison ${saisonLabel} ? Cette action est irréversible.\nTous les rosters, picks et transactions liés seront supprimés.`)) return
    setDeleting(saisonId)
    const result = await deleteSeasonAction(saisonId)
    setDeleting(null)
    if (result.error) {
      showMsg('error', result.error)
    } else {
      showMsg('success', `Saison ${saisonLabel} supprimée.`)
      router.refresh()
    }
  }

  const handleDeactivate = async (saisonId: number, saisonLabel: string) => {
    if (!window.confirm(`Désactiver la saison de séries ${saisonLabel} ? Les données seront conservées, mais les menus séries disparaîtront pour les poolers.`)) return
    setDeactivating(saisonId)
    const result = await deactivateSeasonAction(saisonId)
    setDeactivating(null)
    if (result.error) {
      showMsg('error', result.error)
    } else {
      showMsg('success', `Saison ${saisonLabel} désactivée.`)
      router.refresh()
    }
  }

  const handleActivate = async (saisonId: number, saisonLabel: string) => {
    const target = saisons.find(s => s.id === saisonId)
    const activeOfSameType = saisons.find(s => s.is_active && s.is_playoff === target?.is_playoff && s.id !== saisonId)
    const msg = activeOfSameType
      ? `Activer la saison ${saisonLabel} ? La saison ${activeOfSameType.season} sera désactivée.`
      : `Activer la saison ${saisonLabel} ?`
    if (!window.confirm(msg)) return
    setActivating(saisonId)
    const result = await activateSeasonAction(saisonId)
    setActivating(null)
    if (result.error) {
      showMsg('error', result.error)
    } else {
      showMsg('success', `Saison ${saisonLabel} activée.`)
      router.refresh()
    }
  }

  const handleToggleVisibility = async (saisonId: number, saisonLabel: string, makePublic: boolean) => {
    setTogglingVisibility(saisonId)
    const result = await setSeasonVisibilityAction(saisonId, makePublic)
    setTogglingVisibility(null)
    if (result.error) {
      showMsg('error', result.error)
    } else {
      showMsg('success', makePublic
        ? `Saison ${saisonLabel} de nouveau visible aux poolers.`
        : `Saison ${saisonLabel} masquée aux poolers (transactions, repêchage recrues).`)
      router.refresh()
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg text-gray-800">Saisons</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Nouvelle saison
          </button>
        )}
      </div>

      {/* Liste des saisons */}
      <div className="space-y-2 mb-4">
        {saisons.map(s => (
          <div
            key={s.id}
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${s.is_active ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800">{s.season}</span>
              {s.is_active && (
                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">Active</span>
              )}
              {s.is_playoff && (
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-medium">Séries</span>
              )}
              {!s.is_active && !s.is_public && (
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded font-medium">Masquée aux poolers</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-500">
                {s.is_playoff ? 'Cap séries' : 'Cap pool'}: <span className="font-medium text-gray-700">{fmt(s.pool_cap)}</span>
              </span>
              {(!s.is_active || s.is_playoff) && (
                <div className="flex items-center gap-3">
                  {!s.is_active && (
                    <button
                      onClick={() => handleToggleVisibility(s.id, s.season, !s.is_public)}
                      disabled={togglingVisibility === s.id}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium disabled:opacity-40"
                    >
                      {togglingVisibility === s.id ? '...' : s.is_public ? 'Masquer aux poolers' : 'Rendre visible'}
                    </button>
                  )}
                  {!s.is_active && saisons.some(s2 => s2.is_active) && !s.is_playoff && (
                    <button
                      onClick={() => handlePreviewTransition(s.id)}
                      disabled={transitioning === s.id}
                      className="text-xs text-emerald-600 hover:text-emerald-800 font-medium disabled:opacity-40"
                    >
                      {transitioning === s.id ? '...' : 'Transitionner les rosters →'}
                    </button>
                  )}
                  {!s.is_active && (
                    <button
                      onClick={() => handleActivate(s.id, s.season)}
                      disabled={activating === s.id}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40"
                    >
                      {activating === s.id ? '...' : 'Activer'}
                    </button>
                  )}
                  {s.is_active && s.is_playoff && (
                    <button
                      onClick={() => handleDeactivate(s.id, s.season)}
                      disabled={deactivating === s.id}
                      className="text-xs text-orange-600 hover:text-orange-800 font-medium disabled:opacity-40"
                    >
                      {deactivating === s.id ? '...' : 'Désactiver'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(s.id, s.season)}
                    disabled={deleting === s.id}
                    className="text-xs text-red-400 hover:text-red-600 font-medium disabled:opacity-40"
                  >
                    {deleting === s.id ? '...' : 'Supprimer'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {saisons.length === 0 && (
          <p className="text-gray-400 text-sm">Aucune saison créée.</p>
        )}
      </div>

      {/* Formulaire de création */}
      {showForm && (
        <form onSubmit={handleCreate} className="border-t pt-4 space-y-3">
          <h3 className="font-semibold text-gray-700 text-sm">Nouvelle saison</h3>

          {/* Toggle playoff */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-gray-700">Saison de séries (playoffs)</p>
              <p className="text-xs text-gray-400">Format 2025-PO, sans picks ni saisons futures.</p>
            </div>
            <button
              type="button"
              onClick={() => { setIsPlayoff(v => !v); setSeason('') }}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${isPlayoff ? 'bg-orange-500' : 'bg-gray-300'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${isPlayoff ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Identifiant</label>
            <input
              type="text"
              value={season}
              onChange={e => setSeason(e.target.value)}
              placeholder={isPlayoff ? '2025-PO' : '2026-27'}
              required
              pattern={isPlayoff ? '\\d{4}-PO' : '\\d{4}-\\d{2}'}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-0.5">
              {isPlayoff ? 'Format : 2025-PO' : 'Format : 2026-27'}
            </p>
          </div>
          {isPlayoff ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cap par défaut des rondes ($)</label>
              <input
                type="number"
                value={nhlCap}
                onChange={e => setNhlCap(e.target.value)}
                placeholder="30000000"
                min={1_000_000}
                step={1_000_000}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">
                Montant utilisé par défaut. Une ronde peut avoir son propre cap dans Pool des séries.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Plafond NHL ($)</label>
                <input
                  type="number"
                  value={nhlCap}
                  onChange={e => setNhlCap(e.target.value)}
                  placeholder="98000000"
                  min={1_000_000}
                  step={100_000}
                  required
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Facteur du pool</label>
                <input
                  type="number"
                  value={multiplier}
                  onChange={e => setMultiplier(e.target.value)}
                  min={1}
                  max={2}
                  step={0.01}
                  required
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {parseFloat(nhlCap) > 0 && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
                  Cap du pool estimé : <span className="font-semibold text-blue-700">{fmt(poolCapPreview)}</span>
                </div>
              )}
            </>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? 'Création...' : 'Créer'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setMessage(null) }}
              className="px-4 py-2 border text-sm text-gray-600 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {message && (
        <p className={`mt-3 text-sm font-medium ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {/* Modal de confirmation de transition */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4">
            <h3 className="font-bold text-gray-800 text-lg mb-1">Transition de saison</h3>
            <p className="text-sm text-gray-500 mb-4">
              Copier les rosters de la saison active vers{' '}
              <span className="font-semibold text-gray-700">{saisons.find(s => s.id === preview.toId)?.season}</span>
            </p>

            <div className="flex gap-4 mb-4">
              <div className="bg-blue-50 rounded-lg px-4 py-3 flex-1 text-center">
                <p className="text-2xl font-bold text-blue-700">{preview.data.playerCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">entrées à copier</p>
              </div>
              <div className="bg-blue-50 rounded-lg px-4 py-3 flex-1 text-center">
                <p className="text-2xl font-bold text-blue-700">{preview.data.poolerCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">poolers concernés</p>
              </div>
            </div>

            {preview.data.noContract.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-amber-700 uppercase mb-2">
                  Avertissement — {preview.data.noContract.length} joueur{preview.data.noContract.length > 1 ? 's' : ''} sans contrat pour cette saison
                </p>
                <div className="border border-amber-200 rounded-lg bg-amber-50 max-h-40 overflow-y-auto">
                  {preview.data.noContract.map((w, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-amber-100 last:border-0">
                      <span className="text-gray-700">{w.playerName}</span>
                      <span className="text-gray-400">{w.poolerName} · {w.playerType}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-amber-600 mt-1">Ces joueurs seront quand même copiés — cap simulé (≈ estimé) en pré-saison tant que leur vrai contrat n&apos;est pas connu. Suivi via l&apos;onglet Conformité.</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleConfirmTransition}
                disabled={applyingTransition}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40"
              >
                {applyingTransition ? 'Copie en cours...' : 'Confirmer la transition'}
              </button>
              <button
                onClick={() => setPreview(null)}
                className="px-4 py-2 border text-sm text-gray-600 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
