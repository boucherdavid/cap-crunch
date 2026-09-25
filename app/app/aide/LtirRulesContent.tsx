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
          <li>• Depuis <strong>Gestion d&apos;effectifs</strong>, choisissez <strong>LTIR</strong> (ou <strong>LTIR + signature</strong> pour signer un remplaçant dans le même geste). Au lieu de s&apos;appliquer tout de suite, votre demande est envoyée à l&apos;administrateur pour approbation.</li>
          <li>• Tant que l&apos;administrateur n&apos;a pas décidé, un bandeau <strong>En attente d&apos;approbation</strong> s&apos;affiche et vous pouvez annuler votre demande.</li>
          <li>• Si elle est approuvée, la <strong>date effective est celle de votre demande</strong>, pas celle de l&apos;approbation — une approbation tardive ne vous pénalise pas.</li>
          <li>• Un joueur sur le LTIR ne compte pas dans votre masse salariale et ne rapporte aucun point.</li>
          <li>• Le <strong>retour du LTIR</strong> vers votre alignement actif se fait par l&apos;administrateur — contactez-le quand votre joueur est rétabli.</li>
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
          <li>• <strong>CBS Sports</strong> est la source principale : c&apos;est elle qui décide qui est blessé, et sa date de retour a priorité.</li>
          <li>• <strong>ESPN</strong> sert de recoupement : elle confirme aussi une mise sur IR par l&apos;équipe, et sa date de retour ne sert que lorsque CBS n&apos;en donne aucune. Un joueur absent de la liste CBS n&apos;est jamais considéré blessé, même s&apos;il apparaît chez ESPN.</li>
          <li>• Si les deux sources donnent des dates de retour à {jours(t.disagreementDays)} d&apos;écart ou plus, le marqueur <strong>⚠ CBS≠ESPN</strong> le signale, mais le calcul reste basé sur CBS.</li>
          <li>• Les dates sont lues dans le texte de la source (ex. « until at least Oct 2 »). Un statut sans date précise (ex. « Day-to-Day ») compte comme « aucune date de retour ».</li>
        </ul>
      </div>
      <div>
        <p className="font-medium text-gray-800 mb-1.5">Le compteur de durée de la blessure</p>
        <ul className="space-y-1.5">
          <li>• Il démarre le premier jour où le joueur apparaît dans la liste de CBS, et continue tant qu&apos;il y reste.</li>
          <li>• Quand le joueur disparaît de la liste (rétabli), le compteur est remis à zéro. S&apos;il se blesse de nouveau, un nouveau compteur repart de zéro.</li>
          <li>• Pour éviter qu&apos;un simple oubli de CBS efface une blessure de plusieurs semaines, un joueur n&apos;est retiré qu&apos;après <strong>{jours(t.removalAbsenceDays)} d&apos;absence consécutifs</strong> de la liste. Un joueur tout juste rétabli peut donc rester affiché blessé un peu plus longtemps.</li>
          <li>• Le suivi a commencé fin septembre 2026 : pour un joueur déjà blessé avant, le compteur part de ce moment-là, pas de sa vraie date de blessure.</li>
        </ul>
      </div>
      <div>
        <p className="font-medium text-gray-800 mb-1.5">À garder en tête</p>
        <ul className="space-y-1.5">
          <li>• Le badge <strong>Admissible</strong> est une <strong>aide à la décision</strong>, pas un droit automatique : l&apos;administrateur garde le dernier mot et peut approuver ou refuser selon son jugement (ex. une information plus récente que la dernière mise à jour quotidienne).</li>
          <li>• Les délais ci-dessus peuvent être ajustés par l&apos;administrateur après discussion avec les poolers — cette page affiche toujours les valeurs en vigueur.</li>
          <li>• Les données sont mises à jour une fois par jour — une blessure annoncée ce matin peut n&apos;apparaître qu&apos;au prochain passage.</li>
          <li>• Les joueurs sont associés par nom et équipe. Si un badge vous semble attribué au mauvais joueur, signalez-le via <strong>Signaler un problème</strong>.</li>
        </ul>
      </div>
    </div>
  )
}
