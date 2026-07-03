# WebSocket Integration Plan — VOTRIX

> A complete technical guide for applying WebSockets to the Votrix system.
> Covers **why**, **where**, **how**, and the **before/after diff** for every affected file.

---

## Table of Contents

1. [Why WebSockets](#1-why-websockets)
2. [Current State — What Is Happening Now](#2-current-state--what-is-happening-now)
3. [Where to Apply WebSockets](#3-where-to-apply-websockets)
4. [Architecture Design](#4-architecture-design)
5. [Backend Implementation](#5-backend-implementation)
6. [Frontend Implementation](#6-frontend-implementation)
7. [File-by-File Before / After](#7-file-by-file-before--after)
8. [Security Considerations](#8-security-considerations)
9. [Event Reference](#9-event-reference)
10. [Rollout Order](#10-rollout-order)

---

## 1. Why WebSockets

### The Core Problem — Wasteful Polling

Every dashboard in Votrix currently uses `setInterval` to ask the server
for fresh data every 30 seconds (rankings page: every 10 seconds).
This means:

| Problem | Impact |
|---|---|
| Requests fire even when nothing changed | Wasted DB queries and bandwidth |
| Data is stale for up to 30s after a real event | Organizer sees old vote counts while voting is live |
| Rankings page hits the DB every 10s per open tab | Most expensive page in the system |
| Notification badge polls every 30s for every logged-in user | N users × 1 query × 2/min = constant DB load |
| A judge submits scores — organizer sees it up to 30s late | Bad UX during live scoring events |

### The Solution

Replace polling with a persistent WebSocket connection.
The server **pushes** data the moment it changes.
Clients stop guessing and start reacting.


---

## 2. Current State — What Is Happening Now

### Every `setInterval` in the frontend

| File | Interval | Endpoint Hit | Data |
|---|---|---|---|
| `AppShell.jsx` | **30s** | `GET /api/notifications/unread-count` | Bell badge counter — fires for **every** logged-in user |
| `AdminDashboardPage.jsx` | **30s** | `GET /api/admin/dashboard` + `/analytics` | Platform-wide stats |
| `OrganizerDashboardPage.jsx` | **30s** | `GET /api/organizer/dashboard` + `/analytics` | Cross-module event stats |
| `ElectionDashboardPage.jsx` | **30s** | `GET /api/election/dashboard` | Vote counts, turnout rate |
| `PollingDashboardPage.jsx` | **30s** | `GET /api/polling/dashboard` | Response counts, participation rate |
| `PageantDashboardPage.jsx` | **30s** | `GET /api/competition/dashboard` | Scores submitted, judge completion |
| `VoterDashboardPage.jsx` | **30s** | `GET /api/voter/overview` | Active/assigned/completed events |
| `PageantRankingsPage.jsx` | **10s** ⚠️ | `GET /api/competition/events/:id/rankings` | Live weighted rankings — **most expensive** |

**Total:** 8 polling loops. With 10 concurrent organizer sessions open, that is
up to **~24 DB queries per minute** just from dashboard intervals, before any
real user activity.

### What already exists

- `ws` package is **already installed** (`"ws": "^8.13.0"` in `backend/package.json`)
- `database.js` already polyfills `globalThis.WebSocket = ws` for Supabase Realtime
- `AppShell.jsx` already has a `window.addEventListener('votrix-notifications-updated', ...)` custom event bus pattern — the mental model for push events is already there
- Auth is **fully cookie-based** — the `votrix_access` HTTP-only cookie is sent automatically on WebSocket upgrade requests by the browser


---

## 3. Where to Apply WebSockets

Ranked by impact (highest first):

### Priority 1 — Live Rankings (Competition Scoring)

**File:** `PageantRankingsPage.jsx`
**Why:** Polled every **10 seconds**. A judge submitting scores is the single
highest-impact mutation in the system — it immediately changes rankings.
Organizer and judges need to see it in under 1 second, not up to 10s later.

**Trigger event:** `judge:scores-submitted` (after `pageant-judge.controller.js → submitScores`)
**Push target:** All sockets in room `event:{eventId}:organizer`

---

### Priority 2 — Notification Bell

**File:** `AppShell.jsx`
**Why:** Every single logged-in user (admin, organizer, voter) is hitting
`/api/notifications/unread-count` every 30 seconds. This is the highest
**per-user** query volume in the system. A push replaces it entirely.

**Trigger event:** `notification:created` (after any service creates a notification row)
**Push target:** Room `user:{userId}` — targeted per user

---

### Priority 3 — Election Dashboard (Live Vote Counts)

**File:** `ElectionDashboardPage.jsx`
**Why:** During an active election, votes are cast continuously. Organizer
currently sees stale counts for up to 30 seconds.

**Trigger event:** `election:vote-submitted` (after `election-voter.controller.js → submitVote`)
**Push target:** Room `event:{eventId}:organizer`

---

### Priority 4 — Polling Dashboard (Live Response Counts)

**File:** `PollingDashboardPage.jsx`
**Why:** Same pattern as elections. Response submissions should update
the organizer's participation rate counter immediately.

**Trigger event:** `poll:response-submitted` (after `polling-voter.controller.js → submitPoll`)
**Push target:** Room `event:{eventId}:organizer`

---

### Priority 5 — Voting / Scoring Toggle State

**Files:** `ElectionEventsPage.jsx`, `PageantEventsPage.jsx`, `PollingEventsPage.jsx`
**Why:** When an organizer opens or closes voting/scoring, voters and judges
currently find out only on their next page load or 30s poll.

**Trigger events:** `election:voting-toggled`, `competition:scoring-toggled`, `poll:polling-toggled`
**Push target:** All sockets in room `event:{eventId}` (voters + organizer)

---

### Priority 6 — Admin & Organizer Summary Dashboards

**Files:** `AdminDashboardPage.jsx`, `OrganizerDashboardPage.jsx`
**Why:** Lower urgency — these are overview pages, not live event monitors.
Replace the 30s poll with a WebSocket push that fires on any event-level change.

**Trigger events:** `platform:stats-updated` (admin), `organizer:stats-updated`
**Push target:** `role:admin` room, `user:{organizerId}` room

---

### Priority 7 — Voter Dashboard Event State

**File:** `VoterDashboardPage.jsx`
**Why:** Voters need to know when an event they are assigned to opens or closes.
Currently they wait up to 30s.

**Trigger events:** `election:voting-toggled`, `poll:polling-toggled`, `competition:scoring-toggled`
**Push target:** All voters assigned to that event — room `event:{eventId}:voters`


---

## 4. Architecture Design

### Connection Model

```
Browser                        Express Server (port 5000)
  |                                      |
  |------- HTTP GET /api/ws/connect ---->|  (upgrade request, cookies auto-sent)
  |<------ 101 Switching Protocols ------|
  |                                      |
  |  [persistent WebSocket connection]   |
  |                                      |
  |<-- { type: "notification:created" }--|  pushed when DB row inserted
  |<-- { type: "election:vote-submitted" }|  pushed after vote saved
  |<-- { type: "rankings:updated", data }|  pushed after scores saved
```

### Room Model

Sockets join rooms on connection. Rooms are just Sets of socket references.

```
user:{userId}              — personal room (notifications)
event:{eventId}            — all participants of an event
event:{eventId}:organizer  — only the organizer watching that event
event:{eventId}:voters     — all voters assigned to that event
role:admin                 — all admin sessions
```

A single client can be in multiple rooms.
When the server fires an event, it sends to the relevant room(s) only.

### Technology Choice

Use the **existing `ws` package** (already installed). No new dependencies needed.

Do **not** use Socket.IO — it adds ~70KB to the bundle and the Votrix
use case is simple enough that raw `ws` is sufficient.

Do **not** use Supabase Realtime on the frontend — it would expose the
service role key or require a separate anon key flow, and bypasses the
existing cookie auth entirely.

### Server-side setup — share the HTTP server

```
server.js  (current)              server.js  (after)
─────────────────────             ──────────────────────────────
const app = createApp()           const app = createApp()
app.listen(env.port, ...)         const httpServer = createServer(app)
                                  attachWebSocketServer(httpServer)
                                  httpServer.listen(env.port, ...)
```

The WebSocket upgrade shares the **same port** as the HTTP API (5000).
No extra port, no extra firewall rules, no extra Render service.


---

## 5. Backend Implementation

### New files to create

```
backend/src/
  websocket/
    ws-server.js        — WebSocket server setup, upgrade handler, auth
    ws-rooms.js         — room registry (Map-based, in-memory)
    ws-emitter.js       — emit helper used by service layer
```

---

### `backend/src/websocket/ws-rooms.js`

```js
// In-memory room registry.
// rooms: Map<roomName, Set<WebSocket>>

const rooms = new Map()

export function joinRoom(socket, roomName) {
  if (!rooms.has(roomName)) rooms.set(roomName, new Set())
  rooms.get(roomName).add(socket)
  if (!socket._rooms) socket._rooms = new Set()
  socket._rooms.add(roomName)
}

export function leaveAllRooms(socket) {
  if (!socket._rooms) return
  for (const roomName of socket._rooms) {
    rooms.get(roomName)?.delete(socket)
    if (rooms.get(roomName)?.size === 0) rooms.delete(roomName)
  }
  socket._rooms.clear()
}

export function broadcast(roomName, payload) {
  const room = rooms.get(roomName)
  if (!room || room.size === 0) return
  const message = JSON.stringify(payload)
  for (const socket of room) {
    if (socket.readyState === 1 /* OPEN */) socket.send(message)
  }
}

export function getRoomSize(roomName) {
  return rooms.get(roomName)?.size ?? 0
}
```

---

### `backend/src/websocket/ws-emitter.js`

```js
// Called from the service layer after mutations.
import { broadcast } from './ws-rooms.js'

export function emitToEvent(eventId, type, data = {}) {
  broadcast(`event:${eventId}`, { type, data, ts: Date.now() })
}

export function emitToEventOrganizer(eventId, type, data = {}) {
  broadcast(`event:${eventId}:organizer`, { type, data, ts: Date.now() })
}

export function emitToEventVoters(eventId, type, data = {}) {
  broadcast(`event:${eventId}:voters`, { type, data, ts: Date.now() })
}

export function emitToUser(userId, type, data = {}) {
  broadcast(`user:${userId}`, { type, data, ts: Date.now() })
}

export function emitToRole(role, type, data = {}) {
  broadcast(`role:${role}`, { type, data, ts: Date.now() })
}
```


---

### `backend/src/websocket/ws-server.js`

```js
import { WebSocketServer } from 'ws'
import { parse as parseCookies } from 'cookie'
import { verifyAccessToken } from '../utils/jwt.js'   // existing utility
import { env } from '../config/env.js'
import { joinRoom, leaveAllRooms, broadcast } from './ws-rooms.js'
import { getSupabase } from '../config/database.js'

const HEARTBEAT_INTERVAL = 25_000  // 25s ping/pong
const AUTH_TIMEOUT = 10_000        // close unauthenticated sockets after 10s

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

  // Upgrade handler — validate origin BEFORE the socket is created
  httpServer.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin
    if (origin && !isAllowedOrigin(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }

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

      // Client sends { type: 'auth', token: '<csrf-as-proof>' } after refresh
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
  const allowed = [
    `user:${ws._user.id}`,
    `event:`,    // prefix check below
  ]
  const room = String(msg.room || '')
  if (room.startsWith('event:') || room === `user:${ws._user.id}`) {
    joinRoom(ws, room)
  }
}
```


---

### Modified: `backend/src/server.js`

**Before:**
```js
import { createApp } from './app.js'
import { env } from './config/env.js'

const app = createApp()
app.listen(env.port, '0.0.0.0', () => {
  console.log(`[votrix] API listening on port ${env.port}`)
})
```

**After:**
```js
import { createServer } from 'http'
import { createApp } from './app.js'
import { env } from './config/env.js'
import { attachWebSocketServer } from './websocket/ws-server.js'

const app = createApp()
const httpServer = createServer(app)

attachWebSocketServer(httpServer)

httpServer.listen(env.port, '0.0.0.0', () => {
  console.log(`[votrix] API listening on port ${env.port}`)
  console.log(`[votrix] WebSocket server active on ws://0.0.0.0:${env.port}`)
})
```

The key change: `app.listen()` → `createServer(app)` + `httpServer.listen()`.
The `upgrade` event can only be intercepted on the raw `http.Server` instance,
not on the Express app directly.

---

### Service layer — add emitter calls

After each mutation, call the relevant emitter. Examples:

**`election-voter.service.js` — after vote is saved:**
```js
import { emitToEventOrganizer } from '../websocket/ws-emitter.js'

// inside submitVote(), after DB insert succeeds:
emitToEventOrganizer(eventId, 'election:vote-submitted', {
  eventId,
  votesCast: updatedVotesCast,
  turnoutRate: updatedTurnoutRate,
})
```

**`pageant-judge.service.js` — after scores are saved:**
```js
import { emitToEvent } from '../websocket/ws-emitter.js'

// inside submitJudgeScores(), after DB upsert:
const rankings = await getLiveRankings(eventId)
emitToEvent(eventId, 'rankings:updated', { eventId, rankings })
```

**`notification.service.js` — after notification row is created:**
```js
import { emitToUser } from '../websocket/ws-emitter.js'

// inside createNotification(), after DB insert:
emitToUser(userId, 'notification:created', {
  id: notification.id,
  title: notification.title,
  message: notification.message,
  type: notification.type,
  actionUrl: notification.action_url,
  createdAt: notification.created_at,
})
```

**`election-organizer.service.js` — after voting toggled:**
```js
import { emitToEvent } from '../websocket/ws-emitter.js'

// inside setVotingEnabled(), after DB update:
emitToEvent(eventId, 'election:voting-toggled', {
  eventId,
  votingEnabled: enabled,
})
```


---

## 6. Frontend Implementation

### New file: `frontend/src/services/socket.service.js`

```js
// Singleton WebSocket client for Votrix.
// Manages connection, reconnection, and room-scoped subscriptions.

import { API_BASE_URL } from '@/utils/constants'

const WS_URL = API_BASE_URL.replace(/^http/, 'ws').replace('/api', '') + '/ws'

const MAX_RECONNECT_DELAY = 30_000
const BASE_RECONNECT_DELAY = 1_000

let socket = null
let reconnectAttempts = 0
let reconnectTimer = null
let isIntentionallyClosed = false

// listeners: Map<eventType, Set<Function>>
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
    // onclose will fire after onerror — let it handle reconnect
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
  return () => listeners.get(eventType)?.delete(handler)  // returns unsubscribe fn
}

export function subscribeRoom(room) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', room }))
  }
}

export { connect, disconnect }
export default { connect, disconnect, subscribe, subscribeRoom }
```

---

### New hook: `frontend/src/hooks/useSocketEvent.js`

```js
// React hook — subscribe to a WebSocket event type and auto-unsubscribe on unmount.
import { useEffect } from 'react'
import { subscribe } from '@/services/socket.service'

export function useSocketEvent(eventType, handler, deps = []) {
  useEffect(() => {
    const unsubscribe = subscribe(eventType, handler)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, ...deps])
}
```

---

### Modified: `frontend/src/app/Bootstrap.jsx` (or auth hook)

Connect the socket when the user is authenticated, disconnect on logout.

```js
// In Bootstrap.jsx or useAuthBootstrap.js, after session is confirmed:
import { connect, disconnect } from '@/services/socket.service'

// On login / session restored:
connect()

// On logout:
disconnect()
```


---

## 7. File-by-File Before / After

---

### `AppShell.jsx` — Notification badge

**Before:**
```js
// Polls every 30 seconds for every logged-in user
const intervalId = setInterval(loadUnreadCount, 30000)
```

**After:**
```js
import { useSocketEvent } from '@/hooks/useSocketEvent'

// Remove the setInterval entirely.
// Load once on mount, then react to push events.
useEffect(() => {
  void loadUnreadCount()   // initial load only
}, [user])

// Real-time push replaces all subsequent polls
useSocketEvent('notification:created', () => {
  setUnreadCount((c) => c + 1)
})
```

**Result:** Zero polling. Badge increments instantly when a notification is created.

---

### `PageantRankingsPage.jsx` — Live rankings

**Before:**
```js
// Polls every 10 seconds — most expensive page in the system
useEffect(() => {
  load()
  const interval = setInterval(load, 10000)
  return () => clearInterval(interval)
}, [eventId])
```

**After:**
```js
import { useSocketEvent } from '@/hooks/useSocketEvent'
import { subscribeRoom } from '@/services/socket.service'

useEffect(() => {
  load()                                         // initial fetch
  subscribeRoom(`event:${eventId}:organizer`)    // join the room
}, [eventId])

// Rankings are pushed after every judge score submission
useSocketEvent('rankings:updated', ({ rankings }) => {
  if (rankings?.[0]?.eventId === eventId) setData({ rankings })
}, [eventId])
```

**Result:** Rankings update in under 1 second after a judge submits. Zero interval polling.

---

### `ElectionDashboardPage.jsx` — Vote counts

**Before:**
```js
const id = setInterval(load, 30000)
```

**After:**
```js
import { useSocketEvent } from '@/hooks/useSocketEvent'

useEffect(() => {
  load()   // initial fetch only
}, [])

useSocketEvent('election:vote-submitted', (stats) => {
  setData((prev) => ({ ...prev, stats: { ...prev?.stats, ...stats } }))
})
```

**Result:** Vote count and turnout rate update instantly after each vote.

---

### `PollingDashboardPage.jsx` — Response counts

**Before:**
```js
const id = setInterval(load, 30000)
```

**After:**
```js
useSocketEvent('poll:response-submitted', (stats) => {
  setData((prev) => ({ ...prev, stats: { ...prev?.stats, ...stats } }))
})
// Keep initial load, remove interval
```

---

### `PageantDashboardPage.jsx` — Judge completion

**Before:**
```js
const id = setInterval(load, 30000)
```

**After:**
```js
useSocketEvent('rankings:updated', () => {
  // Re-fetch dashboard stats when scores change
  load()
})
// Remove interval
```

---

### `OrganizerDashboardPage.jsx` — Cross-module stats

**Before:**
```js
const id = setInterval(load, 30000)
```

**After:**
```js
useSocketEvent('organizer:stats-updated', () => load())
// Remove interval — stats are pushed on any event-level change
```

---

### `AdminDashboardPage.jsx` — Platform stats

**Before:**
```js
const id = setInterval(load, 30000)
```

**After:**
```js
useSocketEvent('platform:stats-updated', () => load())
// Remove interval
```

---

### `VoterDashboardPage.jsx` — Event state changes

**Before:**
```js
const id = setInterval(load, 30000)
```

**After:**
```js
// Keep initial load, remove interval
// React to voting/polling/scoring toggles
useSocketEvent('election:voting-toggled', () => load())
useSocketEvent('poll:polling-toggled',    () => load())
useSocketEvent('competition:scoring-toggled', () => load())
```

**Result:** Voter dashboard reflects open/close state changes within 1 second.


---

## 8. Security Considerations

### Authentication on Upgrade

The browser sends the `votrix_access` HTTP-only cookie automatically with the
WebSocket upgrade request. This is the same cookie used for all REST API calls.

```js
// ws-server.js upgrade handler:
const rawCookies = parseCookies(req.headers.cookie || '')
const token = rawCookies[env.jwt.accessCookieName]  // 'votrix_access'
let user = null
try { user = verifyAccessToken(token) } catch { /* expired */ }
```

If the cookie is missing or expired, the socket connects but has no identity.
Close it after `AUTH_TIMEOUT` (10 seconds) if no valid auth is established.

### Origin Validation

Validate the `Origin` header in the upgrade handler **before** the socket is
created. Reuse the exact same `isAllowedOrigin()` logic from `app.js`:

```js
httpServer.on('upgrade', (req, socket, head) => {
  if (req.headers.origin && !isAllowedOrigin(req.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    socket.destroy()
    return
  }
  // ...
})
```

### CSRF on WebSocket

WebSocket connections are not subject to CSRF attacks — the upgrade is a GET
(CSRF only applies to state-mutating HTTP requests). No CSRF token needed on
the socket connection itself.

However, if the client ever sends a message that **causes a mutation**
(e.g., marking a notification read), that should go through the REST API
with CSRF, not through the WebSocket.

**Rule:** WebSocket is **read-only push only** from server to client.
All mutations go through the existing HTTP REST endpoints with CSRF protection.

### Token Expiry (15 minute access tokens)

Access tokens expire in 15 minutes. The WebSocket connection is persistent.
Handle this in two ways:

1. **Graceful close from server:** When the backend detects an expired token
   on a socket (e.g., during a room subscription message), close with code
   `4401`. The client reconnects automatically, picks up the refreshed cookie,
   and re-auths.

2. **Client-side refresh awareness:** The existing `api.js` interceptor handles
   401 → refresh → retry for HTTP calls. After a token refresh, the browser
   now has a new cookie. Reconnect the WebSocket to pick it up:

```js
// In socket.service.js, subscribe to auth refresh events:
// After api.js successfully refreshes the token:
window.dispatchEvent(new Event('votrix-token-refreshed'))

// In socket.service.js:
window.addEventListener('votrix-token-refreshed', () => {
  socket?.close()   // will trigger onclose → reconnect with new cookie
})
```

### Rate Limiting

The existing `globalLimiter` (express-rate-limit) does NOT apply to WebSocket
connections since they bypass Express middleware after the upgrade.

Add a connection-level limit in the upgrade handler:

```js
// Track connections per IP
const connectionsByIp = new Map()
const MAX_CONNECTIONS_PER_IP = 10

httpServer.on('upgrade', (req, socket, head) => {
  const ip = req.socket.remoteAddress
  const count = connectionsByIp.get(ip) ?? 0
  if (count >= MAX_CONNECTIONS_PER_IP) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
    socket.destroy()
    return
  }
  connectionsByIp.set(ip, count + 1)
  // Decrement on close:
  socket.on('close', () => {
    const c = connectionsByIp.get(ip) ?? 1
    if (c <= 1) connectionsByIp.delete(ip)
    else connectionsByIp.set(ip, c - 1)
  })
  // ...
})
```

### Memory — Room Cleanup

Rooms must be cleaned up when sockets close. `leaveAllRooms(ws)` in
`ws-server.js`'s `close` handler does this. Empty rooms are deleted from the
Map to avoid unbounded memory growth for events that no longer have watchers.


---

## 9. Event Reference

Complete list of all WebSocket events the server can push.

### Notification events (personal room — `user:{userId}`)

| Event type | Payload | Pushed when |
|---|---|---|
| `notification:created` | `{ id, title, message, type, actionUrl, createdAt }` | A notification row is inserted for the user |

---

### Election events (room — `event:{eventId}` or `:organizer` / `:voters`)

| Event type | Payload | Room | Pushed when |
|---|---|---|---|
| `election:vote-submitted` | `{ eventId, votesCast, turnoutRate, votedCount }` | `:organizer` | A voter casts their ballot |
| `election:voting-toggled` | `{ eventId, votingEnabled }` | `event:{eventId}` | Organizer opens/closes voting |

---

### Competition Scoring events

| Event type | Payload | Room | Pushed when |
|---|---|---|---|
| `rankings:updated` | `{ eventId, rankings[] }` | `event:{eventId}` | A judge submits scores |
| `competition:scoring-toggled` | `{ eventId, scoringEnabled }` | `event:{eventId}` | Organizer opens/closes scoring |

---

### Polling events

| Event type | Payload | Room | Pushed when |
|---|---|---|---|
| `poll:response-submitted` | `{ eventId, responsesSubmitted, participationRate }` | `:organizer` | A respondent submits a poll |
| `poll:polling-toggled` | `{ eventId, pollingEnabled }` | `event:{eventId}` | Organizer opens/closes a poll |

---

### Platform events (room — `role:admin` or `user:{organizerId}`)

| Event type | Payload | Room | Pushed when |
|---|---|---|---|
| `platform:stats-updated` | `{ totalVotesCast, totalEvents, activeEvents }` | `role:admin` | Any vote or response is submitted |
| `organizer:stats-updated` | `{ activeEvents, totalEvents }` | `user:{organizerId}` | Event status changes |

---

### Connection events (client-side only — not from server)

| Event type | When |
|---|---|
| `ws:connected` | Socket opens successfully |
| `ws:disconnected` | Socket closes (auto-reconnect will follow) |

---

## 10. Rollout Order

Implement in this order to get the most value with the least risk.

### Step 1 — Backend foundation (no frontend changes yet)
1. Create `backend/src/websocket/ws-rooms.js`
2. Create `backend/src/websocket/ws-emitter.js`
3. Create `backend/src/websocket/ws-server.js`
4. Modify `backend/src/server.js` — switch to `createServer` + `httpServer.listen`
5. Test: connect to `ws://localhost:5000/ws` with a WebSocket client, confirm auth works

### Step 2 — Notification push (highest ROI, zero regression risk)
1. Add `emitToUser()` call in `notification.service.js` after INSERT
2. Create `frontend/src/services/socket.service.js`
3. Create `frontend/src/hooks/useSocketEvent.js`
4. Connect socket in `Bootstrap.jsx` on auth
5. Modify `AppShell.jsx` — remove `setInterval`, add `useSocketEvent('notification:created', ...)`
6. Test: create a notification for a user, confirm badge increments instantly

### Step 3 — Live rankings (biggest UX improvement)
1. Add `emitToEvent()` in `pageant-judge.service.js` after score submission
2. Modify `PageantRankingsPage.jsx` — remove 10s interval, add `useSocketEvent('rankings:updated', ...)`
3. Test: submit judge scores, confirm rankings page updates in under 1s

### Step 4 — Voting/scoring toggles
1. Add emit calls in organizer services for `setVoting`, `setScoring`, `setPollOpen`
2. Modify `VoterDashboardPage.jsx` — remove interval, react to toggle events
3. Modify `ElectionEventsPage`, `PageantEventsPage`, `PollingEventsPage` — update toggle button state reactively

### Step 5 — Dashboard vote/response counters
1. Add emit in `election-voter.service.js` and `polling-voter.service.js`
2. Modify `ElectionDashboardPage.jsx`, `PollingDashboardPage.jsx` — remove intervals, add event handlers

### Step 6 — Admin and organizer summary dashboards
1. Add `platform:stats-updated` and `organizer:stats-updated` emit calls
2. Modify `AdminDashboardPage.jsx`, `OrganizerDashboardPage.jsx` — remove intervals

---

## Summary

| | Before WebSockets | After WebSockets |
|---|---|---|
| Notification updates | Every 30s per user | Instant push per user |
| Rankings refresh | Every 10s | Under 1s after score |
| Vote count updates | Every 30s | Instant after vote |
| Response count updates | Every 30s | Instant after response |
| Voting open/close visible to voter | Up to 30s late | Under 1s |
| DB queries (10 concurrent sessions) | ~24 queries/min (idle) | ~0 queries/min (idle) |
| New backend dependencies | — | none (ws already installed) |
| New frontend dependencies | — | none (native WebSocket API) |
| Lines removed from frontend | — | ~16 `setInterval` / `clearInterval` blocks |

