import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit2 } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useSocketEvent } from '@/hooks/useSocketEvent'

export default function CompetitionEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    pageantService
      .listEvents()
      .then(({ data }) => setEvents(data.events ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useSocketEvent('competition:scoring-toggled', ({ eventId, scoringEnabled }) => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, scoringEnabled } : e
      )
    )
  })

  const toggle = async (event) => {
    try {
      await pageantService.setScoring(event.id, !event.scoringEnabled)
      load()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to toggle scoring')
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
        <h2 className="text-xl font-semibold text-v-text">Competition Scoring events</h2>
        <Link
          to="/organizer/competition/events/new"
          className="inline-flex items-center gap-2 rounded-lg bg-v-primary px-4 py-2 text-sm text-white"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          New event
        </Link>
      </div>

      {events.map((event) => (
        <div
          key={event.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-v-border bg-v-surface p-5"
        >
          <Link
            to={`/organizer/competition/events/${event.id}/contestants`}
            className="text-lg font-medium text-v-text hover:text-v-text"
          >
            {event.title}
          </Link>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => toggle(event)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                event.scoringEnabled
                  ? 'border border-red-800 text-v-danger'
                  : 'border border-emerald-800 text-emerald-300'
              }`}
            >
              {event.scoringEnabled ? 'Close scoring' : 'Open scoring'}
            </button>
            <Link
              to={`/organizer/competition/events/${event.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted"
            >
              <Edit2 className="h-3.5 w-3.5" strokeWidth={2} />
              Edit
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
