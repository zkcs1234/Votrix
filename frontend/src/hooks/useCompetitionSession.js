import { useCallback, useEffect, useState } from 'react'
import { competitionSessionService } from '@/services/competition-session.service'
import { useSocketEvent } from '@/hooks/useSocketEvent'

/**
 * Hook for tracking live competition session state.
 * Works for both organizer and judge roles.
 *
 * @param {string} eventId - The competition event ID
 * @param {object} options
 * @param {boolean} options.isOrganizer - Whether the user is an organizer
 * @returns {{ session, loading, error, refresh, judgeProgress, sessionView }}
 */
export function useCompetitionSession(eventId, { isOrganizer = false } = {}) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [judgeProgress, setJudgeProgress] = useState(null)
  const [sessionView, setSessionView] = useState(null)

  const fetchSession = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await competitionSessionService.getActiveSession(eventId)
      setSession(data.session)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load session')
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  const fetchJudgeProgress = useCallback(async () => {
    if (!eventId || !isOrganizer) return
    try {
      const { data } = await competitionSessionService.getJudgeProgress(eventId)
      setJudgeProgress(data)
    } catch {
      // Silently fail — session may not exist
    }
  }, [eventId, isOrganizer])

  const fetchSessionView = useCallback(async () => {
    if (!eventId || isOrganizer) return
    try {
      const { data } = await competitionSessionService.getJudgeSessionView(eventId)
      setSessionView(data)
      setSession(data.session)
    } catch {
      // Silently fail
    }
  }, [eventId, isOrganizer])

  // Initial load
  useEffect(() => {
    if (isOrganizer) {
      fetchSession()
    } else {
      fetchSessionView()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, isOrganizer])

  // Refresh judge progress when session changes
  useEffect(() => {
    if (isOrganizer && session) {
      fetchJudgeProgress()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrganizer, session?.id])

  // ---- WebSocket realtime subscriptions ----

  // Session status changed (started, paused, resumed, completed)
  useSocketEvent('session:status-changed', ({ session: updated }) => {
    if (updated?.eventId === eventId) {
      setSession(updated)
      if (isOrganizer) {
        fetchJudgeProgress()
      }
    }
  }, [eventId, isOrganizer, fetchJudgeProgress])

  // Round changed
  useSocketEvent('session:round-changed', ({ session: updated }) => {
    if (updated?.eventId === eventId) {
      setSession(updated)
      if (isOrganizer) {
        fetchJudgeProgress()
      } else {
        // Judge — refresh their scoring view
        fetchSessionView()
      }
    }
  }, [eventId, isOrganizer, fetchJudgeProgress, fetchSessionView])

  // Contestant changed
  useSocketEvent('session:contestant-changed', ({ session: updated }) => {
    if (updated?.eventId === eventId) {
      setSession(updated)
      if (!isOrganizer) {
        // Judge — reset score input for new contestant
        fetchSessionView()
      }
    }
  }, [eventId, isOrganizer, fetchSessionView])

  // Judge submitted score (organizer sees progress update)
  useSocketEvent('session:judge-score-submitted', (data) => {
    if (data?.sessionId === session?.id && isOrganizer) {
      fetchJudgeProgress()
    }
  }, [session?.id, isOrganizer, fetchJudgeProgress])

  return {
    session,
    loading,
    error,
    refresh: isOrganizer ? fetchSession : fetchSessionView,
    judgeProgress,
    sessionView,
  }
}

