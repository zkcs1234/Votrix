import { API_BASE_URL } from '@/utils/constants'

const WS_URL = API_BASE_URL.replace(/^http/, 'ws').replace('/api', '') + '/ws'

const MAX_RECONNECT_DELAY = 30_000
const BASE_RECONNECT_DELAY = 1_000

let socket = null
let reconnectAttempts = 0
let reconnectTimer = null
let isIntentionallyClosed = false

const listeners = new Map()

function getReconnectDelay() {
  return Math.min(BASE_RECONNECT_DELAY * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY)
}

function connect() {
  if (socket?.readyState === WebSocket.OPEN) return
  if (socket?.readyState === WebSocket.CONNECTING) return

  socket = new WebSocket(WS_URL)

  socket.onopen = () => {
    reconnectAttempts = 0
    clearTimeout(reconnectTimer)
    console.log('[ws] connected')
    emit('ws:connected', {})
  }

  socket.onmessage = (event) => {
    let msg
    try { msg = JSON.parse(event.data) } catch { return }
    emit(msg.type, msg.data ?? {})
  }

  socket.onclose = (event) => {
    if (isIntentionallyClosed) return
    emit('ws:disconnected', { code: event.code })
    const delay = getReconnectDelay()
    reconnectAttempts++
    reconnectTimer = setTimeout(connect, delay)
  }

  socket.onerror = () => {
    // onclose will fire after onerror
  }
}

function disconnect() {
  isIntentionallyClosed = true
  clearTimeout(reconnectTimer)
  socket?.close()
  socket = null
}

function emit(type, data) {
  const set = listeners.get(type)
  if (!set) return
  for (const fn of set) fn(data)
}

export function subscribe(eventType, handler) {
  if (!listeners.has(eventType)) listeners.set(eventType, new Set())
  listeners.get(eventType).add(handler)
  return () => listeners.get(eventType)?.delete(handler)
}

export function subscribeRoom(room) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', room }))
  }
}

window.addEventListener('votrix-token-refreshed', () => {
  socket?.close()
})

export { connect, disconnect }
export default { connect, disconnect, subscribe, subscribeRoom }
