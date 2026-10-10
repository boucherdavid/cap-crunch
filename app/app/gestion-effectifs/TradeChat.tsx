'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { getTradeMessagesAction, postTradeMessageAction, setTradeChatSharedAction } from './trade-actions'
import type { TradeMessageView } from '@/lib/tradeOffers'

const MAX = 500
const POLL_MS = 20_000

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Toronto' })
}

/** Discussion privée entre les deux poolers d'un échange (David, 2026-10-10) — écriture tant
 * que l'offre est en cours (`writable`), lecture seule ensuite jusqu'à sa suppression (7 jours
 * après la fin). L'admin la lit seulement si les deux l'ont partagée. */
export default function TradeChat({
  offerId, initialMessages, writable, myShared, otherShared, otherName, defaultOpen,
}: {
  offerId: number
  initialMessages: TradeMessageView[]
  writable: boolean
  myShared: boolean
  otherShared: boolean
  otherName: string
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [shared, setShared] = useState(myShared)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMessages(initialMessages) }, [initialMessages])
  useEffect(() => { setShared(myShared) }, [myShared])

  // Sondage léger tant que la discussion est ouverte et l'échange en cours.
  useEffect(() => {
    if (!open || !writable) return
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      getTradeMessagesAction(offerId).then(res => { if (res.messages) setMessages(res.messages) })
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [open, writable, offerId])

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [open, messages.length])

  function send() {
    const text = draft.trim()
    if (!text) return
    setError(null)
    startTransition(async () => {
      const res = await postTradeMessageAction(offerId, text)
      if (res.error) { setError(res.error); return }
      setDraft('')
      const fresh = await getTradeMessagesAction(offerId)
      if (fresh.messages) setMessages(fresh.messages)
    })
  }

  function toggleShare() {
    setError(null)
    const next = !shared
    startTransition(async () => {
      const res = await setTradeChatSharedAction(offerId, next)
      if (res.error) { setError(res.error); return }
      setShared(next)
    })
  }

  const userCount = messages.filter(m => !m.system).length
  if (!writable && messages.length === 0) return null

  return (
    <div className="mt-3 border-t border-gray-100 pt-2">
      <button onClick={() => setOpen(v => !v)} className="text-sm text-blue-700 hover:underline">
        {open ? '▾' : '▸'} Discussion{userCount > 0 ? ` (${userCount})` : ''}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {messages.length > 0 ? (
            <div ref={listRef} className="max-h-64 overflow-y-auto space-y-1.5 bg-gray-50 rounded-lg p-2">
              {messages.map(m => m.system ? (
                <p key={m.id} className="text-[11px] text-gray-400 text-center italic">{m.body} · {fmtTime(m.createdAt)}</p>
              ) : (
                <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm ${m.mine ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-800'}`}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[10px] mt-0.5 ${m.mine ? 'text-blue-100' : 'text-gray-400'}`}>
                      {m.mine ? 'Toi' : (m.authorName ?? otherName)} · {fmtTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Aucun message pour l&apos;instant.</p>
          )}

          {writable ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value.slice(0, MAX))}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                rows={2}
                placeholder={`Écris à ${otherName}…`}
                className="flex-1 border rounded-lg px-2 py-1.5 text-sm resize-none"
              />
              <button onClick={send} disabled={isPending || !draft.trim()}
                className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 self-end sm:self-stretch">
                Envoyer
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-400">Échange réglé : la discussion est en lecture seule et sera supprimée 7 jours après la fin.</p>
          )}

          {messages.length > 0 && (
            <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1">
              {shared && otherShared && <span className="text-green-700">✓ L&apos;admin peut lire cette discussion.</span>}
              {shared && !otherShared && <span>Tu as demandé de la montrer à l&apos;admin, en attente de {otherName}.</span>}
              {!shared && otherShared && <span className="text-amber-700">{otherName} demande de montrer cette discussion à l&apos;admin.</span>}
              <button onClick={toggleShare} disabled={isPending} className="underline hover:text-gray-700 disabled:opacity-50">
                {shared ? 'Ne plus la montrer à l\'admin' : (otherShared ? 'Accepter de la montrer à l\'admin' : 'Montrer la discussion à l\'admin')}
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
