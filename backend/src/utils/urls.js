import { env } from '../config/env.js'

const base = env.clientUrl.replace(/\/$/, '')

export function organizerLoginUrl() {
  return `${base}/login`
}

export function voterLoginUrl() {
  return `${base}/login`
}

export function adminLoginUrl() {
  return `${base}/login`
}

export function eventUrl(eventId) {
  return `${base}/voter/events/${eventId}`
}

export function pageantScoreUrl(eventId) {
  return `${base}/voter/competition/events/${eventId}/score`
}

export function competitionScoreUrl(eventId) {
  return `${base}/voter/competition/events/${eventId}/score`
}

export function passwordResetUrl(token) {
  return `${base}/reset-password?token=${encodeURIComponent(token)}`
}
