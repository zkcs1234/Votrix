import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, USER_ROLES } from '../utils/constants.js'
import { hashPassword } from '../utils/password.js'
import { generateTemporaryPassword } from '../utils/crypto.js'
import { findUserByEmail, findUserById, sanitizeUser } from './user.service.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { sendVoterInvitationEmail } from './mailer.service.js'

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

  const { error: evError } = await getClient().from(DB_TABLES.EVENT_VOTERS).upsert(
    {
      event_id: eventId,
      voter_id: user.id,
      has_voted: false,
    },
    { onConflict: 'event_id,voter_id' },
  )

  if (evError) throw new ApiError(500, evError.message)

  const { error: invError } = await getClient().from(DB_TABLES.INVITATIONS).upsert(
    {
      event_id: eventId,
      voter_id: user.id,
      temp_password: null,
      invitation_sent: false,
    },
    { onConflict: 'event_id,voter_id' },
  )

  if (invError) throw new ApiError(500, invError.message)

  const emailResult = await sendVoterInvitationEmail({
    email: user.email,
    temporaryPassword: tempPassword,
    eventId: event.id,
    eventTitle: event.title,
  })

  if (emailResult.sent) {
    await getClient()
      .from(DB_TABLES.INVITATIONS)
      .update({ invitation_sent: true })
      .eq('event_id', eventId)
      .eq('voter_id', user.id)
  }

  return {
    user,
    event: { id: event.id, title: event.title },
    isNewVoter: isNew,
    email: emailResult,
  }
}

export async function resendVoterInvitation({ eventId, voterId, organizerId }) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  const voter = await findUserById(voterId)
  if (!voter || voter.role !== USER_ROLES.VOTER) {
    throw new ApiError(404, 'Voter not found')
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
  }

  return { email: emailResult }
}
