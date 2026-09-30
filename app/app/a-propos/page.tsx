import Link from 'next/link'

export const metadata = { title: 'À propos — Cap Crunch' }

type Item = { title: string; href: string; note?: string; description: string }
type Category = { id: string; label: string; items: Item[] }

const CATEGORIES: Category[] = [
  {
    id: 'mon-equipe',
    label: 'Mon équipe',
    items: [
      {
        title: 'Mon alignement',
        href: '/dashboard',
        description: "Ton alignement complet (actifs, réservistes, recrues, LTIR), ta masse salariale, tes choix de repêchage et les prochains matchs de tes joueurs. Un sélecteur permet de voir l'alignement de n'importe quel autre pooler.",
      },
      {
        title: "Gestion d'effectifs",
        href: '/gestion-effectifs',
        note: 'Libre-service',
        description: "Ton outil principal une fois la saison démarrée : basculer actif ↔ réserviste, libérer un joueur, gérer tes recrues (onglet Mouvements), réclamer un joueur au ballotage (onglet Ballotage), proposer un échange à un autre pooler (onglet Échanges).",
      },
      {
        title: 'Simulation',
        href: '/simulation',
        note: 'Aperçu',
        description: "Teste un mouvement ou un échange sans rien enregistrer pour de vrai — disponible toute l'année, pas seulement en pré-saison.",
      },
      {
        title: 'Mes listes',
        href: '/listes',
        note: 'Privé',
        description: "Tes listes de joueurs à surveiller (agents libres, recrues du dernier repêchage LNH), classées par priorité, avec une note par joueur — pratiques le soir du pool.",
      },
    ],
  },
  {
    id: 'le-pool',
    label: 'Le pool',
    items: [
      {
        title: 'Tous les alignements',
        href: '/poolers',
        description: 'Liste des 8 poolers avec rang au classement et masse salariale utilisée — chaque nom mène à son alignement détaillé.',
      },
      {
        title: 'Journal des transactions',
        href: '/journal-transactions',
        description: 'Historique public, en lecture seule, de tous les mouvements du pool (signatures, libérations, changements de statut, échanges).',
      },
    ],
  },
  {
    id: 'classement',
    label: 'Classement du pool',
    items: [
      {
        title: 'Saison complète',
        href: '/classement',
        description: 'Rang, points totaux et détail (buts, passes, victoires, défaites en prolongation) pour chaque pooler. Clique sur un joueur pour voir sa contribution détaillée.',
      },
      {
        title: 'Hebdomadaire et mensuel',
        href: '/classement/hebdomadaire',
        description: 'Mêmes données que le classement complet, bornées à une semaine (lundi à dimanche) ou à un mois civil, avec navigation précédent/suivant.',
      },
    ],
  },
  {
    id: 'lnh',
    label: 'LNH',
    items: [
      {
        title: 'Calendrier LNH',
        href: '/calendrier',
        description: 'Les matchs de la LNH jour par jour, avec le nombre de matchs impliquant tes joueurs.',
      },
      {
        title: 'Statistiques LNH',
        href: '/statistiques',
        description: 'Stats des patineurs et des gardiens, saison régulière ou séries. Point vert = déjà pris par un pooler. Filtres et recherche par nom.',
      },
      {
        title: 'Projections',
        href: '/statistiques/projections',
        description: 'Quatre sources de projections externes comparées côte à côte, plus une tendance calculée sur les 3 dernières saisons réelles.',
      },
      {
        title: 'Statistiques AHL',
        href: '/statistiques/ahl',
        description: 'Mêmes informations que pour la LNH, mais pour la ligue de développement — utile pour suivre tes prospects en banque de recrues.',
      },
      {
        title: 'Blessures',
        href: '/statistiques/blessures',
        description: 'Les joueurs blessés de la LNH (CBS Sports, recoupé avec ESPN), mis à jour chaque jour, avec leur admissibilité au LTIR et le pooler qui les possède.',
      },
      {
        title: 'Contrats LNH',
        href: '/joueurs',
        description: 'Table de tous les joueurs de la LNH avec leur contrat et salaire par saison, statut (ELC / RFA / UFA) et disponibilité.',
      },
    ],
  },
  {
    id: 'prospects',
    label: 'Prospects LNH',
    items: [
      {
        title: 'Classement pré-repêchage',
        href: '/draft-center',
        description: 'Classement agrégé des prospects du prochain repêchage LNH, combinant plusieurs sources en un rang moyen.',
      },
      {
        title: 'Repêchage LNH',
        href: '/repechage',
        description: "Résultats réels du repêchage LNH des 5 dernières années, ronde par ronde, avec l'équipe LNH qui a sélectionné chaque joueur et ses stats junior pour 2026.",
      },
    ],
  },
  {
    id: 'repechage-annuel',
    label: 'Repêchage annuel des poolers',
    items: [
      {
        title: 'Repêchage des recrues',
        href: '/repechage-recrues',
        description: 'Le tableau du repêchage des recrues propre au pool, par saison.',
      },
      {
        title: 'Signatures des agents libres',
        href: '/repechage-agents-libres',
        note: 'Pré-saison',
        description: "Tableau de bord partagé entre chaque saison : signature d'agents libres à tour de rôle, ajustement de ton alignement, déclaration « prêt » avant le démarrage officiel de la saison.",
      },
    ],
  },
  {
    id: 'communaute',
    label: 'Communauté',
    items: [
      {
        title: 'Babillard',
        href: '/babillard',
        description: "Communications de l'administrateur pour tout le pool, commentables par les poolers.",
      },
      {
        title: 'Planification',
        href: '/planification',
        description: 'Sondage de type Doodle pour fixer une date de rencontre du pool, avec un résumé des disponibilités de tous.',
      },
    ],
  },
  {
    id: 'aide',
    label: 'Aide',
    items: [
      {
        title: 'Aide & Règlements',
        href: '/aide',
        description: "Guide d'utilisation détaillé par fonctionnalité et règlements du pool, avec une barre de recherche.",
      },
    ],
  },
  {
    id: 'compte',
    label: 'Mon compte',
    items: [
      {
        title: 'Notifications',
        href: '/compte',
        description: 'Notifications push (par appareil) et par courriel, activables indépendamment, avec un bouton de test pour chacune.',
      },
      {
        title: 'Signaler un problème',
        href: '/signaler',
        description: 'Formulaire direct pour rapporter un bogue, une donnée incorrecte ou proposer une amélioration.',
      },
    ],
  },
]

export default function AProposPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">À propos de Cap Crunch</h1>
        <p className="text-sm text-gray-500 mt-1">Un tour d&apos;horizon de tout ce qui est consultable ou faisable dans l&apos;app.</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 text-sm text-blue-800 mb-8">
        Cap Crunch remplace l&apos;ancien fichier Excel du pool. Cette page recense, par section de menu, tout ce
        qu&apos;on peut y faire ou y consulter aujourd&apos;hui. Pour des instructions détaillées pas à pas, voir{' '}
        <Link href="/aide" className="underline font-medium">Aide &amp; Règlements</Link>.
      </div>

      <div className="space-y-10">
        {CATEGORIES.map(cat => (
          <section key={cat.id}>
            <h2 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">{cat.label}</h2>
            <div className="space-y-3">
              {cat.items.map(item => (
                <div key={item.href} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Link href={item.href} className="text-blue-600 hover:text-blue-700 hover:underline font-semibold text-sm">
                      {item.title}
                    </Link>
                    {item.note && (
                      <span className="text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5 font-medium">{item.note}</span>
                    )}
                    <span className="text-xs text-gray-400">{item.href}</span>
                  </div>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-10 bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">Il manque quelque chose ?</p>
        <p>
          Une fonctionnalité que tu cherches souvent et qui n&apos;existe pas encore, une section confuse, un outil
          pas assez expliqué ? Fais-le savoir via{' '}
          <Link href="/signaler" className="underline font-medium">Signaler un problème</Link>.
        </p>
      </div>

      <p className="text-xs text-gray-400 text-right mt-8">Dernière mise à jour : septembre 2026</p>
    </div>
  )
}
