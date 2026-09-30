import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FeedbackForm from './FeedbackForm'

export default async function SignalerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Signaler un problème</h1>
      <p className="text-gray-500 text-sm mb-6">
        Un bug, une donnée incorrecte, une idée d&apos;amélioration ? Fais-le-nous savoir.
        Tous les retours sont lus et utilisés pour améliorer l&apos;application.
      </p>
      <FeedbackForm />
    </div>
  )
}
