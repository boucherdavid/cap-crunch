import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const DASH = '—'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pooler } = await supabase
    .from('poolers')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!pooler?.is_admin) redirect('/')

  const [
    { count: nbJoueurs },
    { count: nbPoolers },
    { data: saison },
    { count: nbNouveaux },
  ] = await Promise.all([
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('poolers').select('*', { count: 'exact', head: true }),
    supabase.from('pool_seasons').select('*').eq('is_active', true).eq('is_playoff', false).single(),
    supabase.from('feedback').select('*', { count: 'exact', head: true }).eq('status', 'nouveau'),
  ])

  const sections = [
    {
      href: '/admin/pool',
      label: 'Gestion du pool',
      desc: 'Poolers, configuration des saisons, paramètres de scoring, boîte de réception',
      color: 'border-blue-500',
      badge: (nbNouveaux ?? 0) > 0 ? nbNouveaux : null,
    },
    {
      href: '/admin/nouvelle-saison',
      label: 'Nouvelle saison',
      desc: 'Hub qui séquence les étapes de préparation de la saison à venir',
      color: 'border-amber-500',
      badge: null,
    },
    {
      href: '/admin/init',
      label: 'Initialisation',
      desc: 'Alignements initiaux, banque de recrues, choix de repêchage déjà en place',
      color: 'border-emerald-500',
      badge: null,
    },
    {
      href: '/admin/effectifs',
      label: 'Gestion des effectifs',
      desc: 'Mouvements actifs/réservistes, transactions inter-pooler, saisie historique, conformité cap',
      color: 'border-violet-500',
      badge: null,
    },
    {
      href: '/admin/donnees',
      label: 'Mise à jour de données',
      desc: 'Pipeline PuckPedia/repêchages NHL, classement des prospects',
      color: 'border-indigo-500',
      badge: null,
    },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Panneau Admin</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500">
          <p className="text-3xl font-bold text-blue-700">{nbJoueurs ?? 0}</p>
          <p className="text-gray-500 text-sm mt-1">Joueurs dans la BD</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5 border-l-4 border-green-500">
          <p className="text-3xl font-bold text-green-700">{nbPoolers ?? 0}</p>
          <p className="text-gray-500 text-sm mt-1">{'Poolers enregistrés'}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5 border-l-4 border-orange-500">
          <p className="text-3xl font-bold text-orange-700">{saison?.season ?? DASH}</p>
          <p className="text-gray-500 text-sm mt-1">Saison active</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map(s => (
          <Link
            key={s.href}
            href={s.href}
            className={`bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow group border-l-4 ${s.color}`}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-lg text-gray-800 group-hover:text-blue-700">{s.label}</h2>
              {s.badge && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{s.badge}</span>
              )}
            </div>
            <p className="text-gray-500 text-sm">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
