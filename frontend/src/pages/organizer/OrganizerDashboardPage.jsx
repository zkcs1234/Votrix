import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import PageLoader from '@/components/ui/PageLoader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import { organizerService } from '@/services/organizer.service'

export default function OrganizerDashboardPage() {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
    const id = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (loading) return <PageLoader label="Loading dashboard..." />

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
        <StatCard label="Total events" value={stats?.totalEvents ?? 0} />
        <StatCard label="Active events" value={stats?.activeEvents ?? 0} />
        <StatCard label="Finished events" value={stats?.finishedEvents ?? 0} />
        <StatCard label="Assigned voters" value={stats?.totalAssignedVoters ?? 0} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          to="/organizer/election"
          className="v-card-md flex flex-col gap-2 transition hover:border-v-border-strong"
        >
          <h3 className="v-section-title">Election module</h3>
          <p className="v-caption">
            Manage events, positions, candidates, and voters.
          </p>
        </Link>
        <Link
          to="/organizer/pageant"
          className="v-card-md flex flex-col gap-2 transition hover:border-v-border-strong"
        >
          <h3 className="v-section-title">Pageant module</h3>
          <p className="v-caption">
            Contestants, criteria, judge scoring, and rankings.
          </p>
        </Link>
        <Link
          to="/organizer/polling"
          className="v-card-md flex flex-col gap-2 transition hover:border-v-border-strong"
        >
          <h3 className="v-section-title">Polling module</h3>
          <p className="v-caption">
            Build surveys, configure settings, and view analytics.
          </p>
        </Link>
      </div>

      <Link
        to="/organizer/reports"
        className="v-card-md block transition hover:border-v-border-strong"
      >
        <h3 className="v-section-title">Analytics & reports</h3>
        <p className="v-caption mt-2">
          Turnout reports, vote summaries, pageant rankings, and polling charts.
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