import { useEffect, useMemo, useState } from 'react'
import { adminService } from '@/services/admin.service'
import Card from '@/components/ui/Card'
import { format } from 'date-fns'
import SearchInput from '@/components/ui/SearchInput'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import StatCard from '@/components/ui/StatCard'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const showLoader = useDelayedLoading(loading, 300)

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true)
        const { data } = await adminService.getAuditLogs()
        setLogs(data.logs || [])
      } catch {
        setError('Failed to load audit logs')
      } finally {
        setLoading(false)
      }
    }
    fetchLogs()
  }, [])

  const actionOptions = useMemo(() => {
    const values = new Set(
      logs.map((log) => log.action).filter(Boolean),
    )
    return ['all', ...Array.from(values).sort()]
  }, [logs])

  const summary = useMemo(() => {
    const total = logs.length
    const system = logs.filter((log) => !log.users?.email).length
    const adminActions = logs.filter((log) => log.users?.role === 'admin').length
    const organized = logs.filter((log) => log.users?.role === 'organizer').length
    return { total, system, adminActions, organized }
  }, [logs])

  const filteredLogs = useMemo(() => {
    const searchLower = search.trim().toLowerCase()
    return logs.filter((log) => {
      const haystack = [
        log.action,
        log.entity,
        log.users?.email,
        log.users?.role,
        JSON.stringify(log.details ?? {}),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesSearch = !searchLower || haystack.includes(searchLower)
      const matchesAction = actionFilter === 'all' || log.action === actionFilter
      return matchesSearch && matchesAction
    })
  }, [logs, search, actionFilter])

  if (loading && !showLoader) {
    return null
  }

  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-40 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="mt-2 h-4 w-80 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
        </div>
        <Card>
          <div className="h-10 w-full animate-pulse rounded-xl bg-v-surface-elevated" />
          <div className="mt-4 flex gap-3 overflow-x-auto">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 w-32 animate-pulse rounded-xl bg-v-surface-elevated" />
            ))}
          </div>
          <div className="mt-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-v-surface-elevated" />
            ))}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="v-page-title">Audit logs</h1>
        <p className="v-caption">
          Review administrative and system actions for security and compliance.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total logs" value={summary.total} />
        <StatCard label="Admin actions" value={summary.adminActions} />
        <StatCard label="Organizer actions" value={summary.organized} />
        <StatCard label="System actions" value={summary.system} />
      </div>

      <Card>
        {error ? (
          <div className="p-8 text-center text-v-danger">{error}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <SearchInput
                placeholder="Search actions, users, entities, or details"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="lg:max-w-xl"
              />

              <div className="flex flex-wrap gap-2">
                {actionOptions.map((action) => (
                  <Button
                    key={action}
                    type="button"
                    variant={actionFilter === action ? 'primary' : 'secondary'}
                    onClick={() => setActionFilter(action)}
                  >
                    {action === 'all' ? 'All actions' : action}
                  </Button>
                ))}
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-v-border p-8 text-center text-v-text-subtle">
                No audit logs match your current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="v-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action</th>
                      <th>User</th>
                      <th>Entity</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-v-border">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-v-surface-elevated/50">
                        <td className="whitespace-nowrap text-v-text-muted">
                          {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                        </td>
                        <td>
                          <Badge>{log.action}</Badge>
                        </td>
                        <td>
                          <div className="space-y-1">
                            <p className="font-medium text-v-text">{log.users?.email || 'System'}</p>
                            <p className="v-caption capitalize">{log.users?.role || 'system'}</p>
                          </div>
                        </td>
                        <td className="capitalize text-v-text-muted">{log.entity || 'N/A'}</td>
                        <td>
                          {log.details ? (
                            <pre className="max-w-[320px] overflow-hidden text-xs text-v-text-muted">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
