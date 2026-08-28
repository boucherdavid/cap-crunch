import { redirect } from 'next/navigation'

export default function AdminJoueursPage() {
  redirect('/admin/donnees?tab=pipeline')
}
