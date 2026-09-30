'use client'

import { useEffect, useState } from 'react'
import { subscribePushAction, unsubscribePushAction, testPushAction, getSubscriptionStatusAction } from './push-actions'

type State = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'desynced' | 'unsubscribed'

export default function PushToggle() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      if (!sub) { setState('unsubscribed'); return }
      const { subscribed } = await getSubscriptionStatusAction(sub.endpoint)
      setState(subscribed ? 'subscribed' : 'desynced')
    })
  }, [])

  async function handleSubscribe() {
    setBusy(true)
    setMsg(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      const res = await subscribePushAction(json)
      if (res.error) { setMsg(res.error); return }
      setState('subscribed')
      setMsg('Notifications activées.')
    } catch {
      setMsg("Impossible d'activer les notifications. Vérifie les permissions du navigateur.")
    } finally {
      setBusy(false)
    }
  }

  async function handleUnsubscribe() {
    setBusy(true)
    setMsg(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await unsubscribePushAction(sub.endpoint)
        await sub.unsubscribe()
      }
      setState('unsubscribed')
      setMsg('Notifications désactivées.')
    } catch {
      setMsg('Erreur lors de la désactivation.')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return null

  if (state === 'unsupported') return (
    <p className="text-sm text-gray-400">
      Les notifications push ne sont pas prises en charge par ce navigateur.
      Sur iPhone, l&apos;app doit être installée depuis Safari (iOS 16.4+).
    </p>
  )

  if (state === 'denied') return (
    <p className="text-sm text-orange-600">
      Les notifications sont bloquées dans les paramètres de ton navigateur.
      Autorise-les manuellement, puis recharge la page.
    </p>
  )

  const dotColor = state === 'subscribed' ? 'bg-green-500' : state === 'desynced' ? 'bg-orange-400' : 'bg-gray-300'
  const label = state === 'subscribed'
    ? 'Notifications activées sur cet appareil'
    : state === 'desynced'
      ? 'Notifications interrompues — la souscription a expiré ou a été révoquée'
      : 'Notifications désactivées'

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <span className={`text-sm ${state === 'desynced' ? 'text-orange-700' : 'text-gray-700'}`}>
          {label}
        </span>
      </div>
      {state === 'desynced' && (
        <p className="text-xs text-orange-600">
          Le navigateur croyait les notifications actives, mais elles ne sont plus enregistrées côté serveur.
          Clique sur Réactiver pour rétablir la connexion.
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={state === 'subscribed' ? handleUnsubscribe : handleSubscribe}
          disabled={busy}
          className={`px-4 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors ${
            state === 'subscribed'
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : state === 'desynced'
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {busy
            ? '...'
            : state === 'subscribed'
              ? 'Désactiver les notifications'
              : state === 'desynced'
                ? 'Réactiver les notifications'
                : 'Activer les notifications sur cet appareil'}
        </button>
        {state === 'subscribed' && (
          <button
            onClick={async () => {
              setBusy(true)
              setMsg(null)
              const res = await testPushAction()
              setBusy(false)
              setMsg(res.error ? `Erreur : ${res.error}` : 'Notification de test envoyée — vérifie ton appareil.')
            }}
            disabled={busy}
            className="px-4 py-2 rounded text-sm font-medium bg-gray-50 border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            Tester
          </button>
        )}
      </div>
      {msg && <p className={`text-sm ${msg.startsWith('Erreur') ? 'text-red-600' : 'text-green-600'}`}>{msg}</p>}
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr.buffer as ArrayBuffer
}
