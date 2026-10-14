import OfflineRetry from './OfflineRetry'

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="text-6xl mb-6">🏒</div>
      <h1 className="text-2xl font-bold text-gray-800 mb-3">Connexion impossible</h1>
      <OfflineRetry />
    </div>
  )
}
