'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createPostAction, deletePostAction } from '@/app/babillard/actions'

type Post = { id: number; title: string; body: string; created_at: string; author_id: string }

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-CA', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Toronto',
  })
}

export default function AdminBabillardManager({ posts }: { posts: Post[] }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const result = await createPostAction(title, body)
    setLoading(false)
    if (result.error) {
      showMsg('error', result.error)
    } else {
      showMsg('success', 'Communication publiée — les poolers abonnés aux notifications ont été avisés.')
      setTitle('')
      setBody('')
    }
  }

  const handleDelete = async (post: Post) => {
    if (!window.confirm(`Supprimer « ${post.title} » ? Les commentaires associés seront aussi supprimés.`)) return
    setLoading(true)
    const result = await deletePostAction(post.id)
    setLoading(false)
    if (result.error) showMsg('error', result.error)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Babillard — Admin</h1>
        <Link href="/babillard" className="text-sm text-blue-600 hover:text-blue-800">
          Voir la page publique →
        </Link>
      </div>

      {message && (
        <p className={`text-sm font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-5 space-y-3">
        <h2 className="font-semibold text-gray-700 text-sm">Publier une communication</h2>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Titre"
          required
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Message..."
          rows={4}
          required
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40"
        >
          Publier
        </button>
      </form>

      <div className="bg-white rounded-lg shadow p-5 space-y-3">
        <h2 className="font-semibold text-gray-700 text-sm">Communications publiées</h2>
        {posts.length === 0 ? (
          <p className="text-gray-400 text-sm">Aucune communication pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2">
            {posts.map(post => (
              <li key={post.id} className="border rounded-lg p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700">{post.title}</p>
                  <p className="text-xs text-gray-400">{fmtDateTime(post.created_at)}</p>
                </div>
                <button
                  onClick={() => handleDelete(post)}
                  disabled={loading}
                  className="shrink-0 text-xs text-red-400 hover:text-red-600 font-medium disabled:opacity-40"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
