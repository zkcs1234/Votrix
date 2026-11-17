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
import { listAuditTrail } from '../../src/foundation/audit.js'
import { exportEventsCSV, exportJudgesCSV, exportAuditLogsCSV } from '../../src/services/export.service.js'

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

  test('exports every judge profile field, including those the import template accepts', async () => {
    listJudges.mockResolvedValue({
      judges: [{
        id: 'j1',
        email: 'judge@example.com',
        firstName: 'Sam',
        lastName: 'Lee',
        profileData: { title: 'Dr.', affiliation: 'Design Guild', expertise: 'Design' },
        accountStatus: 'active',
        mustChangePassword: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
      total: 1,
    })

    const csv = await exportJudgesCSV()
    const [header, row] = csv.split('\n')

    expect(header).toBe('judge_id,email,first_name,last_name,title,affiliation,expertise,account_status,password_change_pending,events_assigned,created_at')
    expect(row).toContain('Dr.')
    expect(row).toContain('Design Guild')
    expect(row).toContain('Design')
    expect(row).toContain('true')
  })

  test('the judge export header is accepted by the import, so a round trip needs no editing', async () => {
    listJudges.mockResolvedValue({ judges: [{ email: 'a@b.co', firstName: 'A', lastName: 'B', profileData: {} }], total: 1 })
    const header = (await exportJudgesCSV()).split('\n')[0].split(',')
    for (const column of ['email', 'first_name', 'last_name', 'title', 'affiliation', 'expertise']) {
      expect(header).toContain(column)
    }
  })
})

describe('events export carries more than the table shows', () => {
  beforeEach(() => vi.clearAllMocks())

  test('adds id, description, organizer and timestamps, and keeps multi-line text in one cell', async () => {
    getGlobalEvents.mockResolvedValue([
      {
        id: 'e1',
        title: 'Campus Election',
        description: 'Line one\nLine two',
        event_type: 'election',
        status: 'active',
        start_date: '2026-03-01T00:00:00.000Z',
        end_date: '2026-03-02T00:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
        organizations: { organization_name: 'SSG', organizer: { id: 'u1', email: 'org@example.com', organizer_name: 'Jo Reyes' } },
      },
    ])
    const csv = await exportEventsCSV()
    const header = csv.split('\n')[0].split(',')
    for (const column of ['event_id', 'description', 'organization', 'organizer_name', 'organizer_email', 'participants_enrolled', 'updated_at']) {
      expect(header).toContain(column)
    }
    expect(csv).toContain('e1')
    expect(csv).toContain('org@example.com')
    expect(csv).toContain('Jo Reyes')
    expect(csv).toContain('"Line one\nLine two"')
  })

  test('a spreadsheet formula in user text is stored as text, not run', async () => {
    getGlobalEvents.mockResolvedValue([
      { id: 'e2', title: '=HYPERLINK("http://evil.test")', event_type: 'polling', status: 'draft', organizations: {} },
    ])
    const csv = await exportEventsCSV()
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m)
  })
})

describe('audit export', () => {
  beforeEach(() => vi.clearAllMocks())

  test('pages through the whole trail instead of stopping at the first 200 rows, and prints details as JSON', async () => {
    const make = (n, offset) => Array.from({ length: n }, (_, i) => ({
      created_at: '2026-01-01T00:00:00.000Z',
      action: `A${offset + i}`,
      entity: 'users',
      entity_id: 'x',
      user_id: 'u',
      users: { email: 'admin@example.com', role: 'admin' },
      details: { reason: 'because' },
    }))
    listAuditTrail
      .mockResolvedValueOnce({ rows: make(200, 0), total: 450 })
      .mockResolvedValueOnce({ rows: make(200, 200), total: 450 })
      .mockResolvedValueOnce({ rows: make(50, 400), total: 450 })

    const csv = await exportAuditLogsCSV({ startDate: '2026-01-01' })

    expect(listAuditTrail).toHaveBeenCalledTimes(3)
    expect(listAuditTrail).toHaveBeenNthCalledWith(2, expect.objectContaining({ limit: 200, offset: 200, startDate: '2026-01-01' }))
    expect(csv.trim().split('\n')).toHaveLength(451) // header + 450 rows
    expect(csv).toContain('admin@example.com')
    expect(csv).toContain('{""reason"":""because""}')
    expect(csv).not.toContain('[object Object]')
  })
})
