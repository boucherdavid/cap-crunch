'use client'

import { useState, useTransition } from 'react'
import { checkSigningsAction, releaseFlaggedPlayerAction, updateCapSettingsAction, type CapWatchEntry } from './cap-watch-actions'

const STATUS_TABS: { key: CapWatchEntry['status'] | 'tous'; label: string }[] = [
  { key: 'flagged',       label: 'En attente' },
  { key: 'watching',      label: 'Surveillés' },
  { key: 'resolved',      label: 'Résolus' },
  { key: 'admin_released', label: 'Libérés par admin' },
  { key: 'tous',          label: 'Tous' },
]

const fmt = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function EntryCard({ entry, onReleased }: { entry: CapWatchEntry; onReleased: (id: number) => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const deadlinePassed = entry.status === 'flagged' && entry.deadlineAt && new Date(entry.deadlineAt) < new Date()

  const handleRelease = () => {
    if (!confirm(`Libérer ${entry.playerName} de l'alignement de ${entry.poolerName} ? Cette action est irréversible.`)) return
    startTransition(async () => {
      const result = await releaseFlaggedPlayerAction(entry.id)
      if (result.error) setError(result.error)
      else onReleased(entry.id)
    })
  }

  const borderColor =
    entry.status === 'flagged' ? (deadlinePassed ? 'border-red-400' : 'border-amber-400')
    : entry.status === 'watching' ? 'border-gray-200'
    : entry.status === 'resolved' ? 'border-green-400'
    : 'border-gray-300'

  return (
    <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${borderColor}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium text-gray-800">{entry.playerName} <span className="text-gray-400 font-normal">— {entry.poolerName}</span></p>
          <p className="text-xs text-gray-500 mt-0.5">
            Estimé {fmt(entry.estimatedCap)}
            {entry.realCap != null && <> · Réel {fmt(entry.realCap)}</>}
          </p>
        </div>
        <div className="text-right text-xs text-gray-400 shrink-0">
          {entry.status === 'flagged' && entry.deadlineAt && (
            <p className={deadlinePassed ? 'text-red-600 font-semibold' : 'text-amber-600 font-medium'}>
              {deadlinePassed ? 'Délai dépassé —' : 'Délai jusqu\'au'} {fmtDate(entry.deadlineAt)}
            </p>
          )}
          {entry.status === 'resolved' && <p className="text-green-600">Résolu le {fmtDate(entry.resolvedAt)}</p>}
          {entry.status === 'admin_released' && <p>Libéré le {fmtDate(entry.resolvedAt)}</p>}
          {entry.status === 'watching' && <p>Surveillé depuis {fmtDate(entry.createdAt)}</p>}
        </div>
      </div>
      {deadlinePassed && (
        <div className="mt-3 flex items-center gap-2">
          <button onClick={handleRelease} disabled={pending}
            className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors">
            Libérer ce joueur
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  )
}

export default function CapWatchManager({
  saisonId, initialEntries, initialMultiplier, initialDeadlineDays,
}: {
  saisonId: number
  initialEntries: CapWatchEntry[]
  initialMultiplier: number
  initialDeadlineDays: number
}) {
  const [entries, setEntries] = useState(initialEntries)
  const [activeTab, setActiveTab] = useState<CapWatchEntry['status'] | 'tous'>('flagged')
  const [checking, setChecking] = useState(false)
  const [checkMsg, setCheckMsg] = useState<string | null>(null)

  const [multiplier, setMultiplier] = useState(String(initialMultiplier))
  const [deadlineDays, setDeadlineDays] = useState(String(initialDeadlineDays))
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null)

  const visible = activeTab === 'tous' ? entries : entries.filter(e => e.status === activeTab)

  const handleCheck = async () => {
    setChecking(true)
    setCheckMsg(null)
    const result = await checkSigningsAction(saisonId)
    setChecking(false)
    if (result.error) {
      setCheckMsg(`Erreur : ${result.error}`)
    } else {
      setCheckMsg(`${result.newlyWatching ?? 0} nouveau(x) surveillé(s), ${result.newlyFlagged ?? 0} signalé(s), ${result.resolved ?? 0} résolu(s).`)
      window.location.reload()
    }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    setSettingsMsg(null)
    const result = await updateCapSettingsAction(parseFloat(multiplier), parseInt(deadlineDays, 10))
    setSavingSettings(false)
    setSettingsMsg(result.error ? `Erreur : ${result.error}` : 'Réglages enregistrés.')
    setTimeout(() => setSettingsMsg(null), 3000)
  }

  const handleReleased = (id: number) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'admin_released' as const, resolvedAt: new Date().toISOString() } : e))
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-white rounded-lg shadow p-5 space-y-3">
        <h2 className="font-semibold text-gray-700 text-sm">Réglages</h2>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Multiplicateur du cap simulé</label>
            <div className="flex items-center gap-1">
              <input type="number" min={1} max={3} step={0.05} value={multiplier}
                onChange={e => setMultiplier(e.target.value)}
                className="w-24 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-xs text-gray-400">× salaire précédent</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Délai avant libération admin</label>
            <div className="flex items-center gap-1">
              <input type="number" min={1} max={60} step={1} value={deadlineDays}
                onChange={e => setDeadlineDays(e.target.value)}
                className="w-20 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-xs text-gray-400">jours</span>
            </div>
          </div>
          <button onClick={handleSaveSettings} disabled={savingSettings}
            className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-40">
            Enregistrer
          </button>
          {settingsMsg && <span className={`text-sm ${settingsMsg.startsWith('Erreur') ? 'text-red-600' : 'text-emerald-600'}`}>{settingsMsg}</span>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleCheck} disabled={checking}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40">
          {checking ? 'Vérification...' : 'Vérifier les signatures'}
        </button>
        {checkMsg && <span className="text-sm text-gray-600">{checkMsg}</span>}
      </div>

      <div className="flex border-b overflow-x-auto">
        {STATUS_TABS.map(tab => {
          const count = tab.key === 'tous' ? entries.length : entries.filter(e => e.status === tab.key).length
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {tab.label}
              {count > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                  activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <p className="text-gray-400 text-sm py-8 text-center">Aucun cas dans cette catégorie.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map(e => <EntryCard key={e.id} entry={e} onReleased={handleReleased} />)}
        </div>
      )}
    </div>
  )
}
