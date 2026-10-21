import { ChevronRight } from 'lucide-react'
import { EVENT_STAGES } from '@/utils/eventStages'

/**
 * Figma "Details > Branding > Type > ... > Review" step strip for the event
 * create/edit wizard. Display only (the page owns navigation); it lists the
 * module's setup stages up to and including Review.
 */
export default function WizardSteps({ module, currentKey, className = '' }) {
  const all = EVENT_STAGES[module] ?? []
  const reviewIndex = all.findIndex((stage) => stage.key === 'review')
  const stages = reviewIndex === -1 ? all : all.slice(0, reviewIndex + 1)
  const currentIndex = stages.findIndex((stage) => stage.key === currentKey)

  return (
    <ol
      aria-label="Event steps"
      className={`flex flex-wrap items-center gap-2 text-sm text-v-text-subtle ${className}`}
    >
      {stages.map((stage, index) => {
        const current = index === currentIndex
        const done = currentIndex > -1 && index < currentIndex
        return (
          <li
            key={stage.key}
            aria-current={current ? 'step' : undefined}
            className="flex items-center gap-2"
          >
            <span className={current ? 'font-medium text-v-primary' : done ? 'text-v-text' : ''}>
              Step {index + 1}: {stage.label}
            </span>
            {index < stages.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </li>
        )
      })}
    </ol>
  )
}
