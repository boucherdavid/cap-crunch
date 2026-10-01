import { redirect } from 'next/navigation'

// Page ouverte aux poolers le 2026-10-01 (menu Analytique) — ancienne adresse admin conservée.
export default function AdminAnalysePage() {
  redirect('/analytique/analyse')
}
