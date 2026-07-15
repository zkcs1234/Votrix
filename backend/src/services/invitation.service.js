import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, USER_ROLES, COMPETITION_SCORING_EVENT_TYPES } from '../utils/constants.js'
import { hashPassword } from '../utils/password.js'
import { generateTemporaryPassword } from '../utils/crypto.js'
import { findUserByEmail, findUserById, sanitizeUser } from './user.service.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { sendVoterInvitationEmail, sendVoterInvitationEmailRegistered } from './mailer.service.js'
import { createNotification } from './notification.service.js'


async function ensureVoterAccount(email, plainPassword) {
  const normalizedEmail = email.toLowerCase().trim()
  const existing = await findUserByEmail(normalizedEmail)

  if (existing && existing.role !== USER_ROLES.VOTER) {
    throw new ApiError(409, 'This email is already used by another account type')
  }

  const passwordHash = await hashPassword(plainPassword)

  if (existing) {
    const { data, error } = await getClient()
      .from(DB_TABLES.USERS)
      .update({
        password: passwordHash,
        must_change_password: true,
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) throw new ApiError(500, error.message)
    return { user: sanitizeUser(data), isNew: false }
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .insert({
      email: normalizedEmail,
      password: passwordHash,
      role: USER_ROLES.VOTER,
      must_change_password: true,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return { user: sanitizeUser(data), isNew: true }
}

export async function inviteVoterToEvent({ eventId, email, organizerId, temporaryPassword }) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  const tempPassword = temporaryPassword || generateTemporaryPassword()
  const { user, isNew } = await ensureVoterAccount(email, tempPassword)

  // Enroll voter in event — required for them to access it
  const { error: evError } = await getClient().from(DB_TABLES.EVENT_VOTERS).upsert(
    {
      event_id: eventId,
      voter_id: user.id,
      has_voted: false,
    },
    { onConflict: 'event_id,voter_id' },
  )

  if (evError) {
    console.error('[invitation] event_voters upsert failed:', evError.message)
    throw new ApiError(500, evError.message)
  }

  // Create/reset the invitation tracking record — wrapped so it never blocks the email
  try {
    await getClient().from(DB_TABLES.INVITATIONS).upsert(
      {
        event_id: eventId,
        voter_id: user.id,
        temp_password: null,
        invitation_sent: false,
      },
      { onConflict: 'event_id,voter_id', ignoreDuplicates: false },
    )
  } catch (dbErr) {
    // Non-fatal: log but continue so email is still sent
    console.error('[invitation] invitations upsert failed (non-fatal):', dbErr.message)
  }

  // Send the invitation email — this is the critical step
  const emailResult = await sendVoterInvitationEmail({
    email: user.email,
    temporaryPassword: tempPassword,
    eventId: event.id,
    eventTitle: event.title,
  })

  console.log(`[invitation] email to ${user.email}: sent=${emailResult.sent}`, emailResult.error ?? '')

  if (emailResult.sent) {
    // Update invitation status to sent — also non-fatal
    try {
      await getClient()
        .from(DB_TABLES.INVITATIONS)
        .update({ invitation_sent: true })
        .eq('event_id', eventId)
        .eq('voter_id', user.id)
    } catch (dbErr) {
      console.error('[invitation] failed to mark invitation_sent=true:', dbErr.message)
    }

    try {
      await createNotification({
        userId: user.id,
        type: 'voter.invitation',
        title: `You're invited to ${event.title}`,
        message: `Your invitation for ${event.title} has been sent. Sign in to review your participation details.`,
        actionUrl: COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)
          ? `/voter/competition/events/${event.id}/score`
          : event.event_type === 'polling'
            ? `/voter/polling/events/${event.id}`
            : `/voter/events/${event.id}`,
        entity: 'events',
        entityId: event.id,
        metadata: { eventType: event.event_type, organizationName: event.organizations?.organization_name },
      })
    } catch (notifErr) {
      console.error('[invitation] createNotification failed (non-fatal):', notifErr.message)
    }
  }

  return {
    user,
    event: { id: event.id, title: event.title },
    isNewVoter: isNew,
    email: emailResult,
  }
}

/**
 * Invite an already registered voter to an event.
 * Does NOT create new account or reset password.
 * Simply enrolls the voter in the event.
 */
export async function inviteRegisteredVoter({ eventId, email, organizerId }) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  // Find voter by email
  const voter = await findUserByEmail(email.toLowerCase().trim())

  if (!voter) {
    throw new ApiError(404, 'Voter not found. Use the "Invite New" method to create a new voter account.')
  }

  if (voter.role !== USER_ROLES.VOTER) {
    throw new ApiError(400, 'This email belongs to a different account type')
  }

  // Check if already enrolled
  const { data: existing } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('id')
    .eq('event_id', eventId)
    .eq('voter_id', voter.id)
    .maybeSingle()

  if (existing) {
    throw new ApiError(409, 'Voter is already enrolled in this event')
  }

  // Enroll voter in event
  await getClient().from(DB_TABLES.EVENT_VOTERS).insert({
    event_id: eventId,
    voter_id: voter.id,
    has_voted: false,
  })

  // Send invitation email (no password)
  const emailResult = await sendVoterInvitationEmailRegistered({
    email: voter.email,
    eventId: event.id,
    eventTitle: event.title,
  })

  // Record the invitation as sent so the organizer list stays consistent.
  // This legacy path previously sent the email but never updated the status.
  if (emailResult.sent) {
    try {
      await getClient()
        .from(DB_TABLES.INVITATIONS)
        .upsert(
          { event_id: eventId, voter_id: voter.id, invitation_sent: true },
          { onConflict: 'event_id,voter_id' },
        )
    } catch (dbErr) {
      console.error('[invitation] failed to mark invitation_sent=true:', dbErr.message)
    }
  }

  return { user: voter, event: { id: event.id, title: event.title } }
}

export async function resendVoterInvitation({ eventId, voterId, organizerId }) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  const voter = await findUserById(voterId)
  if (!voter || voter.role !== USER_ROLES.VOTER) {
    throw new ApiError(404, 'Voter not found')
  }

  const { data: enrollment, error: enrollmentError } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('id')
    .eq('event_id', eventId)
    .eq('voter_id', voterId)
    .maybeSingle()

  if (enrollmentError) throw new ApiError(500, enrollmentError.message)
  if (!enrollment) {
    throw new ApiError(404, 'Voter is not enrolled in this event')
  }

  const tempPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(tempPassword)

  await getClient()
    .from(DB_TABLES.USERS)
    .update({
      password: passwordHash,
      must_change_password: true,
    })
    .eq('id', voterId)

  const emailResult = await sendVoterInvitationEmail({
    email: voter.email,
    temporaryPassword: tempPassword,
    eventId: event.id,
    eventTitle: event.title,
  })

  if (emailResult.sent) {
    await getClient()
      .from(DB_TABLES.INVITATIONS)
      .update({ invitation_sent: true })
      .eq('event_id', eventId)
      .eq('voter_id', voterId)

    await createNotification({
      userId: voterId,
      type: 'voter.invitation.resend',
      title: `Invitation resent for ${event.title}`,
      message: `A new temporary password was sent for ${event.title}.`,
      actionUrl: COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)
        ? `/voter/competition/events/${event.id}/score`
        : event.event_type === 'polling'
          ? `/voter/polling/events/${event.id}`
          : `/voter/events/${event.id}`,
      entity: 'events',
      entityId: event.id,
      metadata: { eventType: event.event_type, organizationName: event.organizations?.organization_name },
    })
  }

  return { email: emailResult }
}

// ============================================================================
// NEW FUNCTIONS: Separate Registration from Invitation Email
// ============================================================================

/**
 * Register a voter to an event WITHOUT sending invitation email.
 * Creates account (if new), enrolls in event, creates pending invitation record.
 *
 * @param {Object} params
 * @param {string} params.eventId - The event ID
 * @param {string} params.email - The voter email
 * @param {string} params.organizerId - The organizer ID
 * @param {string} [params.temporaryPassword] - Optional password (auto-generated if not provided)
 * @param {boolean} [params.resetPasswordForExisting] - If false, won't reset password for existing voters (default: true for CSV)
 */
export async function registerVoterToEvent({ eventId, email, organizerId, temporaryPassword, resetPasswordForExisting = true }) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  // Check if voter already exists
  const existingVoter = await findUserByEmail(email.toLowerCase().trim())

  let user
  let isNew = false

  if (existingVoter) {
    // Existing voter - decide whether to reset password
    if (resetPasswordForExisting) {
      // Reset password (used for CSV import)
      const tempPassword = temporaryPassword || generateTemporaryPassword()
      const passwordHash = await hashPassword(tempPassword)

      const { data, error } = await getClient()
        .from(DB_TABLES.USERS)
        .update({
          password: passwordHash,
          must_change_password: true,
        })
        .eq('id', existingVoter.id)
        .select('*')
        .single()

      if (error) throw new ApiError(500, error.message)
      user = sanitizeUser(data)
    } else {
      // Just use existing user without password change
      user = existingVoter
    }
  } else {
    // New voter - create account with password
    isNew = true
    const tempPassword = temporaryPassword || generateTemporaryPassword()
    const { user: newUser, isNew: newIsNew } = await ensureVoterAccount(email, tempPassword)
    user = newUser
    isNew = newIsNew
  }

  // Enroll voter in event — required for them to access it
  const { error: evError } = await getClient().from(DB_TABLES.EVENT_VOTERS).upsert(
    {
      event_id: eventId,
      voter_id: user.id,
      has_voted: false,
    },
    { onConflict: 'event_id,voter_id' },
  )

  if (evError) {
    console.error('[registration] event_voters upsert failed:', evError.message)
    throw new ApiError(500, evError.message)
  }

  // Create/reset the invitation tracking record with invitation_sent = false
  // This means no email has been sent yet
  try {
    await getClient().from(DB_TABLES.INVITATIONS).upsert(
      {
        event_id: eventId,
        voter_id: user.id,
        temp_password: null, // Only stored when sending invitation
        invitation_sent: false, // Key: NOT sent yet!
      },
      { onConflict: 'event_id,voter_id', ignoreDuplicates: false },
    )
  } catch (dbErr) {
    console.error('[registration] invitations upsert failed:', dbErr.message)
    throw new ApiError(500, 'Failed to create invitation record')
  }

  return {
    user,
    event: { id: event.id, title: event.title },
    isNewVoter: isNew,
    // Indicates email has NOT been sent
    invitationSent: false,
  }
}

/**
 * Register an already registered voter to an event WITHOUT sending invitation email.
 */
export async function registerExistingVoter({ eventId, email, organizerId }) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  // Find voter by email
  const voter = await findUserByEmail(email.toLowerCase().trim())

  if (!voter) {
    throw new ApiError(404, 'Voter not found. Use the "Register New" method to create a new voter account.')
  }

  if (voter.role !== USER_ROLES.VOTER) {
    throw new ApiError(400, 'This email belongs to a different account type')
  }

  // Check if already enrolled
  const { data: existing } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('id')
    .eq('event_id', eventId)
    .eq('voter_id', voter.id)
    .maybeSingle()

  if (existing) {
    throw new ApiError(409, 'Voter is already enrolled in this event')
  }

  // Enroll voter in event
  await getClient().from(DB_TABLES.EVENT_VOTERS).insert({
    event_id: eventId,
    voter_id: voter.id,
    has_voted: false,
  })

  // Create pending invitation record (no email sent)
  try {
    await getClient().from(DB_TABLES.INVITATIONS).insert({
      event_id: eventId,
      voter_id: voter.id,
      invitation_sent: false,
    })
  } catch (dbErr) {
    console.error('[registration] invitations insert failed:', dbErr.message)
    throw new ApiError(500, 'Failed to create invitation record')
  }

  return {
    user: voter,
    event: { id: event.id, title: event.title },
    invitationSent: false,
  }
}

/**
 * Send invitation email for a voter who is already registered/enrolled.
 * Generates new temporary password and sends invitation email.
 */
export async function sendVoterInvitation({ eventId, voterId, organizerId }) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  const voter = await findUserById(voterId)
  if (!voter || voter.role !== USER_ROLES.VOTER) {
    throw new ApiError(404, 'Voter not found')
  }

  // Check if voter is enrolled
  const { data: enrollment, error: enrollmentError } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('id')
    .eq('event_id', eventId)
    .eq('voter_id', voterId)
    .maybeSingle()

  if (enrollmentError) throw new ApiError(500, enrollmentError.message)
  if (!enrollment) {
    throw new ApiError(404, 'Voter is not enrolled in this event')
  }

  // Check current invitation status
  const { data: invitation } = await getClient()
    .from(DB_TABLES.INVITATIONS)
    .select('invitation_sent')
    .eq('event_id', eventId)
    .eq('voter_id', voterId)
    .maybeSingle()

  // Generate new temporary password
  const tempPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(tempPassword)

  await getClient()
    .from(DB_TABLES.USERS)
    .update({
      password: passwordHash,
      must_change_password: true,
    })
    .eq('id', voterId)

  // Send the invitation email
  const emailResult = await sendVoterInvitationEmail({
    email: voter.email,
    temporaryPassword: tempPassword,
    eventId: event.id,
    eventTitle: event.title,
  })

  console.log(`[send-invitation] email to ${voter.email}: sent=${emailResult.sent}`, emailResult.error ?? '')

  if (emailResult.sent) {
    // Update invitation status to sent
    try {
      await getClient()
        .from(DB_TABLES.INVITATIONS)
        .update({ invitation_sent: true })
        .eq('event_id', eventId)
        .eq('voter_id', voterId)
    } catch (dbErr) {
      console.error('[send-invitation] failed to mark invitation_sent=true:', dbErr.message)
    }

    // Create notification
    try {
      await createNotification({
        userId: voterId,
        type: 'voter.invitation',
        title: `You're invited to ${event.title}`,
        message: `Your invitation for ${event.title} has been sent. Sign in to review your participation details.`,
        actionUrl: COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)
          ? `/voter/competition/events/${event.id}/score`
          : event.event_type === 'polling'
            ? `/voter/polling/events/${event.id}`
            : `/voter/events/${event.id}`,
        entity: 'events',
        entityId: event.id,
        metadata: { eventType: event.event_type, organizationName: event.organizations?.organization_name },
      })
    } catch (notifErr) {
      console.error('[send-invitation] createNotification failed (non-fatal):', notifErr.message)
    }
  }

  return {
    user: voter,
    email: emailResult,
    invitationSent: emailResult.sent,
  }
}

/**
 * Send all pending invitations for an event.
 * Returns summary of sent/failed invitations.
 */
export async function sendAllPendingInvitations({ eventId, organizerId }) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  // Get all voters with pending invitations (enrolled but invitation_sent = false)
  const { data: pendingVoters, error: pendingError } = await getClient()
    .from(DB_TABLES.INVITATIONS)
    .select(`
      id,
      voter_id,
      users (id, email)
    `)
    .eq('event_id', eventId)
    .eq('invitation_sent', false)

  if (pendingError) throw new ApiError(500, pendingError.message)

  if (!pendingVoters || pendingVoters.length === 0) {
    return {
      total: 0,
      sent: 0,
      failed: 0,
      results: [],
    }
  }

  const results = []
  let sentCount = 0
  let failedCount = 0

  // Process each pending invitation sequentially
  for (const pending of pendingVoters) {
    const voter = pending.users
    const tempPassword = generateTemporaryPassword()
    const passwordHash = await hashPassword(tempPassword)

    try {
      // Update password
      await getClient()
        .from(DB_TABLES.USERS)
        .update({
          password: passwordHash,
          must_change_password: true,
        })
        .eq('id', voter.id)

      // Send invitation email
      const emailResult = await sendVoterInvitationEmail({
        email: voter.email,
        temporaryPassword: tempPassword,
        eventId: event.id,
        eventTitle: event.title,
      })

      if (emailResult.sent) {
        // Update invitation status
        await getClient()
          .from(DB_TABLES.INVITATIONS)
          .update({ invitation_sent: true })
          .eq('event_id', eventId)
          .eq('voter_id', voter.id)

        // Create notification
        try {
          await createNotification({
            userId: voter.id,
            type: 'voter.invitation',
            title: `You're invited to ${event.title}`,
            message: `Your invitation for ${event.title} has been sent. Sign in to review your participation details.`,
            actionUrl: COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)
              ? `/voter/competition/events/${event.id}/score`
              : event.event_type === 'polling'
                ? `/voter/polling/events/${event.id}`
                : `/voter/events/${event.id}`,
            entity: 'events',
            entityId: event.id,
            metadata: { eventType: event.event_type, organizationName: event.organizations?.organization_name },
          })
        } catch (notifErr) {
          console.error('[send-all] createNotification failed:', notifErr.message)
        }

        sentCount++
        results.push({
          voterId: voter.id,
          email: voter.email,
          success: true,
        })
      } else {
        failedCount++
        results.push({
          voterId: voter.id,
          email: voter.email,
          success: false,
          error: emailResult.error || 'Email delivery failed',
        })
      }
    } catch (err) {
      failedCount++
      results.push({
        voterId: voter.id,
        email: voter.email,
        success: false,
        error: err.message,
      })
    }
  }

  return {
    total: pendingVoters.length,
    sent: sentCount,
    failed: failedCount,
    results,
  }
}
