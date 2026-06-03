import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, USER_ROLES } from '../utils/constants.js'

function getClient() {
  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  return client
}

export async function createNotification({
  userId,
  type,
  title,
  message,
  actionUrl = null,
  entity = null,
  entityId = null,
  metadata = null,
}) {
  const { data, error } = await getClient()
    .from(DB_TABLES.NOTIFICATIONS)
    .insert({
      user_id: userId,
      type,
      title,
      message,
      action_url: actionUrl,
      entity,
      entity_id: entityId,
      metadata,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return data
}

export async function createNotificationsForUsers(userIds, payload) {
  const ids = (userIds ?? []).filter(Boolean)
  if (!ids.length) return []

  const { data, error } = await getClient()
    .from(DB_TABLES.NOTIFICATIONS)
    .insert(
      ids.map((userId) => ({
        user_id: userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        action_url: payload.actionUrl ?? null,
        entity: payload.entity ?? null,
        entity_id: payload.entityId ?? null,
        metadata: payload.metadata ?? null,
      })),
    )
    .select('*')

  if (error) throw new ApiError(500, error.message)
  return data ?? []
}

export async function createNotificationsForRole(role, payload) {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('id')
    .eq('role', role)

  if (error) throw new ApiError(500, error.message)
  return createNotificationsForUsers((data ?? []).map((row) => row.id), payload)
}

export async function listNotifications(
  userId,
  { unreadOnly = false, limit = 25, type = null, entity = null } = {},
) {
  let query = getClient()
    .from(DB_TABLES.NOTIFICATIONS)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }
  if (type) {
    query = query.eq('type', type)
  }
  if (entity) {
    query = query.eq('entity', entity)
  }

  const { data, error } = await query
  if (error) throw new ApiError(500, error.message)
  return data ?? []
}

export async function getUnreadNotificationCount(userId) {
  const { count, error } = await getClient()
    .from(DB_TABLES.NOTIFICATIONS)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) throw new ApiError(500, error.message)
  return count ?? 0
}

export async function markNotificationRead(notificationId, userId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.NOTIFICATIONS)
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Notification not found')
  return data
}

export async function markAllNotificationsRead(userId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.NOTIFICATIONS)
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .select('*')

  if (error) throw new ApiError(500, error.message)
  return data ?? []
}

export async function createAdminAlert(payload) {
  return createNotificationsForRole(USER_ROLES.ADMIN, payload)
}
