import { WebSocketServer } from 'ws'
import { socketIdentity, canSubscribeToRoom } from './ws-authorization.js'
import { env } from '../config/env.js'
import { isTrustedOrigin } from '../config/trusted-origins.js'
import { joinRoom, leaveAllRooms } from './ws-rooms.js'
import { db as getClient } from '../foundation/db.js'

const HEARTBEAT_INTERVAL = 25_000  // 25s ping/pong


// Simple cookie parser helper
function parseCookies(cookieString) {
  if (!cookieString) return {}
  return cookieString.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=')
    if (key && value) { try { acc[key] = decodeURIComponent(value) } catch { /* malformed cookie cannot authenticate */ } }
    return acc
  }, {})
}

export function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 })
  
  // A campus NAT/proxy address represents many independent judges. Bound
  // authenticated tabs per identity and total node capacity instead of treating
  // all users behind that address as one person.
  const connectionsByUser = new Map()
  const maxPerUser = env.websocket?.maxConnectionsPerUser ?? 5
  const maxConnections = env.websocket?.maxConnections ?? 1000
  let connections = 0

  // Upgrade handler — validate origin BEFORE the socket is created
  httpServer.on('upgrade', async (req, socket, head) => {
    // Only handle WebSocket upgrades on the /ws path
    if (req.url !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    const origin = req.headers.origin
    if (!isTrustedOrigin(origin, env.clientOrigins)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }

    if (connections >= maxConnections) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
      socket.destroy()
      return
    }
    connections += 1
    let userId = null
    socket.setTimeout(10_000, () => socket.destroy())
    
    socket.on('close', () => {
      connections -= 1
      if (userId !== null) {
        const count = connectionsByUser.get(userId) ?? 1
        if (count <= 1) connectionsByUser.delete(userId)
        else connectionsByUser.set(userId, count - 1)
      }
    })

    // Parse auth cookie
    const rawCookies = parseCookies(req.headers.cookie || '')

    let user
    try {
      user = await socketIdentity(req, rawCookies)
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    if (socket.destroyed) return
    const count = connectionsByUser.get(user.id) ?? 0
    if (count >= maxPerUser) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
      socket.destroy()
      return
    }
    userId = user.id
    connectionsByUser.set(userId, count + 1)
    socket.setTimeout(0)
    try {
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws._user = user
        ws._authed = true
        ws._authRequest = req
        wss.emit('connection', ws, req)
      })
    } catch { socket.destroy() }
  })

  wss.on('connection', (ws) => {
    setupRooms(ws).catch(() => ws.close(4403, 'Room authorization unavailable'))

    // Heartbeat to keep connection alive through load balancers / proxies
    ws._isAlive = true
    ws.on('pong', () => { ws._isAlive = true })

    ws.on('message', async (raw) => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }

      // Client sends { type: 'subscribe', room: '...' }
      if (msg.type === 'subscribe' && ws._authed) {
        try {
          ws._user = await socketIdentity(ws._authRequest, ws._authRequest.cookies)
          if (await canSubscribeToRoom(ws._user, String(msg.room || ''))) joinRoom(ws, msg.room)
          else ws.send(JSON.stringify({ type: 'ws:subscription-rejected', data: { room: msg.room } }))
        } catch { ws.close(4401, 'Session expired or revoked') }
      }
    })

    ws.on('close', () => {
      leaveAllRooms(ws)
    })
  })

  // Heartbeat interval — prune dead sockets
  const heartbeat = setInterval(() => {
    wss.clients.forEach(async (ws) => {
      if (!ws._isAlive) { ws.terminate(); return }
      try { ws._user=await socketIdentity(ws._authRequest, ws._authRequest.cookies);leaveAllRooms(ws);await setupRooms(ws) }
      catch { ws.close(4401, 'Session expired or revoked'); return }
      ws._isAlive = false
      ws.ping()
    })
  }, HEARTBEAT_INTERVAL)

  wss.on('close', () => clearInterval(heartbeat))

  return wss
}

async function setupRooms(ws) {
  const { id: userId, role } = ws._user
  joinRoom(ws, `user:${userId}`)
  joinRoom(ws, `role:${role}`)
  let eventIds = []
  if (role === 'organizer') {
    const { data: orgs, error } = await getClient().from('organizations').select('id').eq('organizer_id', userId)
    if (error) throw error
    if (orgs?.length) {
      const { data, error: eventError } = await getClient().from('events').select('id').in('organization_id', orgs.map(o => o.id))
      if (eventError) throw eventError
      eventIds = (data ?? []).map(e => e.id)
    }
  } else if (['participant', 'voter'].includes(role)) {
    const { data, error } = await getClient().from('event_participants').select('event_id').eq('user_id', userId).eq('is_active', true)
    if (error) throw error
    eventIds = (data ?? []).map(e => e.event_id)
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
