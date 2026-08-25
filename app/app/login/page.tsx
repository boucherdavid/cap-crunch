'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const STORAGE_KEY = 'hockeypool_saved_accounts'

function loadSavedAccounts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveAccount(email: string) {
  const accounts = loadSavedAccounts()
  const updated = [email, ...accounts.filter(e => e !== email)].slice(0, 8)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

function removeAccount(email: string) {
  const accounts = loadSavedAccounts().filter(e => e !== email)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedAccounts, setSavedAccounts] = useState<string[]>([])

  useEffect(() => {
    setSavedAccounts(loadSavedAccounts())
  }, [])

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou mot de passe invalide')
      setLoading(false)
    } else {
      saveAccount(email)
      const next = new URLSearchParams(window.location.search).get('next')
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
    }
  }

  const selectAccount = (savedEmail: string) => {
    setEmail(savedEmail)
    setError('')
    // Donner le focus au champ mot de passe
    setTimeout(() => document.getElementById('password-input')?.focus(), 50)
  }

  const handleRemoveAccount = (e: React.MouseEvent, savedEmail: string) => {
    e.stopPropagation()
    removeAccount(savedEmail)
    setSavedAccounts(prev => prev.filter(a => a !== savedEmail))
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Connexion</h1>
        <p className="text-gray-500 text-sm mb-6">Hockey Pool — Accès poolers</p>

        {/* Comptes sauvegardés */}
        {savedAccounts.length > 0 && (
          <div className="mb-5">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Comptes récents</p>
            <div className="flex flex-col gap-1">
              {savedAccounts.map(saved => (
                <button
                  key={saved}
                  type="button"
                  onClick={() => selectAccount(saved)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                    email === saved
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="truncate">{saved}</span>
                  <span
                    role="button"
                    onClick={e => handleRemoveAccount(e, saved)}
                    className="ml-2 text-gray-300 hover:text-gray-500 text-xs shrink-0"
                    title="Retirer"
                  >
                    ✕
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t border-gray-100 my-4" />
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              id="password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
