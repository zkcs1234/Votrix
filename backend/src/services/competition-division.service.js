import { db as getClient } from '../foundation/db.js'
import { DB_TABLES, COMPETITION_SCORING_EVENT_TYPES } from '../utils/constants.js'
import { assertOrganizerOwnsEvent } from './event.service.js'

/**
 * Competition Division Service
 * 
 * Manages optional divisions within competitions (e.g., Male, Female, Junior, Senior).
 * Divisions are a grouping attribute on the existing shared competition entities.
 * 
 * Design principles:
 * • ONE shared competition system (contestants, criteria, rounds, judges, scores)
 * • Divisions are OPTIONAL (nullable division_id)
 * • Divisions can only be deleted if they have NO associated data
 * • Otherwise, they must be deactivated (is_active = false)
 */

/**
 * Assert that the event exists and is a competition-scoring event
 * @param {string} eventId - Event UUID
 * @throws {Error} If event not found or wrong type
 */
async function assertCompetitionEvent(eventId) {
  const { data: event, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('id, event_type')
    .eq('id', eventId)
    .maybeSingle()

  if (error) throw new Error(error.message)

  if (!event) {
    throw new Error('Event not found')
  }

  if (!COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)) {
    throw new Error('Event is not a competition-scoring event')
  }

  return event
}

/**
 * Assert that the organizer owns the event
 * @param {string} eventId - Event UUID
 * @param {string} organizerId - Organizer user UUID
 * @throws {Error} If organizer doesn't own the event
 */
async function assertEventOwnership(eventId, organizerId) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
}

/**
 * List all divisions for an event
 * @param {string} eventId - Event UUID
 * @param {boolean} includeInactive - Include deactivated divisions
 * @returns {Promise<Array>} Array of division objects
 */
export async function listDivisions(eventId, includeInactive = false) {
  await assertCompetitionEvent(eventId)

  let query = getClient()
    .from(DB_TABLES.COMPETITION_DIVISIONS)
    .select('*')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Get a single division by ID
 * @param {string} divisionId - Division UUID
 * @param {string} eventId - Event UUID (for validation)
 * @returns {Promise<object>} Division object
 */
export async function getDivisionById(divisionId, eventId) {
  const { data: division, error } = await getClient()
    .from(DB_TABLES.COMPETITION_DIVISIONS)
    .select('*')
    .eq('id', divisionId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) throw new Error(error.message)

  if (!division) {
    throw new Error('Division not found')
  }

  return division
}

/**
 * Create a new division
 * @param {string} eventId - Event UUID
 * @param {string} organizerId - Organizer user UUID
 * @param {object} payload - Division data
 * @returns {Promise<object>} Created division
 */
export async function createDivision(eventId, organizerId, payload) {
  await assertCompetitionEvent(eventId)
  await assertEventOwnership(eventId, organizerId)

  const { name, description, displayOrder, isActive = true } = payload

  if (!name || name.trim().length === 0) {
    throw new Error('Division name is required')
  }

  const { data: division, error } = await getClient()
    .from(DB_TABLES.COMPETITION_DIVISIONS)
    .insert({
      event_id: eventId,
      name: name.trim(),
      description: description?.trim() || null,
      display_order: displayOrder ?? 0,
      is_active: isActive,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  return division
}

/**
 * Update an existing division
 * @param {string} eventId - Event UUID
 * @param {string} divisionId - Division UUID
 * @param {string} organizerId - Organizer user UUID
 * @param {object} payload - Updated division data
 * @returns {Promise<object>} Updated division
 */
export async function updateDivision(eventId, divisionId, organizerId, payload) {
  await assertCompetitionEvent(eventId)
  await assertEventOwnership(eventId, organizerId)

  const existing = await getDivisionById(divisionId, eventId)
  if (!existing) {
    throw new Error('Division not found')
  }

  const { name, description, displayOrder, isActive } = payload
  const updates = {}

  if (name !== undefined) {
    if (!name || name.trim().length === 0) {
      throw new Error('Division name cannot be empty')
    }
    updates.name = name.trim()
  }

  if (description !== undefined) {
    updates.description = description?.trim() || null
  }

  if (displayOrder !== undefined) {
    updates.display_order = displayOrder
  }

  if (isActive !== undefined) {
    updates.is_active = isActive
  }

  if (Object.keys(updates).length === 0) {
    return existing
  }

  const { data: updated, error } = await getClient()
    .from(DB_TABLES.COMPETITION_DIVISIONS)
    .update(updates)
    .eq('id', divisionId)
    .eq('event_id', eventId)
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  return updated
}

/**
 * Delete a division (only if it has NO associated data)
 * @param {string} eventId - Event UUID
 * @param {string} divisionId - Division UUID
 * @param {string} organizerId - Organizer user UUID
 * @throws {Error} If division has associated data (contestants, scores, etc.)
 */
export async function deleteDivision(eventId, divisionId, organizerId) {
  await assertCompetitionEvent(eventId)
  await assertEventOwnership(eventId, organizerId)

  const existing = await getDivisionById(divisionId, eventId)
  if (!existing) {
    throw new Error('Division not found')
  }

  // Check for associated data (ON DELETE RESTRICT will prevent deletion, but we check first for better error messages)
  const tables = [
    { table: DB_TABLES.CONTESTANTS, column: 'division_id', label: 'contestants' },
    { table: DB_TABLES.COMPETITION_CATEGORIES, column: 'division_id', label: 'categories' },
    { table: DB_TABLES.COMPETITION_ROUNDS, column: 'division_id', label: 'rounds' },
    { table: DB_TABLES.CRITERIA, column: 'division_id', label: 'criteria' },
    { table: DB_TABLES.JUDGE_SCORES, column: 'division_id', label: 'scores' },
  ]

  for (const { table, column, label } of tables) {
    const { count, error } = await getClient()
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, divisionId)

    if (error) throw new Error(error.message)

    if (count > 0) {
      throw new Error(
        `Cannot delete division: it has associated ${label}. Deactivate it instead by setting isActive to false.`
      )
    }
  }

  // No associated data — safe to delete
  const { error } = await getClient()
    .from(DB_TABLES.COMPETITION_DIVISIONS)
    .delete()
    .eq('id', divisionId)
    .eq('event_id', eventId)

  if (error) throw new Error(error.message)

  return { success: true, message: 'Division deleted successfully' }
}

/**
 * Toggle divisions_enabled flag on event
 * @param {string} eventId - Event UUID
 * @param {string} organizerId - Organizer user UUID
 * @param {boolean} enabled - Enable or disable divisions
 * @returns {Promise<object>} Updated event
 */
export async function setDivisionsEnabled(eventId, organizerId, enabled) {
  await assertCompetitionEvent(eventId)
  await assertEventOwnership(eventId, organizerId)

  const { data: updated, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({ divisions_enabled: enabled })
    .eq('id', eventId)
    .select('id, divisions_enabled')
    .single()

  if (error) throw new Error(error.message)

  return updated
}

/**
 * Check if divisions are enabled for an event
 * @param {string} eventId - Event UUID
 * @returns {Promise<boolean>} True if divisions enabled
 */
export async function areDivisionsEnabled(eventId) {
  const { data: event, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('divisions_enabled')
    .eq('id', eventId)
    .maybeSingle()

  if (error) throw new Error(error.message)

  return event?.divisions_enabled ?? false
}

/**
 * Get division statistics (contestant count, judge count, etc.)
 * @param {string} divisionId - Division UUID
 * @returns {Promise<object>} Statistics object
 */
export async function getDivisionStats(divisionId) {
  const [contestants, criteria, rounds, categories, scores] = await Promise.all([
    countRows(DB_TABLES.CONTESTANTS, divisionId),
    countRows(DB_TABLES.CRITERIA, divisionId),
    countRows(DB_TABLES.COMPETITION_ROUNDS, divisionId),
    countRows(DB_TABLES.COMPETITION_CATEGORIES, divisionId),
    countRows(DB_TABLES.JUDGE_SCORES, divisionId),
  ])

  return {
    contestantsCount: contestants,
    criteriaCount: criteria,
    roundsCount: rounds,
    categoriesCount: categories,
    scoresCount: scores,
  }
}

async function countRows(table, divisionId) {
  const { count, error } = await getClient()
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('division_id', divisionId)

  if (error) throw new Error(error.message)
  return count ?? 0
}

export default {
  listDivisions,
  getDivisionById,
  createDivision,
  updateDivision,
  deleteDivision,
  setDivisionsEnabled,
  areDivisionsEnabled,
  getDivisionStats,
}
