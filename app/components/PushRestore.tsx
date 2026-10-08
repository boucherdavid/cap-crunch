'use client'

import { useEffect, useState } from 'react'
import { getPushRestoreStateAction, subscribePushAction } from '@/app/compte/push-actions'
import { isPushOffOnThisDevice, isPushSupported, setPushOffOnThisDevice, subscribeThisDevice } from '@/lib/pushClient'

// Rétablit les notifications push d'un appareil qui a perdu son abonnement (David, 2026-10-08) —
// mise à jour, expiration, données du navigateur vidées. Le choix est mémorisé sur le compte
// (poolers.notif_push) : tant que la permission du navigateur est encore accordée, l'abonnement
// est recréé en silence ; sinon un bandeau le propose en un clic (le navigateur exige un geste
// de l'utilisateur pour redemander la permission).
export default function PushRestore() {
  const [showBanner, setShowBanner] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!isPushSupported() || isPushOffOnThisDevice()) return
    if (Notification.permission === 'denied') return
    let cancelled = false

    async function restore() {
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      const { wanted, known } = await getPushRestoreStateAction(sub?.endpoint)
      if (cancelled || !wanted || (sub && known)) return

      // Abonnement que le serveur ne connaît plus : il a été retiré parce que l'envoi échouait,
      // donc on repart d'un abonnement neuf plutôt que de réenregistrer le même.
      if (sub) { await sub.unsubscribe(); sub = null }

      if (Notification.permission === 'granted') {
        await subscribePushAction(await subscribeThisDevice())
      } else if (!cancelled) {
        setShowBanner(true)
      }
    }
    restore().catch(() => { /* prochain chargement */ })
    return () => { cancelled = true }
  }, [])

  async function handleActivate() {
    setBusy(true)
    setFailed(false)
    try {
      const res = await subscribePushAction(await subscribeThisDevice())
      if (res.error) setFailed(true)
      else setShowBanner(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  function handleDecline() {
    setPushOffOnThisDevice(true)
    setShowBanner(false)
  }

  if (!showBanner) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-amber-900 min-w-0">
        {failed
          ? "Impossible d'activer les notifications. Vérifie les permissions du navigateur."
          : 'Tes notifications ne sont pas actives sur cet appareil.'}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleActivate}
          disabled={busy}
          className="bg-amber-600 text-white text-sm font-semibold px-3 py-1 rounded hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? '...' : 'Activer'}
        </button>
        <button onClick={handleDecline} className="text-sm text-amber-800 hover:underline">
          Pas sur cet appareil
        </button>
      </div>
    </div>
  )
}
