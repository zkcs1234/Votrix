import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { evaluateCriteriaReadiness } from '../../../../../shared/competition-criteria-readiness.js'
import { Undo2, Lock, CheckCircle2 } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import Button from '@/components/ui/Button'
import StageFooter from '@/components/ui/StageFooter'
import ReadinessItem from '@/components/organizer/ReadinessItem'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'
import { EVENT_STATUS, canUnpublishEventStatus } from '@/utils/constants'

// Review & Publish sits between Judges and Live Control. Publishing a draft hands
// it to the schedule (draft → scheduled) and locks setup; scoring itself is
// started later from Live Control. While scheduled the organizer can unpublish
// to correct setup, or add/invite more judges on the Judges step.
export default function CompetitionReviewPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [acknowledged,setAcknowledged]=useState(false)
  const [rulesConfirmed,setRulesConfirmed]=useState(false)
  const [contestantsCount, setContestantsCount] = useState(0)
  const [judgesCount, setJudgesCount] = useState(0)
  const [criteriaCount, setCriteriaCount] = useState(0)
  const [criteriaReadiness, setCriteriaReadiness] = useState(null)
  const [loadError, setLoadError] = useState('')
  const requestRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const { success, error: showError } = useToast()

  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    const request = ++requestRef.current
    try {
      const [{ data: ev }, { data: found }, { data: jud }] = await Promise.all([
        pageantService.getEvent(eventId),
        pageantService.getFoundation(eventId),
        pageantService.listJudges(eventId),
      ])
      if (request !== requestRef.current) return
      setEvent(ev.event ?? null)
      setContestantsCount(found.foundation?.contestants?.length ?? 0)
      setCriteriaCount(found.foundation?.criteria?.length ?? 0)
      setCriteriaReadiness(found.foundation.criteriaReadiness ?? evaluateCriteriaReadiness(found.foundation))
      setLoadError('')
      setRulesConfirmed(!!found.foundation?.scoringConfig?.confirmed)
      setJudgesCount(Array.isArray(jud.judges) ? jud.judges.length : 0)
    } catch (err) {
      if (request === requestRef.current) setLoadError(err.response?.data?.message || 'Could not confirm saved setup. Reload before publishing.')
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const status = event?.status ?? null
  const isDraft = status === EVENT_STATUS.DRAFT
  const canUnpublish = canUnpublishEventStatus(status)
  const publishReady = !loadError && criteriaReadiness?.allReady && contestantsCount > 0 && judgesCount > 0 && criteriaCount > 0 && rulesConfirmed && acknowledged

  const handlePublish = async () => {
    if (!publishReady) return
    setPublishing(true)
    try {
      await pageantService.publishEvent(eventId,{acknowledged})
      success('Event published. Start scoring anytime from Live Control.')
      await load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to publish event')
      await load()
    } finally {
      setPublishing(false)
    }
  }

  const handleUnpublish = async () => {
    setUnpublishing(true)
    try {
      await pageantService.unpublishEvent(eventId)
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
          Publishing finishes setup and hands the event to its schedule. It does not start scoring —
          you start the live scoring session from Live Control when you are ready. After publishing
          you can still register and invite judges until scoring goes live.
        </p>
      </div>

      <div className="v-card-sm">
        <h3 className="v-label mb-3">{event?.title || 'Untitled event'}</h3>
        <dl className="grid gap-3 sm:grid-cols-3">
          <SummaryStat label="Contestants" value={contestantsCount} />
          <SummaryStat label="Judges" value={judgesCount} />
          <SummaryStat label="Criteria" value={criteriaCount} />
        </dl>
      </div>
      {loadError && <div role="alert" className="v-card-sm"><p className="v-error-text">{loadError}</p><Button variant="secondary" onClick={load}>Reload saved setup</Button></div>}

      {isDraft && (
        <div className="v-card-sm">
          <h3 className="v-label mb-1">Ready to publish?</h3>
          <p className="v-helper-text mb-3">
            You need the scoring structure and at least one judge in place before publishing.
          </p>
          <ul className="space-y-1.5">
            <ReadinessItem ok={contestantsCount > 0} label="At least one contestant" />
            <ReadinessItem ok={judgesCount > 0} label="At least one judge" />
            <ReadinessItem ok={criteriaCount > 0} label="At least one criterion" />
            <ReadinessItem ok={Boolean(criteriaReadiness?.allReady)} label="All scoring criteria complete with valid inputs" />
          </ul>
          {criteriaReadiness?.scopes.filter(scope => !scope.ready).map(scope => <p key={scope.roundId ?? 'flat'} className="mt-2 text-sm text-v-text-muted"><Link className="underline" to={`/organizer/competition/events/${eventId}/workspace?tab=criteria${scope.roundId ? `&roundId=${scope.roundId}` : ''}`}>{scope.name}</Link>: {scope.issues.map(issue => issue.message).join(' ')}</p>)}
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
                ? 'Published — ready for Live Control'
                : status === EVENT_STATUS.ACTIVE
                  ? 'Scoring is live'
                  : 'This event is closed'}
            </p>
            <p className="text-xs text-v-text-muted mt-0.5">
              {canUnpublish
                ? 'Setup is locked. Unpublish to make corrections, or continue to Live Control to run scoring.'
                : 'Setup and the judge roster are locked.'}
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
                <Button onClick={() => navigate(`/organizer/competition/events/${eventId}/live`)}>
                  Go to Live Control
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {isDraft && <label className="flex gap-2 v-card p-4"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/>I acknowledge the configured rules as the official competition rules. Publishing freezes this version.</label>}
      <StageFooter
        module="competition"
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
