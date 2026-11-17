import { describe, expect, it } from 'vitest'
import {
  assertChangeReason,
  assertEventOperational,
  assertPublishedEventUpdate,
  buildEditPolicy,
  getEventChanges,
  summarizeChanges,
  validateChangeReasonShape,
} from '../../src/utils/eventLifecycle.js'

const NOW = new Date('2026-06-15T12:00:00Z')
const PAST = '2026-06-10T08:00:00Z'
const FUTURE = '2026-06-20T08:00:00Z'
const LATER = '2026-06-25T08:00:00Z'

const event = (overrides = {}) => ({
  status: 'draft',
  title: 'Student Council 2026',
  description: 'Vote for your officers',
  banner: 'https://img/banner.png',
  image_asset_id: 'asset-1',
  start_date: PAST,
  end_date: FUTURE,
  poll_expires_at: null,
  results_visibility: 'public',
  ...overrides,
})

const reason = 'Fixing a typo reported by the adviser'

describe('getEventChanges', () => {
  it('ignores fields that were resubmitted unchanged', () => {
    const changes = getEventChanges(event(), {
      title: 'Student Council 2026',
      description: 'Vote for your officers',
      startDate: '2026-06-10T08:00:00.000Z', // same instant, different format
      endDate: FUTURE,
      status: 'draft',
    })
    expect(changes).toEqual([])
  })

  it('treats null, empty and undefined values as the same blank', () => {
    expect(getEventChanges(event({ description: null }), { description: '' })).toEqual([])
    expect(getEventChanges(event({ banner: null }), { banner: null })).toEqual([])
  })

  it('tags each real change with its edit class', () => {
    const changes = getEventChanges(event(), {
      title: 'New',
      endDate: LATER,
      resultsVisibility: 'hidden',
    })
    expect(Object.fromEntries(changes.map((c) => [c.key, c.cls]))).toEqual({
      title: 'safe',
      endDate: 'schedule',
      resultsVisibility: 'integrity',
    })
  })

  it('summarizes changes as field: [from, to]', () => {
    const changes = getEventChanges(event(), { title: 'New title' })
    expect(summarizeChanges(changes)).toEqual({ title: ['Student Council 2026', 'New title'] })
  })
})

describe('assertPublishedEventUpdate', () => {
  it('lets draft events change anything without a reason', () => {
    expect(() =>
      assertPublishedEventUpdate(event(), { title: 'X', resultsVisibility: 'hidden', startDate: PAST }, { now: NOW }),
    ).not.toThrow()
  })

  it('allows a no-op resubmit on every status', () => {
    for (const status of ['draft', 'scheduled', 'active', 'completed', 'cancelled', 'archived']) {
      expect(() =>
        assertPublishedEventUpdate(event({ status }), { title: 'Student Council 2026', status }, { now: NOW }),
      ).not.toThrow()
    }
  })

  it('blocks every real change on completed, cancelled and archived events', () => {
    for (const status of ['completed', 'cancelled', 'archived']) {
      expect(() =>
        assertPublishedEventUpdate(event({ status }), { title: 'Other', changeReason: reason }, { now: NOW }),
      ).toThrow(/can no longer be edited/i)
    }
  })

  describe('scheduled (published, not open)', () => {
    const scheduled = event({ status: 'scheduled', start_date: FUTURE, end_date: LATER })

    it('allows safe edits with a reason and returns the changes', () => {
      const changes = assertPublishedEventUpdate(
        scheduled,
        { title: 'Corrected title', changeReason: reason },
        { now: NOW },
      )
      expect(changes.map((c) => c.key)).toEqual(['title'])
    })

    it('requires a reason', () => {
      expect(() => assertPublishedEventUpdate(scheduled, { title: 'Corrected title' }, { now: NOW })).toThrow(
        /reason/i,
      )
      expect(() =>
        assertPublishedEventUpdate(scheduled, { title: 'Corrected title', changeReason: '  ab ' }, { now: NOW }),
      ).toThrow(/reason/i)
    })

    it('allows moving the schedule to a future time', () => {
      expect(() =>
        assertPublishedEventUpdate(
          scheduled,
          { startDate: '2026-06-18T08:00:00Z', changeReason: reason },
          { now: NOW },
        ),
      ).not.toThrow()
    })

    it('rejects a start date in the past', () => {
      expect(() =>
        assertPublishedEventUpdate(scheduled, { startDate: PAST, changeReason: reason }, { now: NOW }),
      ).toThrow(/future/i)
    })

    it('rejects integrity changes and tells the organizer to unpublish', () => {
      expect(() =>
        assertPublishedEventUpdate(scheduled, { resultsVisibility: 'hidden', changeReason: reason }, { now: NOW }),
      ).toThrow(/Unpublish it back to draft.*resultsVisibility/i)
    })

    it('rejects a status change through the update payload', () => {
      expect(() =>
        assertPublishedEventUpdate(scheduled, { status: 'active', changeReason: reason }, { now: NOW }),
      ).toThrow(/status/)
    })
  })

  describe('active (live)', () => {
    const active = event({ status: 'active' })

    it('allows safe edits with a reason', () => {
      expect(() =>
        assertPublishedEventUpdate(
          active,
          { description: 'Corrected description', changeReason: reason },
          { now: NOW },
        ),
      ).not.toThrow()
    })

    it('allows extending the end date', () => {
      expect(() =>
        assertPublishedEventUpdate(active, { endDate: LATER, changeReason: reason }, { now: NOW }),
      ).not.toThrow()
    })

    it('rejects shortening the end date', () => {
      expect(() =>
        assertPublishedEventUpdate(
          active,
          { endDate: '2026-06-16T08:00:00Z', changeReason: reason },
          { now: NOW },
        ),
      ).toThrow(/extended/i)
    })

    it('rejects changing the start date', () => {
      expect(() =>
        assertPublishedEventUpdate(active, { startDate: '2026-06-01T08:00:00Z', changeReason: reason }, { now: NOW }),
      ).toThrow(/start date cannot be changed/i)
    })

    it('rejects integrity changes and mentions pause and revise', () => {
      expect(() =>
        assertPublishedEventUpdate(active, { resultsVisibility: 'hidden', changeReason: reason }, { now: NOW }),
      ).toThrow(/pause the event/i)
    })

    it('only lets a poll expiry move later or be removed', () => {
      const poll = event({ status: 'active', poll_expires_at: FUTURE })
      expect(() =>
        assertPublishedEventUpdate(poll, { pollExpiresAt: LATER, changeReason: reason }, { now: NOW }),
      ).not.toThrow()
      expect(() =>
        assertPublishedEventUpdate(poll, { pollExpiresAt: null, changeReason: reason }, { now: NOW }),
      ).not.toThrow()
      expect(() =>
        assertPublishedEventUpdate(poll, { pollExpiresAt: '2026-06-16T08:00:00Z', changeReason: reason }, { now: NOW }),
      ).toThrow(/later or removed/i)
      expect(() =>
        assertPublishedEventUpdate(
          event({ status: 'active', poll_expires_at: null }),
          { pollExpiresAt: LATER, changeReason: reason },
          { now: NOW },
        ),
      ).toThrow(/later or removed/i)
    })

    it('requires a reason', () => {
      expect(() => assertPublishedEventUpdate(active, { endDate: LATER }, { now: NOW })).toThrow(/reason/i)
    })
  })
})

describe('change reason helpers', () => {
  it('accepts a long enough reason and rejects a short one', () => {
    expect(() => assertChangeReason(reason)).not.toThrow()
    expect(() => assertChangeReason('no')).toThrow(/at least 5/)
    expect(() => assertChangeReason(undefined)).toThrow(/reason/i)
  })

  it('validates the reason shape', () => {
    expect(validateChangeReasonShape(undefined)).toBeUndefined()
    expect(validateChangeReasonShape('  ok reason  ')).toBe('ok reason')
    expect(() => validateChangeReasonShape('x'.repeat(501))).toThrow(/500/)
  })
})

describe('buildEditPolicy', () => {
  it('lets a draft be edited freely', () => {
    const policy = buildEditPolicy({ status: 'draft' })
    expect(policy).toMatchObject({
      setupLocked: false,
      reasonRequired: false,
      canUnpublish: false,
      canPauseRevise: false,
      liveEditableFields: [],
    })
  })

  it('offers unpublish and live schedule edits while scheduled', () => {
    const policy = buildEditPolicy({ status: 'scheduled' })
    expect(policy).toMatchObject({ setupLocked: true, reasonRequired: true, canUnpublish: true, canPauseRevise: false })
    expect(policy.liveEditableFields).toEqual(
      expect.arrayContaining(['title', 'description', 'banner', 'startDate', 'endDate']),
    )
  })

  it('offers pause and revise only while active with no activity', () => {
    expect(buildEditPolicy({ status: 'active' }, { hasActivity: false }).canPauseRevise).toBe(true)
    expect(buildEditPolicy({ status: 'active' }, { hasActivity: true }).canPauseRevise).toBe(false)
    expect(buildEditPolicy({ status: 'active' }, { supportsPause: false }).canPauseRevise).toBe(false)
  })

  it('limits an active event to safe fields and end-date extension', () => {
    const policy = buildEditPolicy({ status: 'active' })
    expect(policy.liveEditableFields).not.toContain('startDate')
    expect(policy.liveEditableFields).toContain('endDate')
    expect(policy.endDateExtendOnly).toBe(true)
  })

  it('offers nothing once the event is closed', () => {
    const policy = buildEditPolicy({ status: 'completed' })
    expect(policy).toMatchObject({ isTerminal: true, canUnpublish: false, canPauseRevise: false, liveEditableFields: [] })
  })
})

describe('assertEventOperational', () => {
  it('blocks operational activity for archived events', () => {
    expect(() => assertEventOperational({ status: 'archived' })).toThrow(
      /archived.*no longer accepting activity/i,
    )
  })

  it('allows operational activity for non-archived events', () => {
    expect(() => assertEventOperational({ status: 'active' })).not.toThrow()
  })
})
