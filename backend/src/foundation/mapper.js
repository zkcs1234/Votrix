/**
 * Foundation: shared mappers.
 *
 * Maps snake_case DB rows → camelCase API DTOs. Each mapper is a pure
 * function so it can be reused across services and tested in isolation.
 *
 * Only entities that are *already* shared across modules live here:
 *   - organizations
 *   - events (the metadata-only projection; module-specific fields are
 *     mapped by the owning service)
 *   - notifications
 *   - audit logs
 *
 * Domain entities (positions, candidates, contestants, criteria, scores,
 * questions, options) stay in their respective module services.
 */

export function mapOrganization(row) {
  if (!row) return null
  return {
    id: row.id,
    organizationName: row.organization_name,
    organizationType: row.organization_type,
    logo: row.logo ?? null,
    status: row.status,
    organizerId: row.organizer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Map the metadata projection of an event. Module services extend or
 * re-map this when they need module-specific fields.
 */
export function mapEvent(row) {
  if (!row) return null

  // Handle organization data - may come from join as nested object
  const org = row.organizations ?? null

  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description ?? null,
    banner: row.banner ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    status: row.status,
    eventType: row.event_type,
    // voting_enabled and results_visibility are present on election events
    // and on the events table generally — map them so callers don't have to
    // reach into raw DB rows.
    votingEnabled: row.voting_enabled ?? false,
    resultsVisibility: row.results_visibility ?? 'public',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Organization data from join
    organization: org
      ? {
          id: org.id,
          name: org.organization_name,
          logo: org.logo ?? null,
        }
      : null,
  }
}

export function mapNotification(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    actionUrl: row.action_url ?? null,
    entity: row.entity ?? null,
    entityId: row.entity_id ?? null,
    metadata: row.metadata ?? null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapAuditLog(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id ?? null,
    action: row.action,
    entity: row.entity ?? null,
    entityId: row.entity_id ?? null,
    details: row.details ?? null,
    createdAt: row.created_at,
    actor: row.users
      ? { id: row.users.id, email: row.users.email, role: row.users.role }
      : null,
  }
}
