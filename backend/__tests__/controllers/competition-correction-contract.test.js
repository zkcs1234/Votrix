import { beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ unlock: vi.fn() }))
vi.mock('../../src/services/competition-session.service.js', () => ({ unlockSessionScore: mocks.unlock }))
import { unlockScore } from '../../src/controllers/competition-session.controller.js'
beforeEach(() => { vi.clearAllMocks(); mocks.unlock.mockResolvedValue({ changed: 1 }) })
test('controller preserves required correction reason and boolean confirmation through the service', async () => {
  const res = { json: vi.fn() }, next = vi.fn()
  unlockScore({ params: { eventId: 'event' }, user: { id: 'organizer' }, body: { contestantId: 'entry', judgeId: 'judge', criteriaId: 'criterion', reason: 'Reviewed correction', confirmed: true } }, res, next)
  await vi.waitFor(() => expect(res.json).toHaveBeenCalled())
  expect(mocks.unlock).toHaveBeenCalledWith('event', 'organizer', { contestantId: 'entry', judgeId: 'judge', criteriaId: 'criterion', reason: 'Reviewed correction', confirmed: true })
  expect(next).not.toHaveBeenCalled()
})
test('truthy strings cannot satisfy the explicit confirmed boolean contract', async () => {
  unlockScore({ params: { eventId: 'event' }, user: { id: 'organizer' }, body: { contestantId: 'entry', confirmed: 'true' } }, { json: vi.fn() }, vi.fn())
  await vi.waitFor(() => expect(mocks.unlock).toHaveBeenCalled())
  expect(mocks.unlock.mock.calls[0][2]).toMatchObject({ confirmed: false, reason: undefined })
})
