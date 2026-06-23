import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, USER_ROLES, COMPETITION_SCORING_EVENT_TYPES } from '../utils/constants.js'
import { hashPassword } from '../utils/password.js'
import { generateTemporaryPassword } from '../utils/crypto.js'
import { findUserByEmail, findUserById, sanitizeUser } from './user.service.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { sendVoterInvitationEmail, sendVoterInvitationEmailRegistered } from './mailer.service.js'
import { createNotification } from './notification.service.js'

function getClient() {
  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  return client
}

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
  await sendVoterInvitationEmailRegistered({
    email: voter.email,
    eventId: event.id,
    eventTitle: event.title,
  })

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
