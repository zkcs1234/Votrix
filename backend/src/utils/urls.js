import { env } from '../config/env.js'

const base = env.clientUrl.replace(/\/$/, '')

export function organizerLoginUrl() {
  return `${base}/login/organizer`
}

export function voterLoginUrl() {
  return `${base}/login/voter`
}

export function adminLoginUrl() {
  return `${base}/login/admin`
}

export function eventUrl(eventId) {
  return `${base}/voter/events/${eventId}`
}

export function pageantScoreUrl(eventId) {
  return `${base}/voter/pageant/events/${eventId}/score`
}

export function passwordResetUrl(token) {
  return `${base}/reset-password?token=${encodeURIComponent(token)}`
}
