import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function ElectionEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    electionService
      .listEvents()
      .then(({ data }) => setEvents(data.events ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const toggleVoting = async (event) => {
    await electionService.setVoting(event.id, !event.votingEnabled)
    load()
  }

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
        <h2 className="text-xl font-semibold text-v-text">Events</h2>
        <Link
          to="/organizer/election/events/new"
          className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white hover:bg-v-primary-hover"
        >
          New event
        </Link>
      </div>

      <div className="space-y-3">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-v-border bg-v-surface p-5"
          >
            <div>
              <Link
                to={`/organizer/election/events/${event.id}/positions`}
                className="text-lg font-medium text-v-text hover:text-v-text-muted"
              >
                {event.title}
              </Link>
              <p className="mt-1 text-sm text-v-text-subtle">{event.status}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toggleVoting(event)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  event.votingEnabled
                    ? 'border border-red-800 text-v-danger hover:bg-red-950'
                    : 'border border-emerald-800 text-emerald-300 hover:bg-emerald-950'
                }`}
              >
                {event.votingEnabled ? 'Close voting' : 'Open voting'}
              </button>
              <Link
                to={`/organizer/election/events/${event.id}/edit`}
                className="rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated"
              >
                Edit
              </Link>
            </div>
          </div>
        ))}
        {!events.length && <p className="text-v-text-subtle">No events yet.</p>}
      </div>
    </div>
  )
}
