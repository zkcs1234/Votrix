import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit2, Eye } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import { isReadOnlyEventStatus } from '@/utils/constants'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import useDraft from '@/hooks/useDraft'
import DraftBanner from '@/components/organizer/DraftBanner'

function ScoringSheetPreviewModal({ eventId, eventTitle, onClose }) {
  const [contestants, setContestants] = useState([])
  const [criteria, setCriteria] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      pageantService.listContestants(eventId),
      pageantService.listCriteria(eventId),
    ])
      .then(([contestantsRes, criteriaRes]) => {
        setContestants(contestantsRes.data.contestants ?? [])
        setCriteria(criteriaRes.data.criteria ?? [])
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load preview'))
      .finally(() => setLoading(false))
  }, [eventId])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-v-surface rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto border border-v-border space-y-6">
        <div className="flex items-center justify-between border-b border-v-border pb-3">
          <div>
            <span className="v-caption uppercase tracking-wider text-v-primary font-semibold">Scoring Sheet Preview</span>
            <h3 className="text-xl font-semibold text-v-text">{eventTitle || 'Competition'}</h3>
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
              This is a read-only preview of the contestants and criteria judges will score.
            </p>

            <div className="space-y-3">
              <h4 className="font-medium text-v-text">Criteria</h4>
              {criteria.length > 0 ? (
                <div className="space-y-2">
                  {criteria.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-v-border-strong px-4 py-2.5 bg-v-surface-elevated"
                    >
                      <span className="text-sm font-medium text-v-text">{c.name}</span>
                      <span className="text-xs text-v-text-subtle">
                        {c.percentage}% · score {c.minScore}–{c.maxScore}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-v-text-subtle">No criteria added yet.</p>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-v-text">Contestants</h4>
              {contestants.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {contestants.map((c) => (
                    <div key={c.id} className="v-card p-3 text-center">
                      {c.photo ? (
                        <img src={c.photo} alt="" className="mb-2 h-24 w-full rounded-lg object-cover" />
                      ) : (
                        <div className="mb-2 flex h-24 w-full items-center justify-center rounded-lg bg-v-surface-elevated text-v-text-subtle text-sm">
                          No photo
                        </div>
                      )}
                      <p className="text-sm font-medium text-v-text">{c.name}</p>
                      {(c.contestantNumber ?? c.contestant_number) != null && (
                        <p className="text-xs text-v-text-subtle">
                          #{c.contestantNumber ?? c.contestant_number}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-v-text-subtle">No contestants added yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CompetitionEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewEventId, setPreviewEventId] = useState(null)
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

  const previewEvent = events.find((e) => e.id === previewEventId)

  return (
    <div className="space-y-6">
      {previewEventId && (
        <ScoringSheetPreviewModal
          eventId={previewEventId}
          eventTitle={previewEvent?.title}
          onClose={() => setPreviewEventId(null)}
        />
      )}

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
          <div>
            <Link
              to={`/organizer/competition/events/${event.id}/contestants`}
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
            {event.status === 'draft' ? (
              <Link
                to={`/organizer/competition/events/${event.id}/contestants`}
                className="rounded-lg border border-v-primary bg-v-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-v-primary-hover"
              >
                Continue setup
              </Link>
            ) : isReadOnlyEventStatus(event.status) ? null : (
              <Link
                to={`/organizer/competition/events/${event.id}/live`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-950/50"
              >
                Live Control
              </Link>
            )}
            <Link
              to={`/organizer/competition/events/${event.id}/edit`}
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
