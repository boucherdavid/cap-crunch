import AdminGuidePanel from '@/components/AdminGuidePanel'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AdminGuidePanel />
    </>
  )
}
