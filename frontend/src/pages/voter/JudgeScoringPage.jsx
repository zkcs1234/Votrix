import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
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
  
  // Division selector state
  const [selectedDivisionId, setSelectedDivisionId] = useState(null)

  // Check if session is active
  const isSessionActive = sessionState?.status === 'active'

  // Division selector visibility logic
  const shouldShowDivisionSelector = useMemo(() => {
    if (!sheet?.divisionsEnabled) return false
    if (!sheet?.allowedDivisions || sheet.allowedDivisions.length === 0) return false
    return sheet.allowedDivisions.length > 1
  }, [sheet])

  const shouldShowSingleDivision = useMemo(() => {
    if (!sheet?.divisionsEnabled) return false
    return sheet?.allowedDivisions?.length === 1
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

  // Websocket connection and event subscriptions
  useEffect(() => {
    if (!eventId) return
    
    const socket = window.socketClient
    if (!socket) {
      console.warn('[Judge Scoring] Socket client not available')
      return
    }

    // Handle session status changes
    const handleStatusChange = (payload) => {
      const { session } = payload.data
      setSessionState(session)
      
      if (session.status === 'active') {
        if (session.activeContestantId) {
          setActiveContestantId(session.activeContestantId)
        }
      } else {
        setActiveContestantId(null)
      }
    }

    // Handle active contestant changes
    const handleContestantChange = (payload) => {
      const { session } = payload.data
      setSessionState(session)
      
      if (session.activeContestantId) {
        setActiveContestantId(session.activeContestantId)
        // Clear scores for new contestant
        setScores({})
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
        const isAssigned = sheet?.allowedDivisions?.some(
          (div) => div.id === session.currentDivisionId
        )
        
        if (isAssigned) {
          // Reload scoring sheet for new division
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
    }

    // Connection error handler
    const handleConnectError = (error) => {
      console.error('[WS] Connection error:', error)
      setConnectionError('Connection failed - real-time updates unavailable')
    }

    // Disconnect handler
    const handleDisconnect = (reason) => {
      console.warn('[WS] Disconnected:', reason)
      
      if (reason === 'io server disconnect') {
        setConnectionError('Disconnected by server - please refresh')
      } else {
        setReconnectAttempts((prev) => prev + 1)
      }
    }

    // Reconnect handler
    const handleReconnect = () => {
      console.log('[WS] Reconnected successfully')
      setConnectionError(null)
      setReconnectAttempts(0)
      
      // Fetch current session state to sync UI
      pageantService.getSessionView(eventId)
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
  }, [eventId, sheet?.divisionsEnabled, sheet?.allowedDivisions])

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
      try {
        setAutoSaving(true)
        
        // Build scores object for current contestant
        const contestantScores = {}
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
        
        // Only submit if all criteria are scored for this contestant
        if (allScored) {
          await pageantService.submitSessionScore(eventId, contestantScores)
          console.log(`[Auto-save] Submitted scores for contestant ${contestantId}`)
        }
        
      } catch (err) {
        console.error('[Auto-save] Failed:', err)
        setError(err.response?.data?.message || 'Auto-save failed')
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

  // Handle division change with scoring sheet reload  
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
    </div>
  )
}
