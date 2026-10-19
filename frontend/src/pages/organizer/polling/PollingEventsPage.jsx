import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit2, Eye } from 'lucide-react'
import { pollingService } from '@/services/polling.service'
import { isSetupLocked } from '@/utils/constants'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import FormAlert from '@/components/ui/FormAlert'
import PageHeader from '@/components/ui/PageHeader'
import Badge, { statusTone } from '@/components/ui/Badge'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import useDraft from '@/hooks/useDraft'
import DraftBanner from '@/components/organizer/DraftBanner'
import { getErrorMessage } from '@/utils/getErrorMessage'

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
  const [error, setError] = useState('')
  const [previewEventId, setPreviewEventId] = useState(null)
  const { hasDraft, draft, deleteDraft } = useDraft('polling')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await pollingService.listEvents()
      setEvents(data.events ?? [])
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load polls'))
    } finally {
      setLoading(false)
    }
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

      <PageHeader
        title="Polls"
        description="Manage poll setup, preview questions, and continue building respondent experiences."
        actions={
          <Link to="/organizer/polling/events/new" className="v-btn-primary">
            <Plus className="h-4 w-4" strokeWidth={2} />
            New poll
          </Link>
        }
      />

      {hasDraft && (
        <DraftBanner
          module="polling"
          draft={draft}
          onDelete={deleteDraft}
          newEventPath="/organizer/polling/events/new"
        />
      )}

      {error ? (
        <div className="space-y-3">
          <FormAlert variant="error">{error}</FormAlert>
          <Button variant="secondary" onClick={load}>Retry loading polls</Button>
        </div>
      ) : (
        <>
      {events.length === 0 && (
        <div className="v-card-md">
          <p className="font-semibold text-v-text">No polls yet.</p>
          <p className="mt-1 text-sm text-v-text-muted">Create a poll to start collecting responses.</p>
        </div>
      )}

      {events.map((event) => (
        <article
          key={event.id}
          className="v-card-md flex min-w-0 flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center"
        >
          <div className="min-w-0">
            <Link
              to={`/organizer/polling/events/${event.id}/builder`}
              className="break-words text-lg font-semibold text-v-text hover:text-v-primary"
            >
              {event.title}
            </Link>
            <div className="mt-1.5">
              <Badge tone={statusTone(event.status)} dot className="capitalize">
                {event.status === 'draft' ? 'Setup — not published' : event.status}
              </Badge>
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={() => setPreviewEventId(event.id)}
              className="v-btn-secondary"
            >
              <Eye className="h-3.5 w-3.5" strokeWidth={2} />
              Preview
            </button>
            {event.status === 'draft' && (
              <Link
                to={`/organizer/polling/events/${event.id}/builder`}
                className="v-btn-primary"
              >
                Continue setup
              </Link>
            )}
            <Link
              to={`/organizer/polling/events/${event.id}/edit`}
              className="v-btn-secondary"
            >
              {isSetupLocked(event.status) ? (
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
        </article>
      ))}
        </>
      )}
    </div>
  )
}
