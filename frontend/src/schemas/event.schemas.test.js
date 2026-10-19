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
  it('validates the event schedule without a separate expiration field', () => {
    expect(pollingEventSchemaStep1.safeParse(validPoll).success).toBe(true)
    expect(pollingEventSchemaStep3.safeParse(validPoll).success).toBe(true)
  })

  it('rejects an event end before its start', () => {
    const invalidRange = pollingEventSchemaStep1.safeParse({
      ...validPoll,
      endDate: '2026-10-20T08:59',
    })
    expect(invalidRange.success).toBe(false)
    expect(invalidRange.error.issues).toContainEqual(expect.objectContaining({
      path: ['endDate'],
      message: 'End date must be on or after start date',
    }))
  })
})
