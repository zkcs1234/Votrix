import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Zap, CheckCircle2, Users, Vote, Trophy, BarChart2, BarChart3, ArrowRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import { organizerService } from '@/services/organizer.service'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useSocketEvent } from '@/hooks/useSocketEvent'

function StatCardSkeleton() {
  return (
    <div className="v-card-sm">
      <div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
      <div className="mt-2 h-8 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
    </div>
  )
}

function ModuleLinkSkeleton() {
  return (
    <div className="v-card-md flex flex-col gap-2">
      <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
      <div className="h-4 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
    </div>
  )
}

function ListSkeleton({ count = 5 }) {
  return (
    <ul className="mt-3 space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="flex items-center justify-between rounded-lg border border-v-border px-3 py-2"
        >
          <div className="space-y-1">
            <div className="h-4 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <div className="h-3 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
          </div>
          <div className="h-6 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
        </li>
      ))}
    </ul>
  )
}

function ChartSkeleton() {
  return (
    <ul className="mt-3 space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center justify-between rounded-lg border border-v-border px-3 py-2">
          <div className="h-4 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="h-4 w-12 animate-pulse rounded-lg bg-v-surface-elevated" />
        </li>
      ))}
    </ul>
  )
}

export default function OrganizerDashboardPage() {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Use delayed loading - only show skeleton after 300ms
  const showLoader = useDelayedLoading(loading, 300)

  useEffect(() => {
    let alive = true

    const load = async () => {
      try {
        const [dashboardRes, analyticsRes] = await Promise.all([
          organizerService.getDashboard(),
          organizerService.getAnalytics(),
        ])
        if (!alive) return
        setDashboard(dashboardRes.data)
        setAnalytics(analyticsRes.data)
        setError(null)
      } catch (err) {
        if (!alive) return
        setError(err.response?.data?.message || 'Failed to load organizer dashboard')
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [])

  // Real-time updates via WebSocket - no more polling!
  useSocketEvent('organizer:stats-updated', () => {
    organizerService.getDashboard().then(({ data }) => setDashboard(data))
  })

  // Show nothing under 300ms
  if (loading && !showLoader) {
    return null
  }

  // Show skeleton after 300ms
  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div className="v-card-md">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <ModuleLinkSkeleton />
          <ModuleLinkSkeleton />
          <ModuleLinkSkeleton />
        </div>

        <div className="v-card-md">
          <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card padding="sm">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <ListSkeleton count={3} />
          </Card>

          <Card padding="sm">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <ChartSkeleton />
          </Card>
        </div>
      </div>
    )
  }

  if (error) return <p className="text-sm text-v-danger">{error}</p>

  const stats = dashboard?.stats
  const monthlyEvents = analytics?.charts?.monthlyEvents ?? []
  const participation = analytics?.charts?.eventParticipation ?? []

  return (
    <div className="space-y-6">
      <div className="v-card-md">
        <h2 className="v-page-title">Organizer dashboard</h2>
        <p className="v-caption mt-2">
          Signed in as <span className="text-v-text-muted">{user?.email}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total events" value={stats?.totalEvents ?? 0} icon={CalendarDays} />
        <StatCard label="Active events" value={stats?.activeEvents ?? 0} icon={Zap} />
        <StatCard label="Finished events" value={stats?.finishedEvents ?? 0} icon={CheckCircle2} />
        <StatCard label="Assigned voters" value={stats?.totalAssignedVoters ?? 0} icon={Users} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          to="/organizer/election"
          className="v-card-md flex flex-col gap-2 transition hover:border-v-border-strong"
        >
          <div className="flex items-center gap-2">
            <Vote className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
            <h3 className="v-section-title">Election module</h3>
          </div>
          <p className="v-caption">
            Manage events, positions, candidates, and voters.
          </p>
        </Link>
        <Link
          to="/organizer/competition"
          className="v-card-md flex flex-col gap-2 transition hover:border-v-border-strong"
        >
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
            <h3 className="v-section-title">Competition Scoring module</h3>
          </div>
          <p className="v-caption">
            Contestants, criteria, judge scoring, and rankings.
          </p>
        </Link>
        <Link
          to="/organizer/polling"
          className="v-card-md flex flex-col gap-2 transition hover:border-v-border-strong"
        >
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
            <h3 className="v-section-title">Polling module</h3>
          </div>
          <p className="v-caption">
            Build surveys, configure settings, and view analytics.
          </p>
        </Link>
      </div>

      <Link
        to="/organizer/reports"
        className="v-card-md block transition hover:border-v-border-strong"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
          <h3 className="v-section-title">Analytics &amp; reports</h3>
        </div>
        <p className="v-caption mt-2">
          Turnout reports, vote summaries, competition rankings, and polling charts.
        </p>
      </Link>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="sm">
          <h3 className="v-section-title">Recent activity</h3>
          {!(dashboard?.recentActivity ?? []).length ? (
            <p className="v-caption mt-3">No recent activity</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {(dashboard?.recentActivity ?? []).slice(0, 5).map((item, idx) => (
                <li key={`${item.type}-${item.timestamp}-${idx}`} className="rounded-lg border border-v-border px-3 py-2">
                  <p className="v-body-text">{item.label}</p>
                  <p className="v-caption">{new Date(item.timestamp).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="sm">
          <h3 className="v-section-title">Monthly event growth</h3>
          {!monthlyEvents.length ? (
            <p className="v-caption mt-3">No event data yet</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {monthlyEvents.slice(0, 6).map((point) => (
                <li key={point.key} className="flex items-center justify-between rounded-lg border border-v-border px-3 py-2">
                  <span className="v-caption">{point.label}</span>
                  <span className="v-body-text font-medium">{point.value}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card padding="sm">
        <h3 className="v-section-title">Participation by module</h3>
        {!participation.length ? (
          <p className="v-caption mt-3">No participation data yet</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {participation.map((row) => (
              <li key={row.module} className="rounded-lg border border-v-border px-3 py-2">
                <p className="v-body-text font-medium">{row.module}</p>
                <p className="v-caption">
                  Participated: {row.participated} / {row.assigned} ({row.rate}%)
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}