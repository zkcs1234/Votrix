import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ShieldOff, Monitor, RefreshCw } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import { useToast } from '@/hooks/useToast'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' }
  const browser =
    ua.match(/Edg\/([\d.]+)/)?.[0] ||
    ua.match(/Chrome\/([\d.]+)/)?.[0] ||
    ua.match(/Firefox\/([\d.]+)/)?.[0] ||
    ua.match(/Safari\/([\d.]+)/)?.[0] ||
    'Browser'
  const os =
    ua.match(/Windows NT [\d.]+/)?.[0] ||
    ua.match(/Mac OS X [\d_]+/)?.[0]?.replace(/_/g, '.') ||
    ua.match(/Android [\d.]+/)?.[0] ||
    ua.match(/iOS [\d_]+/)?.[0]?.replace(/_/g, '.') ||
    'Unknown OS'
  return { browser, os }
}

function formatDate(iso) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'MMM d, yyyy HH:mm') } catch { return iso }
}

export default function SessionManagementPage() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [revokingId, setRevokingId] = useState(null)
  const [revokingUser, setRevokingUser] = useState(null)
  const showLoader = useDelayedLoading(loading, 300)
  const { success: toastSuccess, error: toastError } = useToast()

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await adminService.listSessions()
      setSessions(data.sessions ?? [])
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return sessions
    return sessions.filter((s) => {
      const email = s.users?.email?.toLowerCase() ?? ''
      const role = s.users?.role?.toLowerCase() ?? ''
      const ip = s.ip_address?.toLowerCase() ?? ''
      const ua = s.user_agent?.toLowerCase() ?? ''
      return email.includes(term) || role.includes(term) || ip.includes(term) || ua.includes(term)
    })
  }, [sessions, search])

  const groupedByUser = useMemo(() => {
    const map = new Map()
    for (const s of filtered) {
      const key = s.user_id ?? 'unknown'
      if (!map.has(key)) {
        map.set(key, {
          user: s.users,
          sessions: [],
        })
      }
      map.get(key).sessions.push(s)
    }
    return Array.from(map.values())
  }, [filtered])

  const handleRevoke = async (session) => {
    setRevokingId(session.id)
    try {
      await adminService.revokeSession(session.id)
      toastSuccess('Session revoked')
      setSessions((prev) => prev.filter((s) => s.id !== session.id))
    } catch (err) {
      toastError(err.response?.data?.message || 'Failed to revoke session')
    } finally {
      setRevokingId(null)
    }
  }

  const handleRevokeAll = async (userId, email) => {
    if (!window.confirm(`Revoke all sessions for ${email}? They will be signed out everywhere.`)) {
      return
    }
    setRevokingUser(userId)
    try {
      const { data } = await adminService.revokeAllUserSessions(userId)
      toastSuccess(`Revoked ${data.revokedCount} session(s)`)
      setSessions((prev) => prev.filter((s) => s.user_id !== userId))
    } catch (err) {
      toastError(err.response?.data?.message || 'Failed to revoke sessions')
    } finally {
      setRevokingUser(null)
    }
  }

  if (loading && showLoader) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-v-surface-elevated" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-v-surface-elevated" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="v-page-title">Active sessions</h1>
          <p className="v-caption">View and revoke active user sessions across the platform.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchSessions} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          placeholder="Search by email, role, IP or user agent"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-md"
        />
        <p className="v-caption">
          {filtered.length} session(s) across {groupedByUser.length} user(s)
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-v-danger bg-v-danger-bg px-4 py-3 text-sm text-v-danger">
          {error}
        </div>
      )}

      {!loading && groupedByUser.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Monitor className="h-10 w-10 text-v-border" strokeWidth={1} />
            <p className="text-sm text-v-text-subtle">No active sessions found.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedByUser.map(({ user, sessions: userSessions }) => (
            <Card key={user?.id ?? 'unknown'}>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-v-text">{user?.email ?? 'Unknown user'}</p>
                    {user?.role && <Badge tone="default">{user.role}</Badge>}
                    <span className="v-caption">{userSessions.length} session(s)</span>
                  </div>
                  {userSessions.length > 1 && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleRevokeAll(user.id, user?.email)}
                      loading={revokingUser === user.id}
                    >
                      <ShieldOff className="h-4 w-4" strokeWidth={1.5} />
                      Revoke all
                    </Button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="v-table w-full text-sm">
                    <thead>
                      <tr>
                        <th>IP address</th>
                        <th>Browser / OS</th>
                        <th>Last active</th>
                        <th>Created</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-v-border">
                      {userSessions.map((s) => {
                        const { browser, os } = parseUserAgent(s.user_agent)
                        return (
                          <tr key={s.id} className="hover:bg-v-surface-elevated/50">
                            <td className="font-mono text-xs text-v-text-muted">{s.ip_address || '—'}</td>
                            <td>
                              <p className="text-sm">{browser}</p>
                              <p className="v-caption">{os}</p>
                            </td>
                            <td className="v-caption">{formatDate(s.last_activity_at)}</td>
                            <td className="v-caption">{formatDate(s.created_at)}</td>
                            <td className="text-right">
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleRevoke(s)}
                                loading={revokingId === s.id}
                              >
                                Revoke
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
