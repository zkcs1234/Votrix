import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { CalendarCheck2, Zap, CheckCircle2, Vote, Trophy, BarChart2, ArrowRight } from 'lucide-react'
import { voterService, PARTICIPANT_TYPE_META } from '@/services/voter.service'
import { useAuth } from '@/hooks/useAuth'
import {
  SkeletonEventCard,
  SkeletonStatCard,
} from '@/components/ui/Skeleton'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import Badge from '@/components/ui/Badge'
import ElectionResultsCard from '@/components/voter/ElectionResultsCard'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import useLatestRequest from '@/hooks/useLatestRequest'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import {nativeCompetitionService} from '@/services/competition-native.service'
import VoterStatusBadge from '@/components/voter/VoterStatusBadge'

const ROLE_ICONS = {
  ELECTION_VOTER: Vote,
  COMPETITION_JUDGE: Trophy,
  POLLING_RESPONDENT: BarChart2,
}

const ROLE_MODULES = {
  ELECTION_VOTER: 'election',
  COMPETITION_JUDGE: 'competition-scoring',
  POLLING_RESPONDENT: 'polling',
}

function formatOpeningDate(value) {
  if (!value) return 'Date not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date not set'
  return format(date, 'd MMM, HH:mm')
}

function formatOrganization(org) {
  if (!org) return 'Organization not specified'
  if (typeof org === 'string') return org
  return org.name || org.organizationName || 'Organization not specified'
}

function ParticipantEventCard({ event }) {
  const TypeIcon = ROLE_ICONS[event.participantType] ?? Vote
  const roleLabel = PARTICIPANT_TYPE_META[event.participantType]?.label

  return (
    <article
      data-module={ROLE_MODULES[event.participantType]}
      className="flex h-full flex-col rounded-xl border border-v-border bg-v-surface p-4 shadow-v-shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-v-text-subtle">
            <TypeIcon className="h-3.5 w-3.5 text-v-primary" strokeWidth={1.8} aria-hidden />
            {['competition_scoring', 'pageant'].includes(event.eventType) ? 'Competition' : event.eventType === 'polling' ? 'Polling' : 'Election'}
          </span>
          <h3 className="mt-2 text-sm font-semibold text-v-text">{event.title}</h3>
          <p className="mt-1 text-xs text-v-text-subtle">{formatOrganization(event.organization)}</p>
        </div>
        <VoterStatusBadge bucket={event.bucket || 'active'} label={event.statusLabel || 'Active'} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-v-border pt-3">
        {roleLabel && <Badge variant="outline" size="sm">{roleLabel}</Badge>}
        {Array.isArray(event.nativeContexts) ? (
          <div className="flex flex-wrap gap-2">
            {event.nativeContexts.map((context) => {
              const query = new URLSearchParams({
                competitionId: context.competitionId,
                ...(context.roundId ? { roundId: context.roundId } : {}),
              })
              return (
                <Link
                  key={`${context.competitionId}:${context.roundId ?? 'single'}`}
                  to={`/participant/competition/events/${event.id}/score?${query}`}
                  className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-v-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v-primary"
                >
                  {context.reviewer ? 'Review results' : 'Open score sheet'}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )
            })}
          </div>
        ) : event.actionPath ? (
          <Link
            to={event.actionPath}
            className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-v-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v-primary"
          >
            {event.actionLabel || 'Open event'}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : (
          <span className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-v-text-muted">
            {event.actionLabel || 'Open event'}
          </span>
        )}
      </div>
    </article>
  )
}

function EventSection({ title, description, events, variant = 'cards' }) {
  if (!events?.length) return null

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="v-section-title">{title}</h2>
          {description && <p className="v-caption mt-0.5">{description}</p>}
        </div>
        {variant === 'cards' && (
          <span className="text-sm font-semibold tabular-nums text-v-text-muted">{events.length}</span>
        )}
      </div>
      {variant === 'cards' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <ParticipantEventCard key={event.dashboardKey ?? `${event.eventType}-${event.id}`} event={event} />
          ))}
        </div>
      ) : (
        <div className="v-table-wrap">
          <table className="v-table min-w-[40rem]">
            <thead>
              <tr>
                <th>Event</th>
                <th>{variant === 'assigned' ? 'Role' : 'Status'}</th>
                <th>{variant === 'assigned' ? 'Opens' : 'Action'}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.dashboardKey ?? `${event.eventType}-${event.id}`}>
                  <td>
                    <p className="font-medium text-v-text">{event.title}</p>
                    <p className="mt-0.5 text-xs text-v-text-subtle">{formatOrganization(event.organization)}</p>
                  </td>
                  <td>
                    {variant === 'assigned'
                      ? PARTICIPANT_TYPE_META[event.participantType]?.label ?? 'Participant'
                      : <VoterStatusBadge bucket="completed" label={event.statusLabel || 'Completed'} />}
                  </td>
                  <td>
                    {variant === 'assigned' ? (
                      <span className="text-sm text-v-text-muted">{formatOpeningDate(event.startDate)}</span>
                    ) : event.actionPath ? (
                      <Link
                        to={event.actionPath}
                        className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-v-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v-primary"
                      >
                        {event.eventType === 'election' && event.canViewResults
                          ? 'View permitted results'
                          : event.eventType === 'polling'
                            ? 'Response recorded'
                            : event.eventType === 'election'
                              ? 'Ballot recorded'
                              : 'Scores submitted'}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    ) : (
                      <span className="text-sm text-v-text-muted">
                        {event.eventType === 'election' && event.canViewResults
                          ? 'View permitted results'
                          : event.eventType === 'polling'
                            ? 'Response recorded'
                            : event.eventType === 'election'
                              ? 'Ballot recorded'
                              : 'Scores submitted'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function EventSectionSkeleton() {
  return (
    <section>
      <div className="mb-3">
        <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
      </div>
      <ul className="space-y-2">
        {[1, 2, 3].map((i) => (
          <li key={i}>
            <SkeletonEventCard />
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function VoterDashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const showLoader = useDelayedLoading(loading, 300)

  const beginRequest = useLatestRequest(user?.id)
  const reload = useCallback(async () => {
    const isCurrent = beginRequest()
    try {
      const { data: res } = await voterService.getOverview()
      if (isCurrent()) { setData(res); setError(null) }
    } catch (err) {
      if (isCurrent()) setError(err.response?.data?.message ?? 'Failed to load dashboard')
    } finally { if (isCurrent()) setLoading(false) }
  }, [beginRequest])
  useEffect(() => { setData(null); setLoading(true); void reload() }, [reload])
  useSocketEvent('election:voting-toggled', reload)
  useSocketEvent('poll:polling-toggled', reload)
  const beginNativeRead=useLatestRequest(`${user?.id}:native`)
  const reloadNative=useCallback(async()=>{
    const valid=beginNativeRead()
    try{const response=await nativeCompetitionService.dashboard();if(!valid())return;setData(previous=>{if(!previous)return previous;const events=[...previous.events.filter(e=>!['competition_scoring','pageant'].includes(e.eventType)),...response.data.events];const group=b=>events.filter(e=>e.bucket===b);return {...previous,events,assigned:group('assigned'),active:group('active'),completed:group('completed'),stats:{total:events.length,assigned:group('assigned').length,active:group('active').length,completed:group('completed').length}}})}catch{if(valid())setData(previous=>{if(!previous)return previous;const events=previous.events.filter(e=>!e.nativeContext);const group=b=>events.filter(e=>e.bucket===b);return {...previous,events,assigned:group('assigned'),active:group('active'),completed:group('completed'),stats:{total:events.length,assigned:group('assigned').length,active:group('active').length,completed:group('completed').length}}})}
  },[beginNativeRead])
  useCompetitionSync(null,import.meta.env.VITE_COMPETITION_NATIVE_SCORING_ENABLED==='true'?reloadNative:reload)

  if (loading && !showLoader) {
    return null
  }

  if (loading || showLoader) {
    return (
      <div className="v-dashboard mx-auto max-w-6xl space-y-6">
        <div className="v-card-md">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
        <EventSectionSkeleton />
        <EventSectionSkeleton />
      </div>
    )
  }

  if (error) {
    return <div className="space-y-3"><FormAlert variant="error">{error}</FormAlert><Button onClick={reload}>Retry dashboard</Button></div>
  }

  const stats = data?.stats ?? { total: 0, active: 0, assigned: 0, completed: 0 }

  const roleCounts = {}
  if (data?.events) {
    for (const event of data.events) {
      const pt = event.participantType
      if (pt) {
        roleCounts[pt] = (roleCounts[pt] || 0) + 1
      }
    }
  }

  return (
    <div className="v-dashboard mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Participant dashboard"
        description={`Welcome, ${user?.firstName || user?.email || 'participant'}. Your next opportunity to take part is here.`}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Active events" value={stats.active} valueClassName="v-stat-success" icon={Zap} />
        <StatCard label="Assigned events" value={stats.assigned} valueClassName="v-stat-accent" icon={CalendarCheck2} />
        <StatCard label="Completed events" value={stats.completed} valueClassName="v-stat-muted" icon={CheckCircle2} />
      </div>

      <EventSection
        title="Active events"
        description="These need your vote, scores, or poll response now."
        events={data?.active}
      />

      <EventSection
        title="Assigned events"
        description="Available when the schedule opens."
        events={data?.assigned}
        variant="assigned"
      />

      <EventSection
        title="Completed events"
        description="Results are shown only when available and permitted."
        events={data?.completed}
        variant="completed"
      />

      {/* Election results section */}
      {data?.events?.filter((e) => e.eventType === 'election' && e.canViewResults && e.results).length > 0 && (
        <section>
          <div className="mb-3">
            <h3 className="v-section-title">Election Results</h3>
            <p className="v-caption">View results for elections you are enrolled in.</p>
          </div>
          <div className="space-y-4">
            {data.events
              .filter((e) => e.eventType === 'election' && e.canViewResults && e.results)
              .map((event) => (
                <ElectionResultsCard
                  key={event.id}
                  results={event.results}
                  electionTitle={event.title}
                  resultsVisibility={event.resultsVisibility}
                />
              ))}
          </div>
        </section>
      )}

      {stats.total === 0 && (
        <Card padding="sm" className="text-center">
          <p className="text-sm font-medium text-v-text">No events assigned yet</p>
          <p className="v-caption mt-1">Check back when an organizer invites you to participate.</p>
        </Card>
      )}
    </div>
  )
}
