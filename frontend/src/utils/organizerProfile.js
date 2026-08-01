import { z } from 'zod'

export const profileSchema = z.object({
  organizationName: z.string().trim().min(1, 'Organization name is required'),
  organizationType: z.string().trim().min(1, 'Organization type is required'),
  organizerName: z.string().trim().min(1, 'Your name is required'),
  position: z.string().trim().min(1, 'Position is required'),
})

export const ORGANIZATION_TYPE_OPTIONS = [
  'Student Organization',
  'Academic Department',
  'College Office',
  'University Office',
  'Student Council',
  'Committee',
  'Others',
]
