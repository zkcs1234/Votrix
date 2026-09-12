import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle, AlertTriangle, RotateCcw, AlertCircle } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import { isConnected } from '@/services/socket.service'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import FormAlert from '@/components/ui/FormAlert'
import ParticipantInformationGate from '@/components/voter/ParticipantInformationGate'
import CompetitionScoringForm from '@/components/voter/competition/CompetitionScoringForm'
import VoterEventHeader from '@/components/voter/VoterEventHeader'

// Build the flat scores map (keyed `contestantId:criteriaId`) that the scoring
// form and auto-save use, from each on-stage contestant's existing scores.
function scoresFromSheet(data) {
  const out = {}
  for (const c of data?.contestants ?? []) {
    for (const [critId, val] of Object.entries(c.existingScores ?? {})) {
      out[`${c.id}:${critId}`] = val
    }
  }
  return out
}

export default function JudgeScoringPage() {
  const { eventId } = useParams()
  const [sheet, setSheet] = useState(null)
  const [scores, setScores] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Live session state variables
  const [sessionState, setSessionState] = useState(null)
  const [activeContestantId, setActiveContestantId] = useState(null)
  const [connectionError, setConnectionError] = useState(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  // Which contestant is currently being submitted (per-row Submit & lock).
  const [submittingId, setSubmittingId] = useState(null)
  // The shared WS client (socket.service) may already be open before this page
  // mounts (Bootstrap connects on auth), so seed from its live state.
  const [socketConnected, setSocketConnected] = useState(() => isConnected())
  
  // Division selector state
  const [selectedDivisionId, setSelectedDivisionId] = useState(null)

  // Retry queue state management (Requirement 15.1, 15.2)
  const [submissionQueue, setSubmissionQueue] = useState([])
  const [showRetryBanner, setShowRetryBanner] = useState(false)
  
  // Confirmation toast state
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [lastSavedName, setLastSavedName] = useState('')

  // Helper functions for retry queue localStorage persistence (Requirement 15.2)
  const getRetryQueueKey = useCallback(() => {
    return `competition_retry_queue_${eventId}`
  }, [eventId])

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
    return sheet?.allowedDivisions?.length === 0
  }, [sheet])

  // Load session view (live-session-only API)
  useEffect(() => {
    pageantService
      .getSessionView(eventId)
      .then(({ data }) => {
        setSheet(data)
        // Initialize scores (per on-stage contestant) from existing submissions.
        setScores(scoresFromSheet(data))
      })
      .catch((err) => {
        console.error('[Load session view]', err)
        setError(err.response?.data?.message || 'Failed to load scoring sheet')
      })
      .finally(() => setLoading(false))
  }, [eventId])

  // Load retry queue from localStorage on mount (Requirement 15.2)
  useEffect(() => {
    const storedQueue = loadRetryQueueFromStorage()
    if (storedQueue.length > 0) {
      setSubmissionQueue(storedQueue)
      setShowRetryBanner(true)
    }
  }, [loadRetryQueueFromStorage])

  // Handle division change with scoring sheet reload - MOVED UP to fix temporal dead zone issue
  const handleDivisionChange = useCallback(async (divisionId) => {
    try {
      setLoading(true)
      setError(null)
      
      // Call API with division filter
      const { data } = await pageantService.getSessionView(eventId, { 
        divisionId: divisionId || null 
      })
      
      // Update sheet with filtered data
      setSheet(data)
      setSelectedDivisionId(divisionId)
      setScores(scoresFromSheet(data))
      
    } catch (err) {
      console.error('Division change error:', err)
      setError(err.response?.data?.message || 'Failed to load division data')
    } finally {
      setLoading(false)
    }
  }, [eventId])

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

  // Update session state from activeSession field
  useEffect(() => {
    if (sheet?.activeSession) {
      setSessionState(sheet.activeSession)
      if (sheet.activeSession.status === 'active' && sheet.activeSession.activeContestantId) {
        setActiveContestantId(sheet.activeSession.activeContestantId)
      } else {
        setActiveContestantId(null)
      }
    }
  }, [sheet?.activeSession])

  // Re-sync the whole session view from the server (used on (re)connect and on
  // round/contestant/stage changes so the round name, criteria, on-stage set and
  // existing scores all refresh together).
  const syncSessionView = useCallback(() => {
    pageantService
      .getSessionView(eventId)
      .then(({ data }) => {
        setSheet(data)
        setScores(scoresFromSheet(data))
        if (data.activeSession) {
          setSessionState(data.activeSession)
          setActiveContestantId(
            data.activeSession.status === 'active' ? data.activeSession.activeContestantId ?? null : null,
          )
        }
      })
      .catch((err) => console.error('[WS] Failed to sync session:', err))
  }, [eventId])

  // Real-time updates via the shared WS client (socket.service). The voter is
  // auto-joined to the event room on connect (ws-server setupRooms), and
  // useSocketEvent handlers receive the emitted `data` object directly. This
  // replaces the previous `window.socketClient` (socket.io-style) client, which
  // this app never defined — so live updates never fired and the judge relied on
  // manual refresh.
  useSocketEvent('session:status-changed', ({ session }) => {
    if (!session) return
    setSessionState(session)
    if (session.status === 'active') {
      // Reload the sheet: the initial mount load may have run BEFORE the session
      // existed (empty criteria/contestants), so without this the judge would see
      // an "active" session with nothing to score.
      pageantService
        .getSessionView(eventId)
        .then(({ data }) => {
          setSheet(data)
          setScores(scoresFromSheet(data))
        })
        .catch((err) => console.error('[Judge] reload on session start failed:', err))
      setActiveContestantId(session.activeContestantId ?? null)
    } else {
      setActiveContestantId(null)
    }
  }, [eventId])

  useSocketEvent('session:contestant-changed', ({ session }) => {
    if (!session) return
    setSessionState(session)
    // Reload the sheet so the on-stage set (single or stage group), its criteria
    // and existing scores all refresh for the new context.
    syncSessionView()
  }, [syncSessionView])

  // Round switched by the organizer — reload so the round name + criteria update.
  useSocketEvent('session:round-changed', ({ session }) => {
    if (session) setSessionState(session)
    syncSessionView()
  }, [syncSessionView])

  // Organizer opened/closed criteria for the current round — reload so closed
  // criteria (and their minors) disappear from the sheet immediately.
  useSocketEvent('session:active-criteria-changed', ({ session }) => {
    if (session) setSessionState(session)
    syncSessionView()
  }, [syncSessionView])

  useSocketEvent('session:division-changed', ({ session }) => {
    if (!session) return
    setSessionState(session)
    if (session.currentDivisionId && sheet?.divisionsEnabled) {
      const isAssigned = sheet?.allowedDivisions?.some((div) => div.id === session.currentDivisionId)
      if (isAssigned) {
        pageantService
          .getSessionView(eventId, { divisionId: session.currentDivisionId })
          .then(({ data }) => {
            setSheet(data)
            setScores(scoresFromSheet(data))
          })
          .catch((err) => {
            console.error('[Division change] Failed to reload scoring sheet:', err)
            setConnectionError('Failed to update division')
          })
      } else {
        setConnectionError('You are not assigned to this division')
      }
    }
  }, [eventId, sheet?.divisionsEnabled, sheet?.allowedDivisions])

  useSocketEvent('ws:connected', () => {
    setSocketConnected(true)
    setConnectionError(null)
    setReconnectAttempts(0)
    syncSessionView()
  }, [syncSessionView])

  useSocketEvent('ws:disconnected', () => {
    setSocketConnected(false)
    setReconnectAttempts((prev) => prev + 1)
  }, [])

  // Update a single score cell in local state. No auto-save — the judge commits
  // each contestant explicitly with "Submit & lock" (B3), which is fairness-safe
  // and, because each submit reads only its own row, records every contestant.
  const onScoreChange = useCallback((contestantId, targetId, value) => {
    setScores((prev) => ({ ...prev, [`${contestantId}:${targetId}`]: value }))
  }, [])

  // Build one contestant's payload from the CURRENT scores, validating each open
  // criterion/minor against its own bounds. Reads live state (not a debounced
  // closure), so scoring several contestants records every one.
  const buildContestantPayload = useCallback(
    (contestantId) => {
      // #6: submit only the OPEN, not-yet-locked criteria for this contestant.
      const contestant = (sheet?.contestants ?? []).find((c) => c.id === contestantId)
      const lockedSet = new Set(contestant?.lockedCriteria ?? [])
      const scoreMap = {}
      for (const criteria of sheet?.criteria ?? []) {
        if (criteria.open === false) continue // closed — can't score yet
        if (lockedSet.has(criteria.id)) continue // already committed
        const targets =
          criteria.minors && criteria.minors.length
            ? criteria.minors
            : [{ id: criteria.id, name: criteria.name, minScore: criteria.minScore, maxScore: criteria.maxScore }]
        for (const t of targets) {
          const raw = scores[`${contestantId}:${t.id}`]
          if (raw === undefined || raw === '' || raw === null) {
            return { ok: false, error: 'Fill in every open score before submitting.' }
          }
          const num = Number(raw)
          const min = t.minScore ?? sheet?.scoreBounds?.min
          const max = t.maxScore ?? sheet?.scoreBounds?.max
          if (Number.isNaN(num) || num < min || num > max) {
            return { ok: false, error: `A score is out of range (${min}–${max}).` }
          }
          scoreMap[t.id] = num
        }
      }
      if (!Object.keys(scoreMap).length) {
        return { ok: false, error: 'No open criteria to submit right now.' }
      }
      return { ok: true, scoreMap }
    },
    [sheet?.criteria, sheet?.contestants, sheet?.scoreBounds, scores],
  )

  const submitContestant = useCallback(
    async (contestantId) => {
      // #4: closed contestants aren't scorable (the organizer hasn't opened them).
      const target = (sheet?.contestants ?? []).find((c) => c.id === contestantId)
      if (target && target.open === false) {
        setError('This contestant is not open for scoring yet.')
        return
      }
      const { ok, scoreMap, error: buildError } = buildContestantPayload(contestantId)
      if (!ok) {
        setError(buildError)
        return
      }
      setError(null)
      setSubmittingId(contestantId)
      try {
        await pageantService.submitSessionScore(eventId, scoreMap, contestantId)
        const savedName = (sheet?.contestants ?? []).find((c) => c.id === contestantId)?.name || ''
        setLastSavedName(savedName)
        setShowConfirmation(true)
        setTimeout(() => setShowConfirmation(false), 3000)
        // Refresh so the row flips to locked (hasSubmitted) with its saved scores.
        syncSessionView()
      } catch (err) {
        console.error('[Submit] Failed:', err)
        if (!err.response) {
          addToRetryQueue({ contestantId, scores: scoreMap, timestamp: Date.now() })
        } else {
          setError(err.response?.data?.message || 'Submit failed')
        }
      } finally {
        setSubmittingId(null)
      }
    },
    [buildContestantPayload, eventId, sheet, syncSessionView, addToRetryQueue],
  )

  // Automatic retry on reconnection (Requirement 15.5, 15.6, 15.7)
  // Task 13.2: Add useEffect watching [socket.connected, submissionQueue]
  useEffect(() => {
    // Retry when the shared WS client is connected AND there are queued submissions.
    const shouldRetry = socketConnected && submissionQueue.length > 0

    if (!shouldRetry) return

    // Iterate through queue and retry each submission
    const retrySubmissions = async () => {
      console.log(`[Retry Queue] Processing ${submissionQueue.length} queued submissions`)

      for (const submission of submissionQueue) {
        try {
          // Retry the submission
          await pageantService.submitSessionScore(eventId, submission.scores, submission.contestantId)
          
          console.log(`[Retry Queue] Successfully submitted scores for contestant ${submission.contestantId}`)
          
          // On success, remove from queue (both state and localStorage) - Task 13.2
          setSubmissionQueue(prevQueue => {
            const updatedQueue = prevQueue.filter(s => s.contestantId !== submission.contestantId)
            saveRetryQueueToStorage(updatedQueue)
            
            // When queue is empty, hide retry banner - Task 13.2
            if (updatedQueue.length === 0) {
              setShowRetryBanner(false)
            }
            
            return updatedQueue
          })
          
          // Show success confirmation
          setShowConfirmation(true)
          setTimeout(() => setShowConfirmation(false), 3000)
          
        } catch (err) {
          console.error(`[Retry Queue] Failed to submit scores for contestant ${submission.contestantId}:`, err)
          // On failure, keep submission in queue for manual retry - Task 13.2
          // Queue remains unchanged
        }
      }
    }

    retrySubmissions()
  }, [socketConnected, submissionQueue, eventId, saveRetryQueueToStorage, sheet?.contestants])

  // Manual retry function for retry banner button (Task 13.3)
  const handleManualRetry = useCallback(async () => {
    if (submissionQueue.length === 0) return

    console.log(`[Manual Retry] Processing ${submissionQueue.length} queued submissions`)

    for (const submission of submissionQueue) {
      try {
        // Retry the submission
        await pageantService.submitSessionScore(eventId, submission.scores, submission.contestantId)
        
        console.log(`[Manual Retry] Successfully submitted scores for contestant ${submission.contestantId}`)
        
        // On success, remove from queue (both state and localStorage)
        setSubmissionQueue(prevQueue => {
          const updatedQueue = prevQueue.filter(s => s.contestantId !== submission.contestantId)
          saveRetryQueueToStorage(updatedQueue)
          
          // When queue is empty, hide retry banner
          if (updatedQueue.length === 0) {
            setShowRetryBanner(false)
          }
          
          return updatedQueue
        })
        
        // Show success confirmation
        setShowConfirmation(true)
        setTimeout(() => setShowConfirmation(false), 3000)
        
      } catch (err) {
        console.error(`[Manual Retry] Failed to submit scores for contestant ${submission.contestantId}:`, err)
        // On failure, keep submission in queue - user can try again
      }
    }
  }, [submissionQueue, eventId, saveRetryQueueToStorage])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  // Show waiting message if no active session
  if (!sessionState || sessionState.status !== 'active') {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <VoterEventHeader event={sheet?.event} eyebrow="Judge scoring">
          <p className="text-sm font-medium text-white/75">Waiting for session to start</p>
        </VoterEventHeader>


        <div className="v-card p-8 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-v-surface border border-v-border mx-auto flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-v-text-muted"></div>
          </div>
          <div>
            <p className="text-lg font-semibold text-white">No active session</p>
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
          <Link to="/voter" className="inline-block text-v-primary hover:underline text-sm">
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      {/* Retry error banner (Requirement 15.3, 15.4) - Task 13.3 */}
      {showRetryBanner && (
        <div className="rounded-lg border border-v-warning/30 bg-v-warning-bg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-v-warning" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-v-warning">
                Couldn't save your scores yet. They'll be submitted automatically when your connection is restored.
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
              disabled={submissionQueue.length === 0}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Retry Now
            </Button>
          </div>
        </div>
      )}

      <VoterEventHeader event={sheet?.event} eyebrow="Judge scoring">
        <p className="text-sm font-medium text-white/75">Live session scoring</p>
      </VoterEventHeader>

      <ParticipantInformationGate eventId={eventId} />

      {/* Connection error banner */}
      {connectionError && (
        <div className="rounded-xl border border-v-danger/30 bg-v-danger-bg px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-v-danger">{connectionError}</p>
            {reconnectAttempts >= 3 && (
              <Button 
                size="sm" 
                onClick={() => window.location.reload()}
                className="ml-4"
              >
                Refresh now
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Live Mode Status */}
      <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></div>
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/70">Live Session Active</p>
            {(sheet?.roundName || sessionState?.currentRoundName || sessionState?.currentRoundId) ? (
              <p className="mt-0.5 text-lg font-bold text-emerald-200">
                {sheet?.roundName || sessionState?.currentRoundName || 'Current round'}
              </p>
            ) : (
              <p className="mt-0.5 text-sm font-semibold text-emerald-200">Scoring</p>
            )}
            {activeContestantId && sessionState?.contestantOrder && (
              <p className="text-xs text-emerald-400/80">
                Contestant {sessionState.contestantOrder.indexOf(activeContestantId) + 1} of {sessionState.contestantOrder.length}
              </p>
            )}
          </div>
          {submittingId && (
            <span className="text-xs text-emerald-400">Saving…</span>
          )}
        </div>
      </div>

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
            Division: <span className="font-medium text-white">{sheet.allowedDivisions[0].name}</span>
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

      <div className="rounded-xl border border-v-border bg-v-surface-elevated px-4 py-3 text-sm">
        {(() => {
          // Round-driven: the whole field is on the sheet. The organizer gates
          // which contestants/criteria are open (#4); summarize what's scorable.
          const field = sheet?.contestants ?? []
          if (!field.length) {
            return <p className="text-v-text-muted">Waiting for the organizer to open scoring…</p>
          }
          const openContestants = field.filter((c) => c.open !== false)
          const openCrit = (sheet?.criteria ?? []).filter((c) => c.open !== false)
          return (
            <p className="text-v-text-muted">
              Scoring{' '}
              <strong className="text-white">
                {openContestants.length} of {field.length}
              </strong>{' '}
              contestant{field.length === 1 ? '' : 's'} on{' '}
              <strong className="text-white">{openCrit.length}</strong> open criteri
              {openCrit.length === 1 ? 'on' : 'a'}.
              {openContestants.length < field.length &&
                ' Locked contestants open when the organizer says so.'}
            </p>
          )
        })()}
      </div>


      <CompetitionScoringForm
        sheet={sheet}
        scores={scores}
        onScoreChange={onScoreChange}
        submittingId={submittingId}
        onSubmitContestant={submitContestant}
        sessionState={sessionState}
      />

      {error && <FormAlert variant="error">{error}</FormAlert>}

      {/* Live mode scoring instructions */}
      <div className="rounded-xl border border-v-border bg-v-surface-elevated px-4 py-3 text-center">
        <p className="text-sm text-v-text-muted">
          Fill every criterion for a contestant, then press <strong>Submit &amp; lock</strong>. A
          locked score can&apos;t be changed unless the organizer reopens it.
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
              <p className="font-semibold">Scores submitted</p>
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
