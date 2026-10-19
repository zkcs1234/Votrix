import { isEmailConfigured } from '../config/resend.js'
import { env } from '../config/env.js'
import { sendEmail } from './email.service.js'
import { organizerInvitationTemplate } from '../templates/email/organizerInvitation.js'
import { organizerOnboardingTemplate } from '../templates/email/organizerOnboarding.js'
import { voterInvitationTemplate } from '../templates/email/voterInvitation.js'
import { voterAccountCreatedTemplate } from '../templates/email/voterAccountCreated.js'
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
  forgotPasswordUrl,
} from '../utils/urls.js'
import { checkAndRecordEmailSend, buildEmailDedupeKey } from './emailGuard.js'

/**
 * Send email without failing the parent operation.
 * Returns { sent, error? } for logging and API responses.
 */
export async function sendWorkflowEmail({
  to,
  subject,
  html,
  workflow = 'general-email',
  dedupeKey,
  eventId,
  userId,
  template,
}) {
  if (!isEmailConfigured()) {
    console.warn(`[mailer] Skipped email to ${to} — Resend not configured`)
    return { sent: false, skipped: true, reason: 'Email service not configured' }
  }

  const guardResult = await checkAndRecordEmailSend({
    to,
    subject,
    workflow,
    eventId,
    userId,
    template,
    dedupeKey:
      dedupeKey ||
      buildEmailDedupeKey({
        to,
        subject,
        workflow,
        eventId,
        userId,
        template,
      }),
  })

  if (!guardResult.allowed) {
    const result = {
      sent: false,
      skipped: true,
      reason: guardResult.reason,
      quotaType: guardResult.quotaType,
      duplicate: guardResult.duplicate,
      dedupeWindowMs: guardResult.dedupeWindowMs,
      limit: guardResult.limit,
    }

    console.warn(`[mailer] Email blocked for ${to}: ${guardResult.reason}`)
    return result
  }

  try {
    const data = await sendEmail({ to, subject, html })
    console.log(`[mailer] Successfully sent email to ${to} (ID: ${data?.id})`)

    try {
      const { updateEmailAuditStatus } = await import('./emailAudit.service.js')
      await updateEmailAuditStatus({
        dedupeKey:
          dedupeKey ||
          buildEmailDedupeKey({
            to,
            subject,
            workflow,
            eventId,
            userId,
            template,
          }),
        workflow,
        providerStatus: 'sent',
        providerMessageId: data?.id || null,
      })
    } catch (auditError) {
      console.warn('[mailer] failed to mark email sent in audit log:', auditError.message)
    }

    return { sent: true, id: data?.id }
  } catch (error) {
    console.error(`[mailer] Failed to send to ${to}:`, error.message)

    try {
      const { notifyAdminsOfFailedEmailDelivery } = await import('./alert.service.js')
      await notifyAdminsOfFailedEmailDelivery({ recipient: to })
    } catch (alertError) {
      console.error('[mailer] email failure alert failed (non-fatal):', alertError.message)
    }

    try {
      const { updateEmailAuditStatus } = await import('./emailAudit.service.js')
      await updateEmailAuditStatus({
        dedupeKey:
          dedupeKey ||
          buildEmailDedupeKey({
            to,
            subject,
            workflow,
            eventId,
            userId,
            template,
          }),
        workflow,
        providerStatus: 'failed',
        providerError: error.message || 'Unknown email failure',
        retryable: Boolean(
          error.message?.includes('Network connectivity') || error.message?.includes('Unable to reach'),
        ),
      })
    } catch (auditError) {
      console.warn('[mailer] failed to mark email failure in audit log:', auditError.message)
    }

    if (error.message?.includes('Network connectivity') || error.message?.includes('Unable to reach')) {
      return { sent: false, error: error.message, retryable: true }
    }

    return { sent: false, error: error.message }
  }
}

export async function sendOrganizerInvitationEmail({ email, temporaryPassword }) {
  const loginUrl = organizerLoginUrl()
  const html = organizerInvitationTemplate({
    email,
    temporaryPassword,
    loginUrl,
    forgotPasswordUrl: forgotPasswordUrl(),
  })

  return sendWorkflowEmail({
    to: email,
    subject: 'Your VOTRIX organizer account',
    html,
    workflow: 'organizer-invite',
    template: 'organizer-invitation',
  })
}

// Email A — account provisioning for admin-registered participants (plan D11).
export async function sendVoterAccountCreatedEmail({ email, temporaryPassword }) {
  const html = voterAccountCreatedTemplate({
    email,
    temporaryPassword,
    loginUrl: voterLoginUrl(),
    forgotPasswordUrl: forgotPasswordUrl(),
  })

  return sendWorkflowEmail({
    to: email,
    subject: 'Your VOTRIX account',
    html,
    workflow: 'participant-account-created',
    template: 'voter-account-created',
  })
}

export async function sendOrganizerOnboardingEmail({ email }) {
  const loginUrl = organizerLoginUrl()
  const html = organizerOnboardingTemplate({ email, loginUrl })

  return sendWorkflowEmail({
    to: email,
    subject: 'Complete your VOTRIX organization profile',
    html,
    workflow: 'organizer-onboarding',
    template: 'organizer-onboarding',
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
    forgotPasswordUrl: forgotPasswordUrl(),
  })

  return sendWorkflowEmail({
    to: email,
    subject: `You're invited: ${eventTitle}`,
    html,
    workflow: 'voter-invite',
    template: 'voter-invite-new',
    eventId,
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
    workflow: 'voter-invite-registered',
    template: 'voter-invite-registered',
    eventId,
  })
}

export async function sendPasswordResetEmail({ email, token, expiresInMinutes }) {
  const resetUrl = passwordResetUrl(token)
  const html = passwordResetTemplate({ resetUrl, expiresInMinutes })

  return sendWorkflowEmail({
    to: email,
    subject: 'Reset your VOTRIX password',
    html,
    workflow: 'password-reset',
    template: 'password-reset',
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
    forgotPasswordUrl: forgotPasswordUrl(),
  })

  return sendWorkflowEmail({
    to: email,
    subject: `Judge invitation: ${eventTitle}`,
    html,
    workflow: 'judge-invite',
    template: 'judge-invite-new',
    eventId,
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
    workflow: 'judge-invite-registered',
    template: 'judge-invite-registered',
    eventId,
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
    workflow: 'event-notification',
    template: 'event-notification',
    eventId,
  })
}
