'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { addCommentAction, deleteCommentAction } from './actions'

type Me = { id: string; name: string; isAdmin: boolean }
type Pooler = { id: string; name: string }
type Post = { id: number; author_id: string; title: string; body: string; created_at: string }
type Comment = { id: number; post_id: number; pooler_id: string; body: string; created_at: string }

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-CA', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Toronto',
  })
}

function PostCard({
  post, comments, poolerName, me,
}: {
  post: Post
  comments: Comment[]
  poolerName: Map<string, string>
  me: Me
}) {
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePost = async () => {
    if (!newComment.trim()) return
    setPosting(true)
    setError(null)
    const result = await addCommentAction(post.id, newComment)
    setPosting(false)
    if (result.error) setError(result.error)
    else setNewComment('')
  }

  const handleDelete = async (commentId: number) => {
    const result = await deleteCommentAction(commentId)
    if (result.error) setError(result.error)
  }

  return (
    <div className="bg-white rounded-lg shadow p-5 space-y-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-gray-800">{post.title}</h2>
          <span className="shrink-0 text-xs text-gray-400">{fmtDateTime(post.created_at)}</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{poolerName.get(post.author_id) ?? 'Admin'}</p>
        <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap break-words">{post.body}</p>
      </div>

      <div className="border-t pt-3 space-y-3">
        {comments.length === 0 ? (
          <p className="text-gray-400 text-xs">Aucun commentaire pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2">
            {comments.map(c => (
              <li key={c.id} className="bg-gray-50 rounded-lg p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700">
                      {poolerName.get(c.pooler_id) ?? 'Un pooler'}
                      <span className="ml-2 text-xs text-gray-400 font-normal">{fmtDateTime(c.created_at)}</span>
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                  </div>
                  {(c.pooler_id === me.id || me.isAdmin) && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="shrink-0 text-gray-300 hover:text-red-500 text-xs"
                      title="Supprimer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2">
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Écrire un commentaire..."
            rows={2}
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <button
            onClick={handlePost}
            disabled={posting || !newComment.trim()}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 self-end"
          >
            Publier
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BabillardManager({
  me, poolers, posts, comments,
}: {
  me: Me
  poolers: Pooler[]
  posts: Post[]
  comments: Comment[]
}) {
  const poolerName = useMemo(
    () => new Map(poolers.map(p => [p.id, p.name])),
    [poolers],
  )

  const commentsByPost = useMemo(() => {
    const m = new Map<number, Comment[]>()
    for (const c of comments) {
      const arr = m.get(c.post_id) ?? []
      arr.push(c)
      m.set(c.post_id, arr)
    }
    return m
  }, [comments])

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Babillard</h1>
        {me.isAdmin && (
          <Link href="/admin/communaute?tab=babillard" className="text-sm text-blue-600 hover:text-blue-800">
            Publier une communication →
          </Link>
        )}
      </div>

      {posts.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400 text-sm">
          Aucune communication pour le moment.
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              comments={commentsByPost.get(post.id) ?? []}
              poolerName={poolerName}
              me={me}
            />
          ))}
        </div>
      )}
    </div>
  )
}
