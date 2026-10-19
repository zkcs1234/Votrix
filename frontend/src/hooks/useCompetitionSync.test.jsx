import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import useCompetitionSync from './useCompetitionSync'
import { useSocketEvent } from './useSocketEvent'

const bus = vi.hoisted(() => ({ listeners: new Map(), connected: false }))
vi.mock('@/services/socket.service', () => ({
  isConnected: () => bus.connected,
  subscribe: (type, callback) => {
    const callbacks = bus.listeners.get(type) ?? new Set()
    callbacks.add(callback); bus.listeners.set(type, callbacks)
    return () => callbacks.delete(callback)
  },
}))
const emit = (type, payload = {}) => { for (const callback of bus.listeners.get(type) ?? []) callback(payload) }
beforeEach(() => { bus.listeners.clear(); bus.connected = false; vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

test('active pages reconcile missed events on bounded fallback, focus and reconnect, with cleanup', async () => {
  const refresh = vi.fn().mockResolvedValue(undefined)
  const { unmount } = renderHook(() => useCompetitionSync('event-a', refresh))
  await act(async () => { await vi.advanceTimersByTimeAsync(14_999) })
  expect(refresh).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(refresh).toHaveBeenCalledTimes(1)
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(refresh).toHaveBeenCalledTimes(2)
  await act(async () => { bus.connected = true; emit('ws:connected') })
  expect(refresh).toHaveBeenCalledTimes(3)
  await act(async () => { await vi.advanceTimersByTimeAsync(59_999) })
  expect(refresh).toHaveBeenCalledTimes(3)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(refresh).toHaveBeenCalledTimes(4)
  unmount()
  await act(async () => { emit('competition:workflow-updated', { eventId: 'event-a' }); await vi.advanceTimersByTimeAsync(120_000) })
  expect(refresh).toHaveBeenCalledTimes(4)
})

test('event-only publication invalidations refetch while foreign enrolled event state is ignored', async () => {
  const refresh = vi.fn().mockResolvedValue(undefined)
  renderHook(() => useCompetitionSync('event-a', refresh))
  await act(async () => { emit('session:status-changed', { session: { eventId: 'event-b', status: 'paused' } }) })
  expect(refresh).not.toHaveBeenCalled()
  await act(async () => { emit('rankings:updated', { eventId: 'event-a' }) })
  await act(async () => { emit('competition:workflow-updated', { eventId: 'event-a', action: 'verify' }) })
  expect(refresh).toHaveBeenCalledTimes(2)
})

test('bursts coalesce into one subsequent authoritative reconciliation', async () => {
  let release
  const refresh = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve })).mockResolvedValue(undefined)
  renderHook(() => useCompetitionSync('event-a', refresh))
  await act(async () => { emit('session:contestant-changed', { eventId: 'event-a' }) })
  await act(async () => { for (let i = 0; i < 10; i++) emit('session:contestant-changed', { eventId: 'event-a' }) })
  expect(refresh).toHaveBeenCalledTimes(1)
  await act(async () => { release() })
  expect(refresh).toHaveBeenCalledTimes(2)
})

test('native invalidations bind event, competition and NULL or explicit round without sibling refresh',async()=>{
 const refresh=vi.fn().mockResolvedValue(undefined)
 const {rerender}=renderHook(({round})=>useCompetitionSync('event-a',refresh,{competitionId:'hip-hop',roundId:round}),{initialProps:{round:null}})
 await act(async()=>{emit('competition:native-invalidated',{eventId:'event-a',competitionId:'contemporary',roundId:null});emit('competition:native-invalidated',{eventId:'event-a',competitionId:'hip-hop',roundId:'final'})})
 expect(refresh).not.toHaveBeenCalled()
 await act(async()=>emit('competition:native-invalidated',{eventId:'event-a',competitionId:'hip-hop',roundId:null}))
 expect(refresh).toHaveBeenCalledTimes(1)
 rerender({round:'preliminary'})
 await act(async()=>{emit('competition:native-invalidated',{eventId:'event-a',competitionId:'hip-hop',roundId:null});emit('competition:native-invalidated',{eventId:'event-a',competitionId:'hip-hop',roundId:'preliminary'})})
 expect(refresh).toHaveBeenCalledTimes(2)
})

test('shared socket event hook invokes the latest callback after rerender even without dependency overrides', () => {
  const seen = []
  const { rerender } = renderHook(({ value }) => useSocketEvent('test', () => seen.push(value)), { initialProps: { value: 'old' } })
  rerender({ value: 'new' })
  emit('test')
  expect(seen).toEqual(['new'])
})
test('dependent-round hints invalidate only the same child and clear views even while reconciliation is running',async()=>{
 let release;const refresh=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve})).mockResolvedValue(undefined),invalidate=vi.fn()
 renderHook(()=>useCompetitionSync('event-a',refresh,{competitionId:'a',roundId:'final',onInvalidate:invalidate}))
 await act(async()=>emit('competition:native-invalidated',{eventId:'event-a',competitionId:'b',roundId:'pre',affectedRoundIds:['final']}));expect(invalidate).not.toHaveBeenCalled()
 await act(async()=>emit('competition:native-invalidated',{eventId:'event-a',competitionId:'a',roundId:'pre',affectedRoundIds:['final']}));await act(async()=>emit('competition:native-invalidated',{eventId:'event-a',competitionId:'a',roundId:'final'}));expect(invalidate).toHaveBeenCalledTimes(2);expect(refresh).toHaveBeenCalledTimes(1);await act(async()=>release());expect(refresh).toHaveBeenCalledTimes(2)
})
