'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { LtirSettings } from '@/lib/ltirEligibility'
import LtirRulesContent, { LtirSettingsContext } from './LtirRulesContent'

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
          <li>Ouvre le site dans Chrome ou Edge</li>
          <li>Clique sur le bouton <strong>Installer</strong> dans la barre de navigation du site</li>
          <li>Confirme l&apos;installation dans la fenêtre qui s&apos;ouvre</li>
        </ol>
        <p className="text-xs text-gray-400 mt-3">
          Si le bouton n&apos;apparaît pas, cherche l&apos;icône d&apos;installation (⊕) à droite de la barre d&apos;adresse du navigateur.
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
          <li>Ouvre le site dans <strong>Safari</strong></li>
          <li>Appuie sur le bouton Partager <strong>⬆</strong> en bas de l&apos;écran</li>
          <li>Fais défiler et choisis <strong>« Sur l&apos;écran d&apos;accueil »</strong></li>
          <li>Confirme en appuyant sur <strong>Ajouter</strong></li>
        </ol>
        <p className="text-xs text-gray-400 mt-3">
          L&apos;icône apparaîtra sur ton écran d&apos;accueil comme une application normale.
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
          <li>Ouvre le site dans <strong>Chrome</strong></li>
          <li>Une bannière d&apos;installation peut apparaître automatiquement</li>
          <li>Sinon, appuie sur le menu <strong>⋮</strong> en haut à droite</li>
          <li>Choisis <strong>« Ajouter à l&apos;écran d&apos;accueil »</strong></li>
        </ol>
        <p className="text-xs text-gray-400 mt-3">
          L&apos;application s&apos;ouvre ensuite sans la barre d&apos;adresse du navigateur.
        </p>
      </div>
    ),
  },
  {
    id: 'install-paysage',
    tab: 'installation',
    title: 'Téléphone : mode paysage',
    keywords: 'paysage portrait tourner telephone colonnes tableau mobile rotation bloque reinstaller',
    content: (
      <div>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• En portrait, les tableaux n&apos;affichent que les colonnes essentielles — le nom du joueur reste figé à gauche quand tu fais défiler.</li>
          <li>• <strong>Tourne ton téléphone en paysage</strong> pour voir toutes les colonnes (équipe, statistiques détaillées, contrats des saisons suivantes…).</li>
          <li>• Si l&apos;application installée refuse de passer en paysage, désinstalle-la puis réinstalle-la (voir ci-dessus) — une ancienne version bloquait le mode paysage.</li>
        </ul>
      </div>
    ),
  },

  // ── GUIDE D'UTILISATION ───────────────────────────────────────────────────
  {
    id: 'guide-equipe',
    tab: 'guide',
    title: 'Mon alignement',
    keywords: 'equipe alignement roster organisation actif reserviste recrue ltir picks repechage cap masse salariale pooler switcher',
    href: '/dashboard',
    screenshot: '/guide/mon-equipe.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accède à ton alignement via <strong>Mon équipe → Mon alignement</strong> dans le menu.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• L&apos;onglet <strong>Organisation</strong> affiche ton alignement complet : actifs, réservistes, recrues et joueurs LTIR.</li>
          <li>• Ta <strong>masse salariale</strong> et le cap restant sont affichés en haut de page.</li>
          <li>• Tes <strong>choix de repêchage</strong> sont listés en bas, regroupés par saison.</li>
          <li>• Le <strong>sélecteur de pooler</strong> en haut te permet de consulter l&apos;alignement d&apos;un autre pooler.</li>
        </ul>
        <p className="text-xs text-gray-400 mt-3 italic">Pour modifier toi-même ton alignement (actif/réserviste, libération, recrues), voir <strong>Gestion d&apos;effectifs</strong> ci-dessous.</p>
      </div>
    ),
  },
  {
    id: 'guide-equipes',
    tab: 'guide',
    title: 'Tous les alignements',
    keywords: 'equipes poolers liste rang classement masse salariale alignement des autres',
    href: '/poolers',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accède-y via <strong>Le pool → Tous les alignements</strong> — la liste des 8 poolers du pool.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Chaque ligne affiche le <strong>rang</strong> au classement et la <strong>masse salariale</strong> utilisée.</li>
          <li>• Clique sur un pooler pour ouvrir son alignement complet (même vue que <strong>Mon alignement</strong>, mais pour lui).</li>
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
          Accède à ton outil de gestion via <strong>Mon équipe → Gestion d&apos;effectifs</strong>. C&apos;est ici que tu ajustes
          toi-même ton alignement une fois la <strong>saison démarrée</strong>{' '}par l&apos;administrateur.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Bascule un joueur <strong>actif ↔ réserviste</strong> selon tes besoins.</li>
          <li>• <strong>Libère</strong> un joueur pour le retirer de ton alignement.</li>
          <li>• <strong>Active ou remets en banque</strong> une recrue encore protégée, à tout moment.</li>
          <li>• Tes changements doivent respecter les limites du pool (voir Règlements) : maximum 12 attaquants / 6 défenseurs / 2 gardiens actifs, minimum 2 réservistes, et ta masse salariale sous le cap.</li>
          <li>• Libérer un joueur en cours de saison le met automatiquement au <strong>ballotage</strong> (onglet Ballotage, voir plus bas) — les autres poolers ont un délai pour le réclamer.</li>
        </ul>
        <p className="text-xs text-gray-400 mt-3 italic">Avant le début officiel de la saison, ces mêmes ajustements se font plutôt depuis <strong>Signatures des agents libres</strong> (Repêchage annuel des poolers, voir plus bas).</p>
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
          Onglet <strong>Ballotage</strong>{' '}de Gestion d&apos;effectifs — quand un joueur est libéré
          en cours de saison, il y apparaît et devient réclamable par n&apos;importe quel autre pooler
          pendant un délai limité.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Clique <strong>Réclamer</strong> pour signaler ton intérêt — tu peux réclamer plusieurs joueurs en même temps. <strong>Refuser</strong> est optionnel, mais si tous les poolers plus prioritaires que toi refusent, tu es averti que tu vas l&apos;obtenir sans attendre la fin du délai.</li>
          <li>• Si plusieurs poolers réclament le même joueur, celui avec la <strong>priorité la plus haute</strong> (pire classé au moment de la libération) le remporte.</li>
          <li>• Si personne ne réclame avant la fin du délai, le joueur redevient simplement un agent libre normal.</li>
          <li>• Une fois gagné, un bandeau apparaît dans l&apos;onglet <strong>Mouvements</strong> pour l&apos;ajouter toi-même à ton alignement (actif ou réserviste, au choix) — ajuste au besoin (libération) pour rester conforme, tu as 48 h pour le faire.</li>
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
          Onglet <strong>Échanges</strong>{' '}de Gestion d&apos;effectifs — propose un échange de joueurs
          (actif, réserviste ou recrue) et/ou de choix de repêchage à un autre pooler.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Le pooler visé doit <strong>accepter ou refuser</strong> ta proposition.</li>
          <li>• Si accepté, l&apos;<strong>admin doit approuver</strong> l&apos;échange avant que quoi que ce soit ne bouge.</li>
          <li>• Une fois approuvé, tu as un délai pour <strong>confirmer</strong> que le résultat entre dans ta masse salariale et ta composition (12/6/2 + réservistes) — si ça ne rentre pas encore, une section dédiée directement dans cet onglet te permet d&apos;ajuster au passage (libérer, changer actif/réserviste, activer ou remettre en banque une recrue), pas besoin d&apos;aller dans Mouvements séparément.</li>
          <li>• L&apos;échange s&apos;exécute seulement une fois que <strong>les deux poolers</strong> ont confirmé. Si l&apos;un des deux ne confirme pas à temps, l&apos;échange est annulé pour les deux — personne ne perd rien, à refaire au besoin.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-marche-echanges',
    tab: 'guide',
    title: 'Marché des échanges',
    keywords: 'marche echanges offrir mettre sur le marche je cherche besoin offre notification expiration',
    href: '/marche-echanges',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Menu <strong>Le pool</strong>{' '}→ <strong>Marché des échanges</strong>{' '}— pour annoncer ce que tu es prêt à échanger ou ce que tu cherches.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• <strong>Mettre sur le marché</strong> : coche tes joueurs (actif, réserviste ou recrue) et tes choix de repêchage, ajoute une note au besoin et choisis jusqu&apos;à quand ils restent affichés.</li>
          <li>• <strong>Je cherche</strong> : publie un besoin sans viser un joueur précis (ex : un défenseur à moins de 3 M$).</li>
          <li>• Les autres poolers reçoivent une <strong>notification</strong>, et les derniers éléments s&apos;affichent sur l&apos;accueil.</li>
          <li>• <strong>Faire une offre</strong> ouvre l&apos;onglet Échanges avec le pooler déjà choisi et l&apos;élément déjà coché dans « Tu reçois » : il reste à choisir ce que tu donnes.</li>
          <li>• Un élément disparaît tout seul à sa date d&apos;expiration ou dès qu&apos;il change d&apos;alignement (échangé, libéré). Tu peux aussi le retirer toi-même.</li>
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
          Accède-y via <strong>Repêchage annuel des poolers → Signatures des agents libres</strong>. C&apos;est l&apos;étape de préparation avant chaque
          nouvelle saison, où chaque pooler ajuste son alignement et où des agents libres sont signés à tour de rôle.
        </p>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Tableau de bord partagé</h4>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li>• Ta masse salariale, l&apos;alignement de n&apos;importe quel pooler (dépliable), et la file d&apos;attente indiquant à qui le tour.</li>
          <li>• Un fil <strong>Activité récente</strong> liste les signatures, libérations et changements de tous les poolers.</li>
        </ul>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Mon alignement</h4>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li>• Onglet <strong>Actuel</strong> : ajuste réellement ton alignement — actif ↔ réserviste, libération (quand la phase de libération est ouverte), activer/remettre en banque une recrue (toujours permis).</li>
          <li>• Onglet <strong>Simulation</strong> : simule l&apos;ajout d&apos;un agent libre ou d&apos;une recrue de ta banque pour voir l&apos;impact sur ta masse salariale <em>avant</em> de décider — rien n&apos;est enregistré tant que tu ne le soumets pas. Filtre par position, salaire maximum, équipe ou statut ELC pour trouver un joueur.</li>
          <li>• Une fois satisfait de ton alignement, clique <strong>Mon alignement est prêt</strong> — l&apos;administrateur en a besoin pour démarrer la saison.</li>
        </ul>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Signer un agent libre</h4>
        <p className="text-sm text-gray-700">
          Pendant ton tour, la signature d&apos;un agent libre repéré dans la simulation est effectuée par l&apos;administrateur en ton nom.
          Tu peux aussi <strong>passer ton tour</strong>{' '}si tu n&apos;as personne à signer.
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
          Accède-y via <strong>Mon équipe → Simulation</strong> — teste des changements d&apos;alignement <strong>toute l&apos;année</strong>,
          pas seulement en pré-saison. Rien n&apos;est jamais appliqué pour de vrai : pour un vrai changement, utilise Gestion d&apos;effectifs.
        </p>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Onglet Mon alignement</h4>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li>• Retire un de tes joueurs, ajoute un agent libre (ou un joueur déjà possédé par un autre pooler, identifié en orange — pratique pour simuler une transaction) ou une recrue de ta banque.</li>
          <li>• Chaque joueur ajouté a un statut à choisir : <strong>Actif / Réserviste / IR</strong>.</li>
          <li>• <strong>Scénarios sauvegardés</strong> : donne un nom à ta simulation pour la retrouver plus tard — plusieurs scénarios peuvent être gardés en parallèle. Tes scénarios sont <strong>privés</strong> : personne d&apos;autre, administrateur compris, ne peut les voir.</li>
        </ul>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Onglet Transaction</h4>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Choisis un autre pooler pour voir les deux alignements côte à côte.</li>
          <li>• Utilise le bouton <strong>→</strong> pour envoyer un de tes joueurs chez l&apos;autre pooler (ou l&apos;inverse) et voir l&apos;impact sur les deux masses salariales en même temps.</li>
          <li>• Les mêmes outils que Mon alignement (agent libre, recrue de banque, statut Actif/Réserviste/IR) sont disponibles des deux côtés.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-listes',
    tab: 'guide',
    title: 'Mes listes',
    keywords: 'mes listes liste souhait cibles aide memoire bloc note agents libres recrues repechage soir du pool disponible deja pris privee',
    href: '/listes',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accède-y via <strong>Mon équipe → Mes listes</strong>{' '}— un aide-mémoire des joueurs qui t&apos;intéressent,
          à préparer pendant la saison et à consulter le soir du pool.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Deux types de listes : <strong>Agents libres</strong> (tout joueur qui n&apos;est dans aucun alignement) et <strong>Recrues</strong> (joueurs du dernier repêchage LNH, à repêcher au pool).</li>
          <li>• Crée autant de listes nommées que tu veux, classe les joueurs par priorité (▲▼) et ajoute une courte note.</li>
          <li>• La recherche ne propose que des joueurs <strong>encore disponibles</strong>.</li>
          <li>• Un joueur pris par un pooler n&apos;est pas effacé : il passe dans <strong>Déjà pris</strong>, avec le nom du pooler. Le soir du pool, la liste se met à jour d&apos;elle-même.</li>
          <li>• Tes listes sont <strong>privées</strong> : personne d&apos;autre, administrateur compris, ne peut les voir.</li>
          <li>• Elles se retrouvent aussi dans Signatures des agents libres, Repêchage des recrues, Gestion d&apos;effectifs et Simulation (bouton <strong>Simuler</strong> pour tester l&apos;impact d&apos;un agent libre sur ta masse salariale).</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-classement',
    tab: 'guide',
    title: 'Classement',
    keywords: 'classement rang points buts passes victoires gardien direct ce soir pointeurs mise a jour nuit hebdomadaire mensuel semaine mois',
    href: '/classement',
    screenshot: '/guide/classement.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accède au classement via <strong>Le pool → Classement</strong>{' '}ou via la page d&apos;accueil.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Le tableau affiche le rang, les points totaux et le détail (buts, passes, victoires, défaites prol.).</li>
          <li>• Clique sur le nom d&apos;un pooler pour consulter son alignement complet.</li>
          <li>• <strong>Quand les points sont-ils mis à jour ?</strong>{' '}Les points officiels du classement sont mis à jour une fois par nuit, vers 2 h (heure de l&apos;Est), avec les matchs de la veille.</li>
          <li>
            • <strong>En direct</strong>{' '}: pendant les matchs, la page d&apos;accueil affiche le classement de la soirée et les pointeurs de la LNH, mis à jour chaque minute. Le détail par pooler est sur{' '}
            <Link href="/en-direct" className="text-blue-600 hover:underline font-medium">Le pool → En direct</Link>.
            Ce pointage est <strong>non officiel</strong>{' '}: seuls les joueurs actifs comptent, et les points officiels sont ceux de la nuit.
          </li>
        </ul>
        <p className="text-sm text-gray-600 mt-3">
          Le sélecteur en haut de la page propose, en plus de la <strong>saison complète</strong> (par défaut), deux fenêtres bornées dans le temps avec les mêmes colonnes : le{' '}
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
          Consulte l&apos;historique de tous les mouvements via <strong>Le pool → Journal des transactions</strong>.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Les transactions sont séparées en deux catégories : <strong>Échanges</strong> (joueurs et picks entre poolers) et <strong>Ajustements</strong> (signatures, libérations, changements de type).</li>
          <li>• C&apos;est un historique en <strong>lecture seule</strong> — tes propres ajustements se font depuis Gestion d&apos;effectifs, et les échanges entre poolers sont traités par l&apos;administrateur.</li>
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
        <p className="text-xs text-gray-400 italic">Tu peux activer les deux, un seul, ou aucun — désactivable en tout temps depuis Mon compte.</p>
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
          Accède au babillard via <strong>Communauté → Babillard</strong>.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• L&apos;administrateur y publie des communications pour l&apos;ensemble du pool.</li>
          <li>• Chaque communication peut être commentée par les poolers.</li>
          <li>• Si tu as activé les notifications (push ou courriel, Mon compte), tu es avisé lors d&apos;une nouvelle communication.</li>
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
          Accède-y via <strong>Communauté → Planification</strong> — un sondage type Doodle pour trouver une date de rencontre du pool.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Indique tes <strong>disponibilités</strong> pour chacune des dates proposées par l&apos;administrateur.</li>
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
          Accède au calendrier via <strong>Calendrier LNH</strong> dans le menu.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
          <li>• La page affiche les matchs d&apos;<strong>une journée</strong> : navigue avec les flèches, le bouton <strong>Aujourd&apos;hui</strong> ou le sélecteur de date.</li>
          <li>• Si tu es connecté, le nombre de matchs impliquant tes joueurs est indiqué pour la journée.</li>
        </ul>
        <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Prochains matchs de tes joueurs</h4>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• L&apos;onglet <strong>Prochains matchs</strong> de Mon alignement (ou de l&apos;alignement de n&apos;importe quel pooler) affiche le nombre de matchs de chaque joueur dans les prochains jours (horizon réglable de 2 à 7 jours).</li>
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
          Accède aux statistiques via <strong>Statistiques → LNH</strong>.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Consulte les stats des patineurs (triés par points) et des gardiens (triés par victoires).</li>
          <li>• Un <strong>point vert</strong> indique qu&apos;un joueur appartient déjà à un pooler dans la saison active.</li>
          <li>• Bascule entre <strong>Saison régulière</strong> et <strong>Séries</strong> avec le sélecteur en haut à droite.</li>
          <li>• Filtre par attaquants / défenseurs et fais une recherche par nom.</li>
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
          Accède-y via <strong>Statistiques → AHL</strong> — les mêmes informations que pour la LNH, mais pour la ligue de développement.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Stats des patineurs et des gardiens AHL, avec la même pastille de disponibilité (vert = déjà pris) que Statistiques LNH.</li>
          <li>• Utile pour suivre tes prospects en banque de recrues avant leur arrivée dans la LNH.</li>
          <li>• Le badge <strong>R</strong> indique le statut recrue au sens de la ligue AHL — distinct de la protection recrue du pool (voir Règlements).</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'guide-blessures',
    tab: 'guide',
    title: 'Blessures LNH',
    keywords: 'blessures injuries ir ltir cbs sports espn disponible dans le pool proprietaire admissible badge desaccord',
    href: '/statistiques/blessures',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accède-y via <strong>Blessures</strong>{' '}dans le menu — la liste des joueurs actuellement
          blessés dans la LNH, mise à jour automatiquement une fois par jour (vers midi, heure de l&apos;Est).
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Type de blessure et statut (ex. « Expected to be out until at least Oct 2 »), en anglais tel que fourni par CBS Sports. Un statut qui commence par <strong>« IR. »</strong> signifie que l&apos;équipe LNH a placé le joueur sur sa liste des blessés.</li>
          <li>• La colonne <strong>LTIR</strong> affiche <strong>Admissible</strong> quand le joueur respecte les critères du pool (voir Règlements → Blessures et LTIR). Le filtre <strong>Admissibles LTIR seulement</strong> ne garde que ceux-là.</li>
          <li>• La colonne <strong>Dans le pool</strong> indique quel pooler possède le joueur et son type de roster (actif/réserviste/recrue/LTIR), ou <strong>Disponible</strong> si personne. Le filtre <strong>Mes joueurs seulement</strong> (une fois connecté) ne garde que tes propres joueurs blessés, peu importe leur statut.</li>
          <li>• Un badge rouge <strong>Blessé</strong> ou vert <strong>Admissible LTIR</strong> apparaît aussi directement sur les joueurs actifs et réservistes (Mon alignement, Tous les alignements) et dans les menus de Gestion d&apos;effectifs. Survole-le pour voir le détail.</li>
          <li>• Un marqueur ambre <strong>⚠ CBS≠ESPN</strong> signale que les deux sources annoncent des dates de retour sensiblement différentes — à vérifier par toi-même avant de décider.</li>
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
          Accède-y via <strong>Statistiques → Projections</strong>{' '}— regroupe en un seul tableau ce qui est normalement
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
    id: 'guide-analytique',
    tab: 'guide',
    title: 'Analytique',
    keywords: 'analytique stats statistiques avancees outil analyse moneypuck buts attendus xb corsi pdo rendement salaire tendance ecart gardiens',
    href: '/analytique/stats-avancees',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Le menu <strong>Analytique</strong> regroupe trois pages pour creuser plus loin que les buts et les passes. Les données viennent de MoneyPuck.com et de Daily Faceoff, et sont mises à jour chaque jour.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• <strong>Statistiques avancées</strong> : un tableau par saison, pour les patineurs ou les gardiens, selon la situation de jeu (toutes, 5 contre 5, avantage ou désavantage numérique). Ouvre « Définitions des colonnes » pour savoir ce que chaque sigle mesure, et clique un en-tête pour trier.</li>
          <li>• <strong>Outil d&apos;analyse</strong> : choisis deux mesures (ou une des questions prêtes, comme « Rendement ») pour les voir sur un graphique. La ligne de tendance montre ce qui est attendu ; l&apos;écart de chaque joueur dit s&apos;il fait mieux ou moins bien. Patineurs ou gardiens (victoires, blanchissages, buts sauvés).</li>
          <li>• <strong>Évolution</strong> : la question prête « Évolution » compare la même mesure d&apos;une saison à la suivante ; au-dessus de la diagonale, le joueur progresse. La fiche d&apos;un joueur montre aussi ses stats avancées saison par saison, depuis 2020-21.</li>
          <li>• <strong>Trios et paires</strong> : l&apos;alignement actuel d&apos;une équipe — les quatre trios, les trois paires, les gardiens et les deux unités d&apos;avantage numérique. Un joueur du premier trio et de la première unité d&apos;avantage numérique a plus de chances de produire. La fiche d&apos;un joueur indique aussi son trio et ses partenaires.</li>
          <li>• Filtre par position, par pooler ou « Disponibles seulement » pour repérer un agent libre sous-estimé, et fixe un salaire maximum selon ton espace sous le plafond.</li>
          <li>• Clique un nom ou un point du graphique pour ouvrir la fiche du joueur.</li>
          <li>• Ce sont des aides à la décision : une tendance calculée sur une saison ne garantit rien pour la suivante.</li>
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
          Accède-y via <strong>Contrats LNH</strong> dans le menu — la table complète des joueurs de la LNH.
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
          Accède-y via <strong>Prospects LNH → Classement pré-repêchage</strong>.
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
          Accède-y via <strong>Prospects LNH → Repêchage LNH</strong> — les résultats réels du repêchage de la LNH.
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
    title: 'Repêchage des recrues',
    keywords: 'repechage interne recrues pool saison qui a repeche qui',
    href: '/repechage-recrues',
    screenshot: '/guide/repechage-recrues.png',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accède-y via <strong>Repêchage annuel des poolers → Repêchage des recrues</strong> — le tableau du repêchage des recrues propre au pool lui-même.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Qui a repêché qui, par saison, avec un sélecteur pour revoir les éditions précédentes.</li>
        </ul>
      </div>
    ),
  },

  {
    id: 'guide-copie-de-secours',
    tab: 'guide',
    title: 'Copie de secours',
    keywords: 'copie secours backup telecharger hors ligne fichier html excel panne sauvegarde',
    href: '/copie-de-secours',
    content: (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Accède-y via <strong>Aide → Copie de secours</strong>{' '}— tout le pool dans un seul fichier, au cas où l&apos;app serait hors service.
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li>• Le fichier contient les alignements de tous les poolers, les contrats LNH, les choix de repêchage et le journal des mouvements.</li>
          <li>• Ouvre-le dans ton navigateur (double-clic) : il fonctionne sans connexion Internet.</li>
          <li>• Les ajustements que tu y fais restent enregistrés dans ton navigateur seulement — ils ne modifient jamais l&apos;app.</li>
          <li>• Il est régénéré automatiquement chaque dimanche ; l&apos;administrateur peut aussi le mettre à jour sur demande.</li>
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
          <li>• Si une de ces pages semble vide ou qu&apos;il y manque des joueurs de façon inattendue, il s&apos;agit le plus souvent d&apos;un <strong>accroc passager</strong> avec la source externe plutôt que d&apos;une vraie perte de données.</li>
          <li>• Sur Statistiques LNH et AHL, un bandeau rouge avec un bouton <strong>Recharger la page</strong> apparaît automatiquement dans ce cas.</li>
          <li>• Ailleurs, un simple rechargement de la page règle généralement le problème.</li>
          <li>• Si ça persiste après quelques essais, utilise <strong>Signaler un problème</strong> (menu de ton compte).</li>
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
        <li>• Une fois la saison officiellement démarrée par l&apos;administrateur, tout mouvement soumis dans Gestion d&apos;effectifs doit laisser ton alignement à exactement ces nombres — un sous-effectif est tout aussi bloquant qu&apos;un dépassement (c&apos;est pour ça que les mouvements groupés existent : libérer et activer en un seul geste, sans jamais passer par un état invalide).</li>
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
        <li>• Le cap du pool est fixé par l&apos;administrateur. Il est calculé à partir du plafond salarial LNH de la saison, multiplié par un facteur (généralement 1,24–1,25) et arrondi au million supérieur.</li>
        <li>• Le facteur et le plafond LNH peuvent être ajustés par l&apos;administrateur avant ou pendant une saison.</li>
        <li>• Seuls les joueurs <strong>actifs</strong> et <strong>réservistes</strong> comptent dans la masse salariale.</li>
        <li>• Les joueurs en <strong>LTIR</strong> et dans la <strong>banque de recrues</strong> ne comptent <em>pas</em> dans la masse.</li>
        <li>• Un joueur <strong>RFA</strong> sans contrat pour la saison compte une masse <strong>estimée</strong> (dernier contrat connu × un facteur, généralement 1,20), affichée « RFA (estimé) », pour éviter qu&apos;il compte 0 $ en attendant sa signature. Un joueur <strong>UFA</strong> sans contrat ne compte pas dans la masse (« UFA (sans contrat) ») — si ce joueur signe ensuite un vrai contrat qui te fait dépasser le cap, tu as un délai (par défaut 7 jours) pour t&apos;ajuster toi-même avant que l&apos;administrateur ne doive intervenir.</li>
      </ul>
    ),
  },
  {
    id: 'regl-ltir',
    tab: 'reglements',
    title: 'Blessures et LTIR (admissibilité)',
    keywords: 'ltir ir blessure blesse admissible admissibilite day to day cbs espn source date retour tampon demande approbation admin 14 jours compteur',
    href: '/statistiques/blessures',
    content: <LtirRulesContent />,
  },
  {
    id: 'regl-recrues',
    tab: 'reglements',
    title: 'Banque de recrues & protection',
    keywords: 'recrue banque draft repeche elc agent libre protection saisons contrat masse salariale expiration automatique activer liberer',
    content: (
      <ul className="text-sm text-gray-700 space-y-1.5">
        <li>• Un joueur <strong>repêché</strong> par le pool reste protégé pendant <strong>5 saisons</strong> après son année de repêchage, peu importe la durée de son contrat d&apos;entrée (ELC) — la fin de l&apos;ELC ne fait pas perdre la protection avant ces 5 ans. Tu gardes donc l&apos;option de le laisser en banque même une fois son ELC terminé.</li>
        <li>• Un joueur signé comme <strong>agent libre</strong> reste protégé tant que son ELC est actif, sans limite de nombre de saisons (pas de fenêtre de 5 ans pour lui).</li>
        <li>• Un joueur en banque de recrues ne compte pas dans la masse salariale, même s&apos;il joue dans la LNH.</li>
        <li>• Quand la protection expire <strong>pour de vrai</strong> (5 ans écoulés pour un repêché, ELC terminé pour un agent libre), la perte du statut recrue est <strong>automatique</strong> : s&apos;il était déjà actif ou réserviste, il reste où il est ; s&apos;il était encore en banque, il est activé automatiquement. Aucune action requise de ta part à ce moment précis.</li>
        <li>• À chaque <strong>changement de saison</strong>, tout joueur actif ou réserviste encore protégé comme recrue est <strong>retourné automatiquement en banque</strong> — ça te montre d&apos;un coup d&apos;œil qui y est encore admissible. Réactive ceux que tu veux garder pendant la pré-saison (Signatures des agents libres).</li>
        <li>• Tu peux toi-même <strong>activer ou remettre en banque</strong> n&apos;importe quelle recrue encore protégée en tout temps, depuis Gestion d&apos;effectifs ou Signatures des agents libres (ce dernier seulement avant le début de la saison).</li>
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
        <li>• Tu proposes toi-même les <strong>échanges entre poolers</strong> (joueurs, choix de repêchage) via l&apos;onglet <strong>Échanges</strong> de Gestion d&apos;effectifs — voir les règles détaillées plus bas. L&apos;admin garde un droit d&apos;approbation sur chacun.</li>
        <li>• Les ajustements sur ton propre alignement (actif/réserviste, libération, recrues) se font en libre-service via <strong>Gestion d&apos;effectifs</strong> une fois la saison démarrée, ou via <strong>Signatures des agents libres</strong> avant le début de la saison.</li>
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
        <li>• Réclamable jusqu&apos;à <strong>23 h 59 (heure de l&apos;Est) du 2e jour suivant</strong> la libération (délai configurable par l&apos;administrateur) — attribué le lendemain de cette date limite.</li>
        <li>• En cas de réclamations multiples sur le même joueur, seule la priorité tranche.</li>
        <li>• Une fois gagné, tu as <strong>48 h</strong> pour l&apos;ajouter toi-même à ton alignement, sinon l&apos;administrateur doit intervenir manuellement.</li>
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
        <li>• Le repêchage se déroule ensuite <strong>à tour de rôle</strong>, selon un ordre déterminé par l&apos;administrateur — tu peux signer un agent libre pendant ton tour ou <strong>passer</strong>.</li>
        <li>• Actif ↔ réserviste et l&apos;activation/retrait de tes recrues de banque restent toujours permis, peu importe la phase en cours.</li>
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

export default function AideTabs({ ltirSettings }: { ltirSettings: LtirSettings }) {
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
    <LtirSettingsContext.Provider value={ltirSettings}>
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
                Cap Crunch est une application web progressive (PWA). Tu peux l&apos;installer sur ton appareil pour y accéder comme une application normale, sans passer par un navigateur.
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
    </LtirSettingsContext.Provider>
  )
}
