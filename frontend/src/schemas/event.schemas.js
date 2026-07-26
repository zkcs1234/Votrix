import { z } from 'zod'

export const electionEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  description: z.string().max(2000, 'Description must be 2000 characters or less').optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
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
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

export const pageantEventSchemaStep1 = pageantEventSchema.omit({
  startDate: true,
  endDate: true,
})

export const pollingEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  description: z.string().max(2000, 'Description must be 2000 characters or less').optional(),
  pollAnonymous: z.boolean().optional(),
  pollAllowMultipleSubmissions: z.boolean().optional(),
  pollExpiresAt: z.string().optional(),
})

export const pollingEventSchemaEdit = pollingEventSchema

export const pollingEventSchemaStep1 = pollingEventSchemaEdit

export const pollingEventSchemaStep3 = pollingEventSchema