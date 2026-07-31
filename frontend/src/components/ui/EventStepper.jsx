import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { EVENT_STAGES, MODULE_BASE_PATH } from '@/utils/eventStages'

export default function EventStepper({ module, currentKey, eventId }) {
  const stages = EVENT_STAGES[module] ?? []
  const currentIndex = stages.findIndex((s) => s.key === currentKey)
  const base = MODULE_BASE_PATH[module]

  if (!stages.length) return null

  return (
    <ol className="flex w-full items-center gap-2 overflow-x-auto pb-1 text-sm">
      {stages.map((stage, idx) => {
        const isCurrent = idx === currentIndex
        const isCompleted = idx < currentIndex && currentIndex !== -1
        const href = eventId && stage.path
          ? eventId === 'new'
            ? `${base}/new`
            : `${base}/${eventId}/${stage.path}`
          : null

        const circleClass = isCurrent
          ? 'border-v-primary bg-v-primary text-white'
          : isCompleted
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-v-border-strong text-v-text-subtle'

        const labelClass = isCurrent
          ? 'text-v-text font-medium'
          : isCompleted
            ? 'text-v-text'
            : 'text-v-text-subtle'

        const inner = (
          <span className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${circleClass}`}
              aria-hidden
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : idx + 1}
            </span>
            <span className={`whitespace-nowrap ${labelClass}`}>{stage.label}</span>
          </span>
        )

        return (
          <li key={stage.key} className="flex items-center gap-2">
            {href && !isCurrent ? (
              <Link to={href} className="hover:opacity-80">
                {inner}
              </Link>
            ) : (
              inner
            )}
            {idx < stages.length - 1 && (
              <span
                className={`mx-1 h-px w-6 shrink-0 ${
                  idx < currentIndex ? 'bg-emerald-500' : 'bg-v-border'
                }`}
                aria-hidden
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
