import { isEmailConfigured } from '../config/resend.js'
import { env } from '../config/env.js'
import { sendEmail } from './email.service.js'
import { organizerInvitationTemplate } from '../templates/email/organizerInvitation.js'
import { organizerOnboardingTemplate } from '../templates/email/organizerOnboarding.js'
import { voterInvitationTemplate } from '../templates/email/voterInvitation.js'
import { voterInvitationRegisteredTemplate } from '../templates/email/voterInvitationRegistered.js'
import { passwordResetTemplate } from '../templates/email/passwordReset.js'
import { eventNotificationTemplate } from '../templates/email/eventNotification.js'
import { judgeInvitationTemplate } from '../templates/email/judgeInvitation.js'
import { judgeInvitationRegisteredTemplate } from '../templates/email/judgeInvitationRegistered.js'
import {
  organizerLoginUrl,
  voterLoginUrl,
  participantEventUrl,
  competitionScoreUrl,
  passwordResetUrl,
} from '../utils/urls.js'

import { isEmailConfigured } from '../config/resend.js'

/**
 * Send email without failing the parent operation.
 * Returns { sent, error? } for logging and API responses.
 */
export async function sendWorkflowEmail({ to, subject, html }) {
  if (!isEmailConfigured()) {
    console.warn(`[mailer] Skipped email to ${to} — Resend not configured`)
    return { sent: false, skipped: true, reason: 'Email service not configured' }
  }

  try {
    const data = await sendEmail({ to, subject, html })
    console.log(`[mailer] Successfully sent email to ${to} (ID: ${data?.id})`)
    return { sent: true, id: data?.id }
  } catch (error) {
    console.error(`[mailer] Failed to send to ${to}:`, error.message)
    
    // For network connectivity issues, suggest retry
    if (error.message?.includes('Network connectivity') || error.message?.includes('Unable to reach')) {
      return { sent: false, error: error.message, retryable: true }
    }
    
    return { sent: false, error: error.message }
  }
}

export async function sendOrganizerInvitationEmail({ email, temporaryPassword }) {
  const loginUrl = organizerLoginUrl()
  const html = organizerInvitationTemplate({ email, temporaryPassword, loginUrl })

  return sendWorkflowEmail({
    to: email,
    subject: 'Your VOTRIX organizer account',
    html,
  })
}

export async function sendOrganizerOnboardingEmail({ email }) {
  const loginUrl = organizerLoginUrl()
  const html = organizerOnboardingTemplate({ email, loginUrl })

  return sendWorkflowEmail({
    to: email,
    subject: 'Complete your VOTRIX organization profile',
    html,
  })
}

export async function sendVoterInvitationEmail({
  email,
  temporaryPassword,
  eventId,
  eventTitle,
  eventType = 'election',
}) {
  const link = participantEventUrl(eventId, eventType)
  const html = voterInvitationTemplate({
    email,
    temporaryPassword,
    eventLink: link,
    eventTitle,
    loginUrl: voterLoginUrl(),
  })

  return sendWorkflowEmail({
    to: email,
    subject: `You're invited: ${eventTitle}`,
    html,
  })
}

export async function sendVoterInvitationEmailRegistered({
  email,
  eventId,
  eventTitle,
  eventType = 'election',
}) {
  const link = participantEventUrl(eventId, eventType)
  const html = voterInvitationRegisteredTemplate({
    email,
    eventLink: link,
    eventTitle,
    loginUrl: voterLoginUrl(),
  })

  return sendWorkflowEmail({
    to: email,
    subject: `You're invited: ${eventTitle}`,
    html,
  })
}

export async function sendPasswordResetEmail({ email, token, expiresInMinutes }) {
  const resetUrl = passwordResetUrl(token)
  const html = passwordResetTemplate({ resetUrl, expiresInMinutes })

  return sendWorkflowEmail({
    to: email,
    subject: 'Reset your VOTRIX password',
    html,
  })
}

export async function sendJudgeInvitationEmail({
  email,
  temporaryPassword,
  eventId,
  eventTitle,
}) {
  const link = competitionScoreUrl(eventId)
  const html = judgeInvitationTemplate({
    email,
    temporaryPassword,
    eventLink: link,
    eventTitle,
    loginUrl: voterLoginUrl(),
  })

  return sendWorkflowEmail({
    to: email,
    subject: `Judge invitation: ${eventTitle}`,
    html,
  })
}

/**
 * Send invitation email to an already-registered judge (no password reset).
 */
export async function sendJudgeInvitationEmailRegistered({
  email,
  eventId,
  eventTitle,
}) {
  const link = competitionScoreUrl(eventId)
  const html = judgeInvitationRegisteredTemplate({
    email,
    eventLink: link,
    eventTitle,
    loginUrl: voterLoginUrl(),
  })

  return sendWorkflowEmail({
    to: email,
    subject: `You've been added as a judge: ${eventTitle}`,
    html,
  })
}

export async function sendEventNotificationEmail({
  email,
  eventTitle,
  eventId,
  message,
  organizationName,
  startDate,
  endDate,
  eventType = 'election',
}) {
  const html = eventNotificationTemplate({
    eventTitle,
    eventLink: participantEventUrl(eventId, eventType),
    message,
    organizationName,
    startDate,
    endDate,
  })

  return sendWorkflowEmail({
    to: email,
    subject: `Event update: ${eventTitle}`,
    html,
  })
}
