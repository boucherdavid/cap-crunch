'use client'

import { useState, useMemo } from 'react'

type TabId = 'installation' | 'guide' | 'reglements'

interface Section {
  id: string
  tab: TabId
  title: string
  keywords: string
  content: React.ReactNode
}

const SECTIONS: Section[] = [
  // ── INSTALLATION ──────────────────────────────────────────────────────────
  {
    id: 'install-desktop',
    tab: 'installation',
    title: 'Ordinateur (Chrome / Edge)',
    keywords: 'ordinateur desktop chrome edge installer bouton icone navigateur',
    content: (
      <div>
        <p className="text-xs text-gray-500 mb-3">Chrome ou Edge</p>
        <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside">
          <li>Ouvrez le site dans Chrome ou Edge</li>
          <li>Cliquez sur le bouton <strong>Installer</strong> dans la barre de navigation du site</li>
          <li>Confirmez l&apos;installation dans la fenêtre qui s&apos;ouvre</li>
        </ol>
        <p className="text-xs text-gray-400 mt-3">
          Si le bouton n&apos;apparaît pas, cherchez l&apos;icône d&apos;installation (⊕) à droite de la barre d&apos;adresse du navigateur.
        </p>
      </div>
    ),
  },
  {
    id: 'install-iphone',
    tab: 'installation',
    title: 'iPhone / iPad (Safari)',
    keywords: 'iphone ipad ios safari partager ecran accueil ajouter apple mobile',
    content: (
      <div>
        <p className="text-xs text-gray-500 mb-3">Safari uniquement</p>
        <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside">
          <li>Ouvrez le site dans <strong>Safari</strong></li>
          <li>Appuyez sur le bouton Partager <strong>⬆</strong> en bas de l&apos;écran</li>
          <li>Faites défiler et choisissez <strong>« Sur l&apos;écran d&apos;accueil »</strong></li>
          <li>Confirmez en appuyant sur <strong>Ajouter</strong></li>
        </ol>
        <p className="text-xs text-gray-400 mt-3">
          L&apos;icône apparaîtra sur votre écran d&apos;accueil comme une application normale.
        </p>
      </div>
    ),
  },
  {
    id: 'install-android',
    tab: 'installation',
    title: 'Android (Chrome)',
    keywords: 'android chrome menu ajouter ecran accueil mobile google',
    content: (
      <div>
        <p className="text-xs text-gray-500 mb-3">Chrome</p>
        <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside">
          <li>Ouvrez le site dans <strong>Chrome</strong></li>
          <li>Une bannière d&apos;installation peut apparaître automatiquement</li>
          <li>Sinon, appuyez sur le menu <strong>⋮</strong> en haut à droite</li>
          <li>Choisissez <strong>« Ajouter à l&apos;écran d&apos;accueil »</strong></li>
        </ol>
        <p className="text-xs text-gray-400 mt-3">
          L&apos;application s&apos;ouvre ensuite sans la barre d&apos;adresse du navigateur.
        </p>
      </div>
    ),
  },

  // ── GUIDE D'UTILISATION ───────────────────────────────────────────────────
  {
    id: 'guide-equipe',
    tab: 'guide',
    title: 'Mon équipe',
    keywords: 'equipe alignement roster organisation actif reserviste recrue ltir picks repechage cap masse salariale pooler switcher',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez à votre alignement via <strong>Pool Saison → Mon équipe</strong> dans la barre de navigation.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• L&apos;onglet <strong>Organisation</strong> affiche votre roster complet : actifs, réservistes, recrues et joueurs LTIR.</li>
          <li>• Votre <strong>masse salariale</strong> et le cap restant sont affichés en haut de page.</li>
          <li>• Vos <strong>choix de repêchage</strong> sont listés en bas, regroupés par saison.</li>
          <li>• Le <strong>sélecteur de pooler</strong> en haut vous permet de consulter l&apos;alignement d&apos;un autre pooler.</li>
        </ul>
        <p className="text-xs text-gray-400 mt-3 italic">Modifications d&apos;alignement : effectuées par l&apos;administrateur seulement pour l&apos;instant.</p>
      </div>
    ),
  },
  {
    id: 'guide-series',
    tab: 'guide',
    title: 'Pool des séries éliminatoires',
    keywords: 'series playoff picks choix gardien attaquant defenseur ronde cap soumettre equipe eliminee remplacer self service',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Le pool des séries est <strong>self-service</strong> : chaque pooler fait ses propres sélections sans passer par l&apos;administrateur.
          Accédez à vos choix via <strong>Pool Séries → Mes choix</strong>.
        </p>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Faire vos sélections</h4>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li>• Choisissez <strong>3 attaquants, 2 défenseurs et 1 gardien</strong> pour la ronde en cours.</li>
          <li>• Seuls les joueurs dont l&apos;équipe est encore active dans les séries apparaissent dans la liste.</li>
          <li>• Votre sélection doit respecter le <strong>cap de la ronde</strong> (environ 25 M$).</li>
          <li>• Les joueurs sont triés par équipe puis par salaire pour faciliter la navigation.</li>
          <li>• Cliquez sur <strong>Soumettre mes choix</strong> pour confirmer. Vous pouvez modifier votre sélection tant que la ronde n&apos;est pas fermée.</li>
        </ul>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Entre les rondes</h4>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Vous pouvez <strong>conserver ou remplacer</strong> vos joueurs au début de chaque nouvelle ronde.</li>
          <li>• Si l&apos;équipe d&apos;un de vos joueurs est éliminée, l&apos;application le détecte automatiquement : le joueur apparaît en rouge et la sauvegarde est bloquée tant qu&apos;il n&apos;est pas remplacé.</li>
        </ul>
        <p className="text-xs text-gray-400 mt-3 italic">La participation au pool des séries est optionnelle.</p>
      </div>
    ),
  },
  {
    id: 'guide-classement',
    tab: 'guide',
    title: 'Classement',
    keywords: 'classement rang points buts passes victoires gardien joueurs action ce soir widget',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez au classement via <strong>Classement → Saison complète</strong> ou via la page d&apos;accueil.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Le tableau affiche le rang, les points totaux et le détail (buts, passes, victoires, défaites prol.).</li>
          <li>• Cliquez sur le nom d&apos;un pooler pour consulter son alignement complet.</li>
          <li>• La page d&apos;accueil affiche un widget <strong>Joueurs en action ce soir</strong> : combien de joueurs de chaque pooler jouent le soir même.</li>
        </ul>
        <p className="text-xs text-gray-400 mt-3 italic">Classements hebdomadaire et mensuel à venir.</p>
      </div>
    ),
  },
  {
    id: 'guide-transactions',
    tab: 'guide',
    title: 'Transactions',
    keywords: 'transactions echanges ajustements joueurs picks historique mouvements admin',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Consultez l&apos;historique des mouvements via <strong>Pool Saison → Transactions</strong>.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Les transactions sont séparées en deux catégories : <strong>Échanges</strong> (joueurs et picks entre poolers) et <strong>Ajustements</strong> (signatures, libérations, changements de type).</li>
          <li>• Toutes les transactions sont effectuées par l&apos;administrateur.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-notifications',
    tab: 'guide',
    title: 'Notifications',
    keywords: 'notifications push alerte avertissement alignement series picks equipe eliminee admin compte appareil activer',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Activez les notifications push depuis <strong>Mon compte</strong> pour être averti des événements importants sur votre appareil.
        </p>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Vous recevez une notification quand :</h4>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li>• L&apos;administrateur modifie votre alignement (ajout, retrait, changement de type).</li>
          <li>• Une nouvelle ronde des séries est démarrée — rappel de soumettre vos choix.</li>
          <li>• La comptabilisation des points d&apos;une ronde est démarrée.</li>
          <li>• Un ou plusieurs de vos joueurs appartiennent à une équipe éliminée — action requise.</li>
        </ul>
        <p className="text-xs text-gray-400 italic">Les notifications s&apos;activent par appareil. Vous pouvez les désactiver à tout moment depuis Mon compte.</p>
      </div>
    ),
  },
  {
    id: 'guide-babillard',
    tab: 'guide',
    title: 'Babillard',
    keywords: 'babillard communication annonce admin commentaire notification ressources',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez au babillard via <strong>Ressources → Babillard</strong>.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• L&apos;administrateur y publie des communications pour l&apos;ensemble du pool.</li>
          <li>• Chaque communication peut être commentée par les poolers.</li>
          <li>• Si vous avez activé les notifications push (Mon compte), vous êtes avisé lors d&apos;une nouvelle communication.</li>
        </ul>
        <p className="text-xs text-gray-400 mt-3 italic">Distinct du babillard de la page Planification, propre au sondage de rencontre.</p>
      </div>
    ),
  },
  {
    id: 'guide-calendrier',
    tab: 'guide',
    title: 'Calendrier LNH',
    keywords: 'calendrier matchs semaine equipe vue mensuel analyse joueurs prochains jours schedule filtre',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez au calendrier via <strong>Calendrier</strong> dans la barre de navigation.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li>• La vue par défaut affiche les matchs de la <strong>semaine en cours</strong>, naviguez avec les boutons précédent/suivant ou le sélecteur de date.</li>
          <li>• Filtrez par <strong>équipe</strong> pour voir uniquement les matchs de cette équipe.</li>
          <li>• Quand un filtre équipe est actif, le bouton <strong>Calendrier</strong> charge la saison complète sous forme de grille mensuelle — navigez mois par mois.</li>
        </ul>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Analyse 7 prochains jours</h4>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Si vous êtes connecté, un bloc résumé affiche le nombre de matchs dans les 7 prochains jours pour chacun de vos joueurs actifs.</li>
          <li>• Code couleur : <span className="text-green-600 font-medium">vert ≥ 4 matchs</span>, <span className="text-blue-600 font-medium">bleu ≥ 2</span>, gris = aucun.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-statistiques',
    tab: 'guide',
    title: 'Statistiques LNH',
    keywords: 'statistiques stats lnh patineurs gardiens points victoires toggle saison series disponible recrue filtre',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez aux statistiques via <strong>Statistiques → LNH</strong>.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Consultez les stats des patineurs (triés par points) et des gardiens (triés par victoires).</li>
          <li>• Un <strong>point vert</strong> indique qu&apos;un joueur appartient déjà à un pooler dans la saison active.</li>
          <li>• Basculez entre <strong>Saison régulière</strong> et <strong>Séries</strong> avec le toggle en haut à droite.</li>
          <li>• Filtrez par attaquants / défenseurs et effectuez une recherche par nom.</li>
        </ul>
      </div>
    ),
  },

  // ── RÈGLEMENTS ────────────────────────────────────────────────────────────
  {
    id: 'regl-alignement',
    tab: 'reglements',
    title: 'Structure de l\'alignement',
    keywords: 'alignement attaquants defenseurs gardiens reservistes minimum actif roster',
    content: (
      <ul className="text-sm text-gray-700 space-y-1.5">
        <li>• <strong>12 attaquants</strong> actifs</li>
        <li>• <strong>6 défenseurs</strong> actifs</li>
        <li>• <strong>2 gardiens</strong> actifs</li>
        <li>• Minimum <strong>2 réservistes</strong> (toutes positions confondues)</li>
      </ul>
    ),
  },
  {
    id: 'regl-cap',
    tab: 'reglements',
    title: 'Plafond salarial',
    keywords: 'cap plafond salarial nhl facteur million admin ajustable ltir recrue masse',
    content: (
      <ul className="text-sm text-gray-700 space-y-1.5">
        <li>• Le cap du pool est fixé par l&apos;administrateur. Il est calculé à partir du plafond salarial NHL de la saison, multiplié par un facteur (généralement 1.24–1.25) et arrondi au million supérieur.</li>
        <li>• Le facteur et le plafond NHL peuvent être ajustés par l&apos;administrateur avant ou pendant une saison.</li>
        <li>• Seuls les joueurs <strong>actifs</strong> et <strong>réservistes</strong> comptent dans la masse salariale.</li>
        <li>• Les joueurs en <strong>LTIR</strong> et dans la <strong>banque de recrues</strong> ne comptent <em>pas</em> dans la masse.</li>
      </ul>
    ),
  },
  {
    id: 'regl-recrues',
    tab: 'reglements',
    title: 'Banque de recrues',
    keywords: 'recrue banque draft repeche elc agent libre protection saisons contrat masse salariale',
    content: (
      <ul className="text-sm text-gray-700 space-y-1.5">
        <li>• Un joueur <strong>repêché</strong> est protégé pendant <strong>5 saisons</strong> à partir de son année de repêchage.</li>
        <li>• Un <strong>agent libre ELC</strong> est protégé uniquement pendant la durée de son contrat ELC.</li>
        <li>• Un joueur en banque de recrues ne compte pas dans la masse salariale, même s&apos;il joue dans la LNH.</li>
      </ul>
    ),
  },
  {
    id: 'regl-transactions',
    tab: 'reglements',
    title: 'Transactions & échanges',
    keywords: 'transactions echanges admin nombre delai desactivation agent libre regles',
    content: (
      <ul className="text-sm text-gray-700 space-y-1.5">
        <li>• Les transactions sont effectuées par l&apos;administrateur.</li>
        <li>• <span className="italic text-gray-400">Règles additionnelles à venir (nombre d&apos;échanges permis, délai de désactivation, etc.)</span></li>
      </ul>
    ),
  },
  {
    id: 'regl-series',
    tab: 'reglements',
    title: 'Pool des séries éliminatoires',
    keywords: 'series playoff attaquant defenseur gardien cap ronde eliminee remplacement pointage buts passes victoires prolongation optionnel participation',
    content: (
      <ul className="text-sm text-gray-700 space-y-1.5">
        <li>• La participation au pool des séries est <strong>optionnelle</strong> — tous les poolers ne sont pas tenus d&apos;y participer.</li>
        <li>• Chaque pooler participant sélectionne <strong>3 attaquants, 2 défenseurs et 1 gardien</strong> par ronde.</li>
        <li>• Un cap s&apos;applique à la sélection active (montant fixé par l&apos;administrateur).</li>
        <li>• Si l&apos;équipe d&apos;un joueur est éliminée, l&apos;application le détecte et bloque la sauvegarde tant que le joueur n&apos;est pas remplacé.</li>
        <li>• Les poolers peuvent conserver ou changer leurs joueurs entre chaque ronde.</li>
        <li>• Pointage : buts, passes, victoires de gardien, défaites en prolongation/fusillade.</li>
      </ul>
    ),
  },
]

const TAB_LABELS: Record<TabId, string> = {
  installation: 'Installation',
  guide: "Guide d'utilisation",
  reglements: 'Règlements',
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function AideTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('installation')
  const [query, setQuery] = useState('')

  const trimmed = query.trim()
  const isSearching = trimmed.length >= 2

  const results = useMemo(() => {
    if (!isSearching) return null
    const q = normalize(trimmed)
    return SECTIONS.filter(s =>
      normalize(s.title).includes(q) || normalize(s.keywords).includes(q)
    )
  }, [isSearching, trimmed])

  const tabSections = SECTIONS.filter(s => s.tab === activeTab)

  const tabs: TabId[] = ['installation', 'guide', 'reglements']

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Aide &amp; Règlements</h1>
        <p className="text-sm text-gray-500 mt-1">Guide d&apos;utilisation et règlements du pool.</p>
      </div>

      {/* Barre de recherche */}
      <div className="relative mb-6">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher dans l'aide…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        )}
      </div>

      {isSearching ? (
        /* ── MODE RECHERCHE ── */
        <div className="space-y-3">
          {results && results.length > 0 ? (
            <>
              <p className="text-xs text-gray-500 mb-2">{results.length} résultat{results.length > 1 ? 's' : ''} pour « {trimmed} »</p>
              {results.map(s => (
                <div key={s.id} className="bg-white rounded-lg shadow p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5 font-medium">{TAB_LABELS[s.tab]}</span>
                    <h3 className="font-semibold text-gray-800">{s.title}</h3>
                  </div>
                  {s.content}
                </div>
              ))}
            </>
          ) : (
            <div className="text-center py-16 text-gray-400 text-sm">
              Aucun résultat pour « {trimmed} »
            </div>
          )}
        </div>
      ) : (
        /* ── MODE ONGLETS ── */
        <>
          {/* Onglets */}
          <div className="flex border-b mb-6">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          {/* Contenu de l'onglet actif */}
          {activeTab === 'installation' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Cap Crunch est une application web progressive (PWA). Vous pouvez l&apos;installer sur votre appareil pour y accéder comme une application normale, sans passer par un navigateur.
              </p>
              {tabSections.map(s => (
                <div key={s.id} className="bg-white rounded-lg shadow p-5">
                  <h3 className="font-semibold text-gray-800 mb-3">{s.title}</h3>
                  {s.content}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 text-sm text-amber-800">
                <strong>Section en construction.</strong> Les instructions seront complétées au fur et à mesure que les fonctionnalités sont déployées.
              </div>
              {tabSections.map(s => (
                <div key={s.id} className="bg-white rounded-lg shadow p-5">
                  <h3 className="font-semibold text-gray-800 mb-3">{s.title}</h3>
                  {s.content}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'reglements' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 text-sm text-blue-800">
                Ces règlements sont évolutifs et seront mis à jour au fur et à mesure que les règles sont clarifiées ou que de nouvelles fonctionnalités sont implémentées.
              </div>
              {tabSections.map(s => (
                <div key={s.id} className="bg-white rounded-lg shadow p-5">
                  <h3 className="font-semibold text-gray-800 mb-3">{s.title}</h3>
                  {s.content}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 text-right mt-8">Dernière mise à jour : avril 2026</p>
        </>
      )}
    </div>
  )
}
