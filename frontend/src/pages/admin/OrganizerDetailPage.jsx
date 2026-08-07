import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, Activity, ChevronLeft, ChevronRight } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'

const ACTION_TONES = {
  CREATE: 'success', INSERT: 'success',
  UPDATE: 'default', PATCH: 'default', CHANGE: 'default',
  DELETE: 'danger', REMOVE: 'danger',
  LOGIN: 'warning', LOGOUT: 'default',
}

function actionTone(action = '') {
  const upper = action.toUpperCase()
  for (const [key, tone] of Object.entries(ACTION_TONES)) {
    if (upper.includes(key)) return tone
  }
  return 'default'
}

function formatDate(iso) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'MMM d, yyyy HH:mm') } catch { return iso }
}

export default function OrganizerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')

  const fetchActivity = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await adminService.getOrganizerActivity(id, {
        page,
        limit: 50,
        action: actionFilter || undefined,
        entity: entityFilter || undefined,
      })
      setLogs(data.logs ?? [])
      setPagination(data.pagination ?? { total: 0, page, limit: 50, totalPages: 0 })
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [id, page, actionFilter, entityFilter])

  useEffect(() => { fetchActivity() }, [fetchActivity])

  const actionOptions = useMemo(() => [...new Set(logs.map((l) => l.action).filter(Boolean))].sort(), [logs])
  const entityOptions = useMemo(() => [...new Set(logs.map((l) => l.entity).filter(Boolean))].sort(), [logs])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => navigate('/admin/organizers')}>
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Back
        </Button>
        <div>
          <h1 className="v-page-title">Organizer Activity</h1>
          <p className="v-caption font-mono text-xs">{id}</p>
        </div>
      </div>

      <Card>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {actionOptions.length > 0 && (
              <select
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
                className="v-input text-sm"
                aria-label="Filter by action"
              >
                <option value="">All actions</option>
                {actionOptions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
            {entityOptions.length > 0 && (
              <select
                value={entityFilter}
                onChange={(e) => { setEntityFilter(e.target.value); setPage(1) }}
                className="v-input text-sm"
                aria-label="Filter by entity"
              >
                <option value="">All entities</option>
                {entityOptions.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            )}
            {(actionFilter || entityFilter) && (
              <Button size="sm" variant="ghost" onClick={() => { setActionFilter(''); setEntityFilter(''); setPage(1) }}>
                Clear filters
              </Button>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-v-danger bg-v-danger-bg px-4 py-3 text-sm text-v-danger">{error}</div>
          )}

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-v-surface-elevated" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Activity className="h-12 w-12 text-v-border" strokeWidth={1} />
              <p className="text-sm text-v-text-subtle">No activity recorded for this organizer.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="v-table w-full text-sm">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-v-border">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-v-surface-elevated/50">
                      <td className="whitespace-nowrap font-mono text-xs text-v-text-muted">{formatDate(log.createdAt)}</td>
                      <td><Badge tone={actionTone(log.action)}>{log.action}</Badge></td>
                      <td className="capitalize text-v-text-muted">{log.entity ?? '—'}</td>
                      <td className="max-w-[280px] truncate text-xs text-v-text-muted">
                        {log.details ? JSON.stringify(log.details) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-v-border pt-4 text-sm">
              <p className="text-v-text-muted">
                {pagination.total} total records
              </p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" strokeWidth={2} />
                </Button>
                <span className="px-2 text-v-text-muted">{page} / {pagination.totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" strokeWidth={2} />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
