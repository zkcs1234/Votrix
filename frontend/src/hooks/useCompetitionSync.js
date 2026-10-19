import { useEffect, useRef, useState } from 'react'
import { isConnected, subscribe } from '@/services/socket.service'

export const COMPETITION_EVENTS = [
  'competition:native-invalidated',
  'competition:workflow-updated', 'competition:updated', 'competition:scoring-toggled', 'rankings:updated',
  'session:status-changed', 'session:contestant-changed', 'session:round-changed',
  'session:active-criteria-changed', 'session:division-changed',
  'session:arrangement-changed', 'session:judge-score-submitted',
  'competition:results-published',
]

export function competitionEventMatches(payload, eventId, competitionId, roundId) {
  const source = payload?.eventId ?? payload?.session?.eventId ?? payload?.session?.event_id ?? payload?.event?.id
  return (eventId == null || source === eventId) && (competitionId == null || (payload?.competitionId === competitionId && (payload?.roundId === roundId || payload?.affectedRoundIds?.includes(roundId))))
}

// Notifications are invalidations, never authoritative score or permission data.
// Slow reconciliation also covers a dropped frame while the transport stays open.
export default function useCompetitionSync(eventId, refresh, {
  enabled = true, offlineInterval = 15_000, onlineInterval = 60_000,
  competitionId = null, roundId = null,
  onInvalidate = null,
} = {}) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const invalidateRef=useRef(onInvalidate)
  invalidateRef.current=onInvalidate
  const [connected, setConnected] = useState(() => isConnected())
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!enabled) return undefined
    setConnected(isConnected())
    let alive = true, running = false, pending = false, timer
    const reconcile = async () => {
      if (!alive) return
      if (document.visibilityState === 'hidden') return
      if (running) { pending = true; return }
      running = true
      setRecovering(true)
      try { await refreshRef.current() } catch { /* the receiving page displays its error */ }
      finally {
        running = false
        if (alive) {
          setRecovering(false)
          if (pending) { pending = false; void reconcile() }
        }
      }
    }
    const schedule = () => {
      clearInterval(timer)
      timer = setInterval(reconcile, isConnected() ? onlineInterval : offlineInterval)
    }
    const subscriptions = COMPETITION_EVENTS.map(type => subscribe(type, payload => {
      if (competitionEventMatches(payload, eventId, competitionId, roundId)) { invalidateRef.current?.(payload); void reconcile() }
    }))
    subscriptions.push(subscribe('ws:connected', () => { setConnected(true); schedule(); void reconcile() }))
    subscriptions.push(subscribe('ws:disconnected', () => { setConnected(false); schedule() }))
    subscriptions.push(subscribe('competition:native-transport-recovered', () => { invalidateRef.current?.({});void reconcile() }))
    const onVisible = () => { if (document.visibilityState !== 'hidden') void reconcile() }
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    schedule()
    return () => {
      alive = false
      clearInterval(timer)
      subscriptions.forEach(unsubscribe => unsubscribe())
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [eventId, competitionId, roundId, enabled, offlineInterval, onlineInterval])
  return { connected, recovering }
}
