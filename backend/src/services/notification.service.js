// Phase 9 — refactored to use the shared `foundation/` helpers.
// Behaviour and the exported surface are unchanged.

import { db, wrap } from '../foundation/db.js'
import { notFound } from '../foundation/errors.js'
import { DB_TABLES, USER_ROLES } from '../utils/constants.js'

import { emitToUser } from '../websocket/ws-emitter.js'

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
  const notification = wrap(
    await db()
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
      .single(),
    { context: 'notification.createNotification' },
  )

  if (notification) {
    emitToUser(userId, 'notification:created', {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      actionUrl: notification.action_url,
      createdAt: notification.created_at,
    })
  }

  return notification
}

export async function createNotificationsForUsers(userIds, payload) {
  const ids = (userIds ?? []).filter(Boolean)
  if (!ids.length) return []

  const notifications = wrap(
    await db()
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
      .select('*'),
    { context: 'notification.createNotificationsForUsers' },
  ) ?? []

  for (const notification of notifications) {
    emitToUser(notification.user_id, 'notification:created', {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      actionUrl: notification.action_url,
      createdAt: notification.created_at,
    })
  }

  return notifications
}

export async function createNotificationsForRole(role, payload) {
  const rows = wrap(
    await db().from(DB_TABLES.USERS).select('id').eq('role', role),
    { context: 'notification.createNotificationsForRole' },
  )
  return createNotificationsForUsers((rows ?? []).map((row) => row.id), payload)
}

export async function listNotifications(
  userId,
  { unreadOnly = false, limit = 25, type = null, entity = null } = {},
) {
  let query = db()
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

  return wrap(await query, { context: 'notification.listNotifications' }) ?? []
}

export async function getUnreadNotificationCount(userId) {
  const { count, error } = await db()
    .from(DB_TABLES.NOTIFICATIONS)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) {
    const { serverError } = await import('../foundation/errors.js')
    throw serverError(`notification.getUnreadNotificationCount: ${error.message}`)
  }
  return count ?? 0
}

export async function markNotificationRead(notificationId, userId) {
  const data = wrap(
    await db()
      .from(DB_TABLES.NOTIFICATIONS)
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select('*')
      .single(),
    { context: 'notification.markNotificationRead' },
  )
  if (!data) throw notFound('Notification not found')
  return data
}

export async function markAllNotificationsRead(userId) {
  return wrap(
    await db()
      .from(DB_TABLES.NOTIFICATIONS)
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .select('*'),
    { context: 'notification.markAllNotificationsRead' },
  ) ?? []
}

export async function createAdminAlert(payload) {
  return createNotificationsForRole(USER_ROLES.ADMIN, payload)
}
