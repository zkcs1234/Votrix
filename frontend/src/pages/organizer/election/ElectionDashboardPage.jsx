import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Vote, Users, CheckSquare, Plus } from 'lucide-react'
import { electionService } from '@/services/election.service'
import PageLoader from '@/components/ui/PageLoader'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Button from '@/components/ui/Button'
import EventStatsTable from '@/components/organizer/EventStatsTable'
import { useSocketEvent } from '@/hooks/useSocketEvent'

export default function ElectionDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    electionService
      .getDashboard()
      .then(({ data: res }) => setData(res))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useSocketEvent('election:vote-submitted', () => load())
  useSocketEvent('election:voting-toggled', () => load())

  if (loading) return <PageLoader label="Loading dashboard…" />

  return (
    <div className="space-y-8">
      <PageHeader
        title="Election dashboard"
        description="Manage events, ballots, and voter turnout."
        actions={
          <Link to="/organizer/election/events/new">
            <Button>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Create event
            </Button>
          </Link>
        }
      />

      {/* Event counts aggregate cleanly; participation rates do not, so they
          live in the per-event table below rather than as blended totals. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total events" value={data?.stats?.totalEvents ?? 0} icon={CalendarDays} />
        <StatCard
          label="Voting active"
          value={data?.stats?.activeVoting ?? 0}
          hint="Events accepting votes"
          icon={Vote}
        />
        <StatCard label="Registered voters" value={data?.stats?.registeredVoters ?? 0} hint="Across all events" icon={Users} />
        <StatCard label="Votes cast" value={data?.stats?.votesCast ?? 0} icon={CheckSquare} />
      </div>

      <EventStatsTable
        title="Turnout by event"
        events={data?.eventBreakdown ?? []}
        linkFor={(e) => `/organizer/election/events/${e.id}/positions`}
        registeredLabel="Registered"
        participatedLabel="Voted"
        rateLabel="Turnout"
        emptyMessage="No events available. Create your first event to begin."
      />
    </div>
  )
}
