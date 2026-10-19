import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  getOrCreateOrganization: vi.fn(),
  assertOrganizerOwnsEvent: vi.fn(),
  syncEventSchedules: vi.fn(),
  deleteDraft: vi.fn(),
  recordEventActivity: vi.fn(),
  inserted: null,
  updated: null,
  queryResult: null,
}))

vi.mock('../../src/foundation/db.js', () => ({ db: mocks.db }))
vi.mock('../../src/services/event.service.js', () => ({
  assertOrganizerOwnsEvent: mocks.assertOrganizerOwnsEvent,
  getEventById: vi.fn(),
}))
vi.mock('../../src/services/organization.service.js', () => ({
  getOrCreatePollingOrganization: mocks.getOrCreateOrganization,
  mapOrganization: value => value,
}))
vi.mock('../../src/services/event-schedule-sync.service.js', () => ({
  syncEventSchedules: mocks.syncEventSchedules,
}))
vi.mock('../../src/services/draft.service.js', () => ({ deleteDraft: mocks.deleteDraft }))
vi.mock('../../src/foundation/activity.js', () => ({ recordEventActivity: mocks.recordEventActivity }))

const { createPollEvent, updatePollEvent } = await import('../../src/services/polling.service.js')

const baseEvent = {
  id: 'poll-id',
  organization_id: 'org-id',
  event_type: 'polling',
  title: 'Campus poll',
  status: 'draft',
  start_date: '2026-10-20T09:00:00.000Z',
  end_date: '2026-10-22T17:00:00.000Z',
  poll_expires_at: null,
  polling_enabled: false,
  poll_anonymous: false,
  poll_allow_multiple_submissions: false,
}

function createQuery() {
  const query = {
    insert: vi.fn(payload => {
      mocks.inserted = payload
      mocks.queryResult = { ...baseEvent, ...payload }
      return query
    }),
    update: vi.fn(payload => {
      mocks.updated = payload
      mocks.queryResult = { ...baseEvent, ...payload }
      return query
    }),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => ({ data: mocks.queryResult, error: null })),
  }
  return query
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.inserted = null
  mocks.updated = null
  mocks.queryResult = null
  mocks.getOrCreateOrganization.mockResolvedValue({ id: 'org-id' })
  mocks.assertOrganizerOwnsEvent.mockResolvedValue(baseEvent)
  mocks.syncEventSchedules.mockResolvedValue()
  mocks.deleteDraft.mockResolvedValue()
  mocks.db.mockImplementation(() => ({ from: () => createQuery() }))
})

describe('polling event expiration persistence', () => {
  it('persists the optional expiration when creating a poll', async () => {
    const pollExpiresAt = '2026-10-21T12:00:00.000Z'
    const event = await createPollEvent('organizer-id', {
      title: 'Campus poll',
      startDate: baseEvent.start_date,
      endDate: baseEvent.end_date,
      pollExpiresAt,
    })

    expect(mocks.inserted.poll_expires_at).toBe(pollExpiresAt)
    expect(event.pollExpiresAt).toBe(pollExpiresAt)
  })

  it('persists clearing an existing expiration when updating a poll', async () => {
    mocks.assertOrganizerOwnsEvent.mockResolvedValue({
      ...baseEvent,
      poll_expires_at: '2026-10-21T12:00:00.000Z',
    })

    const event = await updatePollEvent('poll-id', 'organizer-id', { pollExpiresAt: null })

    expect(mocks.updated).toEqual({ poll_expires_at: null })
    expect(event.pollExpiresAt).toBeNull()
  })

  it('rejects an expiration outside the effective saved schedule before writing', async () => {
    await expect(updatePollEvent('poll-id', 'organizer-id', {
      pollExpiresAt: '2026-10-22T17:01:00.000Z',
    })).rejects.toThrow(/Poll expiration must be between the start and end dates/)

    expect(mocks.db).not.toHaveBeenCalled()
  })

  it('rejects a new event end date that would put its saved expiration out of range', async () => {
    mocks.assertOrganizerOwnsEvent.mockResolvedValue({
      ...baseEvent,
      poll_expires_at: '2026-10-21T12:00:00.000Z',
    })

    await expect(updatePollEvent('poll-id', 'organizer-id', {
      endDate: '2026-10-21T11:00:00.000Z',
    })).rejects.toThrow(/Poll expiration must be between the start and end dates/)

    expect(mocks.db).not.toHaveBeenCalled()
  })
})
