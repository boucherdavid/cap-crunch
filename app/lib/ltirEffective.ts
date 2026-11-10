// Heure d'effet d'une demande de LTIR, lisible (David, 2026-11-10) — partagé par le bandeau du
// pooler (Gestion d'effectifs) et l'approbation de l'admin. Une heure à T12:00:00Z est un report au
// lendemain (computeBatchEffectiveDate) : « avant les matchs ». NULL = demande plus ancienne, dont
// l'heure est établie à l'approbation (lib/ltirRequests.ts).
export function fmtLtirEffective(effectiveAt: string | null): string {
  if (!effectiveAt) {
    return "Prend effet à l'heure de la soumission (le lendemain si un match d'un joueur touché était déjà commencé)"
  }
  const d = new Date(effectiveAt)
  const day = d.toLocaleDateString('fr-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'long' })
  // Comparé sur l'instant, pas sur le texte : Supabase renvoie « …T12:00:00+00:00 ».
  if (d.getUTCHours() === 12 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return `Prend effet le ${day}, avant les matchs`
  }
  const time = d.toLocaleTimeString('fr-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' })
  return `Prend effet le ${day} à ${time}`
}
