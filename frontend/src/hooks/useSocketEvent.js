import { useEffect } from 'react'
import { subscribe } from '@/services/socket.service'

export function useSocketEvent(eventType, handler, deps = []) {
  useEffect(() => {
    const unsubscribe = subscribe(eventType, handler)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, ...deps])
}
