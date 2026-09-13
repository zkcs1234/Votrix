import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit2, Eye } from 'lucide-react'
import { pollingService } from '@/services/polling.service'
import { isReadOnlyEventStatus } from '@/utils/constants'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import useDraft from '@/hooks/useDraft'
import DraftBanner from '@/components/organizer/DraftBanner'

function PollPreviewModal({ eventId, eventTitle, onClose }) {
  const [questions, setQuestions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    pollingService
      .listQuestions(eventId)
      .then(({ data }) => setQuestions(data.questions ?? []))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load preview'))
      .finally(() => setLoading(false))
  }, [eventId])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-v-surface rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto border border-v-border space-y-6">
        <div className="flex items-center justify-between border-b border-v-border pb-3">
          <div>
            <span className="v-caption uppercase tracking-wider text-v-primary font-semibold">Poll Preview</span>
            <h3 className="text-xl font-semibold text-v-text">{eventTitle || 'Poll'}</h3>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {loading && (
          <div className="py-12 flex justify-center">
            <LoadingSpinner />
          </div>
        )}

        {error && <p className="text-sm text-v-danger">{error}</p>}

        {!loading && !error && (
          <div className="space-y-6">
            <p className="text-xs text-v-text-subtle">
              This is a read-only preview of what respondents will see when taking the poll.
            </p>

            {(questions ?? []).map((question, index) => (
              <div key={question.id} className="v-card p-5 space-y-3">
                <div>
                  <h4 className="font-medium text-v-text">
                    {index + 1}. {question.question}
                    {question.required && <span className="text-v-danger"> *</span>}
                  </h4>
                  <p className="text-xs text-v-text-subtle capitalize">
                    {question.typeDef?.label || question.type?.replace(/_/g, ' ')}
                  </p>
                </div>

                {question.imageUrl && (
                  <img src={question.imageUrl} alt="" className="rounded-lg max-h-48 object-cover" />
                )}

                {question.options?.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    {question.options.map((opt) => (
                      <div
                        key={opt.id}
                        className="flex items-center gap-3 rounded-xl border border-v-border-strong px-4 py-2.5 bg-v-surface-elevated"
                      >
                        <span className="h-4 w-4 shrink-0 rounded-full border border-v-border-strong" />
                        {opt.imageUrl && (
                          <img src={opt.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                        )}
                        <span className="text-sm text-v-text">{opt.label}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-v-border px-4 py-3 text-sm text-v-text-subtle">
                    Open response
                  </div>
                )}
              </div>
            ))}

            {(!questions || questions.length === 0) && (
              <p className="text-sm text-v-text-subtle">No questions added to this poll yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PollingEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewEventId, setPreviewEventId] = useState(null)
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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  const previewEvent = events.find((e) => e.id === previewEventId)

  return (
    <div className="space-y-6">
      {previewEventId && (
        <PollPreviewModal
          eventId={previewEventId}
          eventTitle={previewEvent?.title}
          onClose={() => setPreviewEventId(null)}
        />
      )}

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
            <button
              type="button"
              onClick={() => setPreviewEventId(event.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated"
            >
              <Eye className="h-3.5 w-3.5" strokeWidth={2} />
              Preview
            </button>
            {event.status === 'draft' && (
              <Link
                to={`/organizer/polling/events/${event.id}/builder`}
                className="rounded-lg border border-v-primary bg-v-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-v-primary-hover"
              >
                Continue setup
              </Link>
            )}
            <Link
              to={`/organizer/polling/events/${event.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted"
            >
              {isReadOnlyEventStatus(event.status) ? (
                <>
                  <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                  View
                </>
              ) : (
                <>
                  <Edit2 className="h-3.5 w-3.5" strokeWidth={2} />
                  Edit
                </>
              )}
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
