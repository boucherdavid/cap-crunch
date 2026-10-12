'use client'

import { useState, useTransition } from 'react'
import { updateFeedbackStatusAction, deleteFeedbackAction } from './actions'

type Status = 'nouveau' | 'traité' | 'archivé'

const TYPE_LABELS: Record<string, string> = {
  bug: 'Problème',
  suggestion: 'Suggestion',
  autre: 'Commentaire',
}

const TYPE_COLORS: Record<string, string> = {
  bug: 'bg-red-100 text-red-700',
  suggestion: 'bg-blue-100 text-blue-700',
  autre: 'bg-gray-100 text-gray-700',
}

const STATUS_TABS: { key: Status | 'tous'; label: string }[] = [
  { key: 'nouveau',  label: 'Nouveau' },
  { key: 'traité',   label: 'Traité' },
  { key: 'archivé',  label: 'Archivé' },
  { key: 'tous',     label: 'Tous' },
]

type Feedback = {
  id: number
  type: string
  description: string
  created_at: string
  status: string
  poolers: { name: string } | { name: string }[] | null
}

function getPoolerName(poolers: Feedback['poolers']): string {
  if (!poolers) return 'Inconnu'
  if (Array.isArray(poolers)) return poolers[0]?.name ?? 'Inconnu'
  return poolers.name
}

function FeedbackCard({
  f,
  onStatusChange,
  onDelete,
}: {
  f: Feedback
  onStatusChange: (id: number, status: Status, notify?: { reply: string }) => void
  onDelete: (id: number) => void
}) {
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  // Marquer traité : réponse facultative au pooler, avisé ou non (David, 2026-10-11).
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState('')

  async function handleCopyOne() {
    const date = new Date(f.created_at).toLocaleDateString('fr-CA')
    const text = `[${TYPE_LABELS[f.type] ?? f.type}] — ${getPoolerName(f.poolers)} (${date})\n\n${f.description}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleStatus(status: Status, notify?: { reply: string }) {
    startTransition(() => onStatusChange(f.id, status, notify))
    setReplying(false)
    setReply('')
  }

  function handleDelete() {
    if (!confirm('Supprimer ce message définitivement ?')) return
    startTransition(() => onDelete(f.id))
  }

  return (
    <div className={`bg-white rounded-lg shadow p-5 border-l-4 ${f.status === 'nouveau' ? 'border-blue-400' : f.status === 'traité' ? 'border-green-400' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3 mb-3 flex-wrap">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${TYPE_COLORS[f.type] ?? 'bg-gray-100 text-gray-700'}`}>
          {TYPE_LABELS[f.type] ?? f.type}
        </span>
        <span className="text-sm font-medium text-gray-700">{getPoolerName(f.poolers)}</span>
        <span className="text-xs text-gray-400 ml-auto shrink-0">
          {new Date(f.created_at).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      <p className="text-gray-700 text-sm whitespace-pre-wrap mb-4">{f.description}</p>

      {replying && (
        <div className="mb-4 space-y-2">
          <label htmlFor={`reply-${f.id}`} className="block text-xs font-medium text-gray-600">Réponse au pooler (facultative)</label>
          <textarea
            id={`reply-${f.id}`}
            value={reply}
            onChange={e => setReply(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder="Ex. : c'est corrigé, merci de l'avoir signalé !"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => handleStatus('traité', { reply })} disabled={pending}
              className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              Marquer traité et aviser
            </button>
            <button onClick={() => handleStatus('traité')} disabled={pending}
              className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50">
              Marquer traité sans aviser
            </button>
            <button onClick={() => { setReplying(false); setReply('') }}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {f.status !== 'traité' && !replying && (
          <button onClick={() => setReplying(true)} disabled={pending}
            className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50 transition-colors">
            Marquer traité
          </button>
        )}
        {f.status !== 'nouveau' && (
          <button onClick={() => handleStatus('nouveau')} disabled={pending}
            className="px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors">
            Rouvrir
          </button>
        )}
        {f.status !== 'archivé' && (
          <button onClick={() => handleStatus('archivé')} disabled={pending}
            className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors">
            Archiver
          </button>
        )}
        <button onClick={handleCopyOne}
          className="px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-500 rounded hover:bg-gray-100 transition-colors">
          {copied ? 'Copié ✓' : 'Copier ce message'}
        </button>
        <button onClick={handleDelete} disabled={pending}
          className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-500 rounded hover:bg-red-100 disabled:opacity-50 transition-colors ml-auto">
          Supprimer
        </button>
      </div>
    </div>
  )
}

export default function FeedbackAdminView({
  feedbacks: initial,
  counts,
}: {
  feedbacks: Feedback[]
  counts: Record<string, number>
}) {
  const [feedbacks, setFeedbacks] = useState(initial)
  const [activeTab, setActiveTab] = useState<Status | 'tous'>('nouveau')
  const [copied, setCopied] = useState(false)

  const visible = activeTab === 'tous' ? feedbacks : feedbacks.filter(f => f.status === activeTab)

  function handleStatusChange(id: number, status: Status, notify?: { reply: string }) {
    updateFeedbackStatusAction(id, status, notify)
    setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status } : f))
  }

  function handleDelete(id: number) {
    deleteFeedbackAction(id)
    setFeedbacks(prev => prev.filter(f => f.id !== id))
  }

  const buildMarkdown = () => {
    const tabLabel = STATUS_TABS.find(t => t.key === activeTab)?.label ?? activeTab
    const lines: string[] = [
      '# Boîte de réception — Cap Crunch',
      '',
      `_Exporté le ${new Date().toLocaleDateString('fr-CA')} — filtre : ${tabLabel}_`,
      '',
    ]
    for (const f of visible) {
      const date = new Date(f.created_at).toLocaleDateString('fr-CA')
      lines.push(`## [${TYPE_LABELS[f.type] ?? f.type}] — ${getPoolerName(f.poolers)} (${date})`)
      lines.push('')
      lines.push(f.description)
      lines.push('')
      lines.push('---')
      lines.push('')
    }
    return lines.join('\n')
  }

  const exportMarkdown = () => {
    const blob = new Blob([buildMarkdown()], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `boite-reception-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(buildMarkdown())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      {/* Onglets de filtre */}
      <div className="flex border-b mb-6">
        {STATUS_TABS.map(tab => {
          const count = tab.key === 'tous'
            ? feedbacks.length
            : feedbacks.filter(f => f.status === tab.key).length
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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

      {/* Actions export — sur les messages visibles */}
      {visible.length > 0 && (
        <div className="flex gap-3 mb-6">
          <button onClick={exportMarkdown}
            className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
            Exporter en .md
          </button>
          <button onClick={copyMarkdown}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
            {copied ? 'Copié ✓' : 'Copier'}
          </button>
        </div>
      )}

      {/* Liste */}
      {visible.length === 0 ? (
        <p className="text-gray-400 text-sm py-8 text-center">Aucun message dans cette catégorie.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map(f => (
            <FeedbackCard key={f.id} f={f} onStatusChange={handleStatusChange} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
