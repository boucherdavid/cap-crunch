'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CHANGE_LABEL: Record<string, string> = {
  activation:             'Activation',
  deactivation:           'Désactivation',
  ajout_reserviste:       'Ajout réserviste',
  ajout_recrue:           'Ajout recrue',
  retrait:                'Retrait',
  ltir:                   'Mise sur LTIR',
  retour_ltir:            'Retour de LTIR',
  changement_type:        'Changement de type',
  signature_agent_libre:  'Signature agent libre',
  signature_ltir:         'Signature agent libre (LTIR)',
  ballotage:               'Réclamation au ballotage',
  hist_swap:               'Échange (même pooler, historique)',
  hist_trade:              'Échange entre poolers (historique)',
  hist_ajout:              'Ajout (historique)',
  hist_retrait:            'Retrait (historique)',
  hist_type_change:        'Changement de type (historique)',
  hist_ballotage:          'Ballotage (historique)',
}

function csvField(v: string): string {
  if (v.includes(';') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso)).replace(',', '')
}

export async function exportJournalCsvAction(
  saisonId: number,
): Promise<{ csv?: string; filename?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { data: saison } = await supabase.from('pool_seasons').select('season').eq('id', saisonId).single()
  if (!saison) return { error: 'Saison introuvable.' }

  const db = createAdminClient()

  // Pagination — une saison complète dépasse facilement la limite de 1000 lignes par requête.
  const PAGE = 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  let offset = 0
  while (true) {
    const { data, error } = await db
      .from('roster_change_log')
      .select(`
        change_type, old_type, new_type, changed_at, is_admin_override,
        players (first_name, last_name),
        poolers!roster_change_log_pooler_id_fkey (name),
        pool_draft_picks (round, pool_seasons (season))
      `)
      .eq('pool_season_id', saisonId)
      .order('changed_at', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) return { error: error.message }
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }

  const header = ['Date effective', 'Pooler', 'Joueur / Choix', 'Action', 'Ancien statut', 'Nouveau statut', 'Source'].join(';')

  const lines = rows.map(r => {
    const pl = r.players as { first_name: string; last_name: string } | null
    const po = r.poolers as { name: string } | null
    const pick = r.pool_draft_picks as { round: number; pool_seasons: { season: string } | null } | null

    const cible = pl
      ? `${pl.last_name}, ${pl.first_name}`
      : pick
        ? `Choix — ${pick.pool_seasons?.season ?? '?'} Ronde ${pick.round}`
        : '—'

    return [
      fmtDateTime(r.changed_at),
      po?.name ?? '?',
      cible,
      CHANGE_LABEL[r.change_type] ?? r.change_type,
      r.old_type ?? '',
      r.new_type ?? '(retiré)',
      r.is_admin_override ? 'Date forcée (admin)' : 'Temps réel',
    ].map(csvField).join(';')
  })

  const BOM = '﻿' // nécessaire pour qu'Excel détecte l'UTF-8 (accents) à l'ouverture
  const csv = BOM + [header, ...lines].join('\r\n')
  const filename = `journal_${saison.season}.csv`

  return { csv, filename }
}
