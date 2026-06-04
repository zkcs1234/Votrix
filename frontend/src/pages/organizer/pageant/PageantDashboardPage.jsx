import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import OrganizationLogoUpload from '@/components/upload/OrganizationLogoUpload'

export default function PageantDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

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
    const id = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-v-text">Competition Scoring dashboard</h2>
        <Link
          to="/organizer/competition/events/new"
          className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white hover:bg-v-primary-hover"
        >
          Create Competition Scoring Event
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Events" value={data?.stats?.totalEvents} />
        <Stat label="Scoring active" value={data?.stats?.activeScoring} />
        <Stat label="Total contestants" value={data?.stats?.totalContestants} />
        <Stat label="Total judges" value={data?.stats?.totalJudges} />
        <Stat label="Scores submitted" value={data?.stats?.scoresSubmitted} />
        <Stat label="Completed judges" value={data?.stats?.completedJudges} />
        <Stat label="Judge completion" value={`${data?.stats?.judgeCompletionRate ?? 0}%`} />
        <Stat
          label="Organization"
          value={data?.organization?.organizationName ?? data?.organization?.organization_name}
          small
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

      <div className="v-card p-6">
        <h3 className="font-medium text-v-text">Recent Competition Scoring events</h3>

        <ul className="mt-4 space-y-2">
          {(data?.events ?? []).slice(0, 5).map((e) => (
            <li key={e.id}>
              <Link
                to={`/organizer/competition/events/${e.id}/contestants`}
                className="flex justify-between rounded-lg border border-v-border px-4 py-3 hover:bg-v-surface-elevated"
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
      </div>
    </div>
  )
}

function Stat({ label, value, small }) {
  return (
    <div className="v-card p-6">
      <p className="text-sm text-v-text-subtle">{label}</p>
      <p className={`mt-2 font-bold text-white ${small ? 'text-lg' : 'text-3xl'}`}>{value ?? 0}</p>
    </div>
  )
}
