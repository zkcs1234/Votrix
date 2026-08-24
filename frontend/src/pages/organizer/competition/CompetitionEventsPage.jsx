import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit2 } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import useDraft from '@/hooks/useDraft'
import DraftBanner from '@/components/organizer/DraftBanner'

export default function CompetitionEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const { hasDraft, draft, deleteDraft } = useDraft('competition')

  const load = () => {
    pageantService
      .listEvents()
      .then(({ data }) => setEvents(data.events ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  // Listen for session status changes to update event list
  useSocketEvent('session:status-changed', () => {
    load()
  })

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

      {hasDraft && (
        <DraftBanner
          module="competition"
          draft={draft}
          onDelete={deleteDraft}
          newEventPath="/organizer/competition/events/new"
        />
      )}

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
            <Link
              to={`/organizer/competition/events/${event.id}/live`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-950/50"
            >
              Live Control
            </Link>
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
