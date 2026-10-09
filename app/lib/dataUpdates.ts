/**
 * Mises à jour automatiques des données (David, 2026-10-06) — une tâche GitHub Actions chacune.
 * L'horloge de GitHub est en retard de plusieurs heures et saute des passages (voir CLAUDE.md,
 * « Tâches planifiées ») : le panneau de /admin/donnees montre la dernière exécution de chacune et
 * permet de la relancer à la main. Sert aussi de liste blanche aux actions du panneau.
 */
export type DataUpdate = { workflow: string; label: string; schedule: string; detail: string }

export const DATA_UPDATES: DataUpdate[] = [
  { workflow: 'regular_stats.yml', label: 'Points de la veille', schedule: 'Chaque nuit', detail: 'Buts, passes et victoires des 3 derniers jours — alimente le classement.' },
  { workflow: 'injuries.yml', label: 'Blessures', schedule: 'Chaque jour', detail: 'CBS Sports, ESPN et MoneyPuck — badges et admissibilité au LTIR.' },
  { workflow: 'advanced_stats.yml', label: 'Stats avancées', schedule: 'Chaque jour', detail: 'MoneyPuck — pages Analytique.' },
  { workflow: 'line_combos.yml', label: 'Trios et paires', schedule: 'Chaque jour', detail: 'Daily Faceoff — alignements des équipes de la LNH.' },
  { workflow: 'import.yml', label: 'Salaires, contrats et repêchages', schedule: 'Chaque lundi', detail: 'Réimporte les fichiers PuckPedia déjà dans le dépôt (pas de nouvelle lecture du site) et les repêchages de la LNH. Pour des salaires à jour, lancer d\'abord le pipeline local.' },
  { workflow: 'backup_tool.yml', label: 'Copie de secours', schedule: 'Chaque dimanche', detail: 'Régénère le fichier de la page Copie de secours.' },
]
