import { NativeSetupBoundary } from '@/components/organizer/competition/NativeSetupWorkspace'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { evaluateCriteriaReadiness } from '../../../../../shared/competition-criteria-readiness.js'
import { scoringRuleReadiness } from '../../../../../shared/competition-rule-configuration.js'
import { Undo2, Lock, CheckCircle2 } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import Button from '@/components/ui/Button'
import StageFooter from '@/components/ui/StageFooter'
import ReadinessItem from '@/components/organizer/ReadinessItem'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'
import { EVENT_STATUS, canUnpublishEventStatus } from '@/utils/constants'
import useCompetitionSync from '@/hooks/useCompetitionSync'

// Review & Publish sits between Judges and Live Control. Publishing a draft hands
// it to the schedule (draft → scheduled) and locks setup; scoring itself is
// started later from Live Control. Versioned publication freezes the setup.
export default function CompetitionReviewPage() {
  return (
    <div data-module="competition-scoring" className="mx-auto max-w-5xl">
      <NativeSetupBoundary Legacy={LegacyCompetitionReviewPage} />
    </div>
  )
}
function LegacyCompetitionReviewPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [acknowledged,setAcknowledged]=useState(false)
  const [rulesConfirmed,setRulesConfirmed]=useState(false)
  const [contestantsCount, setContestantsCount] = useState(0)
  const [judgesCount, setJudgesCount] = useState(0)
  const [criteriaCount, setCriteriaCount] = useState(0)
  const [criteriaReadiness, setCriteriaReadiness] = useState(null)
  const [scoringReadiness, setScoringReadiness] = useState(null)
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
      setEvent(ev.event ? { ...ev.event, officialRulesId: ev.event.officialRulesId ?? ev.event.official_rules_id ?? found.foundation?.event?.official_rules_id ?? null } : null)
      setContestantsCount(found.foundation?.contestants?.length ?? 0)
      setCriteriaCount(found.foundation?.criteria?.length ?? 0)
      setCriteriaReadiness(found.foundation.criteriaReadiness ?? evaluateCriteriaReadiness(found.foundation))
      setLoadError('')
      setRulesConfirmed(!!found.foundation?.scoringConfig?.confirmed)
      setScoringReadiness(found.foundation.scoringRulesReadiness ?? scoringRuleReadiness(found.foundation))
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
  useCompetitionSync(eventId, load)

  const status = event?.status ?? null
  const frozen = Boolean(event?.officialRulesId)
  const isDraft = status === EVENT_STATUS.DRAFT && !frozen
  const canUnpublish = !frozen && canUnpublishEventStatus(status)
  const publishReady = !loadError && scoringReadiness?.readyForPublication && criteriaReadiness?.allReady && contestantsCount > 0 && judgesCount > 0 && criteriaCount > 0 && rulesConfirmed && acknowledged

  const handlePublish = async () => {
    if (!publishReady || publishing || unpublishing) return
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
    if (!canUnpublish || publishing || unpublishing) return
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
      <div className="v-card-md">
        <h2 className="v-page-title">Review &amp; Publish</h2>
        <p className="v-helper-text mt-1">
          Publishing finishes setup and hands the event to its schedule. It does not start scoring —
          you start the live scoring session from Live Control when you are ready. After publishing
          the official setup, contestant field, judge panel and assignments are frozen.
        </p>
      </div>

      <div className="v-card-md">
        <h3 className="v-section-title mb-3">{event?.title || 'Untitled event'}</h3>
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
            <ReadinessItem ok={Boolean(scoringReadiness?.readyForPublication)} label="Confirmed scoring rules and required reviewer setup complete" />
          </ul>
          {criteriaReadiness?.scopes.filter(scope => !scope.ready).map(scope => <p key={scope.roundId ?? 'flat'} className="mt-2 text-sm text-v-text-muted"><Link className="underline" to={`/organizer/competition/events/${eventId}/workspace?tab=criteria${scope.roundId ? `&roundId=${scope.roundId}` : ''}`}>{scope.name}</Link>: {scope.issues.map(issue => issue.message).join(' ')}</p>)}
          {[...(scoringReadiness?.issues ?? []), ...(scoringReadiness?.pending ?? [])].map((issue, i) => <p key={`${issue.field}-${i}`} className="mt-2 text-sm text-v-text-muted"><Link className="underline" to={`/organizer/competition/events/${eventId}/${issue.field === 'verifierId' ? 'judges' : 'workspace?tab=scoring'}`}>{issue.field === 'verifierId' ? 'Judges and reviewers' : 'Scoring rules'}</Link>: {issue.message}</p>)}
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
              {frozen
                ? 'Published rules and setup are frozen. Use the authorized scoring amendment procedure for supported rule changes; approval and fresh judging are required.'
                : canUnpublish
                ? 'Setup is locked. Unpublish to make corrections, or continue to Live Control to run scoring.'
                : 'Setup and the judge roster are locked.'}
            </p>
            {frozen && <div className="mt-3 flex flex-wrap gap-3"><Button onClick={() => navigate(`/organizer/competition/events/${eventId}/live`)}>Go to Live Control</Button><Link className="text-sm underline self-center" to={`/organizer/competition/events/${eventId}/tabulation`}>Authorized scoring amendments in Tabulation</Link></div>}
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
