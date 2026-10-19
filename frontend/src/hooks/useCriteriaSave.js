import { useCallback, useRef, useState } from 'react'
import { getErrorMessage } from '@/utils/getErrorMessage'

// One criteria write at a time. A successful write stays pending until a fresh
// foundation confirms it; a failed refresh must never retry the write itself.
export default function useCriteriaSave(reload) {
  const [state, setState] = useState({ pending: false, error: '', phase: null, scopeIds: [] })
  const inFlight = useRef(false)
  const needsConfirmation = useRef(false)
  const failed = useRef(false)
  const save = useCallback(async (operation, scopeIds) => {
    if (inFlight.current || needsConfirmation.current || failed.current) throw new Error('Confirm the saved configuration before making another change.')
    inFlight.current = true
    setState({ pending: true, error: '', phase: 'write', scopeIds })
    let phase = 'write'
    try {
      await operation()
      phase = 'reload'
      needsConfirmation.current = true
      await reload()
      needsConfirmation.current = false
      setState({ pending: false, error: '', phase: null, scopeIds: [] })
    } catch (error) {
      failed.current = true
      setState({ pending: false, error: getErrorMessage(error), phase, scopeIds })
      throw error
    } finally { inFlight.current = false }
  }, [reload])
  const recover = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setState(current => ({ ...current, pending: true }))
    try {
      await reload()
      needsConfirmation.current = false
      failed.current = false
      setState({ pending: false, error: '', phase: null, scopeIds: [] })
    } catch (error) {
      setState(current => ({ ...current, pending: false, error: getErrorMessage(error) }))
    } finally { inFlight.current = false }
  }, [reload])
  return { save, state, recover }
}
