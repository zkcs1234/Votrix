import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, CalendarDays, UserCheck, UserPlus, Zap, CheckSquare,
  Vote, Trophy, BarChart2, CheckCircle2, AlertCircle, XCircle,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import StatCard from '@/components/ui/StatCard'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import { AreaChartView } from '@/components/charts'
import {
  SkeletonStatCard,
  SkeletonModuleLink,
  SkeletonList,
  SkeletonChart,
} from '@/components/ui/Skeleton'
import { adminService } from '@/services/admin.service'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useSocketEvent } from '@/hooks/useSocketEvent'

const formatActivityTime = (timestamp) =>
  new Date(timestamp).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

// Operational health summary built from the existing system-health endpoint.
function HealthSummary({ health, unavailable }) {
  if (unavailable) {
    return (
      <FormAlert variant="warning" title="Health status unavailable">
        The health check could not be reached. Open System Health to retry.
      </FormAlert>
    )
  }
  if (!health) {
    return <div className="h-16 animate-pulse rounded-lg bg-v-surface-elevated" aria-hidden />
  }

  const overall = health.overall
  const variant = overall === 'healthy' ? 'success' : overall === 'degraded' ? 'warning' : 'error'
  const title =
    overall === 'healthy'
      ? 'All core services operational'
      : overall === 'degraded'
        ? 'Some services are degraded'
        : 'Service outage detected'
  const checked = health.checkedAt ? ` Last checked ${format(parseISO(health.checkedAt), 'd MMM yyyy, HH:mm')}.` : ''

  return (
    <div className="space-y-3">
      <FormAlert variant={variant} title={title}>
        {`${(health.services ?? []).map((svc) => svc.service).join(', ')}${checked ? `.${checked}` : ''}`}
      </FormAlert>
      <ul className="divide-y divide-v-border text-sm">
        {(health.services ?? []).map((svc) => {
          const Icon = svc.status === 'healthy' ? CheckCircle2 : svc.status === 'degraded' ? AlertCircle : XCircle
          const tone = svc.status === 'healthy' ? 'text-v-success' : svc.status === 'degraded' ? 'text-v-warning' : 'text-v-danger'
          return (
            <li key={svc.service} className="flex items-center justify-between gap-3 py-2">
              <span className="capitalize text-v-text">{svc.service}</span>
              <span className={`inline-flex items-center gap-1.5 font-medium capitalize ${tone}`}>
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                {svc.status}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [health, setHealth] = useState(null)
  const [healthUnavailable, setHealthUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Use delayed loading - only show skeleton after 300ms
  const showLoader = useDelayedLoading(loading, 300)

  useEffect(() => {
    let alive = true

    const load = async () => {
      try {
        const [dashboardRes, analyticsRes] = await Promise.all([
          adminService.getDashboard(),
          adminService.getAnalytics(),
        ])
        if (!alive) return
        setDashboard(dashboardRes.data)
        setAnalytics(analyticsRes.data)
        setError(null)
      } catch (err) {
        if (!alive) return
        setError(err.response?.data?.message || 'Failed to load admin dashboard')
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [])

  // Health is secondary: it loads independently so a slow or failing check
  // never blocks or breaks the rest of the dashboard.
  useEffect(() => {
    let alive = true
    adminService
      .getSystemHealth()
      .then(({ data }) => {
        if (alive) setHealth(data)
      })
      .catch(() => {
        if (alive) setHealthUnavailable(true)
      })
    return () => {
      alive = false
    }
  }, [])

  // Real-time updates via WebSocket - no more polling!
  useSocketEvent('platform:stats-updated', () => {
    adminService.getDashboard().then(({ data }) => setDashboard(data))
  })

  // Show nothing under 300ms
  if (loading && !showLoader) {
    return null
  }

  // Show skeleton after 300ms
  if (loading || showLoader) {
    return (
      <div className="v-dashboard space-y-6">
        <div className="v-card-md">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonModuleLink />
          <SkeletonModuleLink />
          <SkeletonModuleLink />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card padding="sm">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <SkeletonList count={3} />
          </Card>

          <Card padding="sm">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <SkeletonList count={3} />
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card padding="sm">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <SkeletonChart />
          </Card>
          <Card padding="sm">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <SkeletonChart />
          </Card>
        </div>
      </div>
    )
  }

  if (error) {
    return <FormAlert variant="error" title="Couldn't load the dashboard">{error}</FormAlert>
  }

  const stats = dashboard?.stats
  const recentActivity = dashboard?.recentActivity ?? []
  const monthlyEvents = analytics?.charts?.monthlyEvents ?? []
  const participantGrowth = analytics?.charts?.participantGrowth ?? analytics?.charts?.voterGrowth ?? []

  const electionEvents = stats?.totalElectionEvents ?? 0
  const competitionEvents = stats?.totalPageantEvents ?? 0
  const pollingEvents = stats?.totalPollingEvents ?? 0
  const eventCount = (n) => `${n} event${n === 1 ? '' : 's'}`

  return (
    <div className="v-dashboard space-y-6">
      <PageHeader
        title="Admin dashboard"
        description="Platform-wide oversight, account administration and operational health."
        actions={
          <>
            <Link to="/admin/users?tab=participants">
              <Button variant="secondary">
                <UserPlus className="h-4 w-4" strokeWidth={2} />
                Add participant
              </Button>
            </Link>
            <Link to="/admin/users?tab=organizers">
              <Button>
                <UserPlus className="h-4 w-4" strokeWidth={2} />
                Add organizer
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total organizers"
          value={stats?.totalOrganizers ?? 0}
          hint={stats?.activeOrganizations != null ? `${stats.activeOrganizations} active organizations` : undefined}
          icon={Users}
        />
        <StatCard label="Total events" value={stats?.totalEvents ?? 0} hint="Across all modules" icon={CalendarDays} />
        <StatCard
          label="Participant accounts"
          value={stats?.totalParticipants ?? stats?.totalVoters ?? 0}
          hint="Shared account pool"
          icon={UserCheck}
        />
        <StatCard label="Active events" value={stats?.activeEvents ?? 0} hint="Currently in progress" icon={Zap} />
        <StatCard label="Votes cast" value={stats?.totalVotesCast ?? 0} hint="Recorded selections" icon={CheckSquare} />
      </div>

      {/* Administrators oversee events platform-wide but cannot open organizer
          workspaces, so each module card leads to the global event directory. */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: Vote, title: 'Election', description: 'Ballots, positions and voter turnout.', count: electionEvents },
          { icon: Trophy, title: 'Competition', description: 'Scoring, live control and tabulation.', count: competitionEvents },
          { icon: BarChart2, title: 'Polling', description: 'Questions, responses and insights.', count: pollingEvents },
        ].map(({ icon: Icon, title, description, count }) => (
          <Link key={title} to="/admin/events" className="v-card-md flex flex-col gap-2 transition hover:border-v-border-strong">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} aria-hidden />
              <h3 className="v-section-title">{title}</h3>
            </div>
            <p className="v-caption">{description}</p>
            <p className="v-caption">{eventCount(count)}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card padding="sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="v-section-title">Recent platform activity</h3>
            <Link to="/admin/audit-logs" className="text-sm font-semibold text-v-primary hover:underline">
              View all →
            </Link>
          </div>
          {!recentActivity.length ? (
            <p className="v-caption mt-3">No recent activity</p>
          ) : (
            <div className="v-table-wrap mt-3">
              <table className="v-table">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th className="text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.slice(0, 5).map((item, idx) => (
                    <tr key={`${item.type}-${item.timestamp}-${idx}`}>
                      <td className="text-v-text">{item.label}</td>
                      <td className="whitespace-nowrap text-right text-v-text-subtle">
                        {formatActivityTime(item.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card padding="sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="v-section-title">Operational health</h3>
              <Link to="/admin/health" className="text-sm font-semibold text-v-primary hover:underline">
                Open System Health →
              </Link>
            </div>
            <div className="mt-3">
              <HealthSummary health={health} unavailable={healthUnavailable} />
            </div>
          </Card>

          <Card padding="sm">
            <h3 className="v-section-title">Events by module</h3>
            <ul className="mt-3 divide-y divide-v-border text-sm">
              {[
                ['Elections', electionEvents],
                ['Competitions', competitionEvents],
                ['Polling', pollingEvents],
              ].map(([label, count]) => (
                <li key={label} className="flex items-center justify-between py-2">
                  <span className="text-v-text">{label}</span>
                  <span className="font-medium tabular-nums text-v-text-muted">{eventCount(count)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="sm">
          <h3 className="v-section-title">Monthly events</h3>
          {!monthlyEvents.length ? (
            <p className="v-caption mt-3">No event data yet</p>
          ) : (
            <div className="mt-3">
              <AreaChartView
                data={monthlyEvents.slice(0, 6).map((i) => ({ name: i.label, value: i.value }))}
                areas={[{ dataKey: 'value', name: 'Events', color: '#818cf8' }]}
                height={220}
                showLegend={false}
              />
            </div>
          )}
        </Card>
        <Card padding="sm">
          <h3 className="v-section-title">Participant growth</h3>
          {!participantGrowth.length ? (
            <p className="v-caption mt-3">No participant account data yet</p>
          ) : (
            <div className="mt-3">
              <AreaChartView
                data={participantGrowth.slice(0, 6).map((i) => ({ name: i.label, value: i.value }))}
                areas={[{ dataKey: 'value', name: 'Participants', color: '#34d399' }]}
                height={220}
                showLegend={false}
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
