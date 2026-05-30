import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import PageLoader from '@/components/ui/PageLoader'
import { adminService } from '@/services/admin.service'

export default function AdminDashboardPage() {
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
    const id = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (loading) return <PageLoader label="Loading dashboard..." />

  if (error) {
    return <p className="text-sm text-v-danger">{error}</p>
  }

  const stats = dashboard?.stats
  const recentActivity = dashboard?.recentActivity ?? []
  const monthlyEvents = analytics?.charts?.monthlyEvents ?? []
  const voterGrowth = analytics?.charts?.voterGrowth ?? []

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin dashboard"
        description={`Signed in as ${user?.username ?? 'admin'}`}
        actions={
          <Link to="/admin/organizers/new">
            <Button>Create organizer</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total organizers" value={stats?.totalOrganizers ?? 0} />
        <StatCard label="Total events" value={stats?.totalEvents ?? 0} />
        <StatCard label="Total voters" value={stats?.totalVoters ?? 0} />
        <StatCard label="Active events" value={stats?.activeEvents ?? 0} />
        <StatCard label="Finished events" value={stats?.finishedEvents ?? 0} />
        <StatCard label="Election events" value={stats?.totalElectionEvents ?? 0} />
        <StatCard label="Pageant events" value={stats?.totalPageantEvents ?? 0} />
        <StatCard label="Polling events" value={stats?.totalPollingEvents ?? 0} />
        <StatCard label="Total votes cast" value={stats?.totalVotesCast ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold text-v-text">Quick actions</h3>
          <ul className="mt-4 space-y-3 text-sm">
            <li>
              <Link
                to="/admin/organizers/new"
                className="font-medium text-v-text-muted hover:text-v-text"
              >
                Create organizer account →
              </Link>
            </li>
          </ul>
        </Card>

        <Card>
          <h3 className="font-semibold text-v-text">Recent organizer activity</h3>
          {!recentActivity.length && (
            <p className="mt-3 text-sm text-v-text-subtle">
              No events available. Create your first event to begin.
            </p>
          )}
          {!!recentActivity.length && (
            <ul className="mt-3 space-y-2 text-sm text-v-text-subtle">
              {recentActivity.slice(0, 8).map((item, idx) => (
                <li key={`${item.type}-${item.timestamp}-${idx}`} className="rounded-lg border border-v-border px-3 py-2">
                  <p className="text-v-text">{item.label}</p>
                  <p className="text-xs text-v-text-subtle">
                    {new Date(item.timestamp).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold text-v-text">Monthly events</h3>
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
        <Card>
          <h3 className="font-semibold text-v-text">Voter growth</h3>
          {!voterGrowth.length && (
            <p className="mt-3 text-sm text-v-text-subtle">
              No voter records yet.
            </p>
          )}
          {!!voterGrowth.length && (
            <ul className="mt-3 space-y-2 text-sm text-v-text-subtle">
              {voterGrowth.map((point) => (
                <li key={point.key} className="flex items-center justify-between rounded-lg border border-v-border px-3 py-2">
                  <span>{point.label}</span>
                  <span className="text-v-text">{point.value}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
