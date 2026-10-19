import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit2, Eye } from 'lucide-react'
import { electionService } from '@/services/election.service'
import { EVENT_STATUS } from '@/utils/constants'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import PageHeader from '@/components/ui/PageHeader'
import useDraft from '@/hooks/useDraft'
import DraftBanner from '@/components/organizer/DraftBanner'

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
    <article aria-labelledby={`election-event-${event.id}`} className="v-card-md flex min-w-0 flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 id={`election-event-${event.id}`} className="min-w-0 break-words text-lg font-medium text-v-text">
            <Link to={`/organizer/election/events/${event.id}/positions`} className="hover:text-v-primary">
              {event.title}
            </Link>
          </h3>
          <Badge
            tone={event.status === EVENT_STATUS.ACTIVE ? 'success' : event.status === EVENT_STATUS.CANCELLED ? 'danger' : 'default'}
            className="capitalize"
          >
            {event.status === EVENT_STATUS.DRAFT ? 'Setup — not published' : event.status}
          </Badge>
          {event.electionStatus && (
            <span className="v-badge v-badge-info text-xs">{event.electionStatus}</span>
          )}
        </div>
        {event.description && (
          <p className="mt-2 whitespace-pre-line break-words text-sm text-v-text-muted">{event.description}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
        <Button variant="secondary" onClick={() => onPreview(event.id)}>
          <Eye className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Preview
        </Button>
        <Link
          to={`/organizer/election/events/${event.id}/edit`}
          className="v-btn-primary"
        >
          <Edit2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Manage
        </Link>
        {event.status === EVENT_STATUS.DRAFT && (
          <Link
            to={`/organizer/election/events/${event.id}/positions`}
            className="v-btn-secondary"
          >
            Continue setup
          </Link>
        )}
      </div>
    </article>
  )
}

function EventCardSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-v-border bg-v-surface p-5">
      <div className="space-y-2">
        <div className="h-5 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
      </div>
      <div className="flex gap-2">
        <div className="h-7 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="h-7 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
      </div>
    </div>
  )
}

export default function ElectionEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewEventId, setPreviewEventId] = useState(null)
  const { hasDraft, draft, deleteDraft } = useDraft('election')

  // Use delayed loading
  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await electionService.listEvents()
      setEvents(data.events ?? [])
    } catch {
      // Errors are surfaced via the empty state below
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
        <div className="flex items-center justify-between">
          <div className="h-7 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="h-9 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>

        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
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

      <PageHeader
        title="Events"
        description="Create and manage election events, preview ballots, and continue setup."
        actions={
          <Link to="/organizer/election/events/new" className="v-btn-primary">
            <Plus className="h-4 w-4" strokeWidth={2} />
            New event
          </Link>
        }
      />

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

      <div className="space-y-3">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onPreview={setPreviewEventId}
          />
        ))}
        {!events.length && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-v-border bg-v-surface p-6 text-center">
            <div>
              <p className="font-medium text-v-text">No election events yet.</p>
              <p className="v-caption mt-1">Create an election event to get started.</p>
            </div>
            <Link to="/organizer/election/events/new" className="v-btn-primary">
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              New event
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
