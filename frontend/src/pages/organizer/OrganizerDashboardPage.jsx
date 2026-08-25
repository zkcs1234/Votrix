import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Zap, CheckCircle2, Users, Vote, Trophy, BarChart2, BarChart3, ArrowRight, Clock, Play } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import {
  SkeletonStatCard,
  SkeletonModuleLink,
  SkeletonList,
  SkeletonChart,
} from '@/components/ui/Skeleton'
import { AreaChartView, PieChartView } from '@/components/charts'
import { organizerService } from '@/services/organizer.service'
import { pageantService } from '@/services/pageant.service'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import OrganizationLogoUpload from '@/components/upload/OrganizationLogoUpload'

// SVG Illustrations
import ElectionSVG from '@/assets/module/undraw_voting_3ygx.svg'
import CompetitionSVG from '@/assets/module/pageant-amico.svg'
import PollingSVG from '@/assets/module/undraw_data_25jw.svg'

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
        
        // Check for active sessions across all competition events
        await checkForActiveSessions()
        
        setError(null)
      } catch (err) {
        if (!alive) return
        setError(err.response?.data?.message || 'Failed to load organizer dashboard')
      } finally {
        if (alive) setLoading(false)
      }
    }

    const checkForActiveSessions = async () => {
      try {
        // Get all competition events owned by organizer
        const eventsRes = await pageantService.listEvents()
        const events = eventsRes.data.events || []

        // Check each event for active sessions
        const activeSessionPromises = events.map(async (event) => {
          try {
            const sessionRes = await pageantService.getActiveSession(event.id)
            if (sessionRes.data.session && sessionRes.data.session.status === 'active') {
              return {
                eventId: event.id,
                eventTitle: event.title,
                session: sessionRes.data.session
              }
            }
          } catch (err) {
            // 404 means no active session, which is fine
            if (err.response?.status === 404) {
              return null
            }
            console.error(`Failed to check session for event ${event.id}:`, err)
            return null
          }
          return null
        })

        const results = await Promise.all(activeSessionPromises)
        const activeSessions = results.filter(result => result !== null)
        
        if (!alive) return
        setActiveSessions(activeSessions)
      } catch (err) {
        console.error('Failed to check for active sessions:', err)
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
      <div className="space-y-6">
        <div className="v-card-md">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
    <div className="space-y-6">
      {/* Session Recovery Banner */}
      {activeSessions.length > 0 && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-950/30 p-4">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 text-amber-400" strokeWidth={1.5} />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-amber-300">Resume Active Session</h3>
              <p className="mt-1 text-sm text-amber-200">
                You have {activeSessions.length} active competition session{activeSessions.length > 1 ? 's' : ''} that can be resumed.
              </p>
              
              <div className="mt-3 space-y-2">
                {activeSessions.map((activeSession) => (
                  <div key={activeSession.eventId} className="rounded-lg border border-amber-600/30 bg-amber-900/20 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-amber-100">{activeSession.eventTitle}</p>
                        <div className="mt-1 flex items-center gap-4 text-sm text-amber-200">
                          {activeSession.session.activeContestantName && (
                            <span>Current: {activeSession.session.activeContestantName}</span>
                          )}
                          {activeSession.session.activeContestantNumber && !activeSession.session.activeContestantName && (
                            <span>Current: Contestant #{activeSession.session.activeContestantNumber}</span>
                          )}
                          <span>Started {formatElapsedTime(activeSession.session.startedAt)}</span>
                        </div>
                      </div>
                      
                      <Link
                        to={`/organizer/competition/events/${activeSession.eventId}/live`}
                        className="flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-500"
                      >
                        <Play className="h-4 w-4" strokeWidth={1.5} />
                        Resume Session
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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

      <OrganizationLogoUpload
        organizationName={dashboard?.organization?.organizationName}
        logoUrl={dashboard?.organization?.logo}
        onUpload={(file) => organizerService.uploadOrganizationLogo(file)}
      />

      <div className="grid gap-5 md:grid-cols-3">
        {/* Election Module Card */}
        <div className="v-module-card">
          <div className="v-module-card__illustration bg-vote-gradient">
            <img
              src={ElectionSVG}
              alt="Election"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="v-module-card__body">
            <Vote className="v-module-card__icon" strokeWidth={1.5} />
            <h3 className="v-module-card__title">Election module</h3>
            <p className="v-module-card__desc">
              Manage events, positions, candidates, and voters.
            </p>

            <Link to="/organizer/election" className="v-btn-primary w-full mt-4 v-press">
              <span>Manage Election</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Competition Scoring Module Card */}
        <div className="v-module-card">
          <div className="v-module-card__illustration bg-comp-gradient">
            <img
              src={CompetitionSVG}
              alt="Competition"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="v-module-card__body">
            <Trophy className="v-module-card__icon" strokeWidth={1.5} />
            <h3 className="v-module-card__title">Competition Scoring module</h3>
            <p className="v-module-card__desc">
              Contestants, criteria, judge scoring, and rankings.
            </p>

            <Link to="/organizer/competition" className="v-btn-primary w-full mt-4 v-press">
              <span>Manage Competition</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Polling Module Card */}
        <div className="v-module-card">
          <div className="v-module-card__illustration bg-poll-gradient">
            <img
              src={PollingSVG}
              alt="Polling"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="v-module-card__body">
            <BarChart2 className="v-module-card__icon" strokeWidth={1.5} />
            <h3 className="v-module-card__title">Polling module</h3>
            <p className="v-module-card__desc">
              Build surveys, configure settings, and view analytics.
            </p>

            <Link to="/organizer/polling" className="v-btn-primary w-full mt-4 v-press">
              <span>Create Poll</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
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
                areas={[{ dataKey: 'value', name: 'Events', color: '#818cf8' }]}
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
    </div>
  )
}