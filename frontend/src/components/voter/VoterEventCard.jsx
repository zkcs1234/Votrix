import { Link } from 'react-router-dom'
import { Vote, Trophy, BarChart2, ArrowRight } from 'lucide-react'
import VoterStatusBadge from '@/components/voter/VoterStatusBadge'
import { EVENT_TYPE_META } from '@/services/voter.service'

const TYPE_BORDER = {
  election: 'border-v-border hover:border-v-border-strong',
  pageant: 'border-v-border hover:border-v-border-strong',
  competition_scoring: 'border-v-border hover:border-v-border-strong',
  polling: 'border-v-border hover:border-v-border-strong',
}

const TYPE_ACCENT = {
  election: 'text-v-text-muted',
  pageant: 'text-v-text-muted',
  competition_scoring: 'text-v-text-muted',
  polling: 'text-v-text-muted',
}

const TYPE_ICON = {
  election: Vote,
  pageant: Trophy,
  competition_scoring: Trophy,
  polling: BarChart2,
}

// Fallback gradients for when no banner is available
const TYPE_GRADIENT = {
  election: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
  pageant: 'linear-gradient(135deg, #059669 0%, #0891b2 100%)',
  competition_scoring: 'linear-gradient(135deg, #059669 0%, #0891b2 100%)',
  polling: 'linear-gradient(135deg, #ea580c 0%, #dc2626 100%)',
}

export default function VoterEventCard({ event, showAction = true }) {
  const meta = EVENT_TYPE_META[event.eventType] ?? { label: event.eventType }
  const TypeIcon = TYPE_ICON[event.eventType] ?? Vote
  const hasBanner = event.banner && event.banner.length > 0
  const fallbackGradient = TYPE_GRADIENT[event.eventType] ?? TYPE_GRADIENT.election

  return (
    <Link
      to={event.actionPath}
      className={`block rounded-xl border bg-v-surface overflow-hidden transition ${TYPE_BORDER[event.eventType] ?? 'border-v-border'}`}
    >
      {/* Banner Image or Fallback Gradient */}
      <div
        className="relative h-28 w-full overflow-hidden"
        style={hasBanner ? {} : { background: fallbackGradient }}
      >
        {hasBanner && (
          <img
            src={event.banner}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <TypeIcon className={`h-3.5 w-3.5 ${TYPE_ACCENT[event.eventType]}`} strokeWidth={2} aria-hidden />
              <p className={`text-xs font-medium uppercase tracking-wide ${TYPE_ACCENT[event.eventType]}`}>
                {meta.label}
              </p>
            </div>
            <h4 className="mt-1 font-medium text-v-text truncate">{event.title}</h4>
            {event.description && (
              <p className="mt-1 text-sm text-v-text-subtle line-clamp-2">{event.description}</p>
            )}
          </div>
          <VoterStatusBadge bucket={event.bucket} label={event.statusLabel} />
        </div>
        {showAction && event.bucket === 'active' && (
          <p className="mt-3 flex items-center gap-1 text-sm font-medium text-v-text">
            {event.actionLabel}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </p>
        )}
      </div>
    </Link>
  )
}
