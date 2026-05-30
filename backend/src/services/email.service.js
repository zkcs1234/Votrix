import { getResend } from '../config/resend.js'
import { env } from '../config/env.js'
import { ApiError } from '../utils/ApiError.js'

export async function sendEmail({ to, subject, html }) {
  const resend = getResend()
  if (!resend) {
    throw new ApiError(503, 'Email service is not configured')
  }

  const { data, error } = await resend.emails.send({
    from: env.resend.fromEmail,
    to,
    subject,
    html,
  })

  if (error) {
    throw new ApiError(502, error.message || 'Failed to send email')
  }

  return data
}
