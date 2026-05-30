import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function PollingEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    pollingService
      .listEvents()
      .then(({ data }) => setEvents(data.events ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const toggle = async (event) => {
    try {
      await pollingService.setPollOpen(event.id, !event.pollingEnabled)
      load()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed')
    }
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
      <div className="flex justify-between">
        <h2 className="text-xl font-semibold text-v-text">Polls</h2>
        <Link
          to="/organizer/polling/events/new"
          className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white"
        >
          New poll
        </Link>
      </div>

      {events.map((event) => (
        <div
          key={event.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-v-border bg-v-surface p-5"
        >
          <Link
            to={`/organizer/polling/events/${event.id}/builder`}
            className="text-lg font-medium text-v-text hover:text-v-text"
          >
            {event.title}
          </Link>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => toggle(event)}
              className="rounded-lg border border-v-border px-3 py-1.5 text-sm text-v-text-muted"
            >
              {event.pollingEnabled ? 'Close poll' : 'Open poll'}
            </button>
            <Link
              to={`/organizer/polling/events/${event.id}/settings`}
              className="rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted"
            >
              Settings
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
