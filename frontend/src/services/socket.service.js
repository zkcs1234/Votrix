import { API_BASE_URL } from '@/utils/constants'
import { refreshSession } from '@/services/api'

export function websocketUrl(apiUrl = API_BASE_URL, pageUrl = window.location.href) {
  const url = new URL(apiUrl, pageUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = url.pathname.replace(/\/api\/?$/, '').replace(/\/$/, '') + '/ws'
  url.search = ''
  url.hash = ''
  return url.href
}

const MAX_RECONNECT_DELAY = 30_000
const BASE_RECONNECT_DELAY = 1_000

let socket = null
let reconnectAttempts = 0
let reconnectTimer = null
let isIntentionallyClosed = false

const listeners = new Map()
const rooms = new Set()

function getReconnectDelay() {
  return Math.min(BASE_RECONNECT_DELAY * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY)
}

function connect() {
  isIntentionallyClosed = false
  if (socket?.readyState === WebSocket.OPEN) return
  if (socket?.readyState === WebSocket.CONNECTING) return

  socket = new WebSocket(websocketUrl())
  const connection = socket

  socket.onopen = () => {
    if (socket !== connection) return
    reconnectAttempts = 0
    clearTimeout(reconnectTimer)
    console.log('[ws] connected')
    for (const room of rooms) connection.send(JSON.stringify({ type: 'subscribe', room }))
    emit('ws:connected', {})
  }

  socket.onmessage = (event) => {
    if (socket !== connection) return
    let msg
    try { msg = JSON.parse(event.data) } catch { return }
    emit(msg.type, msg.data ?? {})
  }

  socket.onclose = async (event) => {
    if (socket !== connection) return
    if (isIntentionallyClosed) return
    emit('ws:disconnected', { code: event.code })
    if (event.code === 4401) {
      try { await refreshSession() } catch { /* HTTP fallback and retry handle outages; auth rejects clear the session. */ }
      if (socket !== connection || isIntentionallyClosed) return
    }
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
  rooms.clear()
  emit('ws:disconnected', { intentional: true })
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
  rooms.add(room)
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', room }))
  }
}

export function isConnected() {
  return socket?.readyState === WebSocket.OPEN
}

window.addEventListener('votrix-token-refreshed', () => {
  if (isIntentionallyClosed) return
  clearTimeout(reconnectTimer)
  const prior = socket
  socket = null
  prior?.close()
  connect()
})

export { connect, disconnect }
export default { connect, disconnect, subscribe, subscribeRoom, isConnected }
