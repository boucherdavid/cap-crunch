import Link from 'next/link'

export function AdminHubBackLink({ saisonId }: { saisonId: number }) {
  return (
    <Link
      href={`/admin/nouvelle-saison?saisonId=${saisonId}`}
      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mb-4"
    >
      ← Retour à Nouvelle saison
    </Link>
  )
}
