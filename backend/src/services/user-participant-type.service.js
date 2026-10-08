import { db } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, PARTICIPANT_TYPES } from '../utils/constants.js'

const ALLOWED_TYPES = new Set(Object.values(PARTICIPANT_TYPES))

function assertParticipantType(participantType) {
  if (!ALLOWED_TYPES.has(participantType)) {
    throw new ApiError(400, 'Invalid participant type')
  }
}

export async function addParticipantTypeMembership(userId, participantType, createdBy) {
  assertParticipantType(participantType)
  const membership = {
    user_id: userId,
    participant_type: participantType,
    is_active: true,
  }
  if (createdBy) membership.created_by = createdBy

  const { data, error } = await db()
    .from(DB_TABLES.USER_PARTICIPANT_TYPES)
    .upsert(membership, { onConflict: 'user_id,participant_type' })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return data
}

export async function hasParticipantTypeMembership(userId, participantType) {
  assertParticipantType(participantType)
  const { data, error } = await db()
    .from(DB_TABLES.USER_PARTICIPANT_TYPES)
    .select('user_id')
    .eq('user_id', userId)
    .eq('participant_type', participantType)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  return Boolean(data)
}

export async function setParticipantTypeMembership(userId, participantType, isActive) {
  assertParticipantType(participantType)
  const { data, error } = await db()
    .from(DB_TABLES.USER_PARTICIPANT_TYPES)
    .update({ is_active: Boolean(isActive) })
    .eq('user_id', userId)
    .eq('participant_type', participantType)
    .select('*')
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Participant type membership not found')
  return data
}