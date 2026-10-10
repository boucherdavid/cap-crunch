import type { SharedTradeChatView } from './cap-watch-actions'

const STATUS_LABEL: Record<string, string> = {
  pending_target: 'En attente de réponse',
  pending_admin: "En attente d'approbation",
  pending_completion: 'En attente de confirmation',
  declined: 'Refusée',
  rejected_admin: 'Rejetée',
  completed: 'Complétée',
  cancelled_expired: 'Annulée (délai dépassé)',
  withdrawn: 'Retirée',
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Toronto' })
}

/** Discussions d'échange que les deux poolers ont accepté de te montrer (lecture seule). */
export default function SharedTradeChats({ chats }: { chats: SharedTradeChatView[] }) {
  if (chats.length === 0) {
    return <p className="text-sm text-gray-400">Aucune discussion partagée.</p>
  }
  return (
    <div className="space-y-2">
      {chats.map(c => (
        <details key={c.id} className="border border-gray-200 rounded-lg p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-800">
            {c.proposerName} ↔ {c.targetName}
            <span className="text-xs font-normal text-gray-500"> · {STATUS_LABEL[c.status] ?? c.status} · {c.messages.filter(m => !m.system).length} message(s)</span>
          </summary>
          <div className="mt-2 space-y-1.5">
            {c.messages.map(m => m.system ? (
              <p key={m.id} className="text-[11px] text-gray-400 italic">{m.body} · {fmtTime(m.createdAt)}</p>
            ) : (
              <p key={m.id} className="text-sm text-gray-700">
                <strong>{m.authorName ?? '?'}</strong> <span className="text-xs text-gray-400">{fmtTime(m.createdAt)}</span>
                <span className="block whitespace-pre-wrap break-words">{m.body}</span>
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}
