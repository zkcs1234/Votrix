import { useCallback, useEffect, useRef } from 'react'

// Changing the event/account/filter invalidates earlier reads immediately, before
// effects run. The returned guard also prevents updates after a newer read starts.
export default function useLatestRequest(scope) {
  const state = useRef({ scope, generation: 0 })
  if (state.current.scope !== scope) state.current = { scope, generation: state.current.generation + 1 }
  useEffect(() => () => { if (state.current.scope === scope) state.current.generation++ }, [scope])
  return useCallback(() => {
    const generation = ++state.current.generation
    return () => state.current.scope === scope && state.current.generation === generation
  }, [scope])
}
