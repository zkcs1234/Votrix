import api from '@/services/api'

const base = '/notifications'

export const notificationsService = {
  getNotifications(params = {}) {
    return api.get(base, { params })
  },
  getUnreadCount() {
    return api.get(`${base}/unread-count`)
  },
  markRead(notificationId) {
    return api.patch(`${base}/${notificationId}/read`)
  },
  markAllRead() {
    return api.patch(`${base}/read-all`)
  },
}
