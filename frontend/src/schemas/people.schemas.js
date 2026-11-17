import { z } from 'zod'
import { EMAIL_RE, FORM_LIMITS } from '../../../shared/form-rules.js'

// Schemas for the admin / organizer "people" forms. They mirror the server's
// rules (shared/form-rules.js + backend validators) so the user is told about a
// problem while typing instead of after pressing the submit button. The server
// stays authoritative: duplicates and permission checks still come back from it
// and are attached to the right field by useLiveForm.

const MAX = FORM_LIMITS.text

export const emailField = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(MAX, `Email must be ${MAX} characters or fewer`)
  .regex(EMAIL_RE, 'Enter a valid email address, like name@example.com')

export function requiredText(label, max = MAX) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`)
}

export function optionalText(label, max = MAX) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .optional()
    .default('')
}

// A program the server will accept. When the list has not loaded yet (or is
// empty) only presence is checked; the form shows its own "no programs" notice.
function programField(programs, label = 'Program') {
  return z
    .string()
    .trim()
    .min(1, `Select a ${label.toLowerCase()}`)
    .refine(
      (value) =>
        !value ||
        !programs?.length ||
        programs.some((p) => String(p).toLowerCase() === value.toLowerCase()),
      `${label} is not in the program list`,
    )
}

/** Add student (admin). `programs` is the loaded programs list. */
export function buildStudentSchema(programs = []) {
  return z.object({
    email: emailField,
    firstName: requiredText('First name'),
    lastName: requiredText('Last name'),
    schoolId: requiredText('School ID'),
    program: programField(programs),
  })
}

/** Edit student: the email is locked, so it is not validated. */
export function buildEditStudentSchema(programs = []) {
  return buildStudentSchema(programs).omit({ email: true })
}

// Keywords found in server messages -> field, for useLiveForm.serverFieldMap.
export const STUDENT_SERVER_FIELDS = {
  email: ['email'],
  firstName: ['first name'],
  lastName: ['last name'],
  schoolId: ['school id'],
  program: ['program'],
}

export const ORGANIZATION_TYPES = ['Co-curricular', 'Extra-curricular']

/** Admin create / edit organizer. */
export function buildOrganizerSchema({ isEdit = false, programs = [] } = {}) {
  return z
    .object({
      email: isEdit ? z.string().optional() : emailField,
      organizerName: requiredText('Organizer name'),
      position: requiredText('Position'),
      organizationName: requiredText('Organization name'),
      organizationType: requiredText('Organization type'),
      scopeType: z.enum(['all', 'scoped'], { message: 'Choose who this organizer can manage' }),
      programs: z.array(z.string()).default([]),
    })
    .superRefine((data, ctx) => {
      if (data.scopeType !== 'scoped') return
      if (!data.programs.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['programs'],
          message: programs.length
            ? 'Select at least one program for a scoped organizer'
            : 'No programs are available, so a scoped organizer cannot be created yet',
        })
      }
    })
}

export const ORGANIZER_SERVER_FIELDS = {
  email: ['email'],
  organizerName: ['organizer name'],
  position: ['position'],
  organizationName: ['organization name'],
  organizationType: ['organization type'],
  scopeType: ['access scope', 'scope'],
  programs: ['program'],
}

/** Judge create / edit. Email is locked when editing. */
export function buildJudgeSchema({ isEdit = false } = {}) {
  return z.object({
    email: isEdit ? z.string().optional() : emailField,
    firstName: requiredText('First name'),
    lastName: requiredText('Last name'),
    expertise: optionalText('Expertise'),
    title: optionalText('Title'),
    affiliation: optionalText('Affiliation'),
  })
}

export const JUDGE_SERVER_FIELDS = {
  email: ['email'],
  firstName: ['first name'],
  lastName: ['last name'],
}

/** Organizer invitation (admin). */
export const invitationSchema = z.object({
  email: emailField,
  expiresInDays: z.coerce
    .number({ message: 'Enter the number of days' })
    .int('Use a whole number of days')
    .min(FORM_LIMITS.invitationExpiryMinDays, `Must be at least ${FORM_LIMITS.invitationExpiryMinDays} day`)
    .max(FORM_LIMITS.invitationExpiryMaxDays, `Cannot be more than ${FORM_LIMITS.invitationExpiryMaxDays} days`),
  note: optionalText('Note', FORM_LIMITS.invitationNote),
})

/** Assign an officer (organizer): a chosen student plus a position title. */
export const officerSchema = z.object({
  studentId: z.string({ message: 'Select a student' }).min(1, 'Select a student'),
  position: requiredText('Position'),
})
