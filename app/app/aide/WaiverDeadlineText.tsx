'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_WAIVER_CLAIM_DAYS, ordinalFr } from '@/lib/waiverSettings'

// Délai de réclamation au ballotage en vigueur (`app_settings.waiver_claim_days`), lu par
// /aide/page.tsx — jamais un nombre de jours codé en dur dans les règlements (David, 2026-10-19).
export const WaiverDaysContext = createContext<number>(DEFAULT_WAIVER_CLAIM_DAYS)

/** « 2e jour suivant » selon le réglage en vigueur. */
export default function WaiverDeadlineText() {
  const days = useContext(WaiverDaysContext)
  return <>{ordinalFr(days)} jour suivant</>
}
