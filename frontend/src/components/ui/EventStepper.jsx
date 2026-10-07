import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import {
  EVENT_STAGES,
  MODULE_BASE_PATH,
  getStageProgressStatus,
} from '@/utils/eventStages'

export default function EventStepper({
  module,
  currentKey,
  eventId,
  completedKeys = [],
  readOnly = false,
  eventStatus = null,
}) {
  const stages = EVENT_STAGES[module] ?? []
  const currentIndex = stages.findIndex((s) => s.key === currentKey)
  const base = MODULE_BASE_PATH[module]

  if (!stages.length) return null

  return (
    <nav aria-label="Event setup progress" className="w-full print:hidden">
      <ol className="flex w-full items-start overflow-x-auto pb-2 text-sm">
        {stages.map((stage, idx) => {
          const isCurrent = idx === currentIndex
          const status = getStageProgressStatus(module, stage.key, {
            currentKey,
            completedKeys,
            eventStatus,
            readOnly,
          })
          const isDone = status === 'Completed' && !isCurrent
          const isAvailable = status === 'Available'
          const href = eventId && stage.path
            ? eventId === 'new'
              ? `${base}/new`
              : `${base}/${eventId}/${stage.path}`
            : null

          const circleClass = isCurrent
            ? 'border-v-primary bg-v-primary text-white ring-4 ring-v-primary-soft'
            : isDone
              ? 'border-v-success bg-v-success text-white'
              : 'border-v-border-strong bg-v-surface text-v-text-subtle'

          const statusClass = isCurrent
            ? 'font-medium text-v-primary'
            : isDone
              ? 'text-v-success'
              : isAvailable
                ? 'text-v-text-muted'
                : 'text-v-text-subtle'

          const inner = (
            <span className="flex min-w-[7.5rem] flex-1 flex-col">
              <span className="flex items-center">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${circleClass}`}
                  aria-hidden="true"
                >
                  {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : idx + 1}
                </span>
                {idx < stages.length - 1 && (
                  <span
                    className={`mx-2 h-px min-w-5 flex-1 ${isDone ? 'bg-v-success' : 'bg-v-border'}`}
                    aria-hidden="true"
                  />
                )}
              </span>
              <span
                className={`mt-2 whitespace-nowrap text-xs ${
                  isCurrent || isDone ? 'text-v-text' : 'text-v-text-muted'
                }`}
              >
                {stage.label}
              </span>
              <span className={`mt-0.5 text-[11px] ${statusClass}`}>{status}</span>
            </span>
          )

          return (
            <li
              key={stage.key}
              className="flex min-w-[7.5rem] flex-1"
              aria-current={isCurrent ? 'step' : undefined}
            >
              {href && !isCurrent ? (
                <Link
                  to={href}
                  className="flex flex-1 rounded-md outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-v-primary focus-visible:ring-offset-2"
                  aria-label={`${stage.label} - ${status}`}
                >
                  {inner}
                </Link>
              ) : (
                <span className="flex flex-1">{inner}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
