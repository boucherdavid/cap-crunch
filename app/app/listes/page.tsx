import { createClient } from '@/lib/supabase/server'
import WatchlistPanel from '@/components/WatchlistPanel'

export const metadata = { title: 'Mes listes' }
export const dynamic = 'force-dynamic'

export default async function ListesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Mes listes</h1>
      <p className="text-sm text-gray-500 mb-6">
        Aide-mémoire des joueurs qui t&apos;intéressent : agents libres à surveiller pendant la
        saison, recrues du dernier repêchage LNH à cibler au repêchage du pool. Tes listes sont
        privées (personne d&apos;autre, admin compris, ne les voit) et se retrouvent aussi dans
        Signatures des agents libres, Repêchage des recrues, Gestion d&apos;effectifs et
        Simulation. Un joueur pris par un pooler est automatiquement masqué.
      </p>
      {user ? (
        <WatchlistPanel kinds={['joueurs', 'recrues']} />
      ) : (
        <p className="text-sm text-gray-400">Connecte-toi pour gérer tes listes.</p>
      )}
    </div>
  )
}
