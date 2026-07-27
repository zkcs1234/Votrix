import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit2, Copy, Eye, CheckCircle2 } from 'lucide-react'
import { electionService } from '@/services/election.service'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

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
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-v-surface text-v-text font-semibold text-sm">
                        {candidate.name?.charAt(0)}
                      </div>
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

function EventCard({ event, onToggleVoting, onDuplicate, onPreview }) {
  const [toggling, setToggling] = useState(false)
  const [duplicating, setDuplicating] = useState(false)

  const handleToggle = async () => {
    setToggling(true)
    try {
      await onToggleVoting(event)
    } finally {
      setToggling(false)
    }
  }

  const handleDuplicate = async () => {
    setDuplicating(true)
    try {
      await onDuplicate(event.id)
    } finally {
      setDuplicating(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-v-border bg-v-surface p-5">
      <div>
        <Link
          to={`/organizer/election/events/${event.id}/positions`}
          className="text-lg font-medium text-v-text hover:text-v-text-muted"
        >
          {event.title}
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-v-text-subtle capitalize">{event.status}</span>
          {event.electionStatus && (
            <span className="v-badge v-badge-info text-xs">{event.electionStatus}</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPreview(event.id)}
          className="inline-flex items-center gap-1 rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated"
        >
          <Eye className="h-3.5 w-3.5" strokeWidth={2} />
          Preview
        </button>
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={duplicating}
          className="inline-flex items-center gap-1 rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated disabled:opacity-50"
        >
          <Copy className="h-3.5 w-3.5" strokeWidth={2} />
          {duplicating ? 'Copying...' : 'Duplicate'}
        </button>
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggling}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            event.votingEnabled
              ? 'border border-red-800 text-v-danger hover:bg-red-950/40'
              : 'border border-emerald-800 text-emerald-300 hover:bg-emerald-950/40'
          } disabled:opacity-50`}
        >
          {toggling
            ? event.votingEnabled
              ? 'Closing...'
              : 'Opening...'
            : event.votingEnabled
              ? 'Close voting'
              : 'Open voting'}
        </button>
        <Link
          to={`/organizer/election/events/${event.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated"
        >
          <Edit2 className="h-3.5 w-3.5" strokeWidth={2} />
          Edit
        </Link>
      </div>
    </div>
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
  const { success, error: showError } = useToast()

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useSocketEvent('election:voting-toggled', ({ eventId, votingEnabled }) => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, votingEnabled } : e
      )
    )
  })

  const handleToggleVoting = useCallback(
    async (event) => {
      const previousEvents = [...events]

      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id ? { ...e, votingEnabled: !e.votingEnabled } : e
        )
      )

      try {
        await electionService.setVoting(event.id, !event.votingEnabled)
      } catch (err) {
        setEvents(previousEvents)
        showError(err.response?.data?.message || 'Failed to update voting status')
      }
    },
    [events, showError]
  )

  const handleDuplicate = async (eventId) => {
    try {
      const { data } = await electionService.duplicateEvent(eventId)
      success(`Duplicated event as "${data.event.title}"`)
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to duplicate event')
    }
  }

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

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-v-text">Events</h2>
        <Link
          to="/organizer/election/events/new"
          className="inline-flex items-center gap-2 rounded-lg bg-v-primary px-4 py-2 text-sm text-white hover:bg-v-primary-hover font-medium"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          New event
        </Link>
      </div>

      <div className="space-y-3">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onToggleVoting={handleToggleVoting}
            onDuplicate={handleDuplicate}
            onPreview={setPreviewEventId}
          />
        ))}
        {!events.length && <p className="text-v-text-subtle">No events yet.</p>}
      </div>
    </div>
  )
}