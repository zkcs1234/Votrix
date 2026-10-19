import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('@/services/api', () => ({ refreshSession: mocks.refresh }))
const sockets = []
class TestSocket {
  static OPEN = 1
  static CONNECTING = 0
  constructor(url) { this.url = url; this.readyState = TestSocket.CONNECTING; this.send = vi.fn(); sockets.push(this) }
  open() { this.readyState = TestSocket.OPEN; this.onopen?.() }
  close(code = 1000) { this.readyState = 3; return this.onclose?.({ code }) }
}
let client
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules(); vi.clearAllMocks(); sockets.length = 0
  vi.stubGlobal('WebSocket', TestSocket)
  mocks.refresh.mockResolvedValue({})
  client = await import('./socket.service')
})
afterEach(() => { client.disconnect(); vi.useRealTimers(); vi.unstubAllGlobals() })
test('relative API and absolute deployed API resolve the matching socket origin and secure protocol', () => {
  expect(client.websocketUrl('/api', 'http://localhost:5173/participant')).toBe('ws://localhost:5173/ws')
  expect(client.websocketUrl('https://api.votrix.example/api', 'https://app.votrix.example')).toBe('wss://api.votrix.example/ws')
})
test('authorized room requests survive a reconnect and account disconnect clears them', async () => {
  client.subscribeRoom('event:event-a:organizer')
  client.connect(); sockets[0].open()
  expect(sockets[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', room: 'event:event-a:organizer' }))
  await sockets[0].close(1006)
  await vi.advanceTimersByTimeAsync(1_000)
  sockets[1].open()
  expect(sockets[1].send).toHaveBeenCalledTimes(1)
  client.disconnect(); client.connect(); sockets[2].open()
  expect(sockets[2].send).not.toHaveBeenCalled()
})
test('expired socket authentication coordinates HTTP refresh before retrying and fresh cookies replace the connection', async () => {
  client.connect(); sockets[0].open()
  await sockets[0].close(4401)
  expect(mocks.refresh).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1_000)
  sockets[1].open()
  window.dispatchEvent(new Event('votrix-token-refreshed'))
  expect(sockets).toHaveLength(3)
  expect(sockets[2].readyState).toBe(TestSocket.CONNECTING)
  await vi.advanceTimersByTimeAsync(5_000)
  expect(sockets).toHaveLength(3)
})
