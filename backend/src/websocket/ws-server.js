import { WebSocketServer } from 'ws'
import { verifyAccessToken } from '../utils/jwt.js'
import { env } from '../config/env.js'
import { joinRoom, leaveAllRooms, broadcast } from './ws-rooms.js'
import { db as getClient } from '../foundation/db.js'

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
    // Only handle WebSocket upgrades on the /ws path
    if (req.url !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

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
    const db = getClient()
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
  if (role === 'voter' || role === 'participant') {
    const db = getClient()
    const { data: assignments } = await db
      .from('event_participants')
      .select('event_id')
      .eq('user_id', userId)
    assignments?.forEach((a) => {
      joinRoom(ws, `event:${a.event_id}`)
      joinRoom(ws, `event:${a.event_id}:voters`)
    })
  }
}

async function handleSubscribe(ws, msg) {
  const room = String(msg.room || '').trim()
  if (!room || !ws._user) return

  // User's private notifications room
  if (room === `user:${ws._user.id}`) {
    joinRoom(ws, room)
    return
  }

  // Role-wide broadcasts (only own role or admin)
  if (room === `role:${ws._user.role}` || ws._user.role === 'admin') {
    joinRoom(ws, room)
    return
  }

  // Event rooms: event:<eventId> or event:<eventId>:<channel>
  const match = room.match(/^event:([a-f0-9-]+)(?::([a-z0-9_-]+))?$/i)
  if (!match) return

  const [, eventId, channel] = match
  const db = getClient()

  // Organizer private channel: only event organizer or admin
  if (channel === 'organizer') {
    if (ws._user.role === 'admin') {
      joinRoom(ws, room)
      return
    }
    if (ws._user.role !== 'organizer') return

    try {
      const { data: event } = await db
        .from('events')
        .select('id, organization_id, organizations!inner(organizer_id)')
        .eq('id', eventId)
        .maybeSingle()
      if (event?.organizations?.organizer_id === ws._user.id) {
        joinRoom(ws, room)
      }
    } catch (err) {
      console.warn('[ws-server] Failed to verify organizer channel subscription:', err.message)
    }
    return
  }

  // Voter/Participant channel: organizers, admin, or enrolled participants
  if (channel === 'voters') {
    if (ws._user.role === 'admin' || ws._user.role === 'organizer') {
      joinRoom(ws, room)
      return
    }
    try {
      const { data: enrollment } = await db
        .from('event_participants')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', ws._user.id)
        .maybeSingle()
      if (enrollment) {
        joinRoom(ws, room)
      }
    } catch (err) {
      console.warn('[ws-server] Failed to verify voter channel subscription:', err.message)
    }
    return
  }

  // Public/general event room (event:<eventId>)
  joinRoom(ws, room)
}
