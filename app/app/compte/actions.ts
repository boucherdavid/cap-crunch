'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function updateNameAction(name: string): Promise<{ error?: string }> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Le nom ne peut pas être vide.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase
    .from('poolers')
    .update({ name: trimmed })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/compte')
  revalidatePath('/poolers')
  return {}
}

export async function updateEmailAction(email: string): Promise<{ error?: string }> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { error: 'Adresse courriel invalide.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const { error } = await supabase.auth.updateUser(
    { email: trimmed },
    { emailRedirectTo: `${siteUrl}/compte` },
  )
  if (error) return { error: error.message }
  return {}
}

export async function updatePasswordAction(newPassword: string): Promise<{ error?: string }> {
  if (newPassword.length < 6) return { error: 'Le mot de passe doit faire au moins 6 caractères.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }
  return {}
}

export async function updateProfileAction(notifEmail: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase
    .from('poolers')
    .update({ notif_email: notifEmail })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/compte')
  return {}
}

export async function resetPasswordForPoolerAction(poolerId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const admin = createAdminClient()
  const { data: authUser, error: fetchErr } = await admin.auth.admin.getUserById(poolerId)
  if (fetchErr || !authUser?.user?.email) return { error: 'Utilisateur introuvable.' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.vercel.app') ?? ''
  const { error } = await supabase.auth.resetPasswordForEmail(authUser.user.email, {
    redirectTo: `${siteUrl}/compte`,
  })
  if (error) return { error: error.message }
  return {}
}
