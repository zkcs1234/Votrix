import { z } from 'zod'
import { FORM_LIMITS } from '../../../shared/form-rules.js'
import { requiredText } from './people.schemas'

// Form values from <input type="number"> arrive as strings, so these schemas
// validate the text and the page converts to numbers on submit. The rules match
// backend/src/validators/election.validator.js.

const wholeNumber = (label, min) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d+$/, `${label} must be a whole number`)
    .refine((value) => Number(value) >= min, `${label} must be at least ${min}`)

export const positionSchema = z
  .object({
    name: requiredText('Position name'),
    description: z.string().default(''),
    numberOfWinners: wholeNumber('Number of winners', 1),
    maxVote: wholeNumber('Maximum selections', 1),
    // Blank means "put it at the end"; otherwise a whole number, 0 or higher.
    displayOrder: z
      .string()
      .trim()
      .refine((value) => value === '' || /^\d+$/.test(value), 'Display order must be a whole number, 0 or higher'),
    eligibilityMode: z.enum(['all', 'programs']),
    selectedPrograms: z.array(z.string()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.eligibilityMode === 'programs' && !data.selectedPrograms.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['selectedPrograms'],
        message: 'Select at least one program, or allow all voters in the group',
      })
    }
  })

export const POSITION_DEFAULTS = {
  name: '',
  description: '',
  numberOfWinners: '1',
  maxVote: '1',
  displayOrder: '',
  eligibilityMode: 'all',
  selectedPrograms: [],
}

export const candidateSchema = z.object({
  positionId: z.string().min(1, 'Select a position'),
  name: requiredText('Name'),
  party: z.string().trim().max(FORM_LIMITS.text, `Party must be ${FORM_LIMITS.text} characters or fewer`),
  biography: z.string(),
  platform: z.string(),
})

export const CANDIDATE_DEFAULTS = { positionId: '', name: '', party: '', biography: '', platform: '' }

/**
 * An election group (ballot section) name: required, at most 255 characters and
 * unique within the election (case-insensitive). `otherNames` is every OTHER
 * group's name, so renaming a group to its own current name is allowed.
 */
export function buildGroupNameSchema(otherNames = []) {
  const taken = new Set(otherNames.map((n) => String(n).trim().toLowerCase()))
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Election group name is required')
      .max(FORM_LIMITS.text, `Election group name must be ${FORM_LIMITS.text} characters or fewer`)
      .refine((value) => !taken.has(value.toLowerCase()), 'An election group with this name already exists'),
  })
}
