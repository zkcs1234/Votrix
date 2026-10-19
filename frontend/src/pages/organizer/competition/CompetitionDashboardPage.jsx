import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Zap, Users, Star, CheckSquare, Plus } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import StatCard from '@/components/ui/StatCard'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import EventStatsTable from '@/components/organizer/EventStatsTable'
import ParticipationSnapshot from '@/components/organizer/ParticipationSnapshot'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useSocketEvent } from '@/hooks/useSocketEvent'

export const COMPETITION_DASHBOARD_KEY = ['competition', 'dashboard']

export default function CompetitionDashboardPage() {
  const nativeSetupEnabled = import.meta.env.VITE_COMPETITION_NATIVE_SETUP_ENABLED === 'true'
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: COMPETITION_DASHBOARD_KEY,
    queryFn: () => pageantService.getDashboard().then((res) => res.data),
  })

  // Use delayed loading - only show skeleton after 300ms
  const showLoader = useDelayedLoading(isLoading, 300)

  // Real-time updates via WebSocket invalidate the cached dashboard.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: COMPETITION_DASHBOARD_KEY })
  useSocketEvent('rankings:updated', invalidate)
  useSocketEvent('session:status-changed', invalidate)
  useSocketEvent('competition:native-invalidated', invalidate)

  // Show nothing under 300ms
  if (isLoading && !showLoader) return null

  // Show skeleton after 300ms
  if (isLoading || showLoader) {
    return (
      <div className="v-dashboard space-y-6">
        <div className="h-8 w-72 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="v-card-sm h-20 animate-pulse bg-v-surface-elevated" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="v-dashboard space-y-6">
      <PageHeader
        title="Competition Scoring dashboard"
        description={nativeSetupEnabled ? 'Choose an event to configure its independent competitions, judges, and scoring.' : 'Manage contestants, criteria, and judge scoring.'}
        actions={
          <div className="flex flex-wrap gap-2">
          {nativeSetupEnabled && <Link to="/organizer/competition/events"><Button variant="secondary">Manage competitions</Button></Link>}
          <Link to="/organizer/competition/events/new">
            <Button>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Create Event
            </Button>
          </Link>
          </div>
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

      <ParticipationSnapshot
        events={data?.eventBreakdown ?? []}
        module="competition"
        title="Judge completion by event"
        description="Highest judge submission completion rates across your events."
      />

      <EventStatsTable
        title="Judge completion by event"
        events={data?.eventBreakdown ?? []}
        linkFor={(e) => `/organizer/competition/events/${e.id}/${nativeSetupEnabled ? 'workspace' : 'contestants'}`}
        registeredLabel="Judges"
        participatedLabel="Submitted"
        rateLabel="Completion"
        emptyMessage="No competition scoring events available. Create your first event to begin."
      />
    </div>
  )
}
