'use client'

import { useState } from 'react'
import Link from 'next/link'

export type AdminNotification = { id: string; title: string; body: string; url: string | null; sent_at: string; read_at: string | null }

// Type d'une notification, déduit de son titre (David, 2026-10-13) — notification_log n'a pas de
// colonne de type. Tout nouveau titre envoyé par sendPushToAdmins doit être reconnu ici, sinon il
// tombe dans « Autres ».
type Kind = 'approbations' | 'ltir' | 'lnh' | 'retours' | 'planification' | 'series' | 'autres'

const KINDS: { id: Kind; label: string; badge: string; match: RegExp }[] = [
  { id: 'approbations',  label: 'Approbations',        badge: 'bg-blue-100 text-blue-700',       match: /à approuver|Discussion partagée/i },
  { id: 'ltir',          label: 'Retours de LTIR',     badge: 'bg-red-100 text-red-700',         match: /retour de LTIR/i },
  { id: 'lnh',           label: 'LNH',                 badge: 'bg-slate-200 text-slate-700',     match: /^LNH\s*:/ },
  { id: 'retours',       label: 'Retours des poolers', badge: 'bg-pink-100 text-pink-700',       match: /—\s*(Bug|Suggestion|Commentaire|Retour)$/ },
  { id: 'planification', label: 'Planification',       badge: 'bg-emerald-100 text-emerald-700', match: /^Planification/ },
  { id: 'series',        label: 'Pool des séries',     badge: 'bg-orange-100 text-orange-700',   match: /^Pool des séries/ },
]
const OTHER = { id: 'autres' as const, label: 'Autres', badge: 'bg-gray-100 text-gray-600' }

function kindOf(title: string) {
  return KINDS.find(k => k.match.test(title)) ?? OTHER
}

function shortTitle(title: string): string {
  return title.replace(/^Cap Crunch\s*—\s*/, '')
}

export default function NotificationsList({ notifications }: { notifications: AdminNotification[] }) {
  const [filter, setFilter] = useState<Kind | 'tout'>('tout')

  const withKind = notifications.map(n => ({ ...n, kind: kindOf(n.title) }))
  const counts = new Map<Kind, { total: number; unread: number }>()
  for (const n of withKind) {
    const c = counts.get(n.kind.id) ?? { total: 0, unread: 0 }
    c.total++
    if (!n.read_at) c.unread++
    counts.set(n.kind.id, c)
  }
  const unreadAll = withKind.filter(n => !n.read_at).length
  const chips = [...KINDS, OTHER].filter(k => counts.has(k.id))
  const shown = filter === 'tout' ? withKind : withKind.filter(n => n.kind.id === filter)

  const chipClass = (active: boolean) =>
    `text-xs font-medium px-3 py-1.5 rounded-full border whitespace-nowrap shrink-0 ${active ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`

  if (notifications.length === 0) {
    return <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400 text-sm">Aucune notification.</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setFilter('tout')} className={chipClass(filter === 'tout')}>
          Tout ({notifications.length}{unreadAll > 0 ? ` · ${unreadAll} non lue${unreadAll > 1 ? 's' : ''}` : ''})
        </button>
        {chips.map(k => {
          const c = counts.get(k.id)!
          return (
            <button key={k.id} onClick={() => setFilter(k.id)} className={chipClass(filter === k.id)}>
              {k.label} ({c.total}{c.unread > 0 ? ` · ${c.unread} non lue${c.unread > 1 ? 's' : ''}` : ''})
            </button>
          )
        })}
      </div>

      <div className="space-y-2">
        {shown.map(n => {
          const content = (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${n.kind.badge}`}>{n.kind.label}</span>
                <p className={`text-sm font-semibold ${n.read_at ? 'text-gray-600' : 'text-gray-900'}`}>{shortTitle(n.title)}</p>
              </div>
              <p className="text-sm text-gray-500 mt-0.5 whitespace-pre-line">{n.body}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(n.sent_at).toLocaleString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' })}
              </p>
            </>
          )
          const box = `block bg-white rounded-lg shadow px-4 py-3 border-l-4 ${!n.read_at ? 'border-blue-500' : 'border-transparent'}`
          return n.url
            ? <Link key={n.id} href={n.url} className={`${box} hover:bg-gray-50`}>{content}</Link>
            : <div key={n.id} className={box}>{content}</div>
        })}
      </div>
    </div>
  )
}
