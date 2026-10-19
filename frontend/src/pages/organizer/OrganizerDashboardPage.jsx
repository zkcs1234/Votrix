import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Zap, CheckCircle2, Users, Vote, Trophy, BarChart2, BarChart3, Clock, Play, CheckSquare } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import ModuleCard from '@/components/ui/ModuleCard'
import {
  SkeletonStatCard,
  SkeletonModuleLink,
  SkeletonList,
  SkeletonChart,
} from '@/components/ui/Skeleton'
import { AreaChartView, PieChartView } from '@/components/charts'
import { organizerService } from '@/services/organizer.service'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import OrganizationLogoUpload from '@/components/upload/OrganizationLogoUpload'
import OrganizerOverviewEvents from '@/components/organizer/OrganizerOverviewEvents'
import CreateEventMenu from '@/components/organizer/CreateEventMenu'

export default function OrganizerDashboardPage() {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [activeSessions, setActiveSessions] = useState([])
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
        // Active competition sessions now arrive batched in the dashboard payload
        // (previously one request per event — an N+1). Fall back to [] if absent.
        setActiveSessions(dashboardRes.data.activeSessions ?? [])
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
    organizerService.getDashboard().then(({ data }) => {
      setDashboard(data)
      setActiveSessions(data.activeSessions ?? [])
    })
  })

  useSocketEvent('competition:native-invalidated', (payload) => {
    if (!payload?.eventId) return
    organizerService.getDashboard().then(({ data }) => {
      setDashboard(data)
      setActiveSessions(data.activeSessions ?? [])
      setError(null)
    }).catch((err) => {
      setError(err.response?.data?.message || 'Failed to refresh organizer dashboard')
    })
  })

  // Helper function to format elapsed time
  const formatElapsedTime = (startedAt) => {
    const start = new Date(startedAt)
    const now = new Date()
    const diffMs = now - start
    const diffMins = Math.floor(diffMs / (1000 * 60))
    
    if (diffMins < 60) {
      return `${diffMins} minutes ago`
    }
    
    const diffHours = Math.floor(diffMins / 60)
    const remainingMins = diffMins % 60
    
    if (remainingMins === 0) {
      return `${diffHours}h ago`
    }
    
    return `${diffHours}h ${remainingMins}m ago`
  }

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

        <div className="v-card-md">
          <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card padding="sm">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <SkeletonList count={3} />
          </Card>

          <Card padding="sm">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <SkeletonChart />
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
    <div className="v-dashboard space-y-6">
      <PageHeader
        title="Organizer dashboard"
        description={
          <>
            Your organization&apos;s events, participation and live sessions at a glance.{' '}
            <span className="whitespace-nowrap">
              Signed in as <span className="font-medium text-v-text-muted">{user?.organizerName || user?.email}</span>.
            </span>
          </>
        }
        actions={<CreateEventMenu create showPlus label="Create event" />}
      />

      {/* Live competition session banner */}
      {activeSessions.length > 0 && (
        <div className="rounded-xl border border-v-primary/40 bg-v-primary-soft p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-v-primary/15 text-v-primary">
              <Trophy className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-v-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-v-primary" />
                </span>
                <h3 className="text-base font-semibold text-v-text">
                  {activeSessions.length > 1 ? 'Live competition sessions running' : 'Live competition session running'}
                </h3>
              </div>
              <p className="mt-1 text-sm text-v-text-muted">
                {activeSessions.length > 1
                  ? `You have ${activeSessions.length} live scoring sessions in progress. Rejoin to keep controlling the judging.`
                  : 'A live scoring session is in progress. Rejoin to keep controlling the judging.'}
              </p>

              <div className="mt-3 space-y-2">
                {activeSessions.map((activeSession) => (
                  <div
                    key={activeSession.session.id ?? activeSession.eventId}
                    className="flex flex-col gap-3 rounded-lg border border-v-border bg-v-surface p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-v-text">{activeSession.eventTitle}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-v-text-subtle">
                        {activeSession.session.activeContestantName && (
                          <span>Now scoring: {activeSession.session.activeContestantName}</span>
                        )}
                        {activeSession.session.activeContestantNumber && !activeSession.session.activeContestantName && (
                          <span>Now scoring: Contestant #{activeSession.session.activeContestantNumber}</span>
                        )}
                        {activeSession.session.competitionName && (
                          <span>
                            {activeSession.session.roundName
                              ? `${activeSession.session.competitionName} · ${activeSession.session.roundName}`
                              : activeSession.session.competitionName}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Running for {formatElapsedTime(activeSession.session.startedAt)}
                        </span>
                      </div>
                    </div>

                    <Link
                      to={`/organizer/competition/events/${activeSession.eventId}/live`}
                      className="v-press inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-v-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-v-primary-hover"
                    >
                      <Play className="h-4 w-4" strokeWidth={2} />
                      Rejoin live session
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <OrganizationLogoUpload
        organizationName={dashboard?.organization?.organizationName}
        logoUrl={dashboard?.organization?.logo}
        onUpload={(file) => organizerService.uploadOrganizationLogo(file)}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total events" value={stats?.totalEvents ?? 0} icon={CalendarDays} />
        <StatCard label="Active events" value={stats?.activeEvents ?? 0} icon={Zap} />
        <StatCard label="Finished events" value={stats?.finishedEvents ?? 0} icon={CheckCircle2} />
        <StatCard
          label="Registered voters"
          value={stats?.assignedVoters ?? 0}
          hint="Election voters only"
          icon={Users}
        />
        <StatCard
          label="Votes & responses"
          value={stats?.totalVotesCast ?? 0}
          hint="Votes, scores and poll answers"
          icon={CheckSquare}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ModuleCard
          module="election"
          icon={Vote}
          title="Election"
          description="Ballots, positions and voter turnout."
          to="/organizer/election"
        />
        <ModuleCard
          module="competition"
          icon={Trophy}
          title="Competition"
          description="Scoring, live control and tabulation."
          to="/organizer/competition"
        />
        <ModuleCard
          module="polling"
          icon={BarChart2}
          title="Polling"
          description="Questions, responses and insights."
          to="/organizer/polling"
        />
      </div>

      <OrganizerOverviewEvents dashboard={dashboard} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="sm">
          <h3 className="v-section-title">Recent activity</h3>
          {!(dashboard?.recentActivity ?? []).length ? (
            <p className="v-caption mt-3">No recent activity</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {(dashboard?.recentActivity ?? []).slice(0, 3).map((item, idx) => (
                <li key={`${item.type}-${item.timestamp}-${idx}`} className="rounded-lg border border-v-border px-3 py-1.5">
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
            <div className="mt-3">
              <AreaChartView
                data={monthlyEvents.slice(0, 6).map((i) => ({ name: i.label, value: i.value }))}
                areas={[{ dataKey: 'value', name: 'Events', color: '#4f46e5' }]}
                height={180}
                showLegend={false}
              />
            </div>
          )}
        </Card>
      </div>

      <Card padding="sm">
        <h3 className="v-section-title">Participation by module</h3>
        {!participation.length ? (
          <p className="v-caption mt-3">No participation data yet</p>
        ) : (
          <div className="mt-3">
            <PieChartView
              data={participation.map((row) => ({
                name: row.module,
                value: row.participated,
              }))}
              dataKey="value"
              nameKey="name"
              height={240}
              showLegend
              valueFormatter={(value, name) => {
                const row = participation.find((r) => r.module === name)
                return row ? `${value} (${row.rate}%)` : String(value)
              }}
            />
          </div>
        )}
      </Card>

      <Link
        to="/organizer/reports"
        className="v-card-sm flex items-start gap-3 p-4 transition hover:border-v-primary/50"
      >
        <BarChart3 className="mt-0.5 h-4 w-4 text-v-primary" strokeWidth={1.75} aria-hidden />
        <span>
          <span className="block font-semibold text-v-text">Analytics &amp; reports</span>
          <span className="v-caption block">
            Turnout reports, vote summaries, competition rankings, and polling charts.
          </span>
        </span>
      </Link>
    </div>
  )
}
