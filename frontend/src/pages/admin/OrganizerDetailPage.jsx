import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, Activity, ChevronLeft, ChevronRight, Copy, Check, X } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'

const ACTION_TONES = {
  CREATE: 'success', INSERT: 'success',
  UPDATE: 'default', PATCH: 'default', CHANGE: 'default',
  DELETE: 'danger', REMOVE: 'danger',
  LOGIN: 'warning', LOGOUT: 'default',
}
const EMPTY_VALUE = 'Not available'

function actionTone(action = '') {
  const upper = action.toUpperCase()
  for (const [key, tone] of Object.entries(ACTION_TONES)) {
    if (upper.includes(key)) return tone
  }
  return 'default'
}

function formatDate(iso) {
  if (!iso) return EMPTY_VALUE
  try { return format(parseISO(iso), 'MMM d, yyyy HH:mm') } catch { return iso }
}

function formatDetailLabel(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim()
}

function formatDetailValue(value) {
  if (value === null || value === undefined || value === '') return 'Not provided'
  if (Array.isArray(value)) return value.length > 0 ? value.map(formatDetailValue).join(', ') : 'None'
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, entry]) => `${formatDetailLabel(key)}: ${formatDetailValue(entry)}`)
      .join('; ')
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function formatDetailsSummary(details) {
  if (!details || Object.keys(details).length === 0) return EMPTY_VALUE
  return Object.entries(details)
    .map(([key, value]) => `${formatDetailLabel(key)}: ${formatDetailValue(value)}`)
    .join('; ')
}

function ActivityDetailModal({ log, onClose }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }

  useEffect(() => {
    const handleKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Organizer activity detail" className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-v-border bg-v-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-v-border p-5">
            <div>
              <h2 className="text-base font-semibold text-v-text">Activity detail</h2>
              <p className="v-caption mt-0.5">{formatDate(log.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={handleCopy} className="text-xs!">
                {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy JSON</>}
              </Button>
              <button onClick={onClose} className="rounded-lg p-1.5 text-v-text-muted hover:bg-v-surface-elevated hover:text-v-text" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 space-y-5 overflow-y-auto p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailValue label="Action" value={<Badge tone={actionTone(log.action)}>{log.action}</Badge>} />
              <DetailValue label="Entity" value={log.entity ?? EMPTY_VALUE} />
              <DetailValue label="Entity ID" value={log.entityId ?? EMPTY_VALUE} mono />
              <DetailValue label="Timestamp" value={formatDate(log.createdAt)} />
            </div>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-v-text-subtle">Recorded details</h3>
              {log.details && Object.keys(log.details).length > 0 ? (
                <div className="space-y-3 rounded-lg bg-v-surface-elevated p-4">
                  {Object.entries(log.details).map(([key, value]) => (
                    <div key={key} className="grid gap-1 border-b border-v-border/50 pb-3 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)] sm:gap-4">
                      <span className="font-medium capitalize text-v-text-subtle">{formatDetailLabel(key)}</span>
                      <span className="wrap-break-word text-sm text-v-text">{formatDetailValue(value)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm italic text-v-text-subtle">No additional details recorded.</p>}
            </section>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

function DetailValue({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-v-text-subtle">{label}</p>
      <div className={`mt-1 wrap-break-word text-sm text-v-text ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  )
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
  const [selectedLog, setSelectedLog] = useState(null)

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
            <FormAlert variant="error">{error}</FormAlert>
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
                    <th className="text-right">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-v-border">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-v-surface-elevated/50">
                      <td className="whitespace-nowrap font-mono text-xs text-v-text-muted">{formatDate(log.createdAt)}</td>
                      <td><Badge tone={actionTone(log.action)}>{log.action}</Badge></td>
                      <td className="capitalize text-v-text-muted">{log.entity ?? EMPTY_VALUE}</td>
                      <td className="max-w-70 truncate text-xs text-v-text-muted">
                        {formatDetailsSummary(log.details)}
                      </td>
                      <td className="text-right">
                        <button onClick={() => setSelectedLog(log)} className="rounded-md px-2 py-1 text-xs font-medium text-v-primary hover:bg-v-surface-elevated" aria-label="View activity details">
                          View
                        </button>
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

      {selectedLog && <ActivityDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  )
}
