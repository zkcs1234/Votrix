import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Vote, Users, CheckSquare, Percent, Building2, Plus } from 'lucide-react'
import { electionService } from '@/services/election.service'
import PageLoader from '@/components/ui/PageLoader'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import OrganizationLogoUpload from '@/components/upload/OrganizationLogoUpload'
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total events" value={data?.stats?.totalEvents ?? 0} icon={CalendarDays} />
        <StatCard
          label="Voting active"
          value={data?.stats?.activeVoting ?? 0}
          hint="Events accepting votes"
          icon={Vote}
        />
        <StatCard label="Registered voters" value={data?.stats?.registeredVoters ?? 0} icon={Users} />
        <StatCard label="Votes cast" value={data?.stats?.votesCast ?? 0} icon={CheckSquare} />
        <StatCard label="Voters who voted" value={data?.stats?.votedCount ?? 0} icon={Users} />
        <StatCard label="Turnout" value={`${data?.stats?.turnoutRate ?? 0}%`} icon={Percent} />
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
        onUpload={(file) => electionService.uploadOrganizationLogo(file)}
      />

      <Card padding={false}>
        <div className="border-b border-v-border px-6 py-4">
          <h3 className="font-semibold text-v-text">Recent events</h3>
        </div>
        <ul className="divide-y divide-v-border">
          {(data?.events ?? []).slice(0, 5).map((event) => (
            <li key={event.id}>
              <Link
                to={`/organizer/election/events/${event.id}/positions`}
                className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-v-surface-elevated"
              >
                <span className="font-medium text-v-text">{event.title}</span>
                <Badge tone={event.votingEnabled ? 'success' : 'default'}>
                  {event.votingEnabled ? 'Voting open' : event.status}
                </Badge>
              </Link>
            </li>
          ))}
          {!data?.events?.length && (
            <li className="px-6 py-10 text-center text-sm text-v-text-subtle">
              No events available. Create your first event to begin.
            </li>
          )}
        </ul>
      </Card>
    </div>
  )
}
