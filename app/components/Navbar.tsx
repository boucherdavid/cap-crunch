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
    <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

type DropdownKey = 'pool-saison' | 'statistiques' | 'repechage' | 'series' | 'admin' | 'profile' | null

export default function Navbar({
  initialUserName,
  initialIsAdmin,
  initialUnreadCount = 0,
  initialUnreadNotifCount = 0,
  initialNewPlayoffActive = false,
  navPlanificationOnly = false,
}: {
  initialUserName: string | null
  initialIsAdmin: boolean
  initialUnreadCount?: number
  initialUnreadNotifCount?: number
  initialNewPlayoffActive?: boolean
  navPlanificationOnly?: boolean
}) {
  const pathname = usePathname()
  const supabase = createClient()

  const [userName, setUserName] = useState<string | null>(initialUserName)
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin)
  const [isPoolerView, setIsPoolerView] = useState(false)
  const [unreadCount] = useState(initialUnreadCount)
  const [unreadNotifCount] = useState(initialUnreadNotifCount)
  const newPlayoffActive = initialNewPlayoffActive
  const [menuOpen, setMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null)
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null)
  const navRef = useRef<HTMLDivElement>(null)

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
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    setOpenDropdown(null)
  }, [pathname])

  useEffect(() => {
    setUserName(initialUserName)
    setIsAdmin(initialIsAdmin)
  }, [initialUserName, initialIsAdmin])

  useEffect(() => {
    setIsPoolerView(localStorage.getItem('poolerView') === '1')
  }, [])

  const effectiveIsAdmin = isAdmin && !isPoolerView

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

  const toggle = (key: DropdownKey) => setOpenDropdown(prev => prev === key ? null : key)

  const isActive = (...paths: string[]) =>
    paths.some(p => pathname === p || pathname.startsWith(p + '/'))

  const navBtnClass = (active: boolean) =>
    `flex items-center gap-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
      active ? 'bg-pool-navy-light text-white' : 'text-pool-light hover:bg-pool-navy-light hover:text-white'
    }`

  const dropdownLinkClass = (href: string) =>
    `block px-4 py-2 text-sm transition-colors ${
      isActive(href) ? 'text-blue-600 font-medium bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
    }`

  const mobileLinkClass = (href: string) =>
    `block px-3 py-2 rounded text-sm font-medium transition-colors ${
      isActive(href) ? 'bg-pool-navy-light text-white' : 'text-pool-light hover:bg-pool-navy-light hover:text-white'
    }`

  const MobileSection = ({ label }: { label: string }) => (
    <div className="px-3 pt-3 pb-0.5 text-xs text-pool-silver uppercase tracking-wide font-semibold">{label}</div>
  )

  return (
    <nav className="bg-pool-navy shadow" ref={navRef}>
      {isPoolerView && (
        <div className="bg-amber-400 text-amber-900 text-xs font-semibold text-center py-1 px-4 flex items-center justify-center gap-3">
          <span>Mode vue pooler actif — menu admin masqué</span>
          <button onClick={togglePoolerView} className="underline hover:no-underline">Revenir en mode admin</button>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">

          {/* Gauche : logo + liens */}
          <div className="flex items-center gap-1 min-w-0">
            <Link href="/" className="flex items-center gap-2 text-white font-bold text-sm mr-3 shrink-0 hover:opacity-80 transition-opacity">
              <Image src="/icons/icon-192x192.png" alt="Logo" width={32} height={32} className="rounded" />
              <span className="hidden lg:inline">Accueil</span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
            {navPlanificationOnly ? (
              <Link href="/planification" className={navBtnClass(isActive('/planification'))}>
                Planification
              </Link>
            ) : (
            <>

              {/* Pool Saison */}
              <div className="relative">
                <button onClick={() => toggle('pool-saison')}
                  className={navBtnClass(isActive('/dashboard', '/transactions', '/classement', '/poolers', '/gestion-effectifs'))}>
                  Pool Saison <Chevron open={openDropdown === 'pool-saison'} />
                </button>
                {openDropdown === 'pool-saison' && (
                  <div className="absolute left-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-100 z-50 py-1">
                    {userName && <Link href="/dashboard"            className={dropdownLinkClass('/dashboard')}>Mon équipe</Link>}
                    <Link href="/poolers"                          className={dropdownLinkClass('/poolers')}>Équipes</Link>
                    <Link href="/transactions"                     className={dropdownLinkClass('/transactions')}>Transactions</Link>
                    {userName && <Link href="/gestion-effectifs"  className={dropdownLinkClass('/gestion-effectifs')}>Gestion d&apos;effectifs</Link>}
                    <div className="border-t my-1" />
                    <div className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Classement</div>
                    <Link href="/classement" className={dropdownLinkClass('/classement')}>Saison complète</Link>
                    <span className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 cursor-default">
                      Hebdomadaire <span className="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">À venir</span>
                    </span>
                    <span className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 cursor-default">
                      Mensuel <span className="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">À venir</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Statistiques */}
              <div className="relative">
                <button onClick={() => toggle('statistiques')}
                  className={navBtnClass(isActive('/statistiques'))}>
                  Statistiques <Chevron open={openDropdown === 'statistiques'} />
                </button>
                {openDropdown === 'statistiques' && (
                  <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-100 z-50 py-1">
                    <Link href="/statistiques" className={dropdownLinkClass('/statistiques')}>LNH</Link>
                    <span className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 cursor-default">
                      AHL <span className="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">À venir</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Contrats LNH */}
              <Link href="/joueurs" className={navBtnClass(isActive('/joueurs'))}>
                Contrats LNH
              </Link>

              {/* Repêchage */}
              <div className="relative">
                <button onClick={() => toggle('repechage')}
                  className={navBtnClass(isActive('/repechage', '/repechage-recrues', '/draft-center'))}>
                  {'Repêchage'} <Chevron open={openDropdown === 'repechage'} />
                </button>
                {openDropdown === 'repechage' && (
                  <div className="absolute left-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-100 z-50 py-1">
                    <Link href="/draft-center" className={dropdownLinkClass('/draft-center')}>{'Classement des prospects'}</Link>
                    <Link href="/repechage" className={dropdownLinkClass('/repechage')}>{'Repêchage LNH'}</Link>
                    <Link href="/repechage-recrues" className={dropdownLinkClass('/repechage-recrues')}>{'Repêchage recrues'}</Link>
                  </div>
                )}
              </div>

              {/* Calendrier */}
              <Link href="/calendrier" className={navBtnClass(isActive('/calendrier'))}>
                Calendrier
              </Link>

              {/* Planification */}
              <Link href="/planification" className={navBtnClass(isActive('/planification'))}>
                Planification
              </Link>

              {/* Pool Séries — masqué hors saison de séries active */}
              {newPlayoffActive && (
              <div className="relative">
                <button onClick={() => toggle('series')}
                  className={navBtnClass(isActive('/gestion-series', '/classement-series'))}>
                  {'Pool S\u00e9ries'} <Chevron open={openDropdown === 'series'} />
                </button>
                {openDropdown === 'series' && (
                  <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-100 z-50 py-1">
                    {userName && <Link href="/gestion-series" className={dropdownLinkClass('/gestion-series')}>Choix des joueurs</Link>}
                    <Link href="/classement-series" className={dropdownLinkClass('/classement-series')}>Classement</Link>
                    <Link href="/resultats" className={dropdownLinkClass('/resultats')}>Résultats</Link>
                    {effectiveIsAdmin &&<div className="border-t my-1" />}
                    {effectiveIsAdmin &&<Link href="/admin/series" className={dropdownLinkClass('/admin/series')}>Gestion/Création Pool des séries</Link>}
                  </div>
                )}
              </div>
              )}

              {/* Admin */}
              {effectiveIsAdmin &&(
                <div className="relative">
                  <button onClick={() => toggle('admin')}
                    className={navBtnClass(isActive('/admin'))}>
                    <span className="text-xs bg-blue-500 text-white rounded px-1 py-0.5 mr-1">A</span>
                    Admin
                    {(unreadCount > 0 || unreadNotifCount > 0) && (
                      <span className="ml-1 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {unreadCount + unreadNotifCount}
                      </span>
                    )}
                    <Chevron open={openDropdown === 'admin'} />
                  </button>
                  {openDropdown === 'admin' && (
                    <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-100 z-50 py-1">
                      <Link href="/admin/pool"      className={dropdownLinkClass('/admin/pool')}>Gestion du pool</Link>
                      <Link href="/admin/init"      className={dropdownLinkClass('/admin/init')}>Initialisation</Link>
                      <Link href="/admin/repechage" className={dropdownLinkClass('/admin/repechage')}>{'Repêchage recrues'}</Link>
                      <Link href="/admin/effectifs" className={dropdownLinkClass('/admin/effectifs')}>{'Gestion des effectifs'}</Link>
                      <div className="border-t my-1" />
                      <Link href="/admin/series" className={dropdownLinkClass('/admin/series')}>Pool des séries</Link>
                      <div className="border-t my-1" />
                      <Link href="/admin/pool?tab=communication" className={dropdownLinkClass('/admin/pool')}>
                        <span className="flex items-center justify-between">
                          Messages
                          {unreadCount > 0 && <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
                        </span>
                      </Link>
                      <Link href="/admin/pool?tab=suivi" className={dropdownLinkClass('/admin/pool')}>Suivi</Link>
                    </div>
                  )}
                </div>
              )}

            </>
            )}
            </div>
          </div>

          {/* Droite : installer + avatar */}
          <div className="flex items-center gap-2 shrink-0">
            {installPrompt && (
              <button onClick={handleInstall}
                className="text-pool-silver hover:text-white text-sm border border-pool-silver rounded px-2 py-1 transition-colors">
                Installer
              </button>
            )}

            {userName ? (
              <div className="relative">
                <button
                  onClick={() => toggle('profile')}
                  className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-white/30 transition-all"
                  aria-label="Menu du compte"
                  aria-expanded={openDropdown === 'profile'}
                >
                  <Avatar name={userName} />
                </button>
                {openDropdown === 'profile' && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-50 overflow-hidden">
                    <div className="px-4 py-2.5 border-b bg-gray-50">
                      <p className="text-xs text-gray-500">Connecté en tant que</p>
                      <p className="text-sm font-semibold text-gray-800 truncate">{userName}</p>
                    </div>
                    <div className="py-1">
                      <Link href="/compte"   className={dropdownLinkClass('/compte')}>Mon compte</Link>
                      <Link href="/aide"     className={dropdownLinkClass('/aide')}>Aide &amp; Règlements</Link>
                      <Link href="/signaler" className={dropdownLinkClass('/signaler')}>Signaler un problème</Link>
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
                        {'D\u00e9connexion'}
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

            {/* Hamburger mobile */}
            <button
              className="md:hidden text-white p-1 rounded hover:bg-pool-navy-light transition-colors"
              onClick={() => setMenuOpen(v => !v)}
              aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            >
              {menuOpen ? <CloseIcon /> : <HamburgerIcon />}
            </button>
          </div>
        </div>

        {/* Menu mobile */}
        {menuOpen && (
          <div className="md:hidden border-t border-pool-navy-light py-2 flex flex-col gap-0.5">
          {navPlanificationOnly ? (
            <Link href="/planification" className={mobileLinkClass('/planification')}>Planification</Link>
          ) : (
          <>
            <MobileSection label="Pool Saison" />
            {userName && <Link href="/dashboard"           className={mobileLinkClass('/dashboard')}>Mon équipe</Link>}
            <Link href="/poolers"                          className={mobileLinkClass('/poolers')}>Équipes</Link>
            <Link href="/transactions"                     className={mobileLinkClass('/transactions')}>Transactions</Link>
            {userName && <Link href="/gestion-effectifs"  className={mobileLinkClass('/gestion-effectifs')}>Gestion d&apos;effectifs</Link>}
            <Link href="/classement"                       className={mobileLinkClass('/classement')}>Classement</Link>

            <MobileSection label="Statistiques" />
            <Link href="/statistiques" className={mobileLinkClass('/statistiques')}>LNH</Link>
            <span className="px-3 py-2 text-sm text-pool-silver opacity-50">AHL (à venir)</span>

            <MobileSection label="Autre" />
            <Link href="/joueurs"    className={mobileLinkClass('/joueurs')}>Contrats LNH</Link>
            <Link href="/draft-center" className={mobileLinkClass('/draft-center')}>{'Classement des prospects'}</Link>
            <Link href="/repechage"  className={mobileLinkClass('/repechage')}>{'Rep\u00eachage LNH'}</Link>
            <Link href="/repechage-recrues" className={mobileLinkClass('/repechage-recrues')}>{'Rep\u00eachage recrues'}</Link>
            <Link href="/calendrier" className={mobileLinkClass('/calendrier')}>Calendrier</Link>
            <Link href="/planification" className={mobileLinkClass('/planification')}>Planification</Link>

            {newPlayoffActive && (<>
            <MobileSection label={'Pool S\u00e9ries'} />
            {userName && <Link href="/gestion-series" className={mobileLinkClass('/gestion-series')}>Choix des joueurs</Link>}
            <Link href="/classement-series" className={mobileLinkClass('/classement-series')}>Classement</Link>
            <Link href="/resultats" className={mobileLinkClass('/resultats')}>Résultats</Link>
            {effectiveIsAdmin &&<Link href="/admin/series" className={mobileLinkClass('/admin/series')}>{'Gestion/Cr\u00e9ation Pool des s\u00e9ries'}</Link>}
            </>)}
          </>
          )}

            {userName && (
              <div className="mt-1 pt-1 border-t border-pool-navy-light flex flex-col gap-0.5">
                <MobileSection label="Compte" />
                <Link href="/compte"   className={mobileLinkClass('/compte')}>Mon compte</Link>
                <Link href="/aide"     className={mobileLinkClass('/aide')}>Aide &amp; Règlements</Link>
                <Link href="/signaler" className={mobileLinkClass('/signaler')}>Signaler un problème</Link>
                {effectiveIsAdmin && !navPlanificationOnly &&<MobileSection label="Admin" />}
                {effectiveIsAdmin && !navPlanificationOnly &&<Link href="/admin/pool" className={mobileLinkClass('/admin/pool')}>Gestion du pool</Link>}
                {effectiveIsAdmin && !navPlanificationOnly &&<Link href="/admin/init"      className={mobileLinkClass('/admin/init')}>Initialisation</Link>}
                {effectiveIsAdmin && !navPlanificationOnly &&<Link href="/admin/effectifs" className={mobileLinkClass('/admin/effectifs')}>{'Gestion des effectifs'}</Link>}
                {effectiveIsAdmin && !navPlanificationOnly &&<Link href="/admin/series"       className={mobileLinkClass('/admin/series')}>Pool des séries</Link>}
                {effectiveIsAdmin && !navPlanificationOnly &&(
                  <Link href="/admin/pool?tab=communication" className={mobileLinkClass('/admin/pool')}>
                    <span className="flex items-center justify-between">
                      Messages
                      {unreadCount > 0 && <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
                    </span>
                  </Link>
                )}
                {effectiveIsAdmin && !navPlanificationOnly &&<Link href="/admin/pool?tab=suivi" className={mobileLinkClass('/admin/pool')}>Suivi</Link>}
                {isAdmin && (
                  <button onClick={togglePoolerView}
                    className="block text-left px-3 py-2 rounded text-sm font-medium text-amber-300 hover:bg-pool-navy-light transition-colors">
                    {isPoolerView ? 'Revenir en mode admin' : 'Vue pooler'}
                  </button>
                )}
                <button onClick={handleLogout}
                  className="block text-left px-3 py-2 rounded text-sm font-medium text-red-400 hover:bg-pool-navy-light hover:text-red-300 transition-colors">
                  {'D\u00e9connexion'}
                </button>
                <div className="px-3 py-1 text-pool-silver text-xs">{userName}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
