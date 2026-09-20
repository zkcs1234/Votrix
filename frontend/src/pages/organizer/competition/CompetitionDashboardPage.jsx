import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Zap, Users, Star, CheckSquare, Plus } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import StatCard from '@/components/ui/StatCard'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import EventStatsTable from '@/components/organizer/EventStatsTable'
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

  useSocketEvent('session:status-changed', () => {
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

      {/* Counts aggregate cleanly; judge completion is per-event below. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Events" value={data?.stats?.totalEvents ?? 0} icon={CalendarDays} />
        <StatCard label="Active sessions" value={data?.stats?.activeSessions ?? 0} icon={Zap} />
        <StatCard label="Total contestants" value={data?.stats?.totalContestants ?? 0} icon={Users} />
        <StatCard label="Total judges" value={data?.stats?.totalJudges ?? 0} hint="Across all events" icon={Star} />
        <StatCard label="Scores submitted" value={data?.stats?.scoresSubmitted ?? 0} icon={CheckSquare} />
      </div>

      <EventStatsTable
        title="Judge completion by event"
        events={data?.eventBreakdown ?? []}
        linkFor={(e) => `/organizer/competition/events/${e.id}/contestants`}
        registeredLabel="Judges"
        participatedLabel="Submitted"
        rateLabel="Completion"
        emptyMessage="No competition scoring events available. Create your first event to begin."
      />
    </div>
  )
}
