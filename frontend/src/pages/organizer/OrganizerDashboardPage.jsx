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
      <div className="v-card p-8">
        <h2 className="text-lg font-semibold text-v-text">Organizer dashboard</h2>
        <p className="mt-2 text-v-text-subtle">
          Signed in as <span className="text-v-text-muted">{user?.email}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total events" value={stats?.totalEvents ?? 0} />
        <StatCard label="Active events" value={stats?.activeEvents ?? 0} />
        <StatCard label="Finished events" value={stats?.finishedEvents ?? 0} />
        <StatCard label="Assigned voters" value={stats?.totalAssignedVoters ?? 0} />
        <StatCard label="Votes cast" value={stats?.totalVotesCast ?? 0} />
        <StatCard label="Election events" value={stats?.totalElectionEvents ?? 0} />
        <StatCard label="Pageant events" value={stats?.totalPageantEvents ?? 0} />
        <StatCard label="Polling events" value={stats?.totalPollingEvents ?? 0} />
      </div>

      <Link
        to="/organizer/reports"
        className="block rounded-2xl border border-violet-900/50 bg-violet-950/30 p-8 transition hover:border-violet-700"
      >
        <h3 className="text-lg font-semibold text-v-text">Analytics & reports</h3>
        <p className="mt-2 text-sm text-v-text-subtle">
          Turnout reports, vote summaries, pageant rankings, and polling charts across all events.
        </p>
      </Link>

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          to="/organizer/election"
          className="block rounded-2xl border border-v-border bg-v-surface-elevated p-8 transition hover:border-v-border-strong"
        >
          <h3 className="text-lg font-semibold text-v-text">Election module</h3>
          <p className="mt-2 text-sm text-v-text-subtle">
            Manage events, positions, candidates, voters, and view live analytics.
          </p>
        </Link>
        <Link
          to="/organizer/pageant"
          className="block rounded-2xl border border-v-border bg-v-surface-elevated p-8 transition hover:border-v-border-strong"
        >
          <h3 className="text-lg font-semibold text-v-text">Pageant module</h3>
          <p className="mt-2 text-sm text-v-text-subtle">
            Contestants, criteria, judge scoring, and live weighted rankings.
          </p>
        </Link>
        <Link
          to="/organizer/polling"
          className="block rounded-2xl border border-v-border bg-v-surface-elevated p-8 transition hover:border-v-border-strong"
        >
          <h3 className="text-lg font-semibold text-v-text">Polling module</h3>
          <p className="mt-2 text-sm text-v-text-subtle">
            Build surveys, configure anonymity and expiry, and view response analytics.
          </p>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold text-v-text">Recent organizer activity</h3>
          {!(dashboard?.recentActivity ?? []).length && (
            <p className="mt-3 text-sm text-v-text-subtle">
              No events available. Create your first event to begin.
            </p>
          )}
          {!!(dashboard?.recentActivity ?? []).length && (
            <ul className="mt-3 space-y-2 text-sm text-v-text-subtle">
              {(dashboard?.recentActivity ?? []).slice(0, 8).map((item, idx) => (
                <li key={`${item.type}-${item.timestamp}-${idx}`} className="rounded-lg border border-v-border px-3 py-2">
                  <p className="text-v-text">{item.label}</p>
                  <p className="text-xs text-v-text-subtle">{new Date(item.timestamp).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-v-text">Monthly event growth</h3>
          {!monthlyEvents.length && (
            <p className="mt-3 text-sm text-v-text-subtle">
              No events available. Create your first event to begin.
            </p>
          )}
          {!!monthlyEvents.length && (
            <ul className="mt-3 space-y-2 text-sm text-v-text-subtle">
              {monthlyEvents.map((point) => (
                <li key={point.key} className="flex items-center justify-between rounded-lg border border-v-border px-3 py-2">
                  <span>{point.label}</span>
                  <span className="text-v-text">{point.value}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold text-v-text">Participation by module</h3>
        {!participation.length && (
          <p className="mt-3 text-sm text-v-text-subtle">No participation data yet.</p>
        )}
        {!!participation.length && (
          <ul className="mt-3 space-y-2 text-sm text-v-text-subtle">
            {participation.map((row) => (
              <li key={row.module} className="rounded-lg border border-v-border px-3 py-2">
                <p className="font-medium text-v-text">{row.module}</p>
                <p>
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
