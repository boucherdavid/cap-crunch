'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

type TabId = 'installation' | 'guide' | 'reglements'

interface Section {
  id: string
  tab: TabId
  title: string
  keywords: string
  /** Lien direct vers la page correspondante, affiché juste sous le titre. */
  href?: string
  /** Chemin d'une capture d'écran (`/guide/xxx.png`, servie depuis `app/public/guide/`). */
  screenshot?: string
  content: React.ReactNode
}

function SectionCard({ s, badge }: { s: Section; badge?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {badge && <span className="text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5 font-medium">{badge}</span>}
        <h3 className="font-semibold text-gray-800">{s.title}</h3>
      </div>
      {s.href && (
        <Link
          href={s.href}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium mb-3"
        >
          Ouvrir cette page <span aria-hidden>→</span>
        </Link>
      )}
      {s.content}
      {s.screenshot && (
        <div className="mt-4">
          <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.screenshot} alt={s.title} className="w-full block" />
          </div>
          <p className="text-xs text-gray-400 italic mt-1.5">
            Capture d&apos;écran à titre indicatif — les joueurs, alignements et données affichés peuvent ne plus être d&apos;actualité.
          </p>
        </div>
      )}
    </div>
  )
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
    href: '/dashboard',
    screenshot: '/guide/mon-equipe.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez à votre alignement via <strong>Alignements → Mon équipe</strong> dans la barre de navigation.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• L&apos;onglet <strong>Organisation</strong> affiche votre roster complet : actifs, réservistes, recrues et joueurs LTIR.</li>
          <li>• Votre <strong>masse salariale</strong> et le cap restant sont affichés en haut de page.</li>
          <li>• Vos <strong>choix de repêchage</strong> sont listés en bas, regroupés par saison.</li>
          <li>• Le <strong>sélecteur de pooler</strong> en haut vous permet de consulter l&apos;alignement d&apos;un autre pooler.</li>
        </ul>
        <p className="text-xs text-gray-400 mt-3 italic">Pour modifier vous-même votre alignement (actif/réserviste, libération, recrues), voir <strong>Gestion d&apos;effectifs</strong> ci-dessous.</p>
      </div>
    ),
  },
  {
    id: 'guide-equipes',
    tab: 'guide',
    title: 'Équipes',
    keywords: 'equipes poolers liste rang classement masse salariale alignement des autres',
    href: '/poolers',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez via <strong>Alignements → Équipes</strong> — la liste des 8 poolers du pool.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Chaque ligne affiche le <strong>rang</strong> au classement et la <strong>masse salariale</strong> utilisée.</li>
          <li>• Cliquez sur un pooler pour ouvrir son alignement complet (même vue que <strong>Mon équipe</strong>, mais pour lui).</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-effectifs',
    tab: 'guide',
    title: 'Gestion d\'effectifs',
    keywords: 'gestion effectifs self service actif reserviste liberer recrue banque promouvoir cap limite saison demarree',
    href: '/gestion-effectifs',
    screenshot: '/guide/gestion-effectifs.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez à votre outil de gestion via <strong>Alignements → Gestion d&apos;effectifs</strong>. C&apos;est ici que vous ajustez
          vous-même votre alignement une fois la <strong>saison démarrée</strong> par l&apos;administrateur.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Basculez un joueur <strong>actif ↔ réserviste</strong> selon vos besoins.</li>
          <li>• <strong>Libérez</strong> un joueur pour le retirer de votre alignement.</li>
          <li>• <strong>Activez ou remettez en banque</strong> une recrue encore protégée, à tout moment.</li>
          <li>• Vos changements doivent respecter les limites du pool (voir Règlements) : maximum 12 attaquants / 6 défenseurs / 2 gardiens actifs, minimum 2 réservistes, et votre masse salariale sous le cap.</li>
          <li>• Libérer un joueur en cours de saison le met automatiquement au <strong>ballotage</strong> (onglet Ballotage, voir plus bas) — les autres poolers ont un délai pour le réclamer.</li>
        </ul>
        <p className="text-xs text-gray-400 mt-3 italic">Avant le début officiel de la saison, ces mêmes ajustements se font plutôt depuis <strong>Signatures des agents libres</strong> (Alignements, voir plus bas).</p>
      </div>
    ),
  },
  {
    id: 'guide-ballotage',
    tab: 'guide',
    title: 'Ballotage',
    keywords: 'ballotage reclamer liberer joueur delai priorite classement onglet gestion effectifs',
    href: '/gestion-effectifs?tab=ballotage',
    screenshot: '/guide/ballotage.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Onglet <strong>Ballotage</strong> de Gestion d&apos;effectifs — quand un joueur est libéré
          en cours de saison, il y apparaît et devient réclamable par n&apos;importe quel autre pooler
          pendant un délai limité.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Cliquez <strong>Réclamer</strong> pour signaler votre intérêt — vous pouvez réclamer plusieurs joueurs en même temps. <strong>Refuser</strong> est optionnel, mais si tous les poolers plus prioritaires que vous refusent, vous êtes averti que vous allez l&apos;obtenir sans attendre la fin du délai.</li>
          <li>• Si plusieurs poolers réclament le même joueur, celui avec la <strong>priorité la plus haute</strong> (pire classé au moment de la libération) le remporte.</li>
          <li>• Si personne ne réclame avant la fin du délai, le joueur redevient simplement un agent libre normal.</li>
          <li>• Une fois gagné, un bandeau apparaît dans l&apos;onglet <strong>Mouvements</strong> pour l&apos;ajouter vous-même à votre alignement (actif ou réserviste, au choix) — ajustez au besoin (libération) pour rester conforme, vous avez 48h pour le faire.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-echanges',
    tab: 'guide',
    title: 'Échanges entre poolers',
    keywords: 'echange transaction proposer accepter refuser approbation admin delai confirmer',
    href: '/gestion-effectifs?tab=echanges',
    screenshot: '/guide/echanges.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Onglet <strong>Échanges</strong> de Gestion d&apos;effectifs — proposez un échange de joueurs
          (actif, réserviste ou recrue) et/ou de choix de repêchage à un autre pooler.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Le pooler visé doit <strong>accepter ou refuser</strong> votre proposition.</li>
          <li>• Si accepté, l&apos;<strong>admin doit approuver</strong> l&apos;échange avant que quoi que ce soit ne bouge.</li>
          <li>• Une fois approuvé, vous avez un délai pour <strong>confirmer</strong> que le résultat entre dans votre masse salariale et votre composition (12/6/2 + réservistes) — si ça ne rentre pas encore, une section dédiée directement dans cet onglet vous permet d&apos;ajuster au passage (libérer, changer actif/réserviste, activer ou remettre en banque une recrue), pas besoin d&apos;aller dans Mouvements séparément.</li>
          <li>• L&apos;échange s&apos;exécute seulement une fois que <strong>les deux poolers</strong> ont confirmé. Si l&apos;un des deux ne confirme pas à temps, l&apos;échange est annulé pour les deux — personne ne perd rien, à refaire au besoin.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-agents-libres',
    tab: 'guide',
    title: 'Signatures des agents libres (pré-saison)',
    keywords: 'repechage signatures agents libres presaison file attente tour signature admin bac a sable simulation liberer recrue pret alignement',
    href: '/repechage-agents-libres',
    screenshot: '/guide/agents-libres.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez-y via <strong>Alignements → Signatures des agents libres</strong>. C&apos;est l&apos;étape de préparation avant chaque
          nouvelle saison, où chaque pooler ajuste son alignement et où des agents libres sont signés à tour de rôle.
        </p>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Tableau de bord partagé</h4>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li>• Votre masse salariale, l&apos;alignement de n&apos;importe quel pooler (dépliable), et la file d&apos;attente indiquant à qui le tour.</li>
          <li>• Un fil <strong>Activité récente</strong> liste les signatures, libérations et changements de tous les poolers.</li>
        </ul>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Mon alignement</h4>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li>• Onglet <strong>Actuel</strong> : ajustez réellement votre alignement — actif ↔ réserviste, libération (quand la phase de libération est ouverte), activer/remettre en banque une recrue (toujours permis).</li>
          <li>• Onglet <strong>Bac à sable</strong> : simulez l&apos;ajout d&apos;un agent libre ou d&apos;une recrue de votre banque pour voir l&apos;impact sur votre masse salariale <em>avant</em> de décider — rien n&apos;est enregistré tant que vous ne le soumettez pas. Filtrez par position, salaire maximum, équipe ou statut ELC pour trouver un joueur.</li>
          <li>• Une fois satisfait de votre alignement, cliquez <strong>Mon alignement est prêt</strong> — l&apos;administrateur en a besoin pour démarrer la saison.</li>
        </ul>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Signer un agent libre</h4>
        <p className="text-sm text-gray-700">
          Pendant votre tour, la signature d&apos;un agent libre repéré dans le bac à sable est effectuée par l&apos;administrateur en votre nom.
          Vous pouvez aussi <strong>passer votre tour</strong> si vous n&apos;avez personne à signer.
        </p>
      </div>
    ),
  },
  {
    id: 'guide-simulation',
    tab: 'guide',
    title: 'Simulation',
    keywords: 'simulation bac a sable transaction echange test scenario sauvegarder ir ltir actif reserviste agent libre recrue toute la saison',
    href: '/simulation',
    screenshot: '/guide/simulation.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez-y via <strong>Alignements → Simulation</strong> — testez des changements d&apos;alignement <strong>toute l&apos;année</strong>,
          pas seulement en pré-saison. Rien n&apos;est jamais appliqué pour de vrai : pour un vrai changement, utilisez Gestion d&apos;effectifs.
        </p>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Onglet Mon alignement</h4>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li>• Retirez un de vos joueurs, ajoutez un agent libre (ou un joueur déjà possédé par un autre pooler, identifié en orange — pratique pour simuler une transaction) ou une recrue de votre banque.</li>
          <li>• Chaque joueur ajouté a un statut à choisir : <strong>Actif / Réserviste / IR</strong>.</li>
          <li>• <strong>Scénarios sauvegardés</strong> : donnez un nom à votre simulation pour la retrouver plus tard — plusieurs scénarios peuvent être gardés en parallèle.</li>
        </ul>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Onglet Transaction</h4>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Choisissez un autre pooler pour voir les deux alignements côte à côte.</li>
          <li>• Utilisez le bouton <strong>→</strong> pour envoyer un de vos joueurs chez l&apos;autre pooler (ou l&apos;inverse) et voir l&apos;impact sur les deux masses salariales en même temps.</li>
          <li>• Les mêmes outils que Mon alignement (agent libre, recrue de banque, statut Actif/Réserviste/IR) sont disponibles des deux côtés.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-classement',
    tab: 'guide',
    title: 'Classement',
    keywords: 'classement rang points buts passes victoires gardien joueurs action ce soir widget hebdomadaire mensuel semaine mois',
    href: '/classement',
    screenshot: '/guide/classement.png',
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
        <p className="text-sm text-gray-600 mt-3">
          Deux autres fenêtres sont disponibles, mêmes colonnes mais bornées dans le temps : le{' '}
          <Link href="/classement/hebdomadaire" className="text-blue-600 hover:underline font-medium">classement hebdomadaire</Link>{' '}
          (lundi à dimanche) et le{' '}
          <Link href="/classement/mensuel" className="text-blue-600 hover:underline font-medium">classement mensuel</Link>{' '}
          — chacun avec une navigation précédent/suivant pour parcourir les semaines ou mois passés.
        </p>
      </div>
    ),
  },
  {
    id: 'guide-journal-transactions',
    tab: 'guide',
    title: 'Journal des transactions',
    keywords: 'transactions echanges ajustements joueurs picks historique mouvements journal admin lecture seule',
    href: '/journal-transactions',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Consultez l&apos;historique de tous les mouvements via <strong>Alignements → Journal des transactions</strong>.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Les transactions sont séparées en deux catégories : <strong>Échanges</strong> (joueurs et picks entre poolers) et <strong>Ajustements</strong> (signatures, libérations, changements de type).</li>
          <li>• C&apos;est un historique en <strong>lecture seule</strong> — vos propres ajustements se font depuis Gestion d&apos;effectifs, et les échanges entre poolers sont traités par l&apos;administrateur.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-notifications',
    tab: 'guide',
    title: 'Notifications',
    keywords: 'notifications push courriel email alerte avertissement alignement equipe eliminee admin compte appareil activer tester babillard',
    href: '/compte',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Depuis <strong>Mon compte</strong>, deux canaux indépendants sont disponibles pour être averti des événements importants.
        </p>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Notifications push</h4>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li>• S&apos;activent par appareil (bouton <strong>Activer les notifications sur cet appareil</strong>) — à refaire sur chaque appareil utilisé.</li>
          <li>• Un bouton <strong>Tester</strong> permet de vérifier que ça fonctionne sur l&apos;appareil courant.</li>
        </ul>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Notifications par courriel</h4>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li>• Case à cocher <strong>Notifications par courriel</strong> — reçoit les mêmes alertes par courriel, peu importe l&apos;appareil.</li>
          <li>• Bouton <strong>Tester le courriel</strong> pour confirmer la réception.</li>
        </ul>
        <p className="text-xs text-gray-400 italic">Vous pouvez activer les deux, un seul, ou aucun — désactivable en tout temps depuis Mon compte.</p>
      </div>
    ),
  },
  {
    id: 'guide-babillard',
    tab: 'guide',
    title: 'Babillard',
    keywords: 'babillard communication annonce admin commentaire notification ressources',
    href: '/babillard',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez au babillard via <strong>Ressources → Babillard</strong>.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• L&apos;administrateur y publie des communications pour l&apos;ensemble du pool.</li>
          <li>• Chaque communication peut être commentée par les poolers.</li>
          <li>• Si vous avez activé les notifications (push ou courriel, Mon compte), vous êtes avisé lors d&apos;une nouvelle communication.</li>
        </ul>
        <p className="text-xs text-gray-400 mt-3 italic">Distinct du babillard de la page Planification, propre au sondage de rencontre.</p>
      </div>
    ),
  },
  {
    id: 'guide-planification',
    tab: 'guide',
    title: 'Planification',
    keywords: 'planification sondage doodle rencontre disponibilites dates reunion vote babillard',
    href: '/planification',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez-y via <strong>Ressources → Planification</strong> — un sondage type Doodle pour trouver une date de rencontre du pool.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Indiquez vos <strong>disponibilités</strong> pour chacune des dates proposées par l&apos;administrateur.</li>
          <li>• Un résumé affiche la meilleure date selon les réponses de tous.</li>
          <li>• Un babillard propre au sondage permet d&apos;échanger sur l&apos;organisation de la rencontre.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-calendrier',
    tab: 'guide',
    title: 'Calendrier LNH',
    keywords: 'calendrier matchs semaine equipe vue mensuel analyse joueurs prochains jours schedule filtre',
    href: '/calendrier',
    screenshot: '/guide/calendrier.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez au calendrier via <strong>LNH → Calendrier</strong>.
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
    href: '/statistiques',
    screenshot: '/guide/statistiques-lnh.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez aux statistiques via <strong>LNH → Statistiques</strong>.
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
  {
    id: 'guide-ahl',
    tab: 'guide',
    title: 'Statistiques AHL',
    keywords: 'ahl statistiques ligue developpement prospects recrue banque disponible filtre',
    href: '/statistiques/ahl',
    screenshot: '/guide/statistiques-ahl.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez-y via <strong>LNH → Statistiques → AHL</strong> — les mêmes informations que pour la LNH, mais pour la ligue de développement.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Stats des patineurs et des gardiens AHL, avec la même pastille de disponibilité (vert = déjà pris) que Statistiques LNH.</li>
          <li>• Utile pour suivre vos prospects en banque de recrues avant leur arrivée dans la LNH.</li>
          <li>• Le badge <strong>R</strong> indique le statut recrue au sens de la ligue AHL — distinct de la protection recrue du pool (voir Règlements).</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-blessures',
    tab: 'guide',
    title: 'Blessures LNH',
    keywords: 'blessures injuries ir ltir cbs sports disponible dans le pool proprietaire',
    href: '/statistiques/blessures',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez-y via <strong>LNH → Statistiques → Blessures</strong> — la liste des joueurs
          actuellement blessés dans la LNH, mise à jour quotidiennement (source CBS Sports).
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Type de blessure et statut (ex. « Expected to be out until at least Oct 2 »), en anglais tel que fourni par la source.</li>
          <li>• La colonne <strong>Dans le pool</strong> indique quel pooler possède le joueur et son type de roster (actif/réserviste/recrue/LTIR), ou <strong>Disponible</strong> si personne.</li>
          <li>• Un badge <strong>Blessé</strong> apparaît aussi directement sur Mon équipe/Équipes et dans les menus de Gestion d&apos;effectifs, pour vous aider à repérer quand mettre un joueur au LTIR.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-projections',
    tab: 'guide',
    title: 'Projections',
    keywords: 'projections nhl.com cbs tendance points par match saison derniere progression disponible filtre',
    href: '/statistiques/projections',
    screenshot: '/guide/projections.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez-y via <strong>LNH → Statistiques → Projections</strong> — regroupe en un seul tableau ce qui est normalement
          visible joueur par joueur dans le panneau détail (cliquable depuis n&apos;importe quelle page via le nom d&apos;un joueur).
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Colonnes <strong>NHL.com</strong>, <strong>CBS</strong>, <strong>Pool Pro</strong> et <strong>Hockey Le Magazine</strong> : projections externes, mises à jour ponctuellement.</li>
          <li>• <strong>Saison dernière</strong> : total réel de la saison précédente.</li>
          <li>• <strong>Pts/Match (tend.)</strong> et <strong>Tendance 3 saisons</strong> : rythme pondéré sur les dernières saisons réelles (repère rapide, pas une vraie projection) — ignore les saisons à moins de 10 matchs pour éviter un chiffre faussé par un tout petit échantillon.</li>
          <li>• <strong>Progression</strong> (↑ / ↓ / →) : compare le rythme des 2 dernières saisons qualifiées.</li>
          <li>• Séparé en onglets Attaquants / Défenseurs / Gardiens, avec le même point vert de disponibilité que Statistiques LNH.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-joueurs',
    tab: 'guide',
    title: 'Contrats LNH',
    keywords: 'contrats lnh joueurs salaire cap statut elc rfa ufa disponibilite table',
    href: '/joueurs',
    screenshot: '/guide/contrats-lnh.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez-y via <strong>LNH → Contrats</strong> — la table complète des joueurs de la LNH.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Contrat et salaire (<strong>cap number</strong>) par saison pour chaque joueur.</li>
          <li>• Statut de contrat : <strong>ELC</strong> (entrée), <strong>RFA</strong> ou <strong>UFA</strong>.</li>
          <li>• Même pastille de disponibilité que les pages de statistiques.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-draft-center',
    tab: 'guide',
    title: 'Classement pré-repêchage',
    keywords: 'classement pre repechage prospects draft center rang sources annee',
    href: '/draft-center',
    screenshot: '/guide/draft-center.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez-y via <strong>Recrues → Classement pré-repêchage</strong>.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Classement des prospects du <strong>prochain repêchage LNH</strong>, en combinant plusieurs sources externes en un rang moyen.</li>
          <li>• Filtrable par <strong>année de repêchage</strong> pour revoir les cuvées précédentes.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-repechage',
    tab: 'guide',
    title: 'Repêchage LNH',
    keywords: 'repechage lnh resultats reel rondes equipe stats junior 2026',
    href: '/repechage',
    screenshot: '/guide/repechage-lnh.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez-y via <strong>Recrues → Repêchage LNH</strong> — les résultats réels du repêchage de la LNH.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Couvre les <strong>5 dernières années</strong> (la fenêtre de protection recrue du pool), ronde par ronde, avec l&apos;équipe LNH qui a sélectionné chaque joueur.</li>
          <li>• Pour le repêchage <strong>2026</strong> : équipe junior/université, matchs joués et points de la dernière saison amateur.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-repechage-recrues',
    tab: 'guide',
    title: 'Repêchage interne',
    keywords: 'repechage interne recrues pool saison qui a repeche qui',
    href: '/repechage-recrues',
    screenshot: '/guide/repechage-recrues.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accédez-y via <strong>Recrues → Repêchage interne</strong> — le tableau du repêchage des recrues propre au pool lui-même.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Qui a repêché qui, par saison, avec un sélecteur pour revoir les éditions précédentes.</li>
        </ul>
      </div>
    ),
  },

  {
    id: 'guide-donnees-vides',
    tab: 'guide',
    title: 'Une page de données semble vide ou incomplète',
    keywords: 'vide bug erreur recharger cache donnees manquantes probleme passager lnh ahl calendrier repechage statistiques',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Les statistiques LNH/AHL, le calendrier et les résultats de repêchage proviennent de sources externes
          et sont gardés en mémoire quelques minutes à quelques heures pour accélérer l&apos;affichage.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Si une de ces pages semble vide ou vous manque des joueurs de façon inattendue, il s&apos;agit le plus souvent d&apos;un <strong>accroc passager</strong> avec la source externe plutôt que d&apos;une vraie perte de données.</li>
          <li>• Sur Statistiques LNH et AHL, un bandeau rouge avec un bouton <strong>Recharger la page</strong> apparaît automatiquement dans ce cas.</li>
          <li>• Ailleurs, un simple rechargement de la page règle généralement le problème.</li>
          <li>• Si ça persiste après quelques essais, utilisez <strong>Signaler un problème</strong> (menu de votre compte).</li>
        </ul>
      </div>
    ),
  },

  // ── RÈGLEMENTS ────────────────────────────────────────────────────────────
  {
    id: 'regl-alignement',
    tab: 'reglements',
    title: 'Structure de l\'alignement',
    keywords: 'alignement attaquants defenseurs gardiens reservistes minimum actif roster maximum',
    content: (
      <ul className="text-sm text-gray-700 space-y-1.5">
        <li>• <strong>12 attaquants</strong>, <strong>6 défenseurs</strong> et <strong>2 gardiens</strong> actifs au maximum.</li>
        <li>• Minimum <strong>2 réservistes</strong> (toutes positions confondues).</li>
        <li>• Une fois la saison officiellement démarrée par l&apos;administrateur, tout mouvement soumis dans Gestion d&apos;effectifs doit laisser votre alignement à exactement ces nombres — un sous-effectif est tout aussi bloquant qu&apos;un dépassement (c&apos;est pour ça que les mouvements groupés existent : libérer et activer en un seul geste, sans jamais passer par un état invalide).</li>
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
        <li>• Un joueur sans contrat réel compte une masse <strong>simulée</strong> (dernier contrat connu × un facteur, généralement 1.20) pour éviter qu&apos;il compte 0$ — si ce joueur signe ensuite un vrai contrat qui vous fait dépasser le cap, vous avez un délai (par défaut 7 jours) pour vous ajuster vous-même avant que l&apos;administrateur ne doive intervenir.</li>
      </ul>
    ),
  },
  {
    id: 'regl-recrues',
    tab: 'reglements',
    title: 'Banque de recrues & protection',
    keywords: 'recrue banque draft repeche elc agent libre protection saisons contrat masse salariale expiration automatique activer liberer',
    content: (
      <ul className="text-sm text-gray-700 space-y-1.5">
        <li>• Un joueur <strong>repêché</strong> par le pool reste protégé pendant <strong>5 saisons</strong> après son année de repêchage, peu importe la durée de son contrat d&apos;entrée (ELC) — la fin de l&apos;ELC ne fait pas perdre la protection avant ces 5 ans. Vous gardez donc l&apos;option de le laisser en banque même une fois son ELC terminé.</li>
        <li>• Un joueur signé comme <strong>agent libre</strong> reste protégé tant que son ELC est actif, sans limite de nombre de saisons (pas de fenêtre de 5 ans pour lui).</li>
        <li>• Un joueur en banque de recrues ne compte pas dans la masse salariale, même s&apos;il joue dans la LNH.</li>
        <li>• Quand la protection expire <strong>pour de vrai</strong> (5 ans écoulés pour un repêché, ELC terminé pour un agent libre), la perte du statut recrue est <strong>automatique</strong> : s&apos;il était déjà actif ou réserviste, il reste où il est ; s&apos;il était encore en banque, il est activé automatiquement. Aucune action requise de votre part à ce moment précis.</li>
        <li>• Vous pouvez vous-même <strong>activer ou remettre en banque</strong> n&apos;importe quelle recrue encore protégée en tout temps, depuis Gestion d&apos;effectifs ou Signatures des agents libres (ce dernier seulement avant le début de la saison).</li>
      </ul>
    ),
  },
  {
    id: 'regl-transactions',
    tab: 'reglements',
    title: 'Transactions & échanges',
    keywords: 'transactions echanges admin nombre delai desactivation agent libre regles gestion effectifs self service',
    href: '/gestion-effectifs',
    content: (
      <ul className="text-sm text-gray-700 space-y-1.5">
        <li>• Les <strong>échanges entre poolers</strong> (joueurs, choix de repêchage) se proposent vous-même via l&apos;onglet <strong>Échanges</strong> de Gestion d&apos;effectifs — voir les règles détaillées plus bas. L&apos;admin garde un droit d&apos;approbation sur chacun.</li>
        <li>• Les ajustements sur votre propre alignement (actif/réserviste, libération, recrues) se font en libre-service via <strong>Gestion d&apos;effectifs</strong> une fois la saison démarrée, ou via <strong>Signatures des agents libres</strong> avant le début de la saison.</li>
        <li>• Pour tester l&apos;impact d&apos;un changement ou d&apos;un échange avant de le faire pour de vrai, voir <strong>Simulation</strong> — disponible toute l&apos;année, purement en aperçu.</li>
      </ul>
    ),
  },
  {
    id: 'regl-ballotage',
    tab: 'reglements',
    title: 'Ballotage',
    keywords: 'ballotage reclamer liberer priorite classement delai',
    href: '/gestion-effectifs?tab=ballotage',
    content: (
      <ul className="text-sm text-gray-700 space-y-1.5">
        <li>• S&apos;applique uniquement aux libérations en <strong>cours de saison</strong> (pas aux libérations de la phase pré-saison).</li>
        <li>• La priorité de réclamation est l&apos;<strong>ordre inverse du classement</strong> au moment précis de la libération — elle ne change pas même si le classement bouge ensuite. <strong>Avant le 1ᵉʳ novembre</strong> (le classement n&apos;a pas encore de sens en tout début de saison), c&apos;est plutôt l&apos;ordre du repêchage des agents libres pré-saison qui sert de priorité.</li>
        <li>• Réclamable jusqu&apos;à <strong>23h59 (heure de l&apos;Est) du 2e jour suivant</strong> la libération (délai configurable par l&apos;administrateur) — attribué le lendemain de cette date limite.</li>
        <li>• En cas de réclamations multiples sur le même joueur, seule la priorité tranche.</li>
        <li>• Une fois gagné, vous avez <strong>48h</strong> pour l&apos;ajouter vous-même à votre alignement, sinon l&apos;administrateur doit intervenir manuellement.</li>
      </ul>
    ),
  },
  {
    id: 'regl-echanges',
    tab: 'reglements',
    title: 'Échanges entre poolers',
    keywords: 'echange transaction proposer accepter refuser approbation admin delai confirmer annulation',
    href: '/gestion-effectifs?tab=echanges',
    content: (
      <ul className="text-sm text-gray-700 space-y-1.5">
        <li>• Peuvent inclure des joueurs actif/réserviste/recrue et des choix de repêchage, dans n&apos;importe quelle combinaison.</li>
        <li>• Le pooler visé peut seulement <strong>accepter ou refuser</strong> — pas de contre-offre pour l&apos;instant.</li>
        <li>• Une fois accepté, l&apos;<strong>administrateur doit approuver</strong> avant que quoi que ce soit ne bouge.</li>
        <li>• Une fois approuvé, les deux poolers ont un délai (configurable par l&apos;administrateur, par défaut 3 jours) pour confirmer que le résultat respecte leurs limites d&apos;alignement (12/6/2 + cap).</li>
        <li>• Si l&apos;un des deux ne confirme pas à temps, l&apos;échange est <strong>annulé pour les deux</strong> — rien n&apos;a changé, à refaire au besoin.</li>
        <li>• S&apos;applique uniquement en <strong>cours de saison</strong> — un échange en pré-saison se fait par l&apos;administrateur.</li>
      </ul>
    ),
  },
  {
    id: 'regl-agents-libres',
    tab: 'reglements',
    title: 'Signatures des agents libres (pré-saison)',
    keywords: 'repechage signatures agents libres presaison ordre tour phase liberation passer signature admin',
    href: '/repechage-agents-libres',
    content: (
      <ul className="text-sm text-gray-700 space-y-1.5">
        <li>• Se déroule avant le début de chaque nouvelle saison, une fois le repêchage des recrues terminé.</li>
        <li>• Une <strong>phase de libération</strong> permet d&apos;abord à chaque pooler d&apos;ajuster sa masse salariale (libérer des joueurs signés) avant que le repêchage débute.</li>
        <li>• Le repêchage se déroule ensuite <strong>à tour de rôle</strong>, selon un ordre déterminé par l&apos;administrateur — vous pouvez signer un agent libre pendant votre tour ou <strong>passer</strong>.</li>
        <li>• Actif ↔ réserviste et l&apos;activation/retrait de vos recrues de banque restent toujours permis, peu importe la phase en cours.</li>
        <li>• La saison ne peut démarrer que lorsque tous les poolers ont déclaré leur alignement <strong>prêt</strong> et respectent les limites du pool.</li>
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
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Aide &amp; Règlements</h1>
          <p className="text-sm text-gray-500 mt-1">Guide d&apos;utilisation et règlements du pool.</p>
        </div>
        <Link
          href="/a-propos"
          className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium whitespace-nowrap"
        >
          Voir le tour d&apos;horizon des fonctionnalités →
        </Link>
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
                <SectionCard key={s.id} s={s} badge={TAB_LABELS[s.tab]} />
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
                <SectionCard key={s.id} s={s} />
              ))}
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-4">
              {tabSections.map(s => (
                <SectionCard key={s.id} s={s} />
              ))}
            </div>
          )}

          {activeTab === 'reglements' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 text-sm text-blue-800">
                Ces règlements sont évolutifs et seront mis à jour au fur et à mesure que les règles sont clarifiées ou que de nouvelles fonctionnalités sont implémentées.
              </div>
              {tabSections.map(s => (
                <SectionCard key={s.id} s={s} />
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 text-right mt-8">Dernière mise à jour : septembre 2026</p>
        </>
      )}
    </div>
  )
}
