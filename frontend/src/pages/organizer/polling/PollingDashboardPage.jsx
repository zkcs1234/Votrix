import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart2, Zap, Send, Plus } from 'lucide-react'
import { pollingService } from '@/services/polling.service'
import StatCard from '@/components/ui/StatCard'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import EventStatsTable from '@/components/organizer/EventStatsTable'
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

      {/* Counts aggregate cleanly; participation is per-poll below. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total polls" value={data?.stats?.totalPolls ?? 0} icon={BarChart2} />
        <StatCard label="Active polls" value={data?.stats?.activePolls ?? 0} icon={Zap} />
        <StatCard label="Responses submitted" value={data?.stats?.responsesSubmitted ?? 0} icon={Send} />
      </div>

      <EventStatsTable
        title="Participation by poll"
        events={data?.eventBreakdown ?? []}
        linkFor={(e) => `/organizer/polling/events/${e.id}/builder`}
        registeredLabel="Respondents"
        participatedLabel="Responded"
        rateLabel="Participation"
        emptyMessage="No events available. Create your first event to begin."
      />
    </div>
  )
}
