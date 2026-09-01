import { redirect } from 'next/navigation'

export default function AdminPlanificationPage() {
  redirect('/admin/communaute?tab=planification')
}
