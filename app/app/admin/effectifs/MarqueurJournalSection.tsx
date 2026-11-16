/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  classifyTx, splitByOwner, toBasketLine, BasketCard, TradeCard, TAB_LABEL, TAB_BORDER, formatMoment, type TabKey,
} from '@/app/journal-transactions/journalCards'
import type { MarqueurJournal } from './marqueur-actions'
import MarqueurSyncedButton from './MarqueurSyncedButton'

/**
 * « À saisir depuis ta dernière mise à jour » (David, 2026-11-16) — les paniers du Journal des
 * activités soumis depuis le repère « Marqueur est à jour », par pooler, du plus ancien au plus
 * récent. Les écarts calculés (MarqueurReportView) restent dessous comme filet de sécurité.
 */
export default function MarqueurJournalSection({ journal }: { journal: MarqueurJournal }) {
  const txs = journal.transactions.map(tx => ({ ...tx, _tab: classifyTx(tx.transaction_items ?? [], tx.notes ?? null) as TabKey }))
  const trades = txs.filter(tx => tx._tab === 'echanges')
  const byPooler = new Map<string, { tx: any; lines: ReturnType<typeof toBasketLine>[] }[]>()
  for (const tx of txs.filter(t => t._tab !== 'echanges')) {
    for (const { owner, items } of splitByOwner(tx.transaction_items ?? [])) {
      if (!byPooler.has(owner)) byPooler.set(owner, [])
      byPooler.get(owner)!.push({ tx, lines: items.map(toBasketLine) })
    }
  }
  const poolers = [...byPooler].sort(([a], [b]) => a.localeCompare(b, 'fr'))
  const lastTxId = txs.reduce((m, tx) => Math.max(m, tx.id as number), 0)
  const since = journal.syncedAt
    ? new Date(journal.syncedAt).toLocaleString('fr-CA', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' })
    : null

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">
            À saisir depuis ta dernière mise à jour ({txs.length})
          </h2>
          <p className="text-xs text-gray-500">
            {since
              ? <>Dernière mise à jour de Marqueur : {since} (heure de l&apos;Est). </>
              : <>Aucune mise à jour enregistrée : les {journal.lookbackDays} derniers jours sont affichés. </>}
            Soumissions du Journal des activités faites depuis, par pooler, de la plus ancienne à la plus récente. Une fois tout saisi sur Marqueur, clique « Marqueur est à jour ».
          </p>
          {!journal.available && (
            <p className="mt-1 text-xs text-red-600">La migration marqueur_synced.sql n&apos;est pas encore roulée sur cette base : le repère ne peut pas être enregistré.</p>
          )}
        </div>
        {txs.length > 0 && journal.available && <MarqueurSyncedButton lastTxId={lastTxId} count={txs.length} />}
      </div>

      {txs.length === 0 ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">Rien de nouveau depuis ta dernière mise à jour.</p>
      ) : (
        <div className="space-y-4">
          {poolers.map(([owner, baskets]) => (
            <div key={owner}>
              <p className="font-semibold text-gray-800 mb-1.5">{owner}</p>
              <div className="space-y-2">
                {baskets.map(({ tx, lines }) => (
                  <div key={tx.id} className={`bg-white rounded-lg shadow p-3 border-l-4 ${TAB_BORDER[tx._tab as TabKey]}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-2">
                      <p className="text-sm text-gray-600">{TAB_LABEL[tx._tab as TabKey]}</p>
                      <p className="text-xs text-gray-500">{formatMoment(tx.created_at)}</p>
                    </div>
                    {tx.override_note && (
                      <p className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                        Règle contournée par l&apos;admin : {tx.override_note}
                      </p>
                    )}
                    <BasketCard lines={lines} highlightPlayer="" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {trades.length > 0 && (
            <div>
              <p className="font-semibold text-gray-800 mb-1.5">Échanges</p>
              <div className="space-y-2">
                {trades.map(tx => (
                  <div key={tx.id} className={`bg-white rounded-lg shadow p-3 border-l-4 ${TAB_BORDER.echanges}`}>
                    <p className="text-xs text-gray-500 mb-2">{formatMoment(tx.created_at)}</p>
                    <TradeCard items={tx.transaction_items ?? []} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
