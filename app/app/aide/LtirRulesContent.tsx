'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_LTIR_SETTINGS, type LtirSettings } from '@/lib/ltirEligibility'

// Seuils LTIR configurés par l'admin (app_settings, David 2026-09-25) — fournis par page.tsx via
// AideTabs, pour que Règlements → Blessures et LTIR affiche toujours les valeurs appliquées.
export const LtirSettingsContext = createContext<LtirSettings>(DEFAULT_LTIR_SETTINGS)

function jours(n: number): string {
  return `${n} jour${n > 1 ? 's' : ''}`
}

export default function LtirRulesContent() {
  const t = useContext(LtirSettingsContext)
  return (
    <div className="text-sm text-gray-700 space-y-4">
      <div>
        <p className="font-medium text-gray-800 mb-1.5">Mettre un joueur sur le LTIR</p>
        <ul className="space-y-1.5">
          <li>• Un joueur <strong>actif ou réserviste</strong> peut être mis sur le LTIR, pourvu qu&apos;il soit admissible (voir plus bas).</li>
          <li>• Depuis <strong>Gestion d&apos;effectifs</strong>, choisis <strong>LTIR</strong> (ou <strong>LTIR + signature</strong> pour signer un remplaçant dans le même geste ; il prend le statut du joueur remplacé, actif ou réserviste). Au lieu de s&apos;appliquer tout de suite, ta demande est envoyée à l&apos;administrateur pour approbation.</li>
          <li>• En <strong>pré-saison</strong> (avant le début de la saison), la demande se fait plutôt depuis <strong>Signatures des agents libres</strong> → Mon alignement : bouton <strong>Demander LTIR</strong> à côté d&apos;un joueur actif ou réserviste admissible, même approbation par l&apos;administrateur.</li>
          <li>• Tant que l&apos;administrateur n&apos;a pas décidé, un bandeau <strong>En attente d&apos;approbation</strong> s&apos;affiche et tu peux annuler ta demande.</li>
          <li>• Si elle est approuvée, la <strong>date effective est celle de ta demande</strong>, pas celle de l&apos;approbation — une approbation tardive ne te pénalise pas.</li>
          <li>• Un joueur sur le LTIR ne compte pas dans ta masse salariale et ne rapporte aucun point.</li>
          <li>• Le <strong>retour du LTIR</strong> se fait par toi, depuis <strong>Gestion d&apos;effectifs</strong> → <strong>Retour LTIR</strong>, comme actif ou comme réserviste. L&apos;effet est immédiat et ton alignement doit rester conforme (12/6/2, 2 réservistes, plafond) : ajoute au besoin d&apos;autres mouvements au même lot.</li>
          <li>• Dès qu&apos;un joueur sur le LTIR <strong>rejoue un match de la LNH</strong>, tu reçois une notification (l&apos;administrateur aussi) et tu as <strong>{jours(t.returnDeadlineDays)}</strong> pour le remettre dans ton alignement. Un bandeau dans Gestion d&apos;effectifs te rappelle la date limite. Passé ce délai, c&apos;est l&apos;administrateur qui décide de la suite.</li>
          <li>• Pendant ce délai, le joueur reste sur le LTIR : il ne rapporte toujours aucun point et son salaire ne compte toujours pas.</li>
        </ul>
      </div>
      <div>
        <p className="font-medium text-gray-800 mb-1.5">Quand un joueur est-il « admissible » ?</p>
        <p className="mb-1.5">Les règles sont vérifiées dans cet ordre ; la première qui s&apos;applique décide :</p>
        <ol className="space-y-1.5 list-decimal pl-5">
          <li><strong>Placé sur la liste des blessés (IR) par son équipe LNH</strong> → toujours admissible, peu importe la date de retour annoncée. On colle à la réalité de la LNH.</li>
          <li><strong>Retour annoncé dans {jours(t.returnMinDays)} ou plus</strong> → admissible (blessures « semaine à semaine », « mois à mois »…).</li>
          <li><strong>Retour annoncé bientôt</strong> (dans moins de {jours(t.returnMinDays)}, ou date dépassée depuis moins de {jours(t.graceDays)}) → <strong>pas admissible</strong>, même si le joueur est blessé depuis longtemps. C&apos;est une <strong>période tampon</strong> : un joueur annoncé de retour le 2 octobre ne peut pas être mis sur le LTIR le 2 octobre. Il faut d&apos;abord voir la blessure se prolonger.</li>
          <li><strong>Blessé depuis {jours(t.injuredMinDays)} ou plus</strong>, sans date de retour, ou toujours sur la liste {jours(t.graceDays)} après sa date de retour prévue (la blessure se prolonge) → admissible. Couvre notamment le « day-to-day » qui traîne.</li>
        </ol>
      </div>
      <div>
        <p className="font-medium text-gray-800 mb-1.5">D&apos;où viennent les données et comment on les recoupe</p>
        <ul className="space-y-1.5">
          <li>• Trois sources sont consultées chaque jour : <strong>CBS Sports</strong>, <strong>ESPN</strong> et <strong>MoneyPuck</strong>. Un joueur est considéré blessé seulement si <strong>au moins 2 sources sur 3</strong> le rapportent. S&apos;il n&apos;apparaît que dans une seule, il est affiché « À confirmer » sur la page Blessures, sans badge ni admissibilité au LTIR.</li>
          <li>• Une mise sur la liste des blessés (IR) par l&apos;équipe LNH compte dès qu&apos;une des sources la rapporte, pourvu que la blessure soit confirmée.</li>
          <li>• Pour la date de retour, celle de CBS a priorité, puis celle d&apos;ESPN, puis celle de MoneyPuck.</li>
          <li>• Si CBS et ESPN donnent des dates de retour à {jours(t.disagreementDays)} d&apos;écart ou plus, le marqueur <strong>⚠ CBS≠ESPN</strong> le signale, mais le calcul reste basé sur CBS.</li>
          <li>• Les dates sont lues dans le texte de la source (ex. « until at least Oct 2 »). Un statut sans date précise (ex. « Day-to-Day ») compte comme « aucune date de retour ».</li>
        </ul>
      </div>
      <div>
        <p className="font-medium text-gray-800 mb-1.5">Le compteur de durée de la blessure</p>
        <ul className="space-y-1.5">
          <li>• Il démarre le premier jour où le joueur apparaît dans l&apos;une des trois sources, et continue tant qu&apos;au moins une le liste.</li>
          <li>• Quand le joueur disparaît de toutes les sources (rétabli), le compteur est remis à zéro. S&apos;il se blesse de nouveau, un nouveau compteur repart de zéro.</li>
          <li>• Pour éviter qu&apos;un simple oubli des sources efface une blessure de plusieurs semaines, un joueur n&apos;est retiré qu&apos;après <strong>{jours(t.removalAbsenceDays)} d&apos;absence consécutifs</strong> de toutes les sources. Un joueur tout juste rétabli peut donc rester affiché blessé un peu plus longtemps.</li>
          <li>• Le suivi a commencé fin septembre 2026 : pour un joueur déjà blessé avant, le compteur part de ce moment-là, pas de sa vraie date de blessure.</li>
        </ul>
      </div>
      <div>
        <p className="font-medium text-gray-800 mb-1.5">À garder en tête</p>
        <ul className="space-y-1.5">
          <li>• Le badge <strong>Admissible</strong> est une <strong>aide à la décision</strong>, pas un droit automatique : l&apos;administrateur garde le dernier mot et peut approuver ou refuser selon son jugement (ex. une information plus récente que la dernière mise à jour quotidienne).</li>
          <li>• Les délais ci-dessus peuvent être ajustés par l&apos;administrateur après discussion avec les poolers — cette page affiche toujours les valeurs en vigueur.</li>
          <li>• Les données sont mises à jour une fois par jour — une blessure annoncée ce matin peut n&apos;apparaître qu&apos;au prochain passage.</li>
          <li>• Les joueurs sont associés par nom et équipe. Si un badge te semble attribué au mauvais joueur, signale-le via <strong>Signaler un problème</strong>.</li>
        </ul>
      </div>
    </div>
  )
}
