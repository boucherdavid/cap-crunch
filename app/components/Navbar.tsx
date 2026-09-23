'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function HamburgerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase()
  const colors = [
    'bg-blue-600', 'bg-emerald-600', 'bg-violet-600',
    'bg-orange-600', 'bg-rose-600', 'bg-teal-600', 'bg-indigo-600', 'bg-amber-600',
  ]
  const idx = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % colors.length
  return (
    <div className={`w-8 h-8 rounded-full ${colors[idx]} flex items-center justify-center text-white text-xs font-bold select-none`}>
      {initials}
    </div>
  )
}

// ─── Arborescence de navigation ─────────────────────────────────────────────
// Source unique pour la sidebar desktop ET le tiroir mobile (contrairement à
// l'ancien menu horizontal, qui dupliquait deux listes de liens séparées) —
// David, 2026-09-23, suite à un retour de pooler : regroupement "LNH" pas
// clair (Statistiques/Contrats/Blessures séparés), "Ressources" trop vague
// (scindé en Communauté/Aide), Calendrier déplacé sous Alignements, "Mon
// équipe"/"Équipes" renommés pour être plus explicites.

type NavLeaf = { label: string; href: string; auth?: boolean }
type NavSubgroup = { label: string; items: NavLeaf[] }
type NavGroup = {
  id: string
  label: string
  href?: string            // présent + pas d'items/subgroups => lien autonome (pas de chevron)
  items?: NavLeaf[]
  subgroups?: NavSubgroup[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'mon-equipe',
    label: 'Mon équipe',
    items: [
      { label: 'Mon alignement', href: '/dashboard', auth: true },
      { label: "Gestion d'effectifs", href: '/gestion-effectifs', auth: true },
      { label: 'Simulation', href: '/simulation', auth: true },
    ],
  },
  {
    id: 'le-pool',
    label: 'Le pool',
    items: [
      { label: 'Tous les alignements', href: '/poolers' },
      { label: 'Journal des transactions', href: '/journal-transactions' },
    ],
  },
  {
    id: 'classement',
    label: 'Classement du pool',
    items: [
      { label: 'Saison complète', href: '/classement' },
      { label: 'Hebdomadaire', href: '/classement/hebdomadaire' },
      { label: 'Mensuel', href: '/classement/mensuel' },
    ],
  },
  { id: 'calendrier', label: 'Calendrier LNH', href: '/calendrier' },
  {
    id: 'statistiques',
    label: 'Statistiques',
    items: [
      { label: 'LNH', href: '/statistiques' },
      { label: 'Projections', href: '/statistiques/projections' },
      { label: 'AHL', href: '/statistiques/ahl' },
    ],
  },
  { id: 'blessures', label: 'Blessures', href: '/statistiques/blessures' },
  { id: 'contrats', label: 'Contrats LNH', href: '/joueurs' },
  {
    id: 'prospects-lnh',
    label: 'Prospects LNH',
    items: [
      { label: 'Classement pré-repêchage', href: '/draft-center' },
      { label: 'Repêchage LNH', href: '/repechage' },
    ],
  },
  {
    id: 'repechage-annuel',
    label: 'Repêchage annuel',
    items: [
      { label: 'Repêchage des recrues', href: '/repechage-recrues' },
      { label: 'Signatures des agents libres', href: '/repechage-agents-libres', auth: true },
    ],
  },
  {
    id: 'communaute',
    label: 'Communauté',
    items: [
      { label: 'Babillard', href: '/babillard' },
      { label: 'Planification', href: '/planification' },
    ],
  },
  {
    id: 'aide',
    label: 'Aide',
    items: [
      { label: 'Aide & Règlements', href: '/aide' },
      { label: 'À propos', href: '/a-propos' },
    ],
  },
]

const ADMIN_GROUP: NavGroup = {
  id: 'admin',
  label: 'Admin',
  subgroups: [
    {
      label: 'Opérations courantes',
      items: [
        { label: 'Gestion des effectifs', href: '/admin/effectifs' },
        { label: 'Communauté', href: '/admin/communaute' },
        { label: 'Gestion du pool', href: '/admin/pool' },
        { label: 'Mise à jour de données', href: '/admin/donnees' },
      ],
    },
    {
      label: 'Mise en place saisonnière',
      items: [
        { label: 'Nouvelle saison', href: '/admin/nouvelle-saison' },
        { label: 'Initialisation', href: '/admin/init' },
        { label: 'Repêchage recrues', href: '/admin/repechage' },
      ],
    },
  ],
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

function groupHrefs(group: NavGroup): string[] {
  return [
    ...(group.href ? [group.href] : []),
    ...(group.items?.map(i => i.href) ?? []),
    ...(group.subgroups?.flatMap(sg => sg.items.map(i => i.href)) ?? []),
  ]
}

function groupIsActive(pathname: string, group: NavGroup): boolean {
  return groupHrefs(group).some(h => isActive(pathname, h))
}

// ─── Sous-composants de l'arbre ─────────────────────────────────────────────

function TreeLeaf({ leaf, pathname, userName, onNavigate }: {
  leaf: NavLeaf; pathname: string; userName: string | null; onNavigate: () => void
}) {
  if (leaf.auth && !userName) return null
  const active = isActive(pathname, leaf.href)
  return (
    <Link
      href={leaf.href}
      onClick={onNavigate}
      className={`block pl-8 pr-3 py-1.5 rounded text-sm transition-colors ${
        active ? 'bg-pool-navy-light text-white font-medium' : 'text-pool-light hover:bg-pool-navy-light hover:text-white'
      }`}
    >
      {leaf.label}
    </Link>
  )
}

function TreeGroup({ group, pathname, userName, expanded, onToggle, onNavigate, badge, badgeTitle }: {
  group: NavGroup
  pathname: string
  userName: string | null
  expanded: boolean
  onToggle: () => void
  onNavigate: () => void
  badge?: number
  badgeTitle?: string
}) {
  // Lien autonome (Blessures, Contrats) — pas de chevron ni d'enfants.
  if (group.href) {
    const active = isActive(pathname, group.href)
    return (
      <Link
        href={group.href}
        onClick={onNavigate}
        className={`flex items-center px-3 py-2 rounded text-sm font-medium transition-colors ${
          active ? 'bg-pool-navy-light text-white' : 'text-pool-light hover:bg-pool-navy-light hover:text-white'
        }`}
      >
        {group.label}
      </Link>
    )
  }

  const active = groupIsActive(pathname, group)
  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm font-medium transition-colors ${
          active ? 'text-white' : 'text-pool-light hover:bg-pool-navy-light hover:text-white'
        }`}
      >
        <span className="flex items-center gap-1.5">
          {group.label}
          {!!badge && badge > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full" title={badgeTitle}>
              {badge}
            </span>
          )}
        </span>
        <Chevron open={expanded} />
      </button>
      {expanded && (
        <div className="flex flex-col gap-0.5 mt-0.5 mb-1">
          {group.items?.map(leaf => (
            <TreeLeaf key={leaf.href} leaf={leaf} pathname={pathname} userName={userName} onNavigate={onNavigate} />
          ))}
          {group.subgroups?.map(sg => (
            <div key={sg.label} className="mt-1">
              <div className="px-8 py-1 text-xs text-pool-silver uppercase tracking-wide font-semibold">{sg.label}</div>
              {sg.items.map(leaf => (
                <TreeLeaf key={leaf.href} leaf={leaf} pathname={pathname} userName={userName} onNavigate={onNavigate} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NavTree({
  pathname, userName, effectiveIsAdmin, expanded, onToggle, onNavigate, adminBadge, adminBadgeTitle,
}: {
  pathname: string
  userName: string | null
  effectiveIsAdmin: boolean
  expanded: Set<string>
  onToggle: (id: string) => void
  onNavigate: () => void
  adminBadge: number
  adminBadgeTitle: string
}) {
  const groups = effectiveIsAdmin ? [...NAV_GROUPS, ADMIN_GROUP] : NAV_GROUPS
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      <Link
        href="/"
        onClick={onNavigate}
        className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
          pathname === '/' ? 'bg-pool-navy-light text-white' : 'text-pool-light hover:bg-pool-navy-light hover:text-white'
        }`}
      >
        Accueil
      </Link>
      {groups.map(group => (
        <TreeGroup
          key={group.id}
          group={group}
          pathname={pathname}
          userName={userName}
          expanded={expanded.has(group.id)}
          onToggle={() => onToggle(group.id)}
          onNavigate={onNavigate}
          badge={group.id === 'admin' ? adminBadge : undefined}
          badgeTitle={group.id === 'admin' ? adminBadgeTitle : undefined}
        />
      ))}
    </nav>
  )
}

// ─── Composant principal ────────────────────────────────────────────────────

export default function Navbar({
  initialUserName,
  initialIsAdmin,
  initialUnreadCount = 0,
  initialUnreadNotifCount = 0,
}: {
  initialUserName: string | null
  initialIsAdmin: boolean
  initialUnreadCount?: number
  initialUnreadNotifCount?: number
}) {
  const pathname = usePathname()
  const supabase = createClient()

  const [userName, setUserName] = useState<string | null>(initialUserName)
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin)
  const [isPoolerView, setIsPoolerView] = useState(false)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [unreadNotifCount, setUnreadNotifCount] = useState(initialUnreadNotifCount)
  const adminBadgeTitle = [
    unreadCount > 0 ? `${unreadCount} message${unreadCount > 1 ? 's' : ''} non lu${unreadCount > 1 ? 's' : ''} (Communication)` : null,
    unreadNotifCount > 0 ? `${unreadNotifCount} notification${unreadNotifCount > 1 ? 's' : ''} non lue${unreadNotifCount > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ')

  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const effectiveIsAdmin = isAdmin && !isPoolerView
  const allGroups = effectiveIsAdmin ? [...NAV_GROUPS, ADMIN_GROUP] : NAV_GROUPS
  // Groupe(s) contenant la page courante déplié(s) par défaut — le reste de l'arbre reste
  // replié tant qu'on ne clique pas dessus (David voulait une vraie arborescence, pas tout
  // ouvert d'un coup).
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(allGroups.filter(g => !g.href && groupIsActive(pathname, g)).map(g => g.id))
  )
  const toggleGroup = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  useEffect(() => {
    if (
      localStorage.getItem('pwaInstalled') === '1' ||
      window.matchMedia('(display-mode: standalone)').matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true
    ) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).__pwaPrompt) setInstallPrompt((window as any).__pwaPrompt)
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    const onInstalled = () => { localStorage.setItem('pwaInstalled', '1'); setInstallPrompt(null) }
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    setProfileOpen(false)
  }, [pathname])

  // Déplie automatiquement le groupe de la nouvelle page courante après une navigation
  // (ex: clic sur un lien autonome comme Blessures ne doit pas replier Alignements si on y
  // retourne ensuite) — s'ajoute à l'état existant plutôt que de l'écraser.
  useEffect(() => {
    setExpanded(prev => {
      const active = allGroups.filter(g => !g.href && groupIsActive(pathname, g)).map(g => g.id)
      if (active.every(id => prev.has(id))) return prev
      return new Set([...prev, ...active])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    setUserName(initialUserName)
    setIsAdmin(initialIsAdmin)
  }, [initialUserName, initialIsAdmin])

  useEffect(() => {
    setUnreadCount(initialUnreadCount)
    setUnreadNotifCount(initialUnreadNotifCount)
  }, [initialUnreadCount, initialUnreadNotifCount])

  useEffect(() => {
    setIsPoolerView(localStorage.getItem('poolerView') === '1')
  }, [])

  // Verrouille le scroll de la page derrière le tiroir mobile ouvert.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const togglePoolerView = () => {
    const next = !isPoolerView
    setIsPoolerView(next)
    localStorage.setItem('poolerView', next ? '1' : '0')
  }

  const handleInstall = async () => {
    if (!installPrompt) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (installPrompt as any).prompt()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { outcome } = await (installPrompt as any).userChoice
    if (outcome === 'accepted') localStorage.setItem('pwaInstalled', '1')
    setInstallPrompt(null)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const profileLinkClass = (href: string) =>
    `block px-4 py-2 text-sm transition-colors ${
      isActive(pathname, href) ? 'text-blue-600 font-medium bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
    }`

  const adminBadgeCount = unreadCount + unreadNotifCount

  return (
    <>
      {/* Barre du haut — toujours visible, pleine largeur */}
      <div className="bg-pool-navy shadow sticky top-0 z-40">
        {isPoolerView && (
          <div className="bg-amber-400 text-amber-900 text-xs font-semibold text-center py-1 px-4 flex items-center justify-center gap-3">
            <span>Mode vue pooler actif — menu admin masqué</span>
            <button onClick={togglePoolerView} className="underline hover:no-underline">Revenir en mode admin</button>
          </div>
        )}
        <div className="px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <button
                className="md:hidden text-white p-1 -ml-1 rounded hover:bg-pool-navy-light transition-colors"
                onClick={() => setMenuOpen(v => !v)}
                aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              >
                {menuOpen ? <CloseIcon /> : <HamburgerIcon />}
              </button>
              <Link href="/" className="flex items-center gap-2 text-white font-bold text-sm hover:opacity-80 transition-opacity">
                <Image src="/icons/icon-192x192.png" alt="Logo" width={32} height={32} className="rounded" />
                <span className="hidden sm:inline">Cap Crunch</span>
              </Link>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {installPrompt && (
                <button onClick={handleInstall}
                  className="text-pool-silver hover:text-white text-sm border border-pool-silver rounded px-2 py-1 transition-colors">
                  Installer
                </button>
              )}

              {userName ? (
                <div className="relative" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen(v => !v)}
                    className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-white/30 transition-all"
                    aria-label="Menu du compte"
                    aria-expanded={profileOpen}
                  >
                    <Avatar name={userName} />
                  </button>
                  {profileOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-50 overflow-hidden">
                      <div className="px-4 py-2.5 border-b bg-gray-50">
                        <p className="text-xs text-gray-500">Connecté en tant que</p>
                        <p className="text-sm font-semibold text-gray-800 truncate">{userName}</p>
                      </div>
                      <div className="py-1">
                        <Link href="/compte" className={profileLinkClass('/compte')}>Mon compte</Link>
                        <Link href="/signaler" className={profileLinkClass('/signaler')}>Signaler un problème</Link>
                      </div>
                      {isAdmin && (
                        <div className="py-1 border-t">
                          <button
                            onClick={togglePoolerView}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isPoolerView ? 'bg-amber-400' : 'bg-gray-300'}`} />
                            {isPoolerView ? 'Revenir en mode admin' : 'Vue pooler'}
                          </button>
                        </div>
                      )}
                      <div className="py-1 border-t">
                        <button onClick={handleLogout}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                          Déconnexion
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link href="/login" className="text-pool-silver hover:text-white text-sm transition-colors">
                  Connexion
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar desktop — persistante, sous la barre du haut */}
      <aside className="hidden md:block fixed top-14 left-0 bottom-0 w-64 bg-pool-navy overflow-y-auto z-30">
        <NavTree
          pathname={pathname}
          userName={userName}
          effectiveIsAdmin={effectiveIsAdmin}
          expanded={expanded}
          onToggle={toggleGroup}
          onNavigate={() => {}}
          adminBadge={adminBadgeCount}
          adminBadgeTitle={adminBadgeTitle}
        />
      </aside>

      {/* Tiroir mobile */}
      <div
        className={`md:hidden fixed inset-0 bg-black/40 z-40 transition-opacity ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`md:hidden fixed top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-pool-navy z-50 overflow-y-auto shadow-xl transition-transform duration-200 ease-out ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-pool-navy-light">
          <Link href="/" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-white font-bold text-sm">
            <Image src="/icons/icon-192x192.png" alt="Logo" width={28} height={28} className="rounded" />
            Cap Crunch
          </Link>
          <button
            className="text-white p-1 rounded hover:bg-pool-navy-light transition-colors"
            onClick={() => setMenuOpen(false)}
            aria-label="Fermer le menu"
          >
            <CloseIcon />
          </button>
        </div>
        <NavTree
          pathname={pathname}
          userName={userName}
          effectiveIsAdmin={effectiveIsAdmin}
          expanded={expanded}
          onToggle={toggleGroup}
          onNavigate={() => setMenuOpen(false)}
          adminBadge={adminBadgeCount}
          adminBadgeTitle={adminBadgeTitle}
        />
        {userName && (
          <div className="border-t border-pool-navy-light p-2 mt-1">
            <div className="px-3 py-1 text-pool-silver text-xs">{userName}</div>
            <Link href="/compte" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded text-sm font-medium text-pool-light hover:bg-pool-navy-light hover:text-white transition-colors">Mon compte</Link>
            <Link href="/signaler" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded text-sm font-medium text-pool-light hover:bg-pool-navy-light hover:text-white transition-colors">Signaler un problème</Link>
            {isAdmin && (
              <button onClick={togglePoolerView}
                className="block w-full text-left px-3 py-2 rounded text-sm font-medium text-amber-300 hover:bg-pool-navy-light transition-colors">
                {isPoolerView ? 'Revenir en mode admin' : 'Vue pooler'}
              </button>
            )}
            <button onClick={handleLogout}
              className="block w-full text-left px-3 py-2 rounded text-sm font-medium text-red-400 hover:bg-pool-navy-light hover:text-red-300 transition-colors">
              Déconnexion
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
