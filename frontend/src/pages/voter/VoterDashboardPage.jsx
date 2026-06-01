import { useEffect, useState } from 'react'
import { voterService } from '@/services/voter.service'
import { useAuth } from '@/hooks/useAuth'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import VoterEventCard from '@/components/voter/VoterEventCard'
import Card from '@/components/ui/Card'

function EventSection({ title, description, events }) {
  if (!events?.length) return null

  return (
    <section>
      <div className="mb-3">
        <h3 className="v-section-title">{title}</h3>
        {description && <p className="v-caption">{description}</p>}
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
    <div className="v-card-sm">
      <p className="v-caption">{label}</p>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${accent}`}>{value}</p>
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
          if (!alive) setLoading(false)
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="v-card-md">
        <h2 className="v-page-title">Your events</h2>
        <p className="v-caption mt-2">
          Signed in as <span className="text-v-text-muted">{user?.email}</span>
        </p>
        <p className="v-caption mt-1">
          Elections, pageant judging, and polls assigned to you appear below.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Assigned" value={stats.assigned} accent="v-stat-accent" />
        <StatCard label="Active now" value={stats.active} accent="v-stat-success" />
        <StatCard label="Completed" value={stats.completed} accent="v-stat-muted" />
        <StatCard label="Total" value={stats.total} accent="v-text" />
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
        <Card padding="sm" className="text-center">
          <p className="v-caption">No events available. Create your first event to begin.</p>
        </Card>
      )}
    </div>
  )
}