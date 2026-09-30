'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function createPoolerAction(
  name: string,
  email: string,
  password: string,
): Promise<{ error?: string }> {
  // Vérifier que l'appelant est admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { data: pooler } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!pooler?.is_admin) return { error: 'Accès refusé.' }

  name = name.trim()
  email = email.trim()
  if (!name) return { error: 'Le nom est requis.' }
  if (!email) return { error: "Le courriel est requis." }
  if (password.length < 6) return { error: 'Le mot de passe doit faire au moins 6 caractères.' }

  const admin = createAdminClient()

  // Créer le compte Auth
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) return { error: authError.message }

  // Insérer dans poolers (le trigger créera les picks automatiquement)
  const { error: poolerError } = await admin
    .from('poolers')
    .insert({ id: authData.user.id, name, is_admin: false })

  if (poolerError) {
    // Rollback : supprimer le compte Auth créé
    await admin.auth.admin.deleteUser(authData.user.id)
    return { error: poolerError.message }
  }

  return {}
}
