import { z } from 'zod'

function isValidDateString(val) {
  if (!val) return false
  const d = new Date(val)
  return !Number.isNaN(d.getTime())
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
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
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
  pollAnonymous: z.boolean().optional(),
  pollAllowMultipleSubmissions: z.boolean().optional(),
  pollExpiresAt: z.string().optional(),
})

export const pollingEventSchemaEdit = pollingEventSchema.refine(
  (data) => {
    if (!data.startDate || !data.endDate) return true
    return new Date(data.endDate) >= new Date(data.startDate)
  },
  {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  }
)

export const pollingEventSchemaStep1 = pollingEventSchemaEdit

export const pollingEventSchemaStep3 = pollingEventSchema
