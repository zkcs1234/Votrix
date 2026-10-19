import { z } from 'zod'

function isValidDateString(val) {
  if (!val) return false
  const d = new Date(val)
  return !Number.isNaN(d.getTime())
}

export function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function localInputToIso(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export const electionEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  description: z.string().max(2000, 'Description must be 2000 characters or less').optional(),
  startDate: z.string().min(1, 'Start date is required').refine(isValidDateString, 'Invalid start date'),
  endDate: z.string().min(1, 'End date is required').refine(isValidDateString, 'Invalid end date'),
  resultsVisibility: z.enum(['real_time', 'hidden', 'public']),
})

export const electionEventSchemaEdit = electionEventSchema.refine(
  (data) => {
    if (!data.startDate || !data.endDate) return true
    return new Date(data.endDate) >= new Date(data.startDate)
  },
  {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  }
)

export const electionEventSchemaStep1 = electionEventSchemaEdit

export const pageantEventSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  description: z.string().max(2000, 'Description must be 2000 characters or less').optional(),
  startDate: z.string().min(1, 'Start date is required').refine(isValidDateString, 'Invalid start date'),
  endDate: z.string().min(1, 'End date is required').refine(isValidDateString, 'Invalid end date'),
})

export const pageantEventSchemaStep1 = pageantEventSchema.refine(
  (data) => {
    if (!data.startDate || !data.endDate) return true
    return new Date(data.endDate) >= new Date(data.startDate)
  },
  {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  }
)

export const pollingEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  description: z.string().max(2000, 'Description must be 2000 characters or less').optional(),
  startDate: z.string().min(1, 'Start date is required').refine(isValidDateString, 'Invalid start date'),
  endDate: z.string().min(1, 'End date is required').refine(isValidDateString, 'Invalid end date'),
  pollExpiresAt: z.string().nullable().optional().refine(
    (value) => value == null || value === '' || isValidDateString(value),
    'Invalid expiration date',
  ),
  pollAnonymous: z.boolean().optional(),
  pollAllowMultipleSubmissions: z.boolean().optional(),
})

export const pollingEventSchemaEdit = pollingEventSchema.superRefine((data, context) => {
  if (data.startDate && data.endDate && new Date(data.endDate) < new Date(data.startDate)) {
    context.addIssue({
      code: 'custom',
      message: 'End date must be on or after start date',
      path: ['endDate'],
    })
  }

  if (
    data.pollExpiresAt &&
    isValidDateString(data.pollExpiresAt) &&
    isValidDateString(data.startDate) &&
    isValidDateString(data.endDate) &&
    (new Date(data.pollExpiresAt) < new Date(data.startDate) ||
      new Date(data.pollExpiresAt) > new Date(data.endDate))
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Expiration date must be between start and end dates',
      path: ['pollExpiresAt'],
    })
  }
})

export const pollingEventSchemaStep1 = pollingEventSchemaEdit
export const pollingEventSchemaStep3 = pollingEventSchemaEdit
