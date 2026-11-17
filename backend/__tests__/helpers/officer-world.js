import { createFakeSupabase } from './fake-supabase.js'

// One consistent set of accounts for the student-officer tests.
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const IDS = {
  ORG: id(0xa1), // organizer, scoped to BSCS
  ORG2: id(0xa2), // a different organizer (all access)
  ADMIN: id(0xad),
  S1: id(0xb1), // BSCS 3-A student
  S2: id(0xb2), // BSIT 3-B student (outside ORG's scope)
  S3: id(0xb3), // BSCS 3-B student
  JUDGE: id(0xb4), // judge account, not a student
  ARCHIVED: id(0xb5), // archived BSCS student
}

const student = (userId, n, program, extra = {}) => ({
  id: userId,
  email: `student${n}@example.com`,
  role: 'participant',
  account_status: 'active',
  token_version: 0,
  must_change_password: false,
  first_name: `First${n}`,
  last_name: `Last${n}`,
  school_id: `2024-000${n}`,
  program,
  ...extra,
})

export function makeWorld({ orgScope = { scopeType: 'scoped', programs: ['BSCS'] }, extra = {} } = {}) {
  return createFakeSupabase({
    users: [
      {
        id: IDS.ORG, email: 'org@example.com', role: 'organizer', account_status: 'active',
        token_version: 7, must_change_password: false,
        organization_name: 'Computing Society', organizer_name: 'Ada Lovelace', position: 'Adviser',
        organization_type_display: 'Co-curricular', scope: orgScope,
      },
      {
        id: IDS.ORG2, email: 'org2@example.com', role: 'organizer', account_status: 'active',
        token_version: 3, must_change_password: false,
        organization_name: 'Drama Club', organizer_name: 'Grace', position: 'Adviser',
        organization_type_display: 'Extra-curricular', scope: { scopeType: 'all', programs: [] },
      },
      { id: IDS.ADMIN, email: 'admin@example.com', role: 'admin', account_status: 'active', token_version: 0 },
      student(IDS.S1, 1, 'BSCS'),
      student(IDS.S2, 2, 'BSIT'),
      student(IDS.S3, 3, 'BSCS'),
      student(IDS.JUDGE, 4, null),
      student(IDS.ARCHIVED, 5, 'BSCS', { account_status: 'archived' }),
    ],
    user_participant_types: [
      { user_id: IDS.S1, participant_type: 'STUDENT', is_active: true },
      { user_id: IDS.S2, participant_type: 'STUDENT', is_active: true },
      { user_id: IDS.S3, participant_type: 'STUDENT', is_active: true },
      { user_id: IDS.ARCHIVED, participant_type: 'STUDENT', is_active: true },
      { user_id: IDS.JUDGE, participant_type: 'JUDGE', is_active: true },
    ],
    organization_officers: [],
    audit_logs: [],
    ...extra,
  })
}

export const activeOfficerRow = (studentId, organizerId = IDS.ORG, overrides = {}) => ({
  id: id(0xc000 + Number(studentId.slice(-2), 16)),
  organizer_id: organizerId,
  student_id: studentId,
  position: 'President',
  status: 'active',
  assigned_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
})
