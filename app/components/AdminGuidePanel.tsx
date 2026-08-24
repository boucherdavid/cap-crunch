'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Step = {
  title: string
  route: string
  href: string
  body: React.ReactNode
}

const STEPS: Step[] = [
  {
    title: 'Reporter les rosters finaux dans la nouvelle saison',
    route: '/admin/init',
    href: '/admin/init?tab=rosters',
    body: (
      <>
        Onglet <strong>Rosters initiaux</strong>, mode init activé. Une fois la saison
        précédente terminée et les rosters finaux connus, les pousser directement dans la
        nouvelle ligne de saison. N&apos;écrit que <code>pooler_rosters</code> — pas besoin
        d&apos;historique détaillé, le calcul de classement se base sur le type de la ligne
        jusqu&apos;au premier vrai mouvement de la nouvelle saison.
      </>
    ),
  },
  {
    title: 'Rouler le pipeline de données',
    route: 'PowerShell',
    href: '',
    body: (
      <>
        <code>./run_pipeline_staging.ps1</code> pour valider, puis committer/pousser les CSV
        modifiés sur <code>main</code> pour déclencher l&apos;import automatique en prod (voir
        CLAUDE.md section 2). Met à jour les contrats/salaires de la nouvelle saison dans{' '}
        <code>player_contracts</code>.
      </>
    ),
  },
  {
    title: 'Passer par la pré-saison',
    route: '/admin/init',
    href: '/admin/init?tab=presaison',
    body: (
      <>
        Onglet <strong>Pré-saison</strong>. Détecte automatiquement les protections recrues
        expirées (5 saisons pour un repêché du pool, expiration ELC pour un agent libre),
        permet de trancher les décisions ELC (garder actif ou retour à la banque), remet les
        LTIR à actif, et signale les poolers non conformes (cap ou alignement) à ajuster
        manuellement.
      </>
    ),
  },
  {
    title: 'Repêchage annuel',
    route: '/admin/repechage',
    href: '/admin/repechage',
    body: (
      <>
        Le repêchage en direct ajoute les recrues de la nouvelle cohorte par-dessus les
        rosters déjà en place.
      </>
    ),
  },
]

export default function AdminGuidePanel() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg hover:bg-gray-700 transition-colors"
      >
        <span aria-hidden>📘</span> Guide
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50 shrink-0">
              <div>
                <p className="font-bold text-gray-900 text-lg leading-tight">Guide admin</p>
                <p className="text-sm text-gray-500">Transition de saison</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="shrink-0 ml-3 text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-sm text-gray-500 mb-5">
                Étapes pour reporter le pool d&apos;une saison à la suivante, une fois la saison
                précédente terminée. <strong>Tester toute la séquence en staging avant de la
                répéter en prod.</strong>
              </p>

              <ol className="space-y-4">
                {STEPS.map((step, i) => (
                  <li key={step.title} className="border rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-gray-800 text-white text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 text-sm mb-1">{step.title}</p>
                        {step.href ? (
                          <Link
                            href={step.href}
                            onClick={() => setOpen(false)}
                            className="inline-block text-xs font-mono bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 mb-2 hover:bg-blue-100"
                          >
                            {step.route}
                          </Link>
                        ) : (
                          <span className="inline-block text-xs font-mono bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 mb-2">
                            {step.route}
                          </span>
                        )}
                        <p className="text-sm text-gray-600 leading-relaxed">{step.body}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </>
      )}
    </>
  )
}
