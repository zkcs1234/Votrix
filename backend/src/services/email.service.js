import { Resend } from 'resend'
import { env } from '../config/env.js'
import { ApiError } from '../utils/ApiError.js'

export async function sendEmail({ to, subject, html }) {
  if (!env.resend.apiKey) {
    throw new ApiError(503, 'Email service is not configured')
  }

  // Create a fresh Resend client for each request to avoid connection issues
  const resend = new Resend(env.resend.apiKey)

  try {
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
  } catch (error) {
    // Handle network connectivity issues more gracefully
    if (error.message?.includes('fetch failed') || error.message?.includes('ECONNRESET')) {
      throw new ApiError(502, 'Network connectivity issue with email service. Please try again.')
    }
    
    if (error.message?.includes('Unable to fetch data')) {
      throw new ApiError(502, 'Unable to reach email service. Please check your internet connection.')
    }

    // Re-throw ApiError instances as-is
    if (error.statusCode) {
      throw error
    }

    // Wrap other errors
    throw new ApiError(502, error.message || 'Failed to send email')
  }
}
