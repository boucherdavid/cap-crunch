// Abonnement push côté navigateur, partagé par /compte (PushToggle) et le rétablissement
// automatique (PushRestore) — David, 2026-10-08.

// Posé quand le pooler désactive les notifications sur CET appareil : empêche le rétablissement
// automatique de le réabonner alors que son compte les garde activées ailleurs.
export const PUSH_OFF_DEVICE_KEY = 'pushOffThisDevice'

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isPushOffOnThisDevice(): boolean {
  try { return localStorage.getItem(PUSH_OFF_DEVICE_KEY) === '1' } catch { return false }
}

export function setPushOffOnThisDevice(off: boolean) {
  try {
    if (off) localStorage.setItem(PUSH_OFF_DEVICE_KEY, '1')
    else localStorage.removeItem(PUSH_OFF_DEVICE_KEY)
  } catch { /* stockage indisponible : sans conséquence */ }
}

export type PushSubscriptionJson = { endpoint: string; keys: { p256dh: string; auth: string } }

/** Crée l'abonnement de cet appareil. Demande la permission si elle n'est pas déjà accordée
 * (le navigateur exige alors un clic de l'utilisateur). */
export async function subscribeThisDevice(): Promise<PushSubscriptionJson> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  })
  return sub.toJSON() as PushSubscriptionJson
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr.buffer as ArrayBuffer
}
