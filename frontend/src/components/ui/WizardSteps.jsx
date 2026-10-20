import { Check, ChevronRight } from 'lucide-react'
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
      className={`v-card-sm flex flex-wrap items-center gap-x-1 gap-y-2 p-3 text-sm ${className}`}
    >
      {stages.map((stage, index) => {
        const current = index === currentIndex
        const done = currentIndex > -1 && index < currentIndex
        return (
          <li
            key={stage.key}
            aria-current={current ? 'step' : undefined}
            className="flex items-center gap-1"
          >
            <span
              className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 ${
                current
                  ? 'bg-v-primary-soft font-semibold text-v-primary'
                  : done
                    ? 'text-v-text'
                    : 'text-v-text-subtle'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  current
                    ? 'bg-v-primary text-white'
                    : done
                      ? 'bg-v-success text-white'
                      : 'bg-v-surface-elevated text-v-text-subtle'
                }`}
                aria-hidden="true"
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
              </span>
              {stage.label}
            </span>
            {index < stages.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-v-text-subtle" aria-hidden="true" />
            )}
          </li>
        )
      })}
    </ol>
  )
}
