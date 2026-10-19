import { useEffect, useRef } from 'react'
import { subscribe } from '@/services/socket.service'

export function useSocketEvent(eventType, handler, deps = []) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => {
    const unsubscribe = subscribe(eventType, (payload) => handlerRef.current(payload))
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, ...deps])
}
