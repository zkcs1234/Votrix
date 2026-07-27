import { useEffect, useState } from 'react'
import { CalendarCheck2, Zap, CheckCircle2, CalendarDays, Vote, Trophy, BarChart2 } from 'lucide-react'
import { voterService, PARTICIPANT_TYPE_META } from '@/services/voter.service'
import { useAuth } from '@/hooks/useAuth'
import {
  SkeletonEventCard,
  SkeletonStatCard,
} from '@/components/ui/Skeleton'
import StatCard from '@/components/ui/StatCard'
import VoterEventCard from '@/components/voter/VoterEventCard'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useSocketEvent } from '@/hooks/useSocketEvent'

const ROLE_ICONS = {
  ELECTION_VOTER: Vote,
  COMPETITION_JUDGE: Trophy,
  POLLING_RESPONDENT: BarChart2,
}

function RoleSummaryCard({ participantType, count, icon: Icon, label }) {
  if (!count || count === 0) return null
  const roleBadgeLabel =
    participantType === 'ELECTION_VOTER'
      ? 'Voter'
      : participantType === 'COMPETITION_JUDGE'
        ? 'Judge'
        : 'Respondent'

  return (
    <div className="flex items-center gap-3 rounded-xl border border-v-border bg-v-surface p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-v-surface-elevated">
        <Icon className="h-5 w-5 text-v-text" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium text-v-text">{label}</p>
        <p className="text-xs text-v-text-subtle">
          {count} event{count !== 1 ? 's' : ''}
        </p>
      </div>
      <Badge variant="outline" size="sm" className="ml-auto">
        {roleBadgeLabel}
      </Badge>
    </div>
  )
}

function EventSection({ title, description, events }) {
  if (!events?.length) return null

  return (
    <section>
      <div className="mb-3">
        <h3 className="v-section-title">{title}</h3>
        {description && <p className="v-caption">{description}</p>}
      </div>
      <ul className="space-y-2">
        {events.map((event) => (
          <li key={`${event.eventType}-${event.id}`}>
            <VoterEventCard event={event} />
          </li>
        ))}
      </ul>
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

  useEffect(() => {
    let alive = true

    const load = () => {
      voterService.getOverview()
        .then(({ data: res }) => {
          if (!alive) return
          setData(res)
          setError(null)
        })
        .catch((err) => {
          if (!alive) return
          setError(err.response?.data?.message || 'Failed to load dashboard')
        })
        .finally(() => {
          if (!alive) return
          setLoading(false)
        })
    }

    load()
    return () => {
      alive = false
    }
  }, [])

  const reload = () => {
    voterService.getOverview().then(({ data: res }) => {
      setData(res)
    })
  }

  useSocketEvent('election:voting-toggled', reload)
  useSocketEvent('poll:polling-toggled', reload)
  useSocketEvent('competition:scoring-toggled', reload)

  if (loading && !showLoader) {
    return null
  }

  if (loading || showLoader) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="v-card-md">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
    return <p className="text-sm text-v-danger">{error}</p>
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="v-card-md">
        <h2 className="v-page-title">Your events</h2>
        <p className="v-caption mt-2">
          Signed in as <span className="text-v-text-muted">{user?.email}</span>
        </p>
        <p className="v-caption mt-1">
          Elections, competition judging, and polls assigned to you appear below.
        </p>
      </div>

      {Object.keys(roleCounts).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-v-text-subtle">Your roles</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries(PARTICIPANT_TYPE_META).map(([type, meta]) => {
              const count = roleCounts[type] || 0
              if (count === 0) return null
              const Icon = ROLE_ICONS[type] ?? Vote
              return (
                <RoleSummaryCard
                  key={type}
                  participantType={type}
                  count={count}
                  icon={Icon}
                  label={meta.label}
                />
              )
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Assigned" value={stats.assigned} valueClassName="v-stat-accent" icon={CalendarCheck2} />
        <StatCard label="Active now" value={stats.active} valueClassName="v-stat-success" icon={Zap} />
        <StatCard label="Completed" value={stats.completed} valueClassName="v-stat-muted" icon={CheckCircle2} />
        <StatCard label="Total" value={stats.total} valueClassName="text-v-text" icon={CalendarDays} />
      </div>

      <EventSection
        title="Active events"
        description="These need your vote, scores, or poll response now."
        events={data?.active}
      />

      <EventSection
        title="Assigned events"
        description="You are enrolled but voting, scoring, or the poll is not open yet."
        events={data?.assigned}
      />

      <EventSection
        title="Completed events"
        description="You have finished your participation for these events."
        events={data?.completed}
      />

      {stats.total === 0 && (
        <Card padding="sm" className="text-center">
          <p className="v-caption">No events assigned to you yet. Check back when an organizer invites you.</p>
        </Card>
      )}
    </div>
  )
}
