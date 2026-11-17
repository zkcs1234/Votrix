import { z } from 'zod'
import { EMAIL_RE, FORM_LIMITS } from '../../../shared/form-rules.js'

// Same email rule the server applies (shared/form-rules.js), so the form and
// the API never disagree about what a valid address is.
const email = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .regex(EMAIL_RE, 'Enter a valid email')

const newPassword = z
  .string()
  .min(FORM_LIMITS.passwordMin, `Password must be at least ${FORM_LIMITS.passwordMin} characters`)

// Unified login schema for admin, organizer, and voter
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional(),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const createOrganizerSchema = z.object({
  email,
})

export const forgotPasswordSchema = z.object({
  email,
})

export const resetPasswordSchema = z
  .object({
    newPassword,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
