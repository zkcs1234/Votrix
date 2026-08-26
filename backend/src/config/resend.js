import { env } from './env.js'

// Simple helper to check if email service is configured
export function isEmailConfigured() {
  return Boolean(env.resend.apiKey)
}
