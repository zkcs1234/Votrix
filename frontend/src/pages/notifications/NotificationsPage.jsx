import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { notificationsService } from '@/services/notifications.service'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import StatCard from '@/components/ui/StatCard'
import SearchInput from '@/components/ui/SearchInput'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

const TYPE_TONE = {
  'organizer.pending': 'warning',
  'organizer.status': 'default',
  'event.notification': 'success',
  'voter.invitation': 'warning',
  'voter.invitation.resend': 'warning',
}

function NotificationSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-v-surface-elevated" />
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-v-text">{notification.title}</h3>
            <Badge tone={TYPE_TONE[notification.type] ?? 'default'}>
              {notification.type.replace('.', ' ')}
            </Badge>
            {unread && <Badge tone="warning">Unread</Badge>}
          </div>
          <p className="text-sm text-v-text-muted">{notification.message}</p>
          <p className="text-xs text-v-text-subtle">
            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {actionAvailable && (
            <Link
              to={notification.action_url}
              className="inline-flex items-center justify-center rounded-lg border border-v-border-strong bg-v-surface px-3 py-1.5 text-sm font-medium text-v-text transition hover:bg-v-surface-elevated"
            >
              Open
            </Link>
          )}
          {unread && (
            <Button size="sm" onClick={() => onMarkRead(notification.id)}>
              Mark read
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

export default function NotificationsPage() {
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

  if (loading && !showLoader) {
    return null
  }

  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="mt-2 h-4 w-80 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
        </div>
        <NotificationSkeleton />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="v-page-title">Notifications</h1>
          <p className="v-caption">
            Keep track of organizer approvals, event updates, invitations, and responses.
          </p>
        </div>
        <Button onClick={handleMarkAllRead} loading={saving} variant="secondary">
          Mark all read
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total" value={summary.total} />
        <StatCard label="Unread" value={summary.unread} />
        <StatCard label="Read" value={summary.read} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput
          placeholder="Search notifications"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-lg"
        />

        <div className="flex flex-wrap gap-2">
          {['all', 'unread', 'read'].map((item) => (
            <Button
              key={item}
              type="button"
              variant={filter === item ? 'primary' : 'secondary'}
              onClick={() => setFilter(item)}
            >
              {item === 'all' ? 'All' : item.charAt(0).toUpperCase() + item.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-v-danger bg-v-danger-bg px-4 py-3 text-sm text-v-danger">
          {error}
        </div>
      ) : filteredNotifications.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="v-caption">No notifications match your filters.</p>
        </Card>
      ) : (
        <div className="space-y-3">
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
  )
}
