import { Resend } from 'resend'
import { env } from './env.js'

let resendClient = null

export function getResend() {
  if (resendClient) return resendClient

  if (!env.resend.apiKey) {
    console.warn('[resend] RESEND_API_KEY not set — email disabled')
    return null
  }

  resendClient = new Resend(env.resend.apiKey)
  return resendClient
}
