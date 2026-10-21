import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Vote, Trophy, BarChart2, ArrowRight, UserCheck, Eye } from 'lucide-react'
import VoterStatusBadge from '@/components/voter/VoterStatusBadge'
import { EVENT_TYPE_META, PARTICIPANT_TYPE_META } from '@/services/voter.service'
import Badge from '@/components/ui/Badge'

const TYPE_BORDER = {
  election: 'border-v-border hover:border-v-border-strong',
  pageant: 'border-v-border hover:border-v-border-strong',
  competition_scoring: 'border-v-border hover:border-v-border-strong',
  polling: 'border-v-border hover:border-v-border-strong',
}

const TYPE_ICON = {
  election: Vote,
  pageant: Trophy,
  competition_scoring: Trophy,
  polling: BarChart2,
}

// Fallback gradients for when no banner is available
const TYPE_GRADIENT = {
  election: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 50%, #0f766e 100%)',
  pageant: 'linear-gradient(135deg, #047857 0%, #0891b2 55%, #4338ca 100%)',
  competition_scoring: 'linear-gradient(135deg, #047857 0%, #0891b2 55%, #4338ca 100%)',
  polling: 'linear-gradient(135deg, #c2410c 0%, #be123c 55%, #4338ca 100%)',
}

const TYPE_MODULE = {
  election: 'election',
  pageant: 'competition-scoring',
  competition_scoring: 'competition-scoring',
  polling: 'polling',
}

export default function VoterEventCard({ event, showAction = true }) {
  const meta = EVENT_TYPE_META[event.eventType] ?? { label: event.eventType }
  const TypeIcon = TYPE_ICON[event.eventType] ?? Vote
  const [bannerFailed, setBannerFailed] = useState(false)
  const showBanner = Boolean(event.banner && event.banner.length > 0) && !bannerFailed
  const fallbackGradient = TYPE_GRADIENT[event.eventType] ?? TYPE_GRADIENT.election
  const participantMeta = PARTICIPANT_TYPE_META[event.participantType]
  const roleLabel = participantMeta?.label ?? null
  const CardWrapper = event.actionPath ? Link : 'article'

  if(Array.isArray(event.nativeContexts)) {
    return (
      <article data-module={TYPE_MODULE[event.eventType]} className={`overflow-hidden rounded-2xl border bg-v-surface shadow-v-shadow-sm transition-shadow hover:shadow-v-shadow-md ${TYPE_BORDER[event.eventType] ?? 'border-v-border'}`}>
        <div className="relative h-36 w-full overflow-hidden sm:h-40" style={showBanner ? {} : { background: fallbackGradient }}>
          {showBanner && <img src={event.banner} alt="" className="h-full w-full object-cover" onError={() => setBannerFailed(true)} />}
          <div className="absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-transparent" />
        </div>
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <TypeIcon className="h-3.5 w-3.5 text-v-text-subtle" strokeWidth={2} aria-hidden />
              <p className="text-xs font-medium uppercase tracking-wide text-v-text-subtle">{meta.label}</p>
              {roleLabel && <Badge variant="outline" size="sm" className="ml-1"><UserCheck className="mr-0.5 h-3 w-3 inline" aria-hidden />{roleLabel}</Badge>}
            </div>
            <VoterStatusBadge bucket={event.bucket} label={event.statusLabel} />
          </div>
          <h4 className="mt-2 wrap-break-word text-base font-semibold leading-snug text-v-text">{event.title}</h4>
          {event.description && <p className="mt-1 text-sm text-v-text-subtle line-clamp-2">{event.description}</p>}
          <nav className="mt-2 flex flex-wrap gap-2" aria-label={`Categories for ${event.title}`}>
            {event.nativeContexts.map((context) => {
              const query = new URLSearchParams({ competitionId: context.competitionId, ...(context.roundId ? { roundId: context.roundId } : {}) })
              return (
                <Link
                  key={`${context.competitionId}:${context.roundId ?? 'single'}:${context.reviewer ? 'review' : 'judge'}`}
                  to={`/participant/competition/events/${event.id}/score?${query}`}
                  className="inline-flex min-h-9 items-center rounded-lg border border-v-border bg-v-surface-elevated px-3 py-2 text-sm font-medium text-v-text transition-colors hover:border-v-border-strong hover:bg-v-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v-primary"
                >
                  <span>{context.competitionName} ({context.roundName})</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </article>
    )
  }

  return (
    <CardWrapper
      {...(event.actionPath ? { to: event.actionPath } : {})}
      data-module={TYPE_MODULE[event.eventType]}
      className={`block overflow-hidden rounded-2xl border bg-v-surface shadow-v-shadow-sm transition-shadow hover:shadow-v-shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v-primary ${TYPE_BORDER[event.eventType] ?? 'border-v-border'}`}
    >
      <div
        className="relative h-36 w-full overflow-hidden sm:h-40"
        style={showBanner ? {} : { background: fallbackGradient }}
      >
        {showBanner && (
          <img
            src={event.banner}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setBannerFailed(true)}
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-transparent" />
      </div>

      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <TypeIcon className="h-3.5 w-3.5 text-v-text-subtle" strokeWidth={2} aria-hidden />
            <p className="text-xs font-medium uppercase tracking-wide text-v-text-subtle">{meta.label}</p>
            {roleLabel && (
              <Badge variant="outline" size="sm" className="ml-1">
                <UserCheck className="mr-0.5 h-3 w-3 inline" aria-hidden />
                {roleLabel}
              </Badge>
            )}
          </div>
          <VoterStatusBadge bucket={event.bucket} label={event.statusLabel} />
        </div>
        <h4 className="mt-2 truncate font-semibold text-v-text">{event.title}</h4>
        {event.description && <p className="mt-1 text-sm text-v-text-subtle line-clamp-2">{event.description}</p>}
        {event.eventType === 'election' && event.totalSections > 1 && (
          <p className="mt-2 text-xs text-v-text-muted">
            {event.submittedSections} of {event.totalSections} ballots submitted
          </p>
        )}
        {showAction && event.bucket === 'active' && (
          <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-v-primary">
            {event.actionLabel}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </p>
        )}
        {event.eventType === 'election' && event.canViewResults && event.results && (
          <p className="mt-3 flex items-center gap-1 text-sm font-medium text-v-accent">
            <Eye className="h-3.5 w-3.5" strokeWidth={2} />
            Results available
          </p>
        )}
      </div>
    </CardWrapper>
  )
}
