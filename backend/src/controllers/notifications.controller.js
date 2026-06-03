import { asyncHandler } from '../utils/asyncHandler.js'
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notification.service.js'

export const getNotifications = asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unreadOnly === 'true'
  const limit = Math.min(Number(req.query.limit) || 25, 100)
  const type = typeof req.query.type === 'string' && req.query.type.trim() ? req.query.type.trim() : null
  const entity = typeof req.query.entity === 'string' && req.query.entity.trim() ? req.query.entity.trim() : null
  const notifications = await listNotifications(req.user.id, { unreadOnly, limit, type, entity })
  res.json({ success: true, notifications })
})

export const getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await getUnreadNotificationCount(req.user.id)
  res.json({ success: true, unreadCount })
})

export const markRead = asyncHandler(async (req, res) => {
  const notification = await markNotificationRead(req.params.notificationId, req.user.id)
  res.json({ success: true, notification })
})

export const markAllRead = asyncHandler(async (req, res) => {
  const notifications = await markAllNotificationsRead(req.user.id)
  res.json({ success: true, notifications })
})
