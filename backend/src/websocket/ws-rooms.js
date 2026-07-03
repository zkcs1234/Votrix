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
