import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle, AlertTriangle, RotateCcw, AlertCircle } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import { isConnected } from '@/services/socket.service'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import ParticipantInformationGate from '@/components/voter/ParticipantInformationGate'
import CompetitionScoringForm from '@/components/voter/competition/CompetitionScoringForm'
import VoterEventHeader from '@/components/voter/VoterEventHeader'

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
  const [autoSaving, setAutoSaving] = useState(false)
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

  // Check if session is active
  const isSessionActive = sessionState?.status === 'active'

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
        // Initialize scores from existing locked submissions
        if (data.existingScores) {
          setScores(data.existingScores)
        }
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
      setScores(data.existingScores || {})
      
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

  // Re-sync the whole session view from the server (used on (re)connect).
  const syncSessionView = useCallback(() => {
    pageantService
      .getSessionView(eventId)
      .then(({ data }) => {
        setSheet(data)
        if (data.activeSession) {
          setSessionState(data.activeSession)
          if (data.activeSession.status === 'active' && data.activeSession.activeContestantId) {
            setActiveContestantId(data.activeSession.activeContestantId)
          }
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
    if (session.status === 'active' && session.activeContestantId) {
      setActiveContestantId(session.activeContestantId)
    } else {
      setActiveContestantId(null)
    }
  }, [])

  useSocketEvent('session:contestant-changed', ({ session }) => {
    if (!session) return
    setSessionState(session)
    if (session.activeContestantId) {
      setActiveContestantId(session.activeContestantId)
      setScores({}) // clear scores for the new contestant
    } else {
      setActiveContestantId(null)
    }
  }, [])

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
            setScores(data.existingScores || {})
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

  // Auto-save score when changed in live session
  const autoSaveTimeouts = useRef({})
  
  const setScore = useCallback((contestantId, criteriaId, value) => {
    const key = `${contestantId}:${criteriaId}`
    
    setScores(prev => ({ ...prev, [key]: value }))
    
    // Only auto-save for active contestant in active session
    if (!isSessionActive || contestantId !== activeContestantId || !sheet?.criteria) {
      return
    }
    
    // Clear existing timeout for this contestant
    const contestantTimeoutKey = `contestant_${contestantId}`
    if (autoSaveTimeouts.current[contestantTimeoutKey]) {
      clearTimeout(autoSaveTimeouts.current[contestantTimeoutKey])
    }
    
    // Debounce the auto-save to avoid too many API calls
    autoSaveTimeouts.current[contestantTimeoutKey] = setTimeout(async () => {
      // Build scores object for current contestant
      let contestantScores = {}
      let allScored = true
      
      for (const criteria of sheet.criteria) {
        const scoreKey = `${contestantId}:${criteria.id}`
        const score = scores[scoreKey]
        
        if (score === undefined || score === '' || score === null) {
          allScored = false
          break
        }
        
        const numValue = Number(score)
        if (isNaN(numValue) || numValue < criteria.minScore || numValue > criteria.maxScore) {
          allScored = false
          break
        }
        
        contestantScores[criteria.id] = numValue
      }
      
      try {
        setAutoSaving(true)
        
        // Only submit if all criteria are scored for this contestant
        if (allScored) {
          await pageantService.submitSessionScore(eventId, contestantScores)
          console.log(`[Auto-save] Submitted scores for contestant ${contestantId}`)
          
          // Show confirmation toast
          setShowConfirmation(true)
          
          // Auto-dismiss after 3 seconds
          setTimeout(() => {
            setShowConfirmation(false)
          }, 3000)
        }
        
      } catch (err) {
        console.error('[Auto-save] Failed:', err)
        
        // For network errors (no response), add to retry queue (Requirement 15.1)
        if (!err.response && allScored) {
          const submission = {
            contestantId,
            scores: contestantScores,
            timestamp: Date.now()
          }
          addToRetryQueue(submission)
        } else {
          // For validation errors or other server errors, just show error message
          setError(err.response?.data?.message || 'Auto-save failed')
        }
      } finally {
        setAutoSaving(false)
      }
      
      // Clean up the timeout reference
      delete autoSaveTimeouts.current[contestantTimeoutKey]
    }, 2000) // 2 second debounce
  }, [isSessionActive, sheet?.criteria, eventId, activeContestantId, scores])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(autoSaveTimeouts.current).forEach(clearTimeout)
    }
  }, [])

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
          await pageantService.submitSessionScore(eventId, submission.scores)
          
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
        await pageantService.submitSessionScore(eventId, submission.scores)
        
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
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      {/* Retry error banner (Requirement 15.3, 15.4) - Task 13.3 */}
      {showRetryBanner && (
        <div className="border border-red-500/50 bg-red-950/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-300">
                Failed to submit scores. Will retry automatically when connection is restored.
              </p>
              <p className="mt-1 text-xs text-red-400/80">
                {submissionQueue.length} score{submissionQueue.length !== 1 ? 's' : ''} pending submission
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualRetry}
              className="flex-shrink-0 border-red-500/50 text-red-300 hover:bg-red-950/50"
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
        <div className="rounded-xl border border-red-500/50 bg-red-950/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-300">{connectionError}</p>
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
            <p className="text-sm font-medium text-emerald-300">Live Session Active</p>
            {sessionState?.currentRoundId && (
              <p className="text-xs text-emerald-400/80">
                Round: {sessionState.currentRoundName || sessionState.currentRoundId}
                {activeContestantId && sessionState.contestantOrder && (
                  <span className="ml-2">
                    Contestant {sessionState.contestantOrder.indexOf(activeContestantId) + 1} of {sessionState.contestantOrder.length}
                  </span>
                )}
              </p>
            )}
          </div>
          {autoSaving && (
            <span className="text-xs text-emerald-400">Saving...</span>
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
        <p className="text-v-text-muted">
          {activeContestantId ? (
            <>
              Scoring contestant: <strong className="text-white">
                {sheet?.contestants?.find(c => c.id === activeContestantId)?.name || 'Unknown'}
              </strong>{' '}
              on <strong className="text-white">{sheet?.criteria?.length || 0}</strong> criteria
            </>
          ) : (
            'Waiting for organizer to select contestant...'
          )}
        </p>
        {activeContestantId && sheet?.criteria && (
          <p className="mt-1 text-xs text-v-text-subtle">
            {(() => {
              const activeContestant = sheet.contestants?.find(c => c.id === activeContestantId)
              if (!activeContestant) return 'Contestant not found'
              
              const contestantScores = sheet.criteria.map(crit => {
                const key = `${activeContestant.id}:${crit.id}`
                const score = scores[key]
                return score !== undefined && score !== '' && score !== null ? score : null
              }).filter(score => score !== null)
              
              const isComplete = contestantScores.length === sheet.criteria.length
              
              return `Progress: ${contestantScores.length} / ${sheet.criteria.length} criteria scored${isComplete ? ' ✓' : ''}`
            })()}
          </p>
        )}
      </div>

      <CompetitionScoringForm
        sheet={sheet}
        scores={scores}
        onScoreChange={setScore}
        disabled={autoSaving}
        liveMode={true}
        activeContestantId={activeContestantId}
        sessionState={sessionState}
      />

      {error && (
        <div className="rounded-xl border border-red-500/50 bg-red-950/30 px-4 py-3">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Live mode scoring instructions */}
      <div className="rounded-xl border border-v-border bg-v-surface-elevated px-4 py-3 text-center">
        <p className="text-sm text-v-text-muted">
          Complete all criteria for the active contestant - scores auto-save when finished
        </p>
      </div>
      
      {/* Success confirmation toast (Requirement 14) */}
      {showConfirmation && (
        <div className="fixed bottom-4 right-4 z-50 bg-emerald-500 text-white shadow-2xl rounded-xl px-6 py-4 animate-slide-up">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-6 w-6 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-white">Scores Submitted!</p>
              <p className="mt-1 text-sm text-white">
                {sheet?.contestants?.find(c => c.id === activeContestantId)?.name}
              </p>
              <p className="mt-1 text-xs text-white/80">Your scores are locked</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
