'use client'

import { useEffect, useState } from 'react'

// Recharge l'adresse demandée (la page hors ligne est servie à la place de celle-ci)
export default function OfflineRetry() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)
    const goOnline = () => window.location.reload()
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    // Réseau présent mais serveur injoignable : on réessaie tout seul
    const timer = window.setInterval(() => {
      if (navigator.onLine) window.location.reload()
    }, 15000)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.clearInterval(timer)
    }
  }, [])

  return (
    <>
      <p className="text-gray-500 max-w-sm">
        {online
          ? 'Cap Crunch ne répond pas pour le moment. Nouvel essai automatique dans quelques secondes.'
          : 'Ton appareil est hors ligne. La page se rechargera dès que tu seras reconnecté.'}
      </p>
      {/* Sans JS, le formulaire recharge quand même l'adresse courante */}
      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault()
          window.location.reload()
        }}
      >
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Réessayer
        </button>
      </form>
    </>
  )
}
