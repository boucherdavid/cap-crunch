'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updatePasswordAction, updateProfileAction, updateNameAction, updateEmailAction } from './actions'
import PushToggle from './PushToggle'

type Profile = {
  name: string
  email: string
  notif_email: boolean
}

export default function CompteForm({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.name)
  const [nameMsg, setNameMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [nameBusy, setNameBusy] = useState(false)

  const [email, setEmail] = useState(profile.email)
  const [emailMsg, setEmailMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [emailBusy, setEmailBusy] = useState(false)


  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [pwdBusy, setPwdBusy] = useState(false)

  const [notifEmail, setNotifEmail] = useState(profile.notif_email)
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)

  const [isRecovery, setIsRecovery] = useState(false)
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery') || hash.includes('type=email_change')) {
      setIsRecovery(true)
    }
  }, [])

  async function handleName(e: { preventDefault(): void }) {
    e.preventDefault()
    setNameBusy(true)
    setNameMsg(null)
    const res = await updateNameAction(name)
    setNameBusy(false)
    setNameMsg(res.error ? { type: 'err', text: res.error } : { type: 'ok', text: 'Nom mis à jour.' })
  }

  async function handleEmail(e: { preventDefault(): void }) {
    e.preventDefault()
    if (email === profile.email) {
      setEmailMsg({ type: 'err', text: 'Entrez une nouvelle adresse courriel.' })
      return
    }
    setEmailBusy(true)
    setEmailMsg(null)
    const res = await updateEmailAction(email)
    setEmailBusy(false)
    if (res.error) {
      setEmailMsg({ type: 'err', text: res.error })
    } else {
      setEmailMsg({ type: 'ok', text: 'Un lien de confirmation a été envoyé à la nouvelle adresse. Le changement sera effectif après confirmation.' })
    }
  }

  async function handleProfile(e: { preventDefault(): void }) {
    e.preventDefault()
    setProfileBusy(true)
    setProfileMsg(null)
    const res = await updateProfileAction(notifEmail)
    setProfileBusy(false)
    setProfileMsg(res.error ? { type: 'err', text: res.error } : { type: 'ok', text: 'Profil mis à jour.' })
  }

  async function handlePassword(e: { preventDefault(): void }) {
    e.preventDefault()
    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: 'err', text: 'Les mots de passe ne correspondent pas.' })
      return
    }

    if (isRecovery) {
      const supabase = createClient()
      const hashParams = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      }
    }

    setPwdBusy(true)
    setPwdMsg(null)
    const res = await updatePasswordAction(newPwd)
    setPwdBusy(false)
    if (res.error) {
      setPwdMsg({ type: 'err', text: res.error })
    } else {
      setPwdMsg({ type: 'ok', text: 'Mot de passe mis à jour.' })
      setNewPwd(''); setConfirmPwd('')
      setIsRecovery(false)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }

  if (isRecovery) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-xl font-bold text-gray-800 mb-1">Nouveau mot de passe</h1>
          <p className="text-sm text-gray-500 mb-6">Choisissez votre nouveau mot de passe.</p>
          <form onSubmit={handlePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required minLength={6}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer</label>
              <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={pwdBusy}
              className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {pwdBusy ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            {pwdMsg && <p className={`text-sm ${pwdMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{pwdMsg.text}</p>}
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Mon compte</h1>

      {/* Nom d'affichage */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="font-bold text-lg text-gray-800 mb-4">Nom d&apos;affichage</h2>
        <form onSubmit={handleName} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Ce nom apparaît dans le classement et les choix.</p>
          </div>
          <button type="submit" disabled={nameBusy || name.trim() === profile.name}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {nameBusy ? 'Enregistrement...' : 'Sauvegarder'}
          </button>
          {nameMsg && (
            <p className={`text-sm ${nameMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{nameMsg.text}</p>
          )}
        </form>
      </div>

      {/* Courriel */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="font-bold text-lg text-gray-800 mb-4">Adresse courriel</h2>
        <form onSubmit={handleEmail} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Courriel</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Un lien de confirmation sera envoyé à la nouvelle adresse avant que le changement soit appliqué.
            </p>
          </div>
          <button type="submit" disabled={emailBusy || email.trim().toLowerCase() === profile.email}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {emailBusy ? 'Envoi...' : 'Changer le courriel'}
          </button>
          {emailMsg && (
            <p className={`text-sm ${emailMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{emailMsg.text}</p>
          )}
        </form>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="font-bold text-lg text-gray-800 mb-4">Notifications</h2>

        {/* Notifications push PWA */}
        <div className="mb-6 pb-6 border-b">
          <p className="text-sm font-medium text-gray-700 mb-3">Notifications push (application)</p>
          <PushToggle />
        </div>

        <form onSubmit={handleProfile} className="space-y-4">
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifEmail}
                onChange={e => setNotifEmail(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Notifications par courriel</span>
                <p className="text-xs text-gray-400">Recevoir les alertes du pool par courriel.</p>
              </div>
            </label>
          </div>

          <button type="submit" disabled={profileBusy}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {profileBusy ? 'Enregistrement...' : 'Sauvegarder'}
          </button>
          {profileMsg && (
            <p className={`text-sm ${profileMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{profileMsg.text}</p>
          )}
        </form>
      </div>

      {/* Mot de passe */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="font-bold text-lg text-gray-800 mb-4">Changer le mot de passe</h2>
        <form onSubmit={handlePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required minLength={6}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer le nouveau mot de passe</label>
            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" disabled={pwdBusy}
            className="bg-gray-700 text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {pwdBusy ? 'Enregistrement...' : 'Changer le mot de passe'}
          </button>
          {pwdMsg && <p className={`text-sm ${pwdMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{pwdMsg.text}</p>}
        </form>
      </div>
    </div>
  )
}