export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="text-6xl mb-6">🏒</div>
      <h1 className="text-2xl font-bold text-gray-800 mb-3">Pas de connexion</h1>
      <p className="text-gray-500 max-w-sm">
        Tu es hors ligne. Reconnecte-toi à Internet pour accéder au pool.
      </p>
    </div>
  )
}
