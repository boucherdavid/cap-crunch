'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import TradeApprovalManager from '@/app/admin/effectifs/TradeApprovalManager'
import LtirApprovalManager from '@/app/admin/effectifs/LtirApprovalManager'
import { getAdminApprovalsAction, type AdminApprovals } from './admin-approvals-actions'

const REFRESH_MS = 30_000

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) : '—'
}

/**
 * Bouton « Approbations » de la barre du haut + panneau latéral (David, 2026-10-01) — l'admin
 * approuve les transactions entre poolers et les demandes de LTIR sans quitter la page en cours
 * (ex : pendant le repêchage). Réutilise tels quels les composants de l'onglet
 * /admin/effectifs?tab=approbation, qui reste en place (liens des notifications, seuils LTIR).
 * Le compteur se rafraîchit toutes les 30 secondes.
 */
export default function AdminApprovalsPanel() {
  const [data, setData] = useState<AdminApprovals | null>(null)
  const [version, setVersion] = useState(0)  // change à chaque rechargement → réinitialise les listes
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    const res = await getAdminApprovalsAction()
    setData(res)
    setVersion(v => v + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = () => getAdminApprovalsAction().then(res => {
      if (cancelled) return
      setData(res)
      setVersion(v => v + 1)
    })
    load()
    // Pas de rafraîchissement pendant que le panneau est ouvert : la liste ne doit pas bouger
    // sous le doigt au moment d'approuver.
    const timer = open ? null : setInterval(load, REFRESH_MS)
    return () => { cancelled = true; if (timer) clearInterval(timer) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  if (!data) return null
  const count = data.offers.length + data.ltir.length + data.blockedWaivers.length

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={count > 0 ? `${count} demande${count > 1 ? 's' : ''} en attente` : 'Aucune demande en attente'}
        className={`relative flex items-center gap-1.5 rounded px-2 py-1 text-sm border transition-colors ${
          count > 0 ? 'border-amber-400 text-white bg-amber-500/20 hover:bg-amber-500/30' : 'border-pool-silver/50 text-pool-silver hover:text-white'
        }`}
      >
        <span className="hidden lg:inline">Approbations</span>
        <span className="lg:hidden" aria-hidden="true">✓</span>
        {count > 0 && (
          <span className="min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">{count}</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-gray-50 shadow-xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-white shrink-0">
              <div>
                <p className="font-bold text-gray-900 text-lg leading-tight">Approbations</p>
                <p className="text-sm text-gray-500">
                  {count > 0 ? `${count} demande${count > 1 ? 's' : ''} en attente` : 'Rien en attente'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={refresh} className="text-sm text-blue-600 hover:underline">Actualiser</button>
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="Fermer">×</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-8">
              <section>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Transactions entre poolers</h2>
                <TradeApprovalManager key={`t${version}`} initialOffers={data.offers} onDecided={refresh} />
              </section>

              <section>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Demandes de LTIR</h2>
                <LtirApprovalManager key={`l${version}`} initialRequests={data.ltir} onDecided={refresh} />
              </section>

              <section>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Ballotages bloqués</h2>
                {data.blockedWaivers.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun ballotage bloqué.</p>
                ) : (
                  <div className="space-y-3">
                    {data.blockedWaivers.map(w => (
                      <div key={w.id} className="bg-white rounded-lg border border-amber-200 p-4">
                        <p className="text-sm font-semibold text-gray-800">{w.playerName}</p>
                        <p className="text-sm text-gray-600 mt-0.5">
                          Remporté par {w.awardedToName ?? 'un pooler'} le {fmtDate(w.awardedAt)}, mais la réclamation n&apos;a pas été complétée dans le délai.
                        </p>
                        {w.errorMessage && <p className="text-xs text-gray-400 mt-1">{w.errorMessage}</p>}
                        <Link href="/admin/effectifs?tab=transactions" onClick={() => setOpen(false)} className="inline-block mt-2 text-sm text-blue-600 hover:underline">
                          Traiter à la main dans Transactions
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <p className="text-xs text-gray-400">
                Les seuils d&apos;admissibilité LTIR se règlent dans{' '}
                <Link href="/admin/effectifs?tab=approbation" onClick={() => setOpen(false)} className="underline hover:text-gray-600">Gestion des effectifs → Approbation</Link>.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  )
}
