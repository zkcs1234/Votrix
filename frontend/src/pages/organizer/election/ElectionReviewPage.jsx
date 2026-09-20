import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Undo2, Lock, CheckCircle2 } from 'lucide-react'
import { electionService } from '@/services/election.service'
import Button from '@/components/ui/Button'
import StageFooter from '@/components/ui/StageFooter'
import ReadinessItem from '@/components/organizer/ReadinessItem'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'
import { EVENT_STATUS, canUnpublishEventStatus } from '@/utils/constants'

// Review & Publish sits between Candidates and Voters. Publishing a draft hands
// it to the schedule (draft → scheduled) and locks setup; while still scheduled
// the organizer can unpublish to correct setup, or move on to invite voters.
export default function ElectionReviewPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [positionsCount, setPositionsCount] = useState(0)
  const [candidatesCount, setCandidatesCount] = useState(0)
  const [votersCount, setVotersCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const { success, error: showError } = useToast()

  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    try {
      const [{ data: ev }, { data: pos }, { data: cand }, { data: vot }] = await Promise.all([
        electionService.getEvent(eventId),
        electionService.listPositions(eventId),
        electionService.listCandidates(eventId),
        electionService.listVoters(eventId),
      ])
      setEvent(ev.event ?? null)
      setPositionsCount(Array.isArray(pos.positions) ? pos.positions.length : 0)
      setCandidatesCount(Array.isArray(cand.candidates) ? cand.candidates.length : 0)
      setVotersCount(Array.isArray(vot.voters) ? vot.voters.length : 0)
    } catch (err) {
      console.error('Failed to load review data:', err)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const status = event?.status ?? null
  const isDraft = status === EVENT_STATUS.DRAFT
  const canUnpublish = canUnpublishEventStatus(status)
  // Publishing no longer requires voters — they are invited after publish.
  const publishReady = positionsCount > 0 && candidatesCount > 0

  const handlePublish = async () => {
    if (!publishReady) return
    setPublishing(true)
    try {
      await electionService.publishEvent(eventId)
      success('Event published. It will open for voting based on its schedule.')
      await load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to publish event')
    } finally {
      setPublishing(false)
    }
  }

  const handleUnpublish = async () => {
    setUnpublishing(true)
    try {
      await electionService.unpublishEvent(eventId)
      success('Event moved back to draft. You can edit setup again.')
      await load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to unpublish event')
    } finally {
      setUnpublishing(false)
    }
  }

  if (loading && !showLoader) return null
  if (loading) return <p className="v-caption">Loading…</p>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="v-page-title">Review &amp; Publish</h2>
        <p className="v-helper-text mt-1">
          Publishing finishes setup and hands the event to its schedule. It does not open voting
          immediately — voting opens and closes based on the start and end dates you set. After
          publishing you can still register and invite voters until voting opens.
        </p>
      </div>

      {/* Event summary */}
      <div className="v-card-sm">
        <h3 className="v-label mb-3">{event?.title || 'Untitled event'}</h3>
        <dl className="grid gap-3 sm:grid-cols-3">
          <SummaryStat label="Positions" value={positionsCount} />
          <SummaryStat label="Candidates" value={candidatesCount} />
          <SummaryStat label="Registered voters" value={votersCount} />
        </dl>
      </div>

      {isDraft && (
        <div className="v-card-sm">
          <h3 className="v-label mb-1">Ready to publish?</h3>
          <p className="v-helper-text mb-3">
            You need the ballot in place before publishing. Voters can be registered and invited
            afterwards.
          </p>
          <ul className="space-y-1.5">
            <ReadinessItem ok={positionsCount > 0} label="At least one position" />
            <ReadinessItem ok={candidatesCount > 0} label="At least one candidate" />
          </ul>
        </div>
      )}

      {!isDraft && (
        <div className="flex items-start gap-3 rounded-2xl border border-v-border bg-v-surface-elevated p-4">
          <div className="rounded-full bg-emerald-500/15 p-1.5 text-emerald-500">
            {status === EVENT_STATUS.SCHEDULED ? (
              <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
            ) : (
              <Lock className="h-5 w-5" strokeWidth={2} />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-v-text">
              {status === EVENT_STATUS.SCHEDULED
                ? 'Published — waiting on the schedule'
                : status === EVENT_STATUS.ACTIVE
                  ? 'Voting is active'
                  : 'This event is closed'}
            </p>
            <p className="text-xs text-v-text-muted mt-0.5">
              {canUnpublish
                ? 'Setup is locked. Unpublish to make corrections, or continue to Voters to invite participants.'
                : 'Setup and the voter roster are locked.'}
            </p>
            {canUnpublish && (
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={handleUnpublish}
                  loading={unpublishing}
                  disabled={unpublishing}
                >
                  <Undo2 className="h-4 w-4" strokeWidth={1.5} />
                  Unpublish to draft
                </Button>
                <Button onClick={() => navigate(`/organizer/election/events/${eventId}/voters`)}>
                  Continue to Voters
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <StageFooter
        module="election"
        currentKey="review"
        eventId={eventId}
        {...(isDraft
          ? {
              saving: publishing,
              onNext: handlePublish,
              nextLabel: 'Finish & Publish',
              nextDisabled: !publishReady,
            }
          : {})}
      />
    </div>
  )
}

function SummaryStat({ label, value }) {
  return (
    <div className="rounded-lg border border-v-border px-3 py-2">
      <dt className="v-caption">{label}</dt>
      <dd className="text-lg font-semibold text-v-text">{value}</dd>
    </div>
  )
}
