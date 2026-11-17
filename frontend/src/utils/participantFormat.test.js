import { describe, expect, it } from 'vitest'
import {
  eventPath,
  formatDate,
  formatDateTime,
  formatWindow,
  monthHeading,
  outcomeReason,
} from './participantFormat'

describe('participant formatting', () => {
  it('shows an em dash for missing or invalid dates instead of "Invalid Date"', () => {
    for (const value of [null, undefined, '', 'not a date']) {
      expect(formatDate(value)).toBe('—')
      expect(formatDateTime(value)).toBe('—')
    }
    expect(monthHeading(null)).toBe('Date unknown')
  })

  it('formats real dates', () => {
    expect(formatDate('2026-03-12T08:31:00Z')).toMatch(/2026/)
    expect(formatDateTime('2026-03-12T08:31:00Z')).toMatch(/2026/)
    expect(monthHeading('2026-03-12T08:31:00Z')).toMatch(/March 2026|2026/)
  })

  it('formats an event window, a single date, or nothing', () => {
    expect(formatWindow('2026-03-10T00:00:00Z', '2026-03-12T00:00:00Z')).toContain('–')
    expect(formatWindow(null, '2026-03-12T00:00:00Z')).not.toContain('–')
    expect(formatWindow(null, null)).toBe('—')
  })

  it('links each event type to its own page', () => {
    expect(eventPath('election', 'e1')).toBe('/participant/events/e1')
    expect(eventPath('polling', 'p1')).toBe('/participant/polling/events/p1')
    expect(eventPath('competition_scoring', 'c1')).toBe('/participant/competition/events/c1/score')
  })

  it('explains partial and missed outcomes in plain language, and nothing for a clean submission', () => {
    expect(outcomeReason({ outcome: 'Partial', eventType: 'election' })).toMatch(/every section/)
    expect(outcomeReason({ outcome: 'Missed', eventType: 'election' })).toMatch(/ballot/)
    expect(outcomeReason({ outcome: 'Missed', eventType: 'polling' })).toMatch(/poll/)
    expect(outcomeReason({ outcome: 'Missed', eventType: 'competition_scoring' })).toMatch(/round/)
    expect(outcomeReason({ outcome: 'Submitted', eventType: 'election' })).toBeNull()
  })
})
