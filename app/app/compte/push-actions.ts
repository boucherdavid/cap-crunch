'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function subscribePushAction(subscription: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non connecté' }

  // Admin client requis : RLS sur push_subscriptions ne permet pas l'insertion
  // par les poolers non-admins. L'auth est vérifiée ci-dessus.
  const admin = createAdminClient()
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: 'user_id,endpoint' },
  )
  if (error) return { error: error.message }
  // Choix mémorisé sur le compte (David, 2026-10-08) : sert à rétablir l'abonnement quand
  // l'appareil le perd (voir PushRestore). Erreur ignorée tant que la migration n'est pas roulée.
  await admin.from('poolers').update({ notif_push: true }).eq('id', user.id)
  return {}
}

export async function unsubscribePushAction(endpoint: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non connecté' }

  const admin = createAdminClient()
  await admin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  // Le compte ne garde le choix « activé » que s'il reste un autre appareil abonné.
  const { count } = await admin
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if ((count ?? 0) === 0) await admin.from('poolers').update({ notif_push: false }).eq('id', user.id)

  return {}
}

/** Pour PushRestore : le compte veut-il les notifications, et le serveur connaît-il encore
 * l'abonnement de cet appareil ? */
export async function getPushRestoreStateAction(endpoint?: string): Promise<{ wanted: boolean; known: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { wanted: false, known: false }

  const admin = createAdminClient()
  // Colonne absente (migration pas encore roulée) → `data` nul → rien à rétablir.
  const { data: pooler } = await admin.from('poolers').select('notif_push').eq('id', user.id).maybeSingle()
  const wanted = !!(pooler as { notif_push?: boolean } | null)?.notif_push
  if (!wanted || !endpoint) return { wanted, known: false }

  const { data } = await admin
    .from('push_subscriptions').select('id').eq('user_id', user.id).eq('endpoint', endpoint).limit(1)
  return { wanted, known: (data?.length ?? 0) > 0 }
}

export async function getSubscriptionStatusAction(endpoint?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { subscribed: false }

  const admin = createAdminClient()
  let query = admin.from('push_subscriptions').select('endpoint').eq('user_id', user.id)
  if (endpoint) query = query.eq('endpoint', endpoint)

  const { data } = await query
  return { subscribed: (data?.length ?? 0) > 0 }
}

export async function testPushAction(): Promise<{ error?: string; sent?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non connecté' }

  const { sendPushToUser } = await import('@/lib/push')
  try {
    await sendPushToUser(user.id, {
      title: 'Cap Crunch — Test',
      body: 'Les notifications fonctionnent correctement sur cet appareil.',
      url: '/compte',
    })
    return { sent: true }
  } catch (e: unknown) {
    return { error: String(e) }
  }
}
