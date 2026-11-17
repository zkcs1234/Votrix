import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarCheck2, Trophy, Zap } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { voterService } from '@/services/voter.service'
import useLatestRequest from '@/hooks/useLatestRequest'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import { participantKind } from '@/utils/workspace'
import { formatDate } from '@/utils/participantFormat'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import FormAlert from '@/components/ui/FormAlert'
import { SkeletonEventCard, SkeletonStatCard } from '@/components/ui/Skeleton'
import OfficerWorkspaceCard from '@/components/organizer/OfficerWorkspaceCard'
import VoterEventCard from '@/components/voter/VoterEventCard'

const KIND_DESCRIPTION = {
  student: 'Elections and polls you are enrolled in appear here.',
  judge: 'Competitions you are judging appear here.',
  participant: 'Elections, polls and competitions you are enrolled in appear here.',
}

function SectionHeading({ title, to, linkLabel }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-2">
      <h2 className="v-section-title">{title}</h2>
      {to && (
        <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-v-primary hover:underline">
          {linkLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  )
}

// A short summary, not a list of everything: what needs you now, what is next,
// and anything new in Results. The full lists live on their own pages.
export default function ParticipantOverviewPage() {
  const { user } = useAuth()
  const kind = participantKind(user)
  const [events, setEvents] = useState(null)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const showLoader = useDelayedLoading(loading, 300)

  const beginRequest = useLatestRequest(user?.id)
  const reload = useCallback(async () => {
    const isCurrent = beginRequest()
    try {
      const { data } = await voterService.getEvents({ limit: 50 })
      if (!isCurrent()) return
      setEvents(data)
      setError(null)
    } catch (err) {
      if (isCurrent()) setError(err.response?.data?.message ?? 'Failed to load your overview')
    } finally {
      if (isCurrent()) setLoading(false)
    }
    // The results teaser is a nicety: if it fails the rest of the page still works.
    try {
      const { data } = await voterService.getResults({ limit: 50 })
      if (isCurrent()) setResults((data.items ?? []).filter((item) => item.state !== 'pending'))
    } catch {
      if (isCurrent()) setResults([])
    }
  }, [beginRequest])

  useEffect(() => {
    setEvents(null)
    setLoading(true)
    void reload()
  }, [reload])
  useSocketEvent('election:voting-toggled', reload)
  useSocketEvent('poll:polling-toggled', reload)
  useCompetitionSync(null, reload)

  if (loading && !showLoader) return null

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
        <SkeletonEventCard />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-3">
        <FormAlert variant="error">{error}</FormAlert>
        <Button onClick={reload}>Retry</Button>
      </div>
    )
  }

  const all = events?.events ?? []
  const active = all.filter((event) => event.bucket === 'active')
  const upcoming = all.filter((event) => event.bucket === 'assigned')
  const nextUp = upcoming[0]
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <OfficerWorkspaceCard />
      <PageHeader
        title="Participant Dashboard"
        description={
          <>
            Signed in as <span className="text-v-text-muted">{name}</span>. {KIND_DESCRIPTION[kind]}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Needs you now" value={events?.counts?.active ?? 0} valueClassName="v-stat-success" icon={Zap} />
        <StatCard label="Coming up" value={events?.counts?.assigned ?? 0} valueClassName="v-stat-accent" icon={CalendarCheck2} />
        <StatCard label="Results ready" value={results.length} valueClassName="text-v-text" icon={Trophy} />
      </div>

      <section>
        <SectionHeading title="Needs your action" to={active.length ? '/participant/my-events' : undefined} linkLabel="See all events" />
        {active.length ? (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {active.slice(0, 3).map((event) => (
              <li key={event.dashboardKey ?? `${event.eventType}-${event.id}`}>
                <VoterEventCard event={event} />
              </li>
            ))}
          </ul>
        ) : (
          <Card padding="sm" className="text-center">
            <p className="text-sm font-medium text-v-text">Nothing needs you right now</p>
            <p className="v-caption mt-1">When an event opens for you, it shows up here.</p>
          </Card>
        )}
      </section>

      {nextUp && (
        <section>
          <SectionHeading title="Coming up" to="/participant/my-events" linkLabel="See all events" />
          <VoterEventCard event={nextUp} />
          {nextUp.startDate && <p className="v-caption mt-2">Opens {formatDate(nextUp.startDate)}</p>}
        </section>
      )}

      {results.length > 0 && (
        <section>
          <SectionHeading title="New results" to="/participant/results" linkLabel="See all results" />
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {results.slice(0, 3).map((item) => (
              <li key={item.id}>
                <Card padding="sm">
                  <p className="text-sm font-medium text-v-text">{item.title}</p>
                  <p className="v-caption mt-0.5">
                    {item.kind === 'election'
                      ? item.state === 'live' ? 'Live results are available' : 'Results are available'
                      : `Official results published ${formatDate(item.publishedAt)}`}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {all.length === 0 && (
        <Card padding="sm" className="text-center">
          <p className="text-sm font-medium text-v-text">No events assigned yet</p>
          <p className="v-caption mt-1">Check back when an organizer invites you to participate.</p>
        </Card>
      )}
    </div>
  )
}
