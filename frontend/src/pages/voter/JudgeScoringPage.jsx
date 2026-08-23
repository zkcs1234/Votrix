import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import { getDraftStorageKey } from '@/utils/draftStorage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import ParticipantInformationGate from '@/components/voter/ParticipantInformationGate'
import CompetitionScoringForm from '@/components/voter/competition/CompetitionScoringForm'
import VoterEventHeader from '@/components/voter/VoterEventHeader'

export default function JudgeScoringPage() {
  const { eventId } = useParams()
  const competitionDraftKey = getDraftStorageKey('competitionDraft', eventId)
  const pageantDraftKey = getDraftStorageKey('pageantDraft', eventId)
  const [sheet, setSheet] = useState(null)
  const [scores, setScores] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  
  // Live session state variables
  const [liveMode, setLiveMode] = useState(false)
  const [sessionState, setSessionState] = useState(null)
  const [activeContestantId, setActiveContestantId] = useState(null)
  const [connectionError, setConnectionError] = useState(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  
  // Division selector state
  const [selectedDivisionId, setSelectedDivisionId] = useState(null)

  // Division selector visibility logic
  const shouldShowDivisionSelector = useMemo(() => {
    if (!sheet?.event?.divisionsEnabled) return false
    if (!sheet?.allowedDivisions || sheet.allowedDivisions.length === 0) return false
    return sheet.allowedDivisions.length > 1
  }, [sheet])

  const shouldShowSingleDivision = useMemo(() => {
    if (!sheet?.event?.divisionsEnabled) return false
    return sheet?.allowedDivisions?.length === 1
  }, [sheet])

  // Division-aware draft key generation
  const getDraftKey = useCallback((eventId, divisionId) => {
    if (divisionId) {
      return `competition_draft_${eventId}_div_${divisionId}`
    }
    return `competition_draft_${eventId}`
  }, [])

  useEffect(() => {
    pageantService
      .getScoringSheet(eventId)
      .then(({ data }) => {
        setSheet(data)
        if (data.hasScored) setDone(true)
        
        // Load drafts for current division (null = all divisions)
        try {
          const savedStr = localStorage.getItem(getDraftKey(eventId, selectedDivisionId))
          const saved = savedStr ? JSON.parse(savedStr) : {}
          setScores({ ...data.existingScores, ...saved })
        } catch {
          setScores({ ...data.existingScores })
        }
      })
      .finally(() => setLoading(false))
  }, [eventId, getDraftKey, selectedDivisionId])

  // Save draft scores with division awareness
  useEffect(() => {
    if (Object.keys(scores).length > 0) {
      try {
        localStorage.setItem(getDraftKey(eventId, selectedDivisionId), JSON.stringify(scores))
      } catch (err) {
        if (err.name === 'QuotaExceededError') {
          console.warn('LocalStorage quota exceeded, could not save draft scores')
        } else {
          console.error('Failed to save draft scores:', err)
        }
      }
    }
  }, [scores, eventId, selectedDivisionId, getDraftKey])

  // Live Mode state management based on session status
  useEffect(() => {
    if (sessionState) {
      if (sessionState.status === 'active') {
        setLiveMode(true)
        if (sessionState.activeContestantId) {
          setActiveContestantId(sessionState.activeContestantId)
        }
      } else if (sessionState.status === 'completed' || sessionState.status === 'paused') {
        setLiveMode(false)
        setActiveContestantId(null)
      }
    } else {
      setLiveMode(false)
      setActiveContestantId(null)
    }
  }, [sessionState])

  // Initial sync with activeSession from sheet
  useEffect(() => {
    if (sheet?.activeSession) {
      setSessionState(sheet.activeSession)
    }
  }, [sheet?.activeSession])

  // Websocket connection and event subscriptions
  useEffect(() => {
    const socket = window.socketClient
    
    if (!socket || !eventId) return

    // Handle session status changes
    const handleStatusChange = (payload) => {
      const { session } = payload.data
      setSessionState(session)
      
      if (session.status === 'completed') {
        // Exit live mode
        setLiveMode(false)
        setActiveContestantId(null)
      } else if (session.status === 'active') {
        setLiveMode(true)
        if (session.activeContestantId) {
          setActiveContestantId(session.activeContestantId)
        }
      } else if (session.status === 'paused') {
        setLiveMode(false)
      }
    }

    // Handle active contestant changes
    const handleContestantChange = (payload) => {
      const { session } = payload.data
      setSessionState(session)
      
      // Update active contestant and trigger scroll
      if (session.activeContestantId) {
        setActiveContestantId(session.activeContestantId)
        // Scroll will be handled by a separate effect in the scoring form component
      } else {
        setActiveContestantId(null)
      }
    }

    // Handle division changes
    const handleDivisionChange = (payload) => {
      const { session } = payload.data
      setSessionState(session)
      
      // Reload scoring sheet if division changes and judge is assigned
      if (session.currentDivisionId && sheet?.divisionsEnabled) {
        // Check if the judge is assigned to the new division
        const isAssigned = sheet?.allowedDivisions?.some(
          (div) => div.id === session.currentDivisionId
        )
        
        if (isAssigned) {
          // Reload scoring sheet for new division
          pageantService
            .getScoringSheet(eventId, { divisionId: session.currentDivisionId })
            .then(({ data }) => {
              setSheet(data)
              // Restore draft scores for this division
              try {
                const savedStr = localStorage.getItem(competitionDraftKey)
                const saved = savedStr ? JSON.parse(savedStr) : {}
                setScores({ ...data.existingScores, ...saved })
              } catch {
                setScores({ ...data.existingScores })
              }
            })
            .catch((err) => {
              console.error('[Division change] Failed to reload scoring sheet:', err)
              setConnectionError('Failed to update division')
            })
        } else {
          // Judge not assigned to this division
          setConnectionError('You are not assigned to this division')
          setLiveMode(false)
        }
      }
    }

    // Connection error handler
    const handleConnectError = (error) => {
      console.error('[WS] Connection error:', error)
      setConnectionError('Connection failed - real-time updates unavailable')
      setLiveMode(false)
    }

    // Disconnect handler
    const handleDisconnect = (reason) => {
      console.warn('[WS] Disconnected:', reason)
      
      if (reason === 'io server disconnect') {
        // Server forcibly closed connection, don't auto-reconnect
        setConnectionError('Disconnected by server - please refresh')
      } else {
        // Connection lost, attempt reconnection
        setReconnectAttempts((prev) => prev + 1)
      }
    }

    // Reconnect handler
    const handleReconnect = () => {
      console.log('[WS] Reconnected successfully')
      setConnectionError(null)
      setReconnectAttempts(0)
      
      // Fetch current session state to sync UI
      pageantService.getScoringSheet(eventId)
        .then(({ data }) => {
          setSheet(data)
          if (data.activeSession) {
            setSessionState(data.activeSession)
            if (data.activeSession.status === 'active') {
              setLiveMode(true)
              if (data.activeSession.activeContestantId) {
                setActiveContestantId(data.activeSession.activeContestantId)
              }
            }
          }
        })
        .catch((err) => console.error('[WS] Failed to sync session:', err))
    }

    // Subscribe to events
    socket.on('session:status-changed', handleStatusChange)
    socket.on('session:contestant-changed', handleContestantChange)
    socket.on('session:division-changed', handleDivisionChange)
    socket.on('connect_error', handleConnectError)
    socket.on('disconnect', handleDisconnect)
    socket.on('reconnect', handleReconnect)

    // Cleanup on unmount
    return () => {
      socket.off('session:status-changed', handleStatusChange)
      socket.off('session:contestant-changed', handleContestantChange)
      socket.off('session:division-changed', handleDivisionChange)
      socket.off('connect_error', handleConnectError)
      socket.off('disconnect', handleDisconnect)
      socket.off('reconnect', handleReconnect)
    }
  }, [eventId, sheet?.divisionsEnabled, sheet?.allowedDivisions, competitionDraftKey])

  const setScore = (contestantId, criteriaId, value) => {
    const key = `${contestantId}:${criteriaId}`
    setScores((prev) => ({ ...prev, [key]: value }))
  }

  // Handle division change with scoring sheet reload  
  const handleDivisionChange = useCallback(async (divisionId) => {
    try {
      setLoading(true)
      setError(null)
      
      // Call API with division filter
      const { data } = await pageantService.getScoringSheet(eventId, { 
        divisionId: divisionId || null 
      })
      
      // Update sheet with filtered data
      setSheet(data)
      setSelectedDivisionId(divisionId)
      
      // Generate division-specific draft key
      const getDraftKey = (eventId, divisionId) => {
        if (divisionId) {
          return `competition_draft_${eventId}_div_${divisionId}`
        }
        return `competition_draft_${eventId}`
      }
      
      // Restore draft scores for selected division
      let restoredScores = {}
      try {
        const savedStr = localStorage.getItem(getDraftKey(eventId, divisionId))
        restoredScores = savedStr ? JSON.parse(savedStr) : {}
      } catch (err) {
        console.warn('Failed to restore division draft:', err)
        restoredScores = {}
      }
      
      // Merge restored drafts with existing scores
      setScores({ ...data.existingScores, ...restoredScores })
      
    } catch (err) {
      console.error('Division change error:', err)
      setError(err.response?.data?.message || 'Failed to load division data')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  const filledCount =
    sheet?.contestants?.length && sheet?.criteria?.length
      ? sheet.contestants.length * sheet.criteria.length
      : 0

  const enteredCount = Object.values(scores).filter((v) => v !== '' && v !== undefined).length

  // Error state for retry logic
  const [showRetry, setShowRetry] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    setShowRetry(false)

    const payload = []
    for (const contestant of sheet.contestants) {
      for (const crit of sheet.criteria) {
        const key = `${contestant.id}:${crit.id}`
        const val = scores[key]
        if (val === undefined || val === '') {
          setError('Please score every contestant on every criterion before submitting.')
          setSubmitting(false)
          return
        }
        const num = Number(val)
        if (Number.isNaN(num) || num < crit.minScore || num > crit.maxScore) {
          setError(
            `Score for ${contestant.name} — ${crit.name} must be between ${crit.minScore} and ${crit.maxScore}.`,
          )
          setSubmitting(false)
          return
        }
        payload.push({
          contestantId: contestant.id,
          criteriaId: crit.id,
          score: num,
        })
      }
    }

    try {
      // Include session context for real-time feedback
      const sessionContext = {
        sessionId: sessionState?.id || null,
        roundId: sessionState?.currentRoundId || null,
        contestantId: activeContestantId || null,
      }

      await pageantService.submitScores(eventId, payload, sessionContext)
      
      // Clear current division draft and legacy drafts
      localStorage.removeItem(getDraftKey(eventId, selectedDivisionId))
      localStorage.removeItem(competitionDraftKey)
      localStorage.removeItem(pageantDraftKey)
      
      setDone(true)
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Submit failed'
      setError(errorMessage)
      
      // Show retry button for network errors (no response)
      if (!err.response) {
        setShowRetry(true)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  if (done || sheet?.hasScored) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-emerald-900/50 bg-emerald-950/30 p-8 text-center">
        <p className="text-lg font-semibold text-emerald-300">Scores submitted</p>
        <p className="mt-2 text-sm text-v-text-subtle">Your scores are locked for {sheet?.event?.title}.</p>
        <Link to="/voter" className="mt-6 inline-block text-v-text-muted">
          Back to dashboard
        </Link>
      </div>
    )
  }

  if (!sheet?.scoringOpen) {
    return (
      <div className="mx-auto max-w-lg v-card p-8 text-center">
        <p className="text-white">Scoring is not open yet.</p>
        <Link to="/voter" className="mt-4 inline-block text-v-text-muted">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      <VoterEventHeader event={sheet.event} eyebrow="Judge scoring">
        <p className="text-sm font-medium text-white/75">One submission only</p>
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
      {liveMode ? (
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
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-v-border bg-v-surface-elevated px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-v-text-muted"></div>
            <p className="text-sm text-v-text-muted">Offline Mode - Navigate freely between contestants</p>
          </div>
        </div>
      )}

      {/* Division Selector */}
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
          Score all <strong className="text-white">{sheet.contestants.length}</strong> contestants on{' '}
          <strong className="text-white">{sheet.criteria.length}</strong> criteria.
        </p>
        <p className="mt-1 text-xs text-v-text-subtle">
          Progress: {enteredCount} / {filledCount} scores entered
        </p>
      </div>

      <CompetitionScoringForm
        sheet={sheet}
        scores={scores}
        onScoreChange={setScore}
        disabled={submitting}
        liveMode={liveMode}
        activeContestantId={activeContestantId}
        sessionState={sessionState}
      />

      {done && (
        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="h-5 w-5 rounded-full bg-emerald-400 flex items-center justify-center">
              <svg className="h-3 w-3 text-emerald-900" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm font-medium text-emerald-300">Scores successfully submitted!</p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/50 bg-red-950/30 px-4 py-3">
          <p className="text-sm text-red-300">{error}</p>
          {showRetry && (
            <Button
              type="button"
              onClick={handleSubmit}
              className="mt-2"
              size="sm"
              disabled={submitting}
            >
              Retry submission
            </Button>
          )}
        </div>
      )}

      <Button type="button" onClick={handleSubmit} loading={submitting} className="w-full">
        {submitting ? 'Submitting…' : 'Submit all scores (locked)'}
      </Button>
    </div>
  )
}
