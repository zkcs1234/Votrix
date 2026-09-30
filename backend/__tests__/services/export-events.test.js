import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../src/services/admin.service.js', () => ({
  getOrganizersList: vi.fn(),
  getGlobalEvents: vi.fn(),
}))
vi.mock('../../src/services/admin-participant.service.js', () => ({
  listVoters: vi.fn(),
  listJudges: vi.fn(),
}))
vi.mock('../../src/foundation/audit.js', () => ({
  listAuditTrail: vi.fn(),
}))

import { getGlobalEvents } from '../../src/services/admin.service.js'
import { listJudges } from '../../src/services/admin-participant.service.js'
import { exportEventsCSV, exportJudgesCSV } from '../../src/services/export.service.js'

describe('exportEventsCSV', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('applies status, competition aliases, and title or organization search', async () => {
    getGlobalEvents.mockResolvedValue([
      {
        title: 'Campus Showcase',
        event_type: 'pageant',
        status: 'active',
        organizations: { organization_name: 'Arts Department' },
      },
      {
        title: 'Design Awards',
        event_type: 'competition_scoring',
        status: 'active',
        organizations: { organization_name: 'Engineering' },
      },
      {
        title: 'Campus Election',
        event_type: 'election',
        status: 'active',
        organizations: { organization_name: 'Arts Department' },
      },
      {
        title: 'Past Showcase',
        event_type: 'pageant',
        status: 'completed',
        organizations: { organization_name: 'Arts Department' },
      },
    ])

    const csv = await exportEventsCSV({ type: 'competition', status: 'active', search: 'arts department' })

    expect(csv).toContain('Campus Showcase')
    expect(csv).not.toContain('Design Awards')
    expect(csv).not.toContain('Campus Election')
    expect(csv).not.toContain('Past Showcase')
  })

  test('does not filter when filters are omitted', async () => {
    getGlobalEvents.mockResolvedValue([
      { title: 'Election', event_type: 'election', status: 'active' },
      { title: 'Poll', event_type: 'polling', status: 'scheduled' },
    ])

    const csv = await exportEventsCSV()

    expect(csv).toContain('Election')
    expect(csv).toContain('Poll')
  })

  test('exports expertise without optional legacy profile columns', async () => {
    listJudges.mockResolvedValue({
      judges: [{
        email: 'judge@example.com',
        firstName: 'Sam',
        lastName: 'Lee',
        profileData: { title: 'Dr.', affiliation: 'Legacy Org', expertise: 'Design' },
      }],
      total: 1,
    })

    const csv = await exportJudgesCSV()

    expect(csv.split('\n')[0]).toBe('email,first_name,last_name,expertise,account_status,created_at')
    expect(csv).toContain('Design')
    expect(csv).not.toContain('Legacy Org')
  })
})