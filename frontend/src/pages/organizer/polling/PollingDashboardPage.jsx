import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import OrganizationLogoUpload from '@/components/upload/OrganizationLogoUpload'

export default function PollingDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    const load = () => {
      pollingService
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
      <div className="flex justify-between">
        <h2 className="text-xl font-semibold text-v-text">Polling dashboard</h2>
        <Link
          to="/organizer/polling/events/new"
          className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white hover:bg-v-primary-hover"
        >
          Create poll
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="v-card p-6">
          <p className="text-sm text-v-text-subtle">Total polls</p>
          <p className="mt-2 text-3xl font-bold text-white">{data?.stats?.totalPolls ?? 0}</p>
        </div>
        <div className="v-card p-6">
          <p className="text-sm text-v-text-subtle">Active polls</p>
          <p className="mt-2 text-3xl font-bold text-v-text-muted">{data?.stats?.activePolls ?? 0}</p>
        </div>
        <div className="v-card p-6">
          <p className="text-sm text-v-text-subtle">Responses submitted</p>
          <p className="mt-2 text-3xl font-bold text-white">{data?.stats?.responsesSubmitted ?? 0}</p>
        </div>
        <div className="v-card p-6">
          <p className="text-sm text-v-text-subtle">Assigned users</p>
          <p className="mt-2 text-3xl font-bold text-white">{data?.stats?.assignedUsers ?? 0}</p>
        </div>
        <div className="v-card p-6">
          <p className="text-sm text-v-text-subtle">Responded users</p>
          <p className="mt-2 text-3xl font-bold text-white">{data?.stats?.respondedUsers ?? 0}</p>
        </div>
        <div className="v-card p-6">
          <p className="text-sm text-v-text-subtle">Participation rate</p>
          <p className="mt-2 text-3xl font-bold text-white">{data?.stats?.participationRate ?? 0}%</p>
        </div>
      </div>

      <OrganizationLogoUpload
        organizationName={
          data?.organization?.organizationName ?? data?.organization?.organization_name
        }
        logoUrl={data?.organization?.logo}
        onUpload={(file) => pollingService.uploadOrganizationLogo(file)}
        accentClass="text-v-text-muted"
      />

      <ul className="space-y-2">
        {(data?.events ?? []).slice(0, 5).map((e) => (
          <li key={e.id}>
            <Link
              to={`/organizer/polling/events/${e.id}/builder`}
              className="flex justify-between rounded-lg border border-v-border px-4 py-3 hover:bg-v-surface-elevated"
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
    </div>
  )
}
