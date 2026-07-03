import { WebSocketServer } from 'ws'
import { verifyAccessToken } from '../utils/jwt.js'
import { env } from '../config/env.js'
import { joinRoom, leaveAllRooms, broadcast } from './ws-rooms.js'
import { getSupabase } from '../config/database.js'

const HEARTBEAT_INTERVAL = 25_000  // 25s ping/pong
const AUTH_TIMEOUT = 10_000        // close unauthenticated sockets after 10s

// Simple cookie parser helper
function parseCookies(cookieString) {
  if (!cookieString) return {}
  return cookieString.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=')
    if (key && value) acc[key] = decodeURIComponent(value)
    return acc
  }, {})
}

function isAllowedOrigin(origin) {
  if (!origin) return false
  const normalized = origin.replace(/\/$/, '')
  if (env.clientOrigins.includes(normalized)) return true
  try {
    const url = new URL(normalized)
    return url.protocol === 'https:' && url.hostname.endsWith('.vercel.app')
  } catch { return false }
}

export function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true })
  
  // Track connections per IP
  const connectionsByIp = new Map()
  const MAX_CONNECTIONS_PER_IP = 10

  // Upgrade handler — validate origin BEFORE the socket is created
  httpServer.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin
    if (origin && !isAllowedOrigin(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }

    const ip = req.socket.remoteAddress
    const count = connectionsByIp.get(ip) ?? 0
    if (count >= MAX_CONNECTIONS_PER_IP) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
      socket.destroy()
      return
    }
    connectionsByIp.set(ip, count + 1)
    
    socket.on('close', () => {
      const c = connectionsByIp.get(ip) ?? 1
      if (c <= 1) connectionsByIp.delete(ip)
      else connectionsByIp.set(ip, c - 1)
    })

    // Parse auth cookie
    const rawCookies = parseCookies(req.headers.cookie || '')
    const token = rawCookies[env.jwt.accessCookieName]

    let user = null
    if (token) {
      try { user = verifyAccessToken(token) } catch { /* expired or invalid */ }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws._user = user   // may be null — client must send 'auth' message to claim identity
      ws._authed = !!user
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    // If not authenticated from cookie, give the client AUTH_TIMEOUT to send auth message
    let authTimer = null
    if (!ws._authed) {
      authTimer = setTimeout(() => {
        if (!ws._authed) ws.close(4401, 'Authentication timeout')
      }, AUTH_TIMEOUT)
    } else {
      setupRooms(ws)
    }

    // Heartbeat to keep connection alive through load balancers / proxies
    ws._isAlive = true
    ws.on('pong', () => { ws._isAlive = true })

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }

      // Client sends { type: 'subscribe', room: '...' }
      if (msg.type === 'subscribe' && ws._authed) {
        handleSubscribe(ws, msg)
      }
    })

    ws.on('close', () => {
      clearTimeout(authTimer)
      leaveAllRooms(ws)
    })
  })

  // Heartbeat interval — prune dead sockets
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws._isAlive) { ws.terminate(); return }
      ws._isAlive = false
      ws.ping()
    })
  }, HEARTBEAT_INTERVAL)

  wss.on('close', () => clearInterval(heartbeat))

  return wss
}

async function setupRooms(ws) {
  const { id: userId, role, organizationId } = ws._user

  // Every user joins their personal room
  joinRoom(ws, `user:${userId}`)

  // Role-based rooms
  joinRoom(ws, `role:${role}`)

  // Organizers join their active event rooms
  if (role === 'organizer' && organizationId) {
    const db = getSupabase()
    const { data: events } = await db
      .from('events')
      .select('id')
      .eq('organization_id', organizationId)
      .in('status', ['scheduled', 'active'])
    events?.forEach((e) => {
      joinRoom(ws, `event:${e.id}`)
      joinRoom(ws, `event:${e.id}:organizer`)
    })
  }

  // Voters join rooms for their assigned events
  if (role === 'voter') {
    const db = getSupabase()
    const { data: assignments } = await db
      .from('event_voters')
      .select('event_id')
      .eq('voter_id', userId)
    assignments?.forEach((a) => {
      joinRoom(ws, `event:${a.event_id}`)
      joinRoom(ws, `event:${a.event_id}:voters`)
    })
  }
}

function handleSubscribe(ws, msg) {
  // Allow client to explicitly subscribe to a specific event room
  // e.g. { type: 'subscribe', room: 'event:abc-123:organizer' }
  const room = String(msg.room || '')
  if (room.startsWith('event:') || room === `user:${ws._user.id}`) {
    joinRoom(ws, room)
  }
}
