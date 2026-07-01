import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, CalendarDays, UserCheck, Zap, CheckSquare,
  Settings, ClipboardList, ArrowRight, LayoutDashboard,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import { adminService } from '@/services/admin.service'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

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
      <div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
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

export default function AdminDashboardPage() {
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCardSkeleton />
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

        <div className="grid gap-4 lg:grid-cols-2">
          <Card padding="sm">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <ListSkeleton count={3} />
          </Card>

          <Card padding="sm">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <ListSkeleton count={3} />
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card padding="sm">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <ChartSkeleton />
          </Card>
          <Card padding="sm">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <ChartSkeleton />
          </Card>
        </div>
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-v-danger">{error}</p>
  }

  const stats = dashboard?.stats
  const recentActivity = dashboard?.recentActivity ?? []
  const monthlyEvents = analytics?.charts?.monthlyEvents ?? []
  const voterGrowth = analytics?.charts?.voterGrowth ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin dashboard"
        description={`Signed in as ${user?.username ?? 'admin'}`}
        actions={
          <Link to="/admin/organizers">
            <Button>Create organizer</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total organizers" value={stats?.totalOrganizers ?? 0} icon={Users} />
        <StatCard label="Total events" value={stats?.totalEvents ?? 0} icon={CalendarDays} />
        <StatCard label="Total voters" value={stats?.totalVoters ?? 0} icon={UserCheck} />
        <StatCard label="Active events" value={stats?.activeEvents ?? 0} icon={Zap} />
        <StatCard label="Votes cast" value={stats?.totalVotesCast ?? 0} icon={CheckSquare} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          to="/admin/organizers"
          className="v-card-md flex flex-col gap-2 transition hover:border-v-border-strong"
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
            <h3 className="v-section-title">Organizers</h3>
          </div>
          <p className="v-caption">
            {stats?.totalOrganizers ?? 0} total accounts
          </p>
        </Link>
        <Link
          to="/admin/events"
          className="v-card-md flex flex-col gap-2 transition hover:border-v-border-strong"
        >
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
            <h3 className="v-section-title">Events</h3>
          </div>
          <p className="v-caption">
            {stats?.totalEvents ?? 0} across all modules
          </p>
        </Link>
        <Link
          to="/admin/settings"
          className="v-card-md flex flex-col gap-2 transition hover:border-v-border-strong"
        >
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
            <h3 className="v-section-title">Settings</h3>
          </div>
          <p className="v-caption">System configuration</p>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="sm">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
            <h3 className="v-section-title">Quick actions</h3>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link
                to="/admin/organizers"
                className="v-btn-tertiary inline-flex items-center gap-1.5"
              >
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                Create organizer account
              </Link>
            </li>
            <li>
              <Link
                to="/admin/events"
                className="v-btn-tertiary inline-flex items-center gap-1.5"
              >
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                View all events
              </Link>
            </li>
            <li>
              <Link
                to="/admin/audit-logs"
                className="v-btn-tertiary inline-flex items-center gap-1.5"
              >
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                Review audit logs
              </Link>
            </li>
            <li>
              <Link
                to="/admin/settings"
                className="v-btn-tertiary inline-flex items-center gap-1.5"
              >
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                Update system settings
              </Link>
            </li>
          </ul>
        </Card>

        <Card padding="sm">
          <h3 className="v-section-title">Recent activity</h3>
          {!recentActivity.length ? (
            <p className="v-caption mt-3">No recent activity</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {recentActivity.slice(0, 5).map((item, idx) => (
                <li key={`${item.type}-${item.timestamp}-${idx}`} className="rounded-lg border border-v-border px-3 py-2">
                  <p className="v-body-text">{item.label}</p>
                  <p className="v-caption">
                    {new Date(item.timestamp).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="sm">
          <h3 className="v-section-title">Monthly events</h3>
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
        <Card padding="sm">
          <h3 className="v-section-title">Voter growth</h3>
          {!voterGrowth.length ? (
            <p className="v-caption mt-3">No voter data yet</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {voterGrowth.slice(0, 6).map((point) => (
                <li key={point.key} className="flex items-center justify-between rounded-lg border border-v-border px-3 py-2">
                  <span className="v-caption">{point.label}</span>
                  <span className="v-body-text font-medium">{point.value}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
