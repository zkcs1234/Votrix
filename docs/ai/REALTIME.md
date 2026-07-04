# Realtime (WebSocket)

---

## Overview

Votrix uses a custom native WebSocket server built with the `ws` library. It is attached to the same HTTP server as Express and handles upgrades at the `/ws` path. There is no Supabase Realtime or Socket.IO in use.

---

## WebSocket Server

**File:** `backend/src/websocket/ws-server.js`  
**Entry:** `backend/src/server.js` — `attachWebSocketServer(httpServer)` is called after the Express app is created.  
**URL:** `ws://localhost:5000/ws` (dev) / `wss://<render-app>.onrender.com/ws` (prod)

### Configuration

| Constant | Value | Purpose |
|----------|-------|---------|
| `HEARTBEAT_INTERVAL` | 25,000 ms | Ping interval to detect dead connections |
| `AUTH_TIMEOUT` | 10,000 ms | Unauthenticated sockets closed after 10s |
| `MAX_CONNECTIONS_PER_IP` | 10 | Per-IP connection cap |

---

## Authentication

1. On WebSocket upgrade, the server reads the `votrix_access` cookie from the HTTP upgrade request headers
2. If the cookie is present and valid, `ws._user` is set to the decoded JWT payload and `ws._authed = true`
3. If invalid or missing, `ws._authed = false` — a 10-second timer starts; if no auth message arrives, the socket is closed with code `4401`
4. Once authenticated, `setupRooms(ws)` is called to join the user to their rooms

---

## Room System

**File:** `backend/src/websocket/ws-rooms.js`

Rooms are stored in-memory as a `Map<roomName, Set<WebSocket>>`. Each socket also tracks which rooms it belongs to in `socket._rooms`.

### Built-in Rooms (auto-joined on connect)

| Room | Joined By |
|------|-----------|
| `user:{userId}` | All authenticated users |
| `role:{role}` | All authenticated users |
| `event:{eventId}` | Organizers with active/scheduled events, voters with assigned events |
| `event:{eventId}:organizer` | Organizers only |
| `event:{eventId}:voters` | Voters only |

### Client-Requested Subscription

Clients can explicitly subscribe to additional rooms by sending:
```json
{ "type": "subscribe", "room": "event:abc-123:organizer" }
```
Only `event:*` rooms and the user's own `user:{id}` room are allowed.

---

## Emitter API

**File:** `backend/src/websocket/ws-emitter.js`

Called from the service layer after mutations to push updates to connected clients.

| Function | Room Targeted | Use Case |
|----------|--------------|----------|
| `emitToEvent(eventId, type, data)` | `event:{eventId}` | Broadcast to everyone in an event |
| `emitToEventOrganizer(eventId, type, data)` | `event:{eventId}:organizer` | Organizer-only events |
| `emitToEventVoters(eventId, type, data)` | `event:{eventId}:voters` | Voter-only events |
| `emitToUser(userId, type, data)` | `user:{userId}` | Direct user notification |
| `emitToRole(role, type, data)` | `role:{role}` | Role-wide broadcast |

All emit functions send: `{ type, data, ts: Date.now() }`

---

## Message Format

### Server → Client
```json
{
  "type": "vote_cast",
  "data": { "eventId": "...", "positionId": "...", "candidateId": "..." },
  "ts": 1720000000000
}
```

### Client → Server
```json
{ "type": "subscribe", "room": "event:abc-123:organizer" }
```

---

## Known Broadcast Events (emitted from services)

| Event Type | Emitter Function | Trigger |
|-----------|-----------------|---------|
| `vote_cast` | `emitToEvent` / `emitToEventOrganizer` | Voter submits election ballot |
| `score_submitted` | `emitToEventOrganizer` | Judge submits competition scores |
| `poll_submitted` | `emitToEvent` | Respondent submits poll |
| `event_status_changed` | `emitToEvent` | Event status updated by organizer |
| `voting_enabled` | `emitToEvent` | Organizer enables/disables voting |
| `scoring_enabled` | `emitToEvent` | Organizer enables/disables scoring |
| `notification` | `emitToUser` | New in-app notification created |

> Note: Exact event type strings should be verified against service files — the list above is inferred from the architecture.

---

## Frontend WebSocket Client

**File:** `frontend/src/services/socket.service.js`

### Connection URL
```js
const WS_URL = API_BASE_URL.replace(/^http/, 'ws').replace('/api', '') + '/ws'
```

### Reconnect Strategy
- **Base delay:** 1,000 ms
- **Max delay:** 30,000 ms
- **Algorithm:** Exponential backoff: `min(1000 * 2^attempts, 30000)`
- On `votrix-token-refreshed` window event: socket is closed and reconnected with the new cookie

### API

```js
// Connect to WebSocket server
connect()

// Disconnect intentionally (no reconnect)
disconnect()

// Subscribe to a message type — returns unsubscribe function
const unsubscribe = subscribe('vote_cast', (data) => { ... })

// Request server to add socket to a room
subscribeRoom('event:abc-123:organizer')
```

---

## Frontend Hook

**File:** `frontend/src/hooks/useSocketEvent.js`

```jsx
useSocketEvent('vote_cast', (data) => {
  // handle realtime vote update
}, [eventId])
```

Automatically subscribes and unsubscribes on mount/unmount using `useEffect`.

---

## Heartbeat

- Server sends a WebSocket `ping` every 25 seconds
- Clients must respond with `pong`
- If `_isAlive` is false when the heartbeat fires, the socket is terminated
- On `pong` received: `_isAlive = true`

---

## Performance Considerations

- Rooms are **in-memory only** — data is lost on server restart
- Not suitable for multi-instance deployment without a Redis pub/sub adapter
- Max 10 connections per IP prevents runaway connection floods
- Message serialization is JSON — no binary protocol
- Dead socket pruning via heartbeat prevents memory leaks

---

## Security

- Origin checked on HTTP upgrade (same allowlist as CORS)
- Unauthenticated connections closed after 10s
- Room subscription is gated to allowed room patterns
- Per-IP connection limit (10 max)

---

**Last Updated:** 2026-07-04
**Documentation Version:** 1.0.0
**Related Files:** `backend/src/websocket/ws-server.js`, `backend/src/websocket/ws-rooms.js`, `backend/src/websocket/ws-emitter.js`, `backend/src/server.js`, `frontend/src/services/socket.service.js`, `frontend/src/hooks/useSocketEvent.js`
**Related Documentation:** `docs/ai/SYSTEM_ARCHITECTURE.md`, `docs/ai/FEATURES.md`
