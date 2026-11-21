import { useEffect, useState, useCallback } from 'react'
import { Eye } from 'lucide-react'
import { electionService } from '@/services/election.service'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import Button from '@/components/ui/Button'
import EventListCard, { EventListHeader, EventListSkeleton, EventListEmpty, EventListError } from '@/components/organizer/EventList'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import useDraft from '@/hooks/useDraft'
import DraftBanner from '@/components/organizer/DraftBanner'
import { getErrorMessage } from '@/utils/getErrorMessage'

function BallotPreviewModal({ eventId, onClose }) {
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    electionService
      .getBallotPreview(eventId)
      .then(({ data }) => setPreview(data.preview))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load preview'))
      .finally(() => setLoading(false))
  }, [eventId])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-v-surface rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto border border-v-border space-y-6">
        <div className="flex items-center justify-between border-b border-v-border pb-3">
          <div>
            <span className="v-caption uppercase tracking-wider text-v-primary font-semibold">Ballot Preview</span>
            <h3 className="text-xl font-semibold text-v-text">{preview?.event?.title || 'Election Ballot'}</h3>
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

        {!loading && preview && (
          <div className="space-y-6">
            <p className="text-xs text-v-text-subtle">
              This is an exact read-only preview of what voters will see when casting their ballot.
            </p>

            {(preview.positions ?? []).map((position) => (
              <div key={position.id} className="v-card p-5 space-y-3">
                <div>
                  {position.ballotSectionName && (
                    <p className="mb-1 text-xs font-medium uppercase text-v-primary">
                      {position.ballotSectionName}
                    </p>
                  )}
                  <h4 className="font-medium text-v-text">{position.name}</h4>
                  <p className="text-xs text-v-text-subtle">
                    Select {position.minVote === position.maxVote ? position.minVote : `${position.minVote}–${position.maxVote}`} candidate(s)
                    {position.allowSkip ? ' · or skip' : ''}
                  </p>
                </div>

                <div className="space-y-2 pt-2">
                  {(position.candidates ?? []).map((candidate) => (
                    <div
                      key={candidate.id}
                      className="flex items-center gap-3 rounded-xl border border-v-border-strong px-4 py-3 bg-v-surface-elevated"
                    >
                      {candidate.photo ? (
                        <img
                          src={candidate.photo}
                          alt={`Photo of ${candidate.name}`}
                          className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-v-surface text-v-text font-semibold text-sm">
                          {candidate.name?.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-v-text">{candidate.name}</p>
                        {(candidate.party || candidate.partylist) && (
                          <p className="text-xs text-v-text-subtle">{candidate.party || candidate.partylist}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {(!position.candidates || position.candidates.length === 0) && (
                    <p className="text-xs text-v-text-subtle">No candidates added to this position yet.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EventCard({ event, onPreview }) {
  return (
    <EventListCard
      module="election"
      event={event}
      titleHref={`/organizer/election/events/${event.id}/positions`}
      editHref={`/organizer/election/events/${event.id}/edit`}
      continueSetupHref={`/organizer/election/events/${event.id}/positions`}
      badges={event.electionStatus && <span className="v-badge v-badge-info text-xs">{event.electionStatus}</span>}
      actions={
        <Button variant="secondary" onClick={() => onPreview(event.id)}>
          <Eye className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Preview
        </Button>
      }
    />
  )
}

export default function ElectionEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [previewEventId, setPreviewEventId] = useState(null)
  const { hasDraft, draft, deleteDraft } = useDraft('election')

  // Use delayed loading
  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await electionService.listEvents()
      setEvents(data.events ?? [])
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load election events'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useSocketEvent('election:voting-toggled', ({ eventId, votingEnabled }) => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, votingEnabled } : e
      )
    )
  })

  if (loading && !showLoader) {
    return null
  }

  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
        <EventListSkeleton rows={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {previewEventId && (
        <BallotPreviewModal
          eventId={previewEventId}
          onClose={() => setPreviewEventId(null)}
        />
      )}

      <EventListHeader title="Elections" newEventPath="/organizer/election/events/new" />

      {hasDraft && (
        <DraftBanner
          module="election"
          discardFirst
          alignActionsRight
          draft={draft}
          onDelete={deleteDraft}
          newEventPath="/organizer/election/events/new"
        />
      )}

      {error ? (
        <EventListError message={error} retryLabel="Retry loading elections" onRetry={load} />
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} onPreview={setPreviewEventId} />
          ))}
          {!events.length && (
            <EventListEmpty title="No election events yet." hint="Create an election event to get started." />
          )}
        </div>
      )}
    </div>
  )
}
