import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit2 } from 'lucide-react'
import { pollingService } from '@/services/polling.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import useDraft from '@/hooks/useDraft'
import DraftBanner from '@/components/organizer/DraftBanner'

export default function PollingEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const { hasDraft, draft, deleteDraft } = useDraft('polling')

  const load = () => {
    pollingService
      .listEvents()
      .then(({ data }) => setEvents(data.events ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useSocketEvent('poll:polling-toggled', ({ eventId, pollingEnabled }) => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, pollingEnabled } : e
      )
    )
  })

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
          className="inline-flex items-center gap-2 rounded-lg bg-v-primary px-4 py-2 text-sm text-white"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          New poll
        </Link>
      </div>

      {hasDraft && (
        <DraftBanner
          module="polling"
          draft={draft}
          onDelete={deleteDraft}
          newEventPath="/organizer/polling/events/new"
        />
      )}

      {events.map((event) => (
        <div
          key={event.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-v-border bg-v-surface p-5"
        >
          <div>
            <Link
              to={`/organizer/polling/events/${event.id}/builder`}
              className="text-lg font-medium text-v-text hover:text-v-text"
            >
              {event.title}
            </Link>
            <div className="mt-1 text-sm text-v-text-subtle capitalize">
              {event.status === 'draft' ? 'Setup — not published' : event.status}
            </div>
          </div>
          <div className="flex gap-2">
            {event.status === 'draft' ? (
              <Link
                to={`/organizer/polling/events/${event.id}/builder`}
                className="rounded-lg border border-v-primary bg-v-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-v-primary-hover"
              >
                Continue setup
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => toggle(event)}
                className="rounded-lg border border-v-border px-3 py-1.5 text-sm text-v-text-muted"
              >
                {event.pollingEnabled ? 'Close poll' : 'Open poll'}
              </button>
            )}
            <Link
              to={`/organizer/polling/events/${event.id}/edit`}
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
