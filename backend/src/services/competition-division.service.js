import db from '../config/database.js'
import { DB_TABLES, COMPETITION_SCORING_EVENT_TYPES } from '../utils/constants.js'

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
  const event = await db(DB_TABLES.EVENTS)
    .where({ id: eventId })
    .first('id', 'event_type', 'organizer_id')

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
  const event = await db(DB_TABLES.EVENTS)
    .where({ id: eventId, organizer_id: organizerId })
    .first('id')

  if (!event) {
    throw new Error('Event not found or access denied')
  }
}

/**
 * List all divisions for an event
 * @param {string} eventId - Event UUID
 * @param {boolean} includeInactive - Include deactivated divisions
 * @returns {Promise<Array>} Array of division objects
 */
export async function listDivisions(eventId, includeInactive = false) {
  await assertCompetitionEvent(eventId)

  let query = db(DB_TABLES.COMPETITION_DIVISIONS)
    .where({ event_id: eventId })
    .orderBy('display_order', 'asc')
    .orderBy('created_at', 'asc')

  if (!includeInactive) {
    query = query.where({ is_active: true })
  }

  return query
}

/**
 * Get a single division by ID
 * @param {string} divisionId - Division UUID
 * @param {string} eventId - Event UUID (for validation)
 * @returns {Promise<object>} Division object
 */
export async function getDivisionById(divisionId, eventId) {
  const division = await db(DB_TABLES.COMPETITION_DIVISIONS)
    .where({ id: divisionId, event_id: eventId })
    .first()

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

  const [division] = await db(DB_TABLES.COMPETITION_DIVISIONS)
    .insert({
      event_id: eventId,
      name: name.trim(),
      description: description?.trim() || null,
      display_order: displayOrder ?? 0,
      is_active: isActive,
    })
    .returning('*')

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

  const [updated] = await db(DB_TABLES.COMPETITION_DIVISIONS)
    .where({ id: divisionId, event_id: eventId })
    .update(updates)
    .returning('*')

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
    const count = await db(table)
      .where({ [column]: divisionId })
      .count('* as count')
      .first()

    if (parseInt(count.count) > 0) {
      throw new Error(
        `Cannot delete division: it has associated ${label}. Deactivate it instead by setting isActive to false.`
      )
    }
  }

  // No associated data — safe to delete
  await db(DB_TABLES.COMPETITION_DIVISIONS)
    .where({ id: divisionId, event_id: eventId })
    .delete()

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

  const [updated] = await db(DB_TABLES.EVENTS)
    .where({ id: eventId })
    .update({ divisions_enabled: enabled })
    .returning('id', 'divisions_enabled')

  return updated
}

/**
 * Check if divisions are enabled for an event
 * @param {string} eventId - Event UUID
 * @returns {Promise<boolean>} True if divisions enabled
 */
export async function areDivisionsEnabled(eventId) {
  const event = await db(DB_TABLES.EVENTS)
    .where({ id: eventId })
    .first('divisions_enabled')

  return event?.divisions_enabled ?? false
}

/**
 * Get division statistics (contestant count, judge count, etc.)
 * @param {string} divisionId - Division UUID
 * @returns {Promise<object>} Statistics object
 */
export async function getDivisionStats(divisionId) {
  const [contestants, criteria, rounds, categories, scores] = await Promise.all([
    db(DB_TABLES.CONTESTANTS)
      .where({ division_id: divisionId })
      .count('* as count')
      .first(),
    db(DB_TABLES.CRITERIA)
      .where({ division_id: divisionId })
      .count('* as count')
      .first(),
    db(DB_TABLES.COMPETITION_ROUNDS)
      .where({ division_id: divisionId })
      .count('* as count')
      .first(),
    db(DB_TABLES.COMPETITION_CATEGORIES)
      .where({ division_id: divisionId })
      .count('* as count')
      .first(),
    db(DB_TABLES.JUDGE_SCORES)
      .where({ division_id: divisionId })
      .count('* as count')
      .first(),
  ])

  return {
    contestantsCount: parseInt(contestants.count),
    criteriaCount: parseInt(criteria.count),
    roundsCount: parseInt(rounds.count),
    categoriesCount: parseInt(categories.count),
    scoresCount: parseInt(scores.count),
  }
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
