import CompetitionReviewer from '@/components/voter/competition/CompetitionReviewer'
import CompetitionPublishedResults from '@/components/voter/competition/CompetitionPublishedResults'
import useJudgeScoreDrafts from '@/hooks/useJudgeScoreDrafts'
import { workflowService } from '@/services/competition-workflow.service'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle, AlertTriangle, RotateCcw, AlertCircle } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import useLatestRequest from '@/hooks/useLatestRequest'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import FormAlert from '@/components/ui/FormAlert'
import CompetitionScoringForm from '@/components/voter/competition/CompetitionScoringForm'
import JudgeScoringHeader from '@/components/voter/competition/JudgeScoringHeader'
import { useAuth } from '@/hooks/useAuth'
import { CompetitionWorkspaceBoundary } from '@/components/voter/competition/NativeCompetitionWorkspace'

export default function JudgeScoringPage() { return <CompetitionWorkspaceBoundary Legacy={LegacyJudgeScoringPage}/> }
function LegacyJudgeScoringPage() {
  const { eventId } = useParams()
  const { user } = useAuth()
  const identityRef = useRef({ eventId, judgeId: user?.id })
  identityRef.current = { eventId, judgeId: user?.id }
  const beginViewRequest = useLatestRequest(`${eventId}:${user?.id}`)
  const acceptedRevision = useRef(null)
  const getGuardedView = useCallback(async (options) => {
    const identity = { eventId, judgeId: user?.id }
    const isCurrent = beginViewRequest()
    const result = await pageantService.getSessionView(eventId, options)
    const session = result.data.activeSession ?? result.data.session
    const revisionKey = `${eventId}:${identity.judgeId}:${session?.id}:${result.data.context?.rulesVersion}`
    const previous = acceptedRevision.current
    if (!isCurrent() || identityRef.current.eventId !== identity.eventId ||
        identityRef.current.judgeId !== identity.judgeId || result.data.viewerJudgeId !== identity.judgeId ||
        (previous?.key === revisionKey && Number(session?.revision ?? 0) < previous.revision)) {
      const stale = new Error('A newer scoring context is already available')
      stale.staleContext = true
      throw stale
    }
    acceptedRevision.current = { key: revisionKey, revision: Number(session?.revision ?? 0) }
    return result
  }, [eventId, user?.id, beginViewRequest])
  const judgeName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email
  const [sheet, setSheet] = useState(null)
  const currentSheetRef = useRef(sheet)
  currentSheetRef.current = sheet
  const [reviewer,setReviewer]=useState(false)
  const [scores, setScores] = useState({})
  const [loading, setLoading] = useState(true)
  const {changed:markDraftChanged,flush:flushDrafts,status:draftStatus,hasPending:pendingDrafts} = useJudgeScoreDrafts(eventId,user?.id,sheet,scores,setScores)
  const [roundSubmitting,setRoundSubmitting]=useState(false)
  const [error, setError] = useState(null)
  
  // Live session state variables
  const [sessionState, setSessionState] = useState(null)
  const [activeContestantId, setActiveContestantId] = useState(null)
  const [connectionError, setConnectionError] = useState(null)
  // Which criterion is currently being submitted, keyed `contestantId:criterionId`
  // (per-criterion Lock). null when nothing is in flight.
  const [submittingKey, setSubmittingKey] = useState(null)
  const isArchived = sheet?.event?.status === 'archived'
  
  // Division selector state
  const [selectedDivisionId, setSelectedDivisionId] = useState(null)

  // Retry queue state management (Requirement 15.1, 15.2)
  const [submissionQueue, setSubmissionQueue] = useState([])
  const retryInProgress = useRef(false)
  const [showRetryBanner, setShowRetryBanner] = useState(false)
  
  // Confirmation toast state
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [lastSavedName, setLastSavedName] = useState('')

  // Helper functions for retry queue localStorage persistence (Requirement 15.2)
  const getRetryQueueKey = useCallback(() => {
    return `competition_retry_queue_v2_${user?.id}_${eventId}_${sheet?.context?.sessionId??'waiting'}_${sheet?.context?.roundId??'flat'}_${sheet?.context?.rulesVersion??'legacy'}`
  }, [eventId,user?.id,sheet?.context?.sessionId,sheet?.context?.roundId,sheet?.context?.rulesVersion])

  const loadRetryQueueFromStorage = useCallback(() => {
    try {
      const key = getRetryQueueKey()
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : []
    } catch (err) {
      console.error('[Retry Queue] Failed to load from localStorage:', err)
      return []
    }
  }, [getRetryQueueKey])

  const saveRetryQueueToStorage = useCallback((queue) => {
    try {
      const key = getRetryQueueKey()
      localStorage.setItem(key, JSON.stringify(queue))
    } catch (err) {
      console.error('[Retry Queue] Failed to save to localStorage:', err)
    }
  }, [getRetryQueueKey])

  const addToRetryQueue = useCallback((submission) => {
    setSubmissionQueue(prevQueue => {
      const newQueue = [...prevQueue, submission]
      saveRetryQueueToStorage(newQueue)
      setShowRetryBanner(true) // Requirement 15.3
      return newQueue
    })
  }, [saveRetryQueueToStorage])

  // Division selector visibility logic (Requirements 19.1, 19.2, 19.3, 19.4, 19.5)
  const shouldShowDivisionSelector = useMemo(() => {
    if (!sheet?.divisionsEnabled) return false
    if (!sheet?.allowedDivisions || sheet.allowedDivisions.length === 0) return false
    return sheet.allowedDivisions.length > 1
  }, [sheet])

  const shouldShowSingleDivision = useMemo(() => {
    if (!sheet?.divisionsEnabled) return false
    return sheet?.allowedDivisions?.length === 1
  }, [sheet])

  const shouldShowNoDivisionsError = useMemo(() => {
    if (!sheet?.divisionsEnabled) return false
    return sheet?.allowedDivisions?.length === 0 && !sheet?.contestants?.length
  }, [sheet])

  // An event and authenticated Judge jointly own a scoring view.
  useEffect(() => {
    let cancelled=false
    setLoading(true);setSheet(null);setScores({});setReviewer(false);setError(null)
    getGuardedView().then(({data})=>{if(!cancelled)setSheet(data)})
      .catch(error=>{
        if(cancelled || error.staleContext)return
        setError(error.response?.data?.message??'Failed to load scoring sheet')
        workflowService.review(eventId).then(()=>{if(!cancelled)setReviewer(true)}).catch(()=>{})
      }).finally(()=>{if(!cancelled)setLoading(false)})
    return()=>{cancelled=true}
  },[eventId,getGuardedView])

  // Load retry queue from localStorage on mount (Requirement 15.2)
  useEffect(() => {
    const storedQueue = loadRetryQueueFromStorage()
    setSubmissionQueue(storedQueue)
    setShowRetryBanner(storedQueue.length > 0)
  }, [loadRetryQueueFromStorage])

  // Handle division change with scoring sheet reload - MOVED UP to fix temporal dead zone issue
  const handleDivisionChange = useCallback(async (divisionId) => {
    try {
      setError(null)
      setSelectedDivisionId(divisionId)
      // Call API with division filter
      const { data } = await getGuardedView({
        divisionId: divisionId || null 
      })
      
      // Update sheet with filtered data
      setSheet(data)
      setSelectedDivisionId(divisionId)

    } catch (err) {
      if (err.staleContext) return
      setError(err.response?.data?.message || 'Failed to load division data')
    } finally {
      setLoading(false)
    }
  }, [getGuardedView])

  // Auto-select single division when divisions are enabled and only one is allowed (Requirement 19.2, 19.5)
  useEffect(() => {
    if (shouldShowSingleDivision && sheet?.allowedDivisions?.length === 1) {
      const singleDivisionId = sheet.allowedDivisions[0].id
      if (!selectedDivisionId || selectedDivisionId !== singleDivisionId) {
        // Auto-select the single division and load filtered scoring sheet
        setSelectedDivisionId(singleDivisionId)
        handleDivisionChange(singleDivisionId)
      }
    }
  }, [shouldShowSingleDivision, sheet?.allowedDivisions, selectedDivisionId, handleDivisionChange])

  // Update session state from the sheet. The judge-session API returns the live
  // session under `activeSession` when it is fully active (a contestant is on
  // stage), but only under `session` when it is active-without-a-contestant,
  // paused, or completed — so read BOTH, otherwise a judge who lands here right
  // after the organizer starts the session stays stuck on "No active session".
  useEffect(() => {
    const s = sheet?.activeSession ?? sheet?.session
    if (s) {
      setSessionState(s)
      if (s.status === 'active' && s.activeContestantId) {
        setActiveContestantId(s.activeContestantId)
      } else {
        setActiveContestantId(null)
      }
    }
  }, [sheet?.activeSession, sheet?.session])

  const syncSessionView = useCallback(async () => {
    try {
      const { data } = await getGuardedView()
      if (!currentSheetRef.current) setError(null)
      setSheet(data)
      const session = data.activeSession ?? data.session ?? null
      setSessionState(session)
      setActiveContestantId(session?.status === 'active' ? session.activeContestantId ?? null : null)
      setConnectionError(null)
    } catch (err) {
      if (!err.staleContext) setConnectionError(err.response?.data?.message ?? 'Unable to reconcile scoring permissions. Your local scores are retained; retry when connected.')
    }
  }, [getGuardedView])
  const { connected: socketConnected, recovering } = useCompetitionSync(eventId, syncSessionView, { enabled: !loading && !reviewer })

  // Update a single score cell in local state. No auto-save — the judge commits
  // each contestant explicitly with "Submit & lock" (B3), which is fairness-safe
  // and, because each submit reads only its own row, records every contestant.
  const onScoreChange = useCallback((contestantId, targetId, value) => {
    setScores((prev) => ({ ...prev, [`${contestantId}:${targetId}`]: value }))
    markDraftChanged(contestantId,targetId)
  }, [markDraftChanged])

  // Build ONE criterion's payload for a contestant from the CURRENT scores,
  // validating each of that criterion's minors against its own bounds. The judge
  // commits (and locks) a single criterion at a time for fairness (#6).
  const buildCriterionPayload = useCallback(
    (contestantId, criterionId) => {
      const criteria = (sheet?.criteria ?? []).find((c) => c.id === criterionId)
      if (!criteria) return { ok: false, error: 'That criterion is no longer available.' }
      if (criteria.open === false) return { ok: false, error: 'This criterion is not open yet.' }
      const targets =
        criteria.minors && criteria.minors.length
          ? criteria.minors
          : [{ id: criteria.id, name: criteria.name, minScore: criteria.minScore, maxScore: criteria.maxScore }]
      const scoreMap = {}
      for (const t of targets) {
        const raw = scores[`${contestantId}:${t.id}`]
        if (raw === undefined || raw === '' || raw === null) {
          return { ok: false, error: 'Fill in every score for this criterion before locking.' }
        }
        const num = Number(raw)
        const min = t.minScore ?? sheet?.scoreBounds?.min
        const max = t.maxScore ?? sheet?.scoreBounds?.max
        if (!Number.isFinite(num) || num < min || num > max) {
          return { ok: false, error: `A score is out of range (${min}–${max}).` }
        }
        scoreMap[t.id] = num
      }
      return { ok: true, scoreMap }
    },
    [sheet?.criteria, sheet?.scoreBounds, scores],
  )

  const submitCriterion = useCallback(
    async (contestantId, criterionId) => {
      if (submittingKey) return
      // #4: closed contestants aren't scorable (the organizer hasn't opened them).
      const target = (sheet?.contestants ?? []).find((c) => c.id === contestantId)
      if (target && target.open === false) {
        setError('This contestant is not open for scoring yet.')
        return
      }
      const { ok, scoreMap, error: buildError } = buildCriterionPayload(contestantId, criterionId)
      if (!ok) {
        setError(buildError)
        return
      }
      setError(null)
      setSubmittingKey(`${contestantId}:${criterionId}`)
      try {
        await flushDrafts(contestantId,criterionId)
        if (eventId !== identityRef.current.eventId || sheet.context?.judgeId !== identityRef.current.judgeId || ['sessionId','roundId','rulesVersion'].some(key => sheet.context?.[key] !== currentSheetRef.current?.context?.[key])) return
        await pageantService.submitSessionScore(eventId, scoreMap, contestantId, sheet.context, criterionId)
        const savedName = (sheet?.contestants ?? []).find((c) => c.id === contestantId)?.name || ''
        setLastSavedName(savedName)
        setShowConfirmation(true)
        setTimeout(() => setShowConfirmation(false), 3000)
        // Refresh so this criterion flips to locked with its saved scores.
        syncSessionView()
      } catch (err) {
        console.error('[Submit] Failed:', err)
        if (eventId !== identityRef.current.eventId || sheet.context?.judgeId !== identityRef.current.judgeId || ['sessionId','roundId','rulesVersion'].some(key => sheet.context?.[key] !== currentSheetRef.current?.context?.[key])) return
        if (!err.response) {
          addToRetryQueue({ contestantId, criteriaId:criterionId, context:sheet.context, scores: scoreMap, timestamp: Date.now() })
        } else {
          setError(err.response?.data?.message || 'Submit failed')
        }
      } finally {
        setSubmittingKey(null)
      }
    },
    [buildCriterionPayload, eventId, sheet, syncSessionView, addToRetryQueue, flushDrafts, submittingKey],
  )

  const handleManualRetry = useCallback(async () => {
    if (!submissionQueue.length || retryInProgress.current) return
    retryInProgress.current = true
    try {
      for (const submission of submissionQueue) {
        const sameContext = ['judgeId','sessionId','roundId','rulesVersion'].every(key =>
          (submission.context?.[key] ?? null) === (sheet?.context?.[key] ?? null))
        if (!sameContext || submission.context?.judgeId !== identityRef.current.judgeId) {
          setError('Queued scores belong to a different scoring context. They have been retained for review; they cannot be replayed into this round.')
          continue
        }
        try {
          await pageantService.submitSessionScore(eventId, submission.scores, submission.contestantId, submission.context, submission.criteriaId)
          setSubmissionQueue(previous => {
            const remaining = previous.filter(item => !(item.timestamp === submission.timestamp && item.criteriaId === submission.criteriaId))
            saveRetryQueueToStorage(remaining)
            setShowRetryBanner(remaining.length > 0)
            return remaining
          })
          setShowConfirmation(true)
          setTimeout(() => setShowConfirmation(false), 3000)
        } catch (err) {
          setError(err.response?.data?.message ?? 'Scores remain queued. Check your connection and retry.')
        }
      }
      await syncSessionView()
    } finally { retryInProgress.current = false }
  }, [submissionQueue, eventId, saveRetryQueueToStorage, sheet?.context, syncSessionView])
  // One automatic attempt on transport recovery. Failed scores stay available for
  // explicit retry instead of looping on every authoritative sheet refetch.
  const wasConnected = useRef(socketConnected)
  useEffect(() => {
    if (socketConnected && !wasConnected.current) void handleManualRetry()
    wasConnected.current = socketConnected
  }, [socketConnected, handleManualRetry])

  if (reviewer) return <CompetitionReviewer eventId={eventId}/>
  if (loading || sheet && sheet.viewerJudgeId!==user?.id) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  // Show waiting message if no active session
  if (!sessionState || (sessionState.status !== 'active' && !sheet?.context)) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <JudgeScoringHeader sheet={sheet} sessionState={sessionState} judgeName={judgeName} />
        <CompetitionPublishedResults eventId={eventId} judgeId={user?.id}/>
        <p role="status" className="v-caption">{socketConnected ? 'Live updates connected' : 'Live updates interrupted; checking saved scoring state every 15 seconds.'}</p>


        {error&&<FormAlert variant="error" message={error}/>}
        {error&&<Button onClick={syncSessionView}>Retry scoring access</Button>}
        <div className="v-card p-8 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-v-surface border border-v-border mx-auto flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-v-text-muted"></div>
          </div>
          <div>
            <p className="text-lg font-semibold text-v-text">No active session</p>
            <p className="mt-2 text-sm text-v-text-muted">
              The organizer has not started a live session yet. You'll be able to score contestants once the session begins.
            </p>
          </div>
          {sessionState?.status === 'paused' && (
            <p className="text-sm text-amber-400">Session is paused</p>
          )}
          {sessionState?.status === 'completed' && (
            <p className="text-sm text-emerald-400">Session has ended</p>
          )}
          <Link to="/participant" className="inline-block text-v-primary hover:underline text-sm">
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="v-judge-page mx-auto max-w-7xl space-y-4 pb-24">
      {/* Retry error banner (Requirement 15.3, 15.4) - Task 13.3 */}
      {showRetryBanner && (
        <div className="rounded-lg border border-v-warning/30 bg-v-warning-bg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-v-warning" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-v-warning">
                Couldn't lock these scores yet. We retry once after live connection recovery; unresolved scores stay here for review.
              </p>
              <p className="mt-1 text-xs text-v-warning/80">
                {submissionQueue.length} score{submissionQueue.length !== 1 ? 's' : ''} pending submission
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualRetry}
              className="shrink-0 border-v-warning/40 text-v-warning hover:bg-v-warning/10"
              disabled={submissionQueue.length === 0 || isArchived}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Retry Now
            </Button>
          </div>
        </div>
      )}

      <JudgeScoringHeader sheet={selectedDivisionId ? { ...sheet, contestants: sheet.contestants.filter(contestant => contestant.divisionId === selectedDivisionId) } : sheet} sessionState={sessionState} judgeName={judgeName} />
      <CompetitionPublishedResults eventId={eventId} judgeId={user?.id}/>

      <p role="status" className="v-caption">{socketConnected ? recovering ? 'Reconciling saved scoring state…' : 'Live updates connected' : 'Live updates interrupted; checking saved state every 15 seconds while this page is visible.'}</p>
      {/* Connection error banner */}
      {connectionError && (
        <div className="rounded-xl border border-v-danger/30 bg-v-danger-bg px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-v-danger">{connectionError}</p>
            <Button size="sm" onClick={syncSessionView} className="ml-4">Retry synchronization</Button>
          </div>
        </div>
      )}

      {sheet?.context && <div className="v-judge-workflow-strip">
        <p className="v-label">{sheet.submission ? 'Round submitted' : sheet.completion?.ready ? 'Ready to Submit Round' : `${sheet.completion?.locked ?? 0}/${sheet.completion?.required ?? 0} groups locked`} · Rules version {sheet.rulesVersion}</p>
        <p className="v-caption">{Object.values(draftStatus).includes('Saving') ? 'Saving drafts…' : Object.values(draftStatus).some(value => value !== 'Saved draft') ? 'Local edits still need saving' : 'Numeric edits save drafts automatically. Lock commits a criterion; Submit Round sends the completed round.'}</p>
        {!sheet.submission && <Button disabled={!sheet.completion?.ready || pendingDrafts || submissionQueue.length > 0 || roundSubmitting || !sheet.submissionWindow} loading={roundSubmitting} onClick={async () => {
          if (roundSubmitting || !window.confirm(`Submit this round with ${sheet.completion.locked} locked groups? Ordinary edits will close.`)) return
          setRoundSubmitting(true)
          try { await workflowService.submit(eventId, { context: sheet.context }); await syncSessionView(); setError(null) }
          catch (e) { setError(e.response?.data?.message ?? 'Round submission failed') }
          finally { setRoundSubmitting(false) }
        }}>Submit Round</Button>}
      </div>}
      {sheet?.legacyTransitionRequired&&<p className="v-card p-4">Historical scoring is read-only. Official rules must be acknowledged before a new scoring session; existing locks are not round submissions.</p>}
      {/* Division Selector */}
      {shouldShowNoDivisionsError && (
        <div className="v-card px-4 py-3">
          <div className="flex items-center gap-2 text-red-300">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-sm font-medium">You are not assigned to any divisions</p>
          </div>
        </div>
      )}

      {shouldShowSingleDivision && (
        <div className="v-card px-4 py-3">
          <p className="text-sm text-v-text-muted">
            Division: <span className="font-medium text-v-text">{sheet.allowedDivisions[0].name}</span>
          </p>
        </div>
      )}

      {shouldShowDivisionSelector && (
        <div className="v-card px-4 py-3">
          <label htmlFor="division-selector" className="block text-sm font-medium text-v-text-muted mb-2">
            Select Division
          </label>
          <select 
            id="division-selector"
            value={selectedDivisionId || ''}
            onChange={(e) => handleDivisionChange(e.target.value || null)}
            className="w-full rounded-lg border border-v-border bg-v-surface px-3 py-2 text-white focus:border-v-primary focus:outline-none focus:ring-1 focus:ring-v-primary"
          >
            <option value="">All Assigned Divisions</option>
            {sheet.allowedDivisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <CompetitionScoringForm
        sheet={selectedDivisionId?{...sheet,contestants:sheet.contestants.filter(c=>c.divisionId===selectedDivisionId)}:sheet}
        scores={scores}
        onScoreChange={onScoreChange}
        submittingKey={submittingKey}
        onSubmitCriterion={submitCriterion}
        sessionState={sessionState}
        disabled={isArchived}
      />

      {error && <FormAlert variant="error">{error}</FormAlert>}

      {/* Live mode scoring instructions */}
      <div className="rounded-xl border border-v-border bg-v-surface-elevated px-4 py-3 text-center">
        <p className="text-sm text-v-text-muted">
          Fill in a criterion&apos;s score, then press <strong>Lock</strong> to commit it. A locked
          criterion can&apos;t be changed unless the organizer reopens it.
        </p>
      </div>
      
      {/* Success confirmation — matches the top-center toast design system */}
      {showConfirmation && (
        <div
          className="v-toast-enter pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4 sm:top-6"
          role="status"
        >
          <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border border-v-success/25 bg-v-success-bg px-4 py-3 text-sm text-v-success shadow-v-shadow-md">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <div className="flex-1 leading-snug">
              <p className="font-semibold">Criterion saved and locked</p>
              <p className="mt-0.5 opacity-90">
                {lastSavedName || sheet?.contestants?.find(c => c.id === activeContestantId)?.name} — scores are locked
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
