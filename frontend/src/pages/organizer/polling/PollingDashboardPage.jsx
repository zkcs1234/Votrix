import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart2, Zap, Send, Users, UserCheck, Percent, Plus } from 'lucide-react'
import { pollingService } from '@/services/polling.service'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import OrganizationLogoUpload from '@/components/upload/OrganizationLogoUpload'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useSocketEvent } from '@/hooks/useSocketEvent'

export default function PollingDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Use delayed loading - only show skeleton after 300ms
  const showLoader = useDelayedLoading(loading, 300)

  const load = () => {
    pollingService
      .getDashboard()
      .then(({ data: res }) => setData(res))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useSocketEvent('poll:response-submitted', () => load())
  useSocketEvent('poll:polling-toggled', () => load())

  // Show nothing under 300ms
  if (loading && !showLoader) return null

  // Show skeleton after 300ms
  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Polling dashboard"
        description="Manage surveys, configure polls, and track responses."
        actions={
          <Link to="/organizer/polling/events/new">
            <Button>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Create poll
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total polls" value={data?.stats?.totalPolls ?? 0} icon={BarChart2} />
        <StatCard label="Active polls" value={data?.stats?.activePolls ?? 0} icon={Zap} />
        <StatCard label="Responses submitted" value={data?.stats?.responsesSubmitted ?? 0} icon={Send} />
        <StatCard label="Assigned users" value={data?.stats?.assignedUsers ?? 0} icon={Users} />
        <StatCard label="Responded users" value={data?.stats?.respondedUsers ?? 0} icon={UserCheck} />
        <StatCard label="Participation rate" value={`${data?.stats?.participationRate ?? 0}%`} icon={Percent} />
      </div>

      <OrganizationLogoUpload
        organizationName={
          data?.organization?.organizationName ?? data?.organization?.organization_name
        }
        logoUrl={data?.organization?.logo}
        onUpload={(file) => pollingService.uploadOrganizationLogo(file)}
        accentClass="text-v-text-muted"
      />

      <Card padding={false}>
        <div className="border-b border-v-border px-6 py-4">
          <h3 className="font-semibold text-v-text">Recent polls</h3>
        </div>
        <ul className="divide-y divide-v-border">
          {(data?.events ?? []).slice(0, 5).map((e) => (
            <li key={e.id}>
              <Link
                to={`/organizer/polling/events/${e.id}/builder`}
                className="flex justify-between px-6 py-4 transition hover:bg-v-surface-elevated"
              >
                <span className="text-v-text-muted">{e.title}</span>
                <span className="text-xs text-v-text-subtle">
                  {e.pollingEnabled ? 'Open' : 'Closed'}
                </span>
              </Link>
            </li>
          ))}
          {!data?.events?.length && (
            <li className="rounded-lg border border-dashed border-v-border px-4 py-8 text-center text-sm text-v-text-subtle">
              No events available. Create your first event to begin.
            </li>
          )}
        </ul>
      </Card>
    </div>
  )
}
