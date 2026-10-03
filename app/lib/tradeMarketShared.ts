// Types et libellés du marché des échanges — module pur, importable côté client (voir
// lib/tradeMarket.ts pour la lecture et le nettoyage côté serveur).

export type MarketCategory = 'attaquant' | 'defenseur' | 'gardien' | 'recrue' | 'choix'

export const MARKET_CATEGORY_LABEL: Record<MarketCategory, string> = {
  attaquant: 'Attaquant',
  defenseur: 'Défenseur',
  gardien: 'Gardien',
  recrue: 'Recrue',
  choix: 'Choix de repêchage',
}

export type MarketListingView = {
  id: number
  poolerId: string
  poolerName: string
  kind: 'player' | 'pick'
  itemId: number          // player_id ou pick_id
  label: string
  position: string | null
  teamCode: string | null
  playerType: 'actif' | 'reserviste' | 'recrue' | null
  capNumber: number | null
  note: string | null
  expiresOn: string
  createdAt: string
}

export type MarketRequestView = {
  id: number
  poolerId: string
  poolerName: string
  category: MarketCategory | null
  description: string
  expiresOn: string
  createdAt: string
}

/** Lien « Faire une offre » vers l'onglet Échanges pré-rempli. */
export function tradeOfferHref(poolerId: string, receiveKey?: string): string {
  const params = new URLSearchParams({ tab: 'echanges', avec: poolerId })
  if (receiveKey) params.set('recoit', receiveKey)
  return `/gestion-effectifs?${params.toString()}`
}
