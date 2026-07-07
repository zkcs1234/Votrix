import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Zap, Users, Star, CheckSquare, UserCheck, Percent, Building2, Plus } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import PageLoader from '@/components/ui/PageLoader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import OrganizationLogoUpload from '@/components/upload/OrganizationLogoUpload'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useSocketEvent } from '@/hooks/useSocketEvent'

export default function CompetitionDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Use delayed loading - only show skeleton after 300ms
  const showLoader = useDelayedLoading(loading, 300)

  useEffect(() => {
    let alive = true

    const load = () => {
      pageantService
        .getDashboard()
        .then(({ data: res }) => {
          if (alive) setData(res)
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }

    load()
    return () => {
      alive = false
    }
  }, [])

  // Real-time updates via WebSocket - no more polling!
  useSocketEvent('rankings:updated', () => {
    pageantService.getDashboard().then(({ data }) => setData(data))
  })

  useSocketEvent('competition:scoring-toggled', () => {
    pageantService.getDashboard().then(({ data }) => setData(data))
  })

  // Show nothing under 300ms
  if (loading && !showLoader) return null

  // Show skeleton after 300ms
  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-72 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competition Scoring dashboard"
        description="Manage contestants, criteria, and judge scoring."
        actions={
          <Link to="/organizer/competition/events/new">
            <Button>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Create Event
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Events" value={data?.stats?.totalEvents ?? 0} icon={CalendarDays} />
        <StatCard label="Scoring active" value={data?.stats?.activeScoring ?? 0} icon={Zap} />
        <StatCard label="Total contestants" value={data?.stats?.totalContestants ?? 0} icon={Users} />
        <StatCard label="Total judges" value={data?.stats?.totalJudges ?? 0} icon={Star} />
        <StatCard label="Scores submitted" value={data?.stats?.scoresSubmitted ?? 0} icon={CheckSquare} />
        <StatCard label="Completed judges" value={data?.stats?.completedJudges ?? 0} icon={UserCheck} />
        <StatCard label="Judge completion" value={`${data?.stats?.judgeCompletionRate ?? 0}%`} icon={Percent} />
        <StatCard
          label="Organization"
          value={data?.organization?.organizationName ?? data?.organization?.organization_name ?? '—'}
          icon={Building2}
        />
      </div>

      <OrganizationLogoUpload
        organizationName={
          data?.organization?.organizationName ?? data?.organization?.organization_name
        }
        logoUrl={data?.organization?.logo}
        onUpload={(file) => pageantService.uploadOrganizationLogo(file)}
        accentClass="text-v-text-muted"
      />

      <Card padding={false}>
        <div className="border-b border-v-border px-6 py-4">
          <h3 className="font-medium text-v-text">Recent Competition Scoring events</h3>
        </div>
        <ul className="divide-y divide-v-border">
          {(data?.events ?? []).slice(0, 5).map((e) => (
            <li key={e.id}>
              <Link
                to={`/organizer/competition/events/${e.id}/contestants`}
                className="flex justify-between px-6 py-4 transition hover:bg-v-surface-elevated"
              >
                <span className="text-v-text-muted">{e.title}</span>
                <span className={e.scoringEnabled ? 'text-v-success text-xs' : 'text-v-text-subtle text-xs'}>
                  {e.scoringEnabled ? 'Scoring open' : e.status}
                </span>
              </Link>
            </li>
          ))}
          {!data?.events?.length && (
            <li className="rounded-lg border border-dashed border-v-border px-4 py-8 text-center text-sm text-v-text-subtle">
              No competition scoring events available. Create your first event to begin.
            </li>
          )}
        </ul>
      </Card>
    </div>
  )
}
