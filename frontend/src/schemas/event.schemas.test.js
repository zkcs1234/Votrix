import { describe, expect, it } from 'vitest'
import { pollingEventSchemaStep1, pollingEventSchemaStep3 } from './event.schemas'

const validPoll = {
  title: 'Campus poll',
  startDate: '2026-10-20T09:00',
  endDate: '2026-10-22T17:00',
  pollAnonymous: false,
  pollAllowMultipleSubmissions: false,
}

describe('polling event date validation', () => {
  it('allows an omitted or cleared optional expiration', () => {
    expect(pollingEventSchemaStep1.safeParse(validPoll).success).toBe(true)
    expect(pollingEventSchemaStep3.safeParse({ ...validPoll, pollExpiresAt: null }).success).toBe(true)
    expect(pollingEventSchemaStep3.safeParse({ ...validPoll, pollExpiresAt: '' }).success).toBe(true)
  })

  it('allows expiration at either schedule boundary and within the schedule', () => {
    for (const pollExpiresAt of [
      validPoll.startDate,
      '2026-10-21T12:00',
      validPoll.endDate,
    ]) {
      expect(pollingEventSchemaStep3.safeParse({ ...validPoll, pollExpiresAt }).success).toBe(true)
    }
  })

  it.each(['2026-10-20T08:59', '2026-10-22T17:01'])(
    'rejects expiration outside the event schedule (%s)',
    pollExpiresAt => {
      const result = pollingEventSchemaStep3.safeParse({ ...validPoll, pollExpiresAt })
      expect(result.success).toBe(false)
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ['pollExpiresAt'],
        message: 'Expiration date must be between start and end dates',
      }))
    },
  )

  it('keeps end-after-start validation and reports malformed expiration', () => {
    const invalidRange = pollingEventSchemaStep1.safeParse({
      ...validPoll,
      endDate: '2026-10-20T08:59',
    })
    expect(invalidRange.success).toBe(false)
    expect(invalidRange.error.issues).toContainEqual(expect.objectContaining({
      path: ['endDate'],
      message: 'End date must be on or after start date',
    }))

    const invalidExpiration = pollingEventSchemaStep3.safeParse({
      ...validPoll,
      pollExpiresAt: 'not-a-date',
    })
    expect(invalidExpiration.success).toBe(false)
    expect(invalidExpiration.error.issues).toContainEqual(expect.objectContaining({
      path: ['pollExpiresAt'],
      message: 'Invalid expiration date',
    }))
  })
})
