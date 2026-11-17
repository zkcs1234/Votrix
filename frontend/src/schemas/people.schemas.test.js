import { describe, expect, it } from 'vitest'
import {
  buildEditStudentSchema,
  buildJudgeSchema,
  buildOrganizerSchema,
  buildStudentSchema,
  invitationSchema,
  officerSchema,
} from './people.schemas'
import { changePasswordSchema, loginSchema } from './auth.schemas'

// react-hook-form shows the FIRST issue for each field, so mirror that here.
const messages = (result) => {
  const out = {}
  for (const i of result.error.issues) out[i.path.join('.')] ??= i.message
  return out
}

const validStudent = {
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'Cruz',
  schoolId: '2024-12345',
  program: 'BSIT',
}

describe('student schema', () => {
  const schema = buildStudentSchema(['BSIT', 'BSCS'])

  it('accepts a complete student and trims text', () => {
    const result = schema.safeParse({ ...validStudent, firstName: '  Ana  ' })
    expect(result.success).toBe(true)
    expect(result.data.firstName).toBe('Ana')
  })

  it('flags each bad field with its own message', () => {
    const result = schema.safeParse({ email: 'nope', firstName: '   ', lastName: '', schoolId: '', program: '' })
    expect(messages(result)).toMatchObject({
      email: 'Enter a valid email address, like name@example.com',
      firstName: 'First name is required',
      lastName: 'Last name is required',
      schoolId: 'School ID is required',
      program: 'Select a program',
    })
  })

  it('rejects a program that is not in the list, case-insensitively accepting a listed one', () => {
    expect(messages(schema.safeParse({ ...validStudent, program: 'BSXYZ' })).program).toBe(
      'Program is not in the program list',
    )
    expect(schema.safeParse({ ...validStudent, program: 'bscs' }).success).toBe(true)
  })

  it('does not reject by list while programs are still loading', () => {
    expect(buildStudentSchema([]).safeParse(validStudent).success).toBe(true)
  })

  it('enforces the 255-character limit the server enforces', () => {
    const result = schema.safeParse({ ...validStudent, lastName: 'x'.repeat(256) })
    expect(messages(result).lastName).toBe('Last name must be 255 characters or fewer')
  })

  it('edit schema ignores the locked email', () => {
    const rest = { ...validStudent }
    delete rest.email
    expect(buildEditStudentSchema(['BSIT']).safeParse(rest).success).toBe(true)
  })
})

describe('organizer schema', () => {
  const base = {
    email: 'org@example.com',
    organizerName: 'Jo',
    position: 'Adviser',
    organizationName: 'SSG',
    organizationType: 'Co-curricular',
    scopeType: 'all',
    programs: [],
  }

  it('accepts all-scope without programs', () => {
    expect(buildOrganizerSchema().safeParse(base).success).toBe(true)
  })

  it('requires at least one program for scoped organizers', () => {
    const result = buildOrganizerSchema({ programs: ['BSIT'] }).safeParse({ ...base, scopeType: 'scoped' })
    expect(messages(result).programs).toBe('Select at least one program for a scoped organizer')
  })

  it('requires a scope choice', () => {
    expect(messages(buildOrganizerSchema().safeParse({ ...base, scopeType: '' })).scopeType).toBe(
      'Choose who this organizer can manage',
    )
  })

  it('skips email validation when editing', () => {
    expect(buildOrganizerSchema({ isEdit: true }).safeParse({ ...base, email: '' }).success).toBe(true)
  })
})

describe('judge, invitation and officer schemas', () => {
  it('judge needs email and names; extras are optional', () => {
    expect(
      buildJudgeSchema().safeParse({ email: 'j@example.com', firstName: 'J', lastName: 'D' }).success,
    ).toBe(true)
    expect(messages(buildJudgeSchema().safeParse({ email: '', firstName: '', lastName: '' }))).toMatchObject({
      email: 'Email is required',
      firstName: 'First name is required',
    })
  })

  it('invitation expiry must be a whole number from 1 to 30', () => {
    const ok = { email: 'a@b.co', expiresInDays: 7, note: '' }
    expect(invitationSchema.safeParse(ok).success).toBe(true)
    expect(messages(invitationSchema.safeParse({ ...ok, expiresInDays: 0 })).expiresInDays).toMatch(/at least 1/)
    expect(messages(invitationSchema.safeParse({ ...ok, expiresInDays: 31 })).expiresInDays).toMatch(/more than 30/)
    expect(messages(invitationSchema.safeParse({ ...ok, expiresInDays: 2.5 })).expiresInDays).toMatch(/whole number/)
  })

  it('invitation note is capped at 500', () => {
    const result = invitationSchema.safeParse({ email: 'a@b.co', expiresInDays: 7, note: 'n'.repeat(501) })
    expect(messages(result).note).toBe('Note must be 500 characters or fewer')
  })

  it('officer needs a chosen student and a position', () => {
    expect(messages(officerSchema.safeParse({ studentId: null, position: ' ' }))).toMatchObject({
      studentId: 'Select a student',
      position: 'Position is required',
    })
  })
})

describe('auth schemas share the server rules', () => {
  it('login email uses the same pattern as the backend', () => {
    expect(messages(loginSchema.safeParse({ email: 'bad', password: 'x' })).email).toBe('Enter a valid email')
    expect(loginSchema.safeParse({ email: ' a@b.co ', password: 'x' }).success).toBe(true)
  })

  it('password rules read from the shared limit', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'old',
      newPassword: 'short',
      confirmPassword: 'short',
    })
    expect(messages(result).newPassword).toBe('Password must be at least 8 characters')
  })
})
