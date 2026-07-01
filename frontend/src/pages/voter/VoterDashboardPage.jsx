import { useEffect, useState } from 'react'
import { CalendarCheck2, Zap, CheckCircle2, CalendarDays, Vote, Trophy, BarChart2 } from 'lucide-react'
import { voterService } from '@/services/voter.service'
import { useAuth } from '@/hooks/useAuth'
import {
  SkeletonEventCard,
} from '@/components/ui/Skeleton'
import VoterEventCard from '@/components/voter/VoterEventCard'
import Card from '@/components/ui/Card'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

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

function StatCard({ label, value, accent, icon: Icon }) {
  return (
    <div className="v-card-sm">
      <div className="flex items-center justify-between">
        <p className="v-caption">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />}
      </div>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${accent}`}>{value}</p>
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="v-card-sm">
      <div className="h-4 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
      <div className="mt-2 h-8 w-12 animate-pulse rounded-lg bg-v-surface-elevated" />
    </div>
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

  // Use delayed loading - only show skeleton after 300ms
  const showLoader = useDelayedLoading(loading, 300)

  useEffect(() => {
    let alive = true

    const load = () => {
      voterService
        .getOverview()
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
    const id = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  // Show nothing under 300ms - prevents loading flicker
  if (loading && !showLoader) {
    return null
  }

  // Show skeleton after 300ms
  if (loading || showLoader) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="v-card-md">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Assigned" value={stats.assigned} accent="v-stat-accent" icon={CalendarCheck2} />
        <StatCard label="Active now" value={stats.active} accent="v-stat-success" icon={Zap} />
        <StatCard label="Completed" value={stats.completed} accent="v-stat-muted" icon={CheckCircle2} />
        <StatCard label="Total" value={stats.total} accent="v-text" icon={CalendarDays} />
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