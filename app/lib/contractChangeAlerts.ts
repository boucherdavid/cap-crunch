/**
 * Salaires modifiés d'un import à l'autre (David, 2026-10-26) — filet de sécurité après Duchene
 * (rachat NSH additionné à son contrat DAL). python_script/import_supabase.py inscrit chaque cap
 * d'une saison active ou future qui change de valeur, ou passe à vide, dans
 * `contract_change_alerts`. Ici : avis aux admins (push + courriel, une fois par lot, depuis les
 * vérifications horaires de l'accueil) et liste pour /admin/donnees jusqu'à ce qu'ils soient vus.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToAdmins } from '@/lib/push'
import { sendEmailToIds, escapeHtml } from '@/lib/email'
import { emailLinkHtml } from '@/lib/siteUrl'
import { getAppEnv } from '@/lib/appEnv'

const PATH = '/admin/donnees'
export const CONTRACT_ALERT_TITLE = 'Cap Crunch — Salaires modifiés'

export type ContractChangeAlertView = {
  id: number
  playerName: string
  teamCode: string | null
  season: string
  oldCap: number | null
  newCap: number | null
  detectedAt: string
  seenAt: string | null
  ownerName: string | null
}

const fmt = (v: number | null) => (v === null ? 'vide' : `${Math.round(v).toLocaleString('fr-CA')} $`)

type Row = { id: number; player_id: number; season: string; old_cap: number | null; new_cap: number | null; detected_at: string; seen_at: string | null }

async function describe(admin: ReturnType<typeof createAdminClient>, rows: Row[]): Promise<ContractChangeAlertView[]> {
  if (rows.length === 0) return []
  const ids = [...new Set(rows.map(r => r.player_id))]
  const [{ data: players }, { data: season }] = await Promise.all([
    admin.from('players').select('id, first_name, last_name, teams (code)').in('id', ids),
    admin.from('pool_seasons').select('id').eq('is_active', true).eq('is_playoff', false).maybeSingle(),
  ])
  const owners = new Map<number, string>()
  if (season) {
    const { data: rosters } = await admin.from('pooler_rosters').select('player_id, poolers (name)')
      .eq('pool_season_id', season.id).eq('is_active', true).in('player_id', ids)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (rosters ?? []) as any[]) owners.set(r.player_id, r.poolers?.name ?? '')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map(((players ?? []) as any[]).map(p => [p.id as number, p]))
  return rows.map(r => {
    const p = byId.get(r.player_id)
    return {
      id: r.id,
      playerName: p ? `${p.last_name}, ${p.first_name}` : `Joueur #${r.player_id}`,
      teamCode: p?.teams?.code ?? null,
      season: r.season,
      oldCap: r.old_cap === null ? null : Number(r.old_cap),
      newCap: r.new_cap === null ? null : Number(r.new_cap),
      detectedAt: r.detected_at,
      seenAt: r.seen_at,
      ownerName: owners.get(r.player_id) || null,
    }
  })
}

/** Avis aux admins des alertes pas encore annoncées — une seule fois chacune (mise à jour conditionnelle). */
export async function syncContractChangeAlerts(): Promise<void> {
  if (getAppEnv() === 'local') return
  try {
    const admin = createAdminClient()
    const { data: pending, error } = await admin.from('contract_change_alerts')
      .select('id').is('notified_at', null).order('id').limit(200)
    if (error || !pending || pending.length === 0) return
    const { data: claimed } = await admin.from('contract_change_alerts')
      .update({ notified_at: new Date().toISOString() })
      .in('id', pending.map(p => p.id)).is('notified_at', null)
      .select('id, player_id, season, old_cap, new_cap, detected_at, seen_at')
    if (!claimed || claimed.length === 0) return

    const alerts = await describe(admin, claimed as Row[])
    const lines = alerts.map(a =>
      `${a.playerName}${a.teamCode ? ` (${a.teamCode})` : ''}${a.ownerName ? ` — chez ${a.ownerName}` : ''} : ${a.season}, ${fmt(a.oldCap)} → ${fmt(a.newCap)}`)
    const n = alerts.length
    const body = `${n === 1 ? '1 salaire a changé' : `${n} salaires ont changé`} au dernier import — à vérifier.`
    const { data: admins } = await admin.from('poolers').select('id').eq('is_admin', true)
    await Promise.allSettled([
      sendPushToAdmins({ title: CONTRACT_ALERT_TITLE, body: `${body}\n${lines.slice(0, 3).join('\n')}${n > 3 ? `\n… et ${n - 3} de plus` : ''}`, url: PATH }),
      sendEmailToIds((admins ?? []).map(a => a.id as string), {
        subject: CONTRACT_ALERT_TITLE,
        html: `<p>${escapeHtml(body)} Un salaire ne devrait pas changer d'un import à l'autre : vérifie sur PuckPedia.</p><ul>${lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>${emailLinkHtml(PATH)}`,
      }),
    ])
  } catch {
    // Table absente (migration pas roulée) ou base indisponible : prochain passage.
  }
}

/** Alertes à afficher sur /admin/donnees : toutes celles pas encore vues, et les 30 derniers jours vus. */
export async function loadContractChangeAlerts(): Promise<ContractChangeAlertView[] | null> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [unseen, seen] = await Promise.all([
    admin.from('contract_change_alerts').select('id, player_id, season, old_cap, new_cap, detected_at, seen_at')
      .is('seen_at', null).order('detected_at', { ascending: false }).limit(200),
    admin.from('contract_change_alerts').select('id, player_id, season, old_cap, new_cap, detected_at, seen_at')
      .not('seen_at', 'is', null).gte('detected_at', since).order('detected_at', { ascending: false }).limit(50),
  ])
  if (unseen.error) return null  // migration pas encore roulée
  return describe(admin, [...(unseen.data ?? []), ...(seen.data ?? [])] as Row[])
}
