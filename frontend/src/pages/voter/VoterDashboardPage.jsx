import { useEffect, useState } from 'react'
import { voterService } from '@/services/voter.service'
import { useAuth } from '@/hooks/useAuth'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import VoterEventCard from '@/components/voter/VoterEventCard'

function EventSection({ title, description, events }) {
  if (!events?.length) return null

  return (
    <section>
      <div className="mb-3">
        <h3 className="font-medium text-v-text">{title}</h3>
        {description && <p className="text-sm text-v-text-subtle">{description}</p>}
      </div>
      <ul className="space-y-2">
        {events.map((event) => (
          <li key={`${event.eventType}-${event.id}`}>
            <VoterEventCard event={event} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div className="rounded-2xl border border-v-border bg-v-surface p-5">
      <p className="text-xs text-v-text-subtle">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent}`}>{value}</p>
    </div>
  )
}

export default function VoterDashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true

    const load = () => {
      voterService
        .getOverview()
        .then(({ data: res }) => {
          if (!alive) return
          setData(res)
          setError(null)
        })
        .catch((err) => {
          if (!alive) return
          setError(err.response?.data?.message || 'Failed to load dashboard')
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

  if (error) {
    return <p className="text-sm text-v-danger">{error}</p>
  }

  const stats = data?.stats ?? { total: 0, active: 0, assigned: 0, completed: 0 }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="v-card p-8">
        <h2 className="text-lg font-semibold text-v-text">Your events</h2>
        <p className="mt-2 text-v-text-subtle">
          Signed in as <span className="text-v-text-muted">{user?.email}</span>
        </p>
        <p className="mt-1 text-sm text-v-text-subtle">
          Elections, pageant judging, and polls assigned to you appear below.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Assigned" value={stats.assigned} accent="text-amber-400" />
        <StatCard label="Active now" value={stats.active} accent="text-v-success" />
        <StatCard label="Completed" value={stats.completed} accent="text-v-text-muted" />
        <StatCard label="Total" value={stats.total} accent="text-white" />
      </div>

      <EventSection
        title="Active events"
        description="These need your vote, scores, or poll response now."
        events={data?.active}
      />

      <EventSection
        title="Assigned events"
        description="You are enrolled but voting, scoring, or the poll is not open yet."
        events={data?.assigned}
      />

      <EventSection
        title="Completed events"
        description="You have finished your participation for these events."
        events={data?.completed}
      />

      {stats.total === 0 && (
        <p className="rounded-xl border border-dashed border-v-border px-6 py-10 text-center text-sm text-v-text-subtle">
          No events available. Create your first event to begin.
        </p>
      )}
    </div>
  )
}
