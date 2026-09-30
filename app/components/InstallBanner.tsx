'use client'

import { useEffect, useState } from 'react'

export default function InstallBanner() {
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [prompt, setPrompt] = useState<Event | null>(null)

  useEffect(() => {
    // Déjà lancé en mode app installée
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true
    ) return

    // Déjà installée (marqué lors d'une session précédente)
    if (localStorage.getItem('pwaInstalled') === '1') return

    // Bandeau fermé définitivement
    if (localStorage.getItem('installBannerDismissed') === '1') return

    // Écouter l'événement d'installation (Chrome/Edge/Android/Windows)
    const onInstalled = () => {
      localStorage.setItem('pwaInstalled', '1')
      setShow(false)
    }
    window.addEventListener('appinstalled', onInstalled)

    // Capturer le prompt natif d'installation
    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Si le prompt a été capturé avant le montage du composant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deferred = (window as any).__pwaPrompt
    if (deferred) {
      setPrompt(deferred)
      setShow(true)
    }

    // iOS : pas de beforeinstallprompt, instructions manuelles
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    if (ios) {
      setIsIOS(true)
      setShow(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!prompt) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prompt as any).prompt()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { outcome } = await (prompt as any).userChoice
    if (outcome === 'accepted') localStorage.setItem('pwaInstalled', '1')
    setShow(false)
  }

  const handleDismiss = () => {
    localStorage.setItem('installBannerDismissed', '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="bg-pool-navy border-b border-pool-navy-light px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192x192.png" alt="Logo" className="w-8 h-8 rounded shrink-0" />
        <div className="min-w-0">
          <p className="text-white text-sm font-medium">Installer Cap Crunch</p>
          {prompt ? (
            <p className="text-pool-silver text-xs">Accès rapide depuis votre bureau ou écran d&apos;accueil</p>
          ) : isIOS ? (
            <p className="text-pool-silver text-xs">Safari → Partager → « Sur l&apos;écran d&apos;accueil »</p>
          ) : (
            <p className="text-pool-silver text-xs">Menu du navigateur → « Installer l&apos;application »</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {prompt && (
          <button
            onClick={handleInstall}
            className="bg-white text-pool-navy text-sm font-semibold px-3 py-1 rounded"
          >
            Installer
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="text-pool-silver hover:text-white text-lg leading-none"
          aria-label="Fermer"
        >
          ×
        </button>
      </div>
    </div>
  )
}