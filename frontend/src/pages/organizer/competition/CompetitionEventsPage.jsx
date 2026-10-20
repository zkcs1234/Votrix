import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit2, Eye } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import { isReadOnlyEventStatus, isSetupLocked } from '@/utils/constants'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import Badge, { statusTone } from '@/components/ui/Badge'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import useLatestRequest from '@/hooks/useLatestRequest'
import { getErrorMessage } from '@/utils/getErrorMessage'
import useDraft from '@/hooks/useDraft'
import DraftBanner from '@/components/organizer/DraftBanner'
import { resolveScaleBounds, scaleBoundsLabel, minorScoreLabel } from '@/utils/scoreScale'

function ScoringSheetPreviewModal({ eventId, eventTitle, onClose }) {
  const [contestants, setContestants] = useState([])
  const [criteria, setCriteria] = useState([])
  const [scoringConfig, setScoringConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const beginRead = useLatestRequest(eventId)

  const load = useCallback(async () => {
    const isCurrent = beginRead()
    setLoading(true); setError(null)
    // The foundation carries the event's real score scale and each criterion's
    // minor criteria, so the preview shows the range judges actually score
    // against instead of a criterion's stale stored min/max.
    await pageantService
      .getFoundation(eventId)
      .then(({ data }) => {
        if (!isCurrent()) return
        const foundation = data.foundation ?? data
        setContestants(foundation.contestants ?? [])
        setCriteria(foundation.criteria ?? [])
        setScoringConfig(foundation.scoringConfig ?? foundation.event?.scoring_config ?? null)
      })
      .catch((err) => { if (isCurrent()) setError(getErrorMessage(err, 'Failed to load preview')) })
      .finally(() => { if (isCurrent()) setLoading(false) })
  }, [eventId, beginRead])
  useEffect(() => { void load() }, [load])

  const eventBounds = resolveScaleBounds(scoringConfig)

  return (
    <div role="dialog" aria-modal="true" aria-label="Scoring sheet preview" className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
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

        {error && <div role="alert"><p className="text-sm text-v-danger">{error}</p><Button variant="secondary" onClick={load}>Retry preview</Button></div>}

        {!loading && !error && (
          <div className="space-y-6">
            <p className="text-xs text-v-text-subtle">
              This is a read-only preview of the contestants and criteria judges will score.
            </p>

            <div className="space-y-3">
              <h4 className="font-medium text-v-text">Criteria</h4>
              {criteria.length > 0 ? (
                <div className="space-y-2">
                  {criteria.map((c) => {
                    const minors = c.minorCriteria ?? []
                    return (
                      <div
                        key={c.id}
                        className="rounded-xl border border-v-border-strong px-4 py-2.5 bg-v-surface-elevated"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-v-text">{c.name}</span>
                          <span className="text-xs text-v-text-subtle">
                            {c.percentage}%
                            {minors.length === 0 && ` · score ${scaleBoundsLabel(eventBounds)}`}
                          </span>
                        </div>
                        {minors.length > 0 && (
                          <ul className="mt-2 space-y-1 border-t border-v-border/60 pt-2">
                            {minors.map((m) => (
                              <li
                                key={m.id}
                                className="flex items-center justify-between gap-3 text-xs text-v-text-subtle"
                              >
                                <span>{m.name}</span>
                                <span>score {minorScoreLabel(m)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
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
  const [error, setError] = useState('')
  const beginRead = useLatestRequest('competition-events')
  const { hasDraft, draft, deleteDraft } = useDraft('competition')

  const load = useCallback(async () => {
    const isCurrent = beginRead()
    try { const { data } = await pageantService.listEvents(); if (isCurrent()) { setEvents(data.events ?? []); setError('') } }
    catch (err) { if (isCurrent()) setError(getErrorMessage(err, 'Could not load competitions')) }
    finally { if (isCurrent()) setLoading(false) }
  }, [beginRead])

  useEffect(() => {
    load()
  }, [load])

  // Listen for session status changes to update event list
  useCompetitionSync(null, load)

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

      <PageHeader
        title="Competition Scoring events"
        description="Manage competitions, preview judging criteria, and monitor live events."
        actions={
          <Link to="/organizer/competition/events/new" className="v-btn-primary">
            <Plus className="h-4 w-4" strokeWidth={2} />
            New event
          </Link>
        }
      />

      {hasDraft && (
        <DraftBanner
          module="competition"
          draft={draft}
          onDelete={deleteDraft}
          newEventPath="/organizer/competition/events/new"
        />
      )}
      {error && <div role="alert" className="v-card p-4 space-y-2"><p className="v-error-text">{error}</p><Button variant="secondary" onClick={load}>Retry loading competitions</Button></div>}
      {!error && events.length === 0 && (
        <div className="v-card-md">
          <p className="font-semibold text-v-text">No competitions yet.</p>
          <p className="mt-1 text-sm text-v-text-muted">Create an event to begin setup.</p>
        </div>
      )}

      {events.map((event) => (
        <article
          key={event.id}
          className="v-card-md flex min-w-0 flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center"
        >
          <div className="min-w-0">
            <Link
              to={`/organizer/competition/events/${event.id}/${event.status === 'draft' ? 'workspace' : isReadOnlyEventStatus(event.status) ? 'rankings' : 'live'}`}
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
            {event.status === 'draft' ? (
              <Link
                to={`/organizer/competition/events/${event.id}/workspace`}
                className="v-btn-primary"
              >
                Continue setup
              </Link>
            ) : isReadOnlyEventStatus(event.status) ? null : (
              <Link
                to={`/organizer/competition/events/${event.id}/live`}
                className="v-btn-secondary text-v-success"
              >
                Live Control
              </Link>
            )}
            <Link
              to={`/organizer/competition/events/${event.id}/edit`}
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
    </div>
  )
}
