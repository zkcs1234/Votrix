import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { notificationsService } from '@/services/notifications.service'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

function NotificationSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-v-surface-elevated" />
      ))}
    </div>
  )
}

function NotificationCard({ notification, onMarkRead }) {
  const unread = !notification.is_read
  const actionAvailable = Boolean(notification.action_url)

  return (
    <article
      className={`rounded-2xl border p-4 transition ${
        unread
          ? 'border-v-border-strong bg-v-surface'
          : 'border-v-border bg-v-surface-elevated/40'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-v-text">{notification.title}</h3>
            {unread && <Badge tone="warning">Unread</Badge>}
          </div>
          <p className="text-xs text-v-text-muted line-clamp-2">{notification.message}</p>
          <p className="text-[10px] text-v-text-subtle">
            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
          {actionAvailable && (
            <Link
              to={notification.action_url}
              className="inline-flex items-center justify-center rounded-lg border border-v-border-strong bg-v-surface px-2.5 py-1 text-xs font-medium text-v-text transition hover:bg-v-surface-elevated"
            >
              Open
            </Link>
          )}
          {unread && (
            <Button size="sm" className="!px-2.5 !py-1 !text-xs" onClick={() => onMarkRead(notification.id)}>
              Mark read
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

export default function NotificationsModal({ onClose }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState(null)
  const showLoader = useDelayedLoading(loading, 300)

  const loadNotifications = async () => {
    try {
      setLoading(true)
      const { data } = await notificationsService.getNotifications({ limit: 50 })
      setNotifications(data.notifications || [])
      setError(null)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadNotifications)
  }, [])

  const summary = useMemo(() => {
    const total = notifications.length
    const unread = notifications.filter((n) => !n.is_read).length
    const read = total - unread
    return { total, unread, read }
  }, [notifications])

  const filteredNotifications = useMemo(() => {
    const searchLower = search.trim().toLowerCase()
    return notifications.filter((notification) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'unread' && !notification.is_read) ||
        (filter === 'read' && notification.is_read)

      const haystack = `${notification.title} ${notification.message} ${notification.type}`
        .toLowerCase()
      const matchesSearch = !searchLower || haystack.includes(searchLower)

      return matchesFilter && matchesSearch
    })
  }, [notifications, search, filter])

  const handleMarkRead = async (notificationId) => {
    setSaving(true)
    try {
      await notificationsService.markRead(notificationId)
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId ? { ...notification, is_read: true } : notification,
        ),
      )
      window.dispatchEvent(new Event('votrix-notifications-updated'))
      setError(null)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update notification')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkAllRead = async () => {
    setSaving(true)
    try {
      await notificationsService.markAllRead()
      setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })))
      window.dispatchEvent(new Event('votrix-notifications-updated'))
      setError(null)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update notifications')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex max-h-[85vh] w-[90vw] sm:w-[500px] flex-col overflow-hidden rounded-2xl border border-v-border bg-v-bg shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-v-border p-4">
          <h2 className="text-lg font-semibold text-v-text">Notifications</h2>
          <Button size="sm" variant="secondary" onClick={onClose} className="!p-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-v-text-subtle">
                {summary.unread} unread / {summary.total} total
              </span>
              <Button size="sm" onClick={handleMarkAllRead} loading={saving} variant="ghost" className="!px-2 !py-1 !text-xs">
                Mark all read
              </Button>
            </div>
            
            <SearchInput
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            
            <div className="flex flex-wrap gap-1">
              {['all', 'unread', 'read'].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    filter === item
                      ? 'bg-v-primary text-white'
                      : 'bg-v-surface-elevated text-v-text-muted hover:bg-v-border'
                  }`}
                >
                  {item === 'all' ? 'All' : item.charAt(0).toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {loading || showLoader ? (
            <NotificationSkeleton />
          ) : error ? (
            <div className="rounded-xl border border-v-danger bg-v-danger-bg px-4 py-3 text-sm text-v-danger">
              {error}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-v-text-muted">No notifications match your filters.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredNotifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
