import type { PlayoffChangeLogEntry } from '@/app/gestion-series/playoff-pool-actions'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-CA', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    timeZone: 'America/Toronto',
  })

export default function ChangeLogPanel({
  log,
}: {
  log: PlayoffChangeLogEntry[]
}) {
  return (
    <div className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Changements après la date limite
        </h2>
      </div>

      {log.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun changement enregistré après la date limite.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Pooler</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Joueur</th>
                <th className="px-3 py-2 text-left">Équipe</th>
                <th className="px-3 py-2 text-left">Pos.</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {log.map((entry, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800">{entry.poolerName}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                      entry.action === 'ajout' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {entry.action === 'ajout' ? '+ Ajout' : '− Retrait'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{entry.playerName}</td>
                  <td className="px-3 py-2 text-gray-500">{entry.teamCode ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{entry.positionSlot ?? '—'}</td>
                  <td className="px-3 py-2">
                    {entry.removalReason === 'elimination' && (
                      <span className="text-xs text-red-600 font-medium">Élim.</span>
                    )}
                    {entry.removalReason === 'voluntary' && (
                      <span className="text-xs text-orange-600 font-medium">Volont.</span>
                    )}
                    {!entry.removalReason && entry.action === 'ajout' && (
                      <span className="text-xs text-blue-600 font-medium">Ajout</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">{fmtDate(entry.changedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
