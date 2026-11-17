import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { RefreshCw, Download, X, AlertTriangle, FileSearch, ChevronUp, ChevronDown, Copy, Check, Mail, Search } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import { useToast } from '@/hooks/useToast'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import StatCard from '@/components/ui/StatCard'
import SearchInput from '@/components/ui/SearchInput'
import PageHeader from '@/components/ui/PageHeader'
import ActingUserNote from '@/components/admin/ActingUserNote'
import { INPUT_CLASS } from '@/utils/uiClasses'

// ─── Action colour coding ────────────────────────────────────────────────────

const ACTION_TONES = {
  // Creates / inserts
  CREATE: 'success',
  INSERT: 'success',
  // Updates / changes
  UPDATE: 'default',
  PATCH: 'default',
  CHANGE: 'default',
  // Deletes
  DELETE: 'danger',
  REMOVE: 'danger',
  // Auth
  LOGIN: 'warning',
  LOGOUT: 'default',
}

/**
 * Derive a Badge tone from an action string.
 * Matches the first word segment against known prefixes (case-insensitive).
 */
function actionTone(action = '') {
  const upper = action.toUpperCase()
  for (const [key, tone] of Object.entries(ACTION_TONES)) {
    if (upper.includes(key)) return tone
  }
  return 'default'
}

// ─── Rows-per-page options ───────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [25, 50, 100]
const EMPTY_VALUE = 'Not available'
const EMAIL_PAGE_SIZE = 50

// ─── Email Delivery Tab Component ────────────────────────────────────────────

function statusTone(status = '') {
  if (['sent', 'delivered', 'opened', 'clicked'].includes(status)) return 'success'
  if (['failed', 'bounced', 'complained'].includes(status)) return 'danger'
  if (['queued', 'delivery_delayed', 'skipped_duplicate', 'skipped_quota'].includes(status)) return 'warning'
  return 'default'
}

function formatEmailDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function EmailDeliveryTab({ onRefresh }) {
  const [logs, setLogs] = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: EMAIL_PAGE_SIZE, totalPages: 0 })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [workflow, setWorkflow] = useState('')
  const [providerStatus, setProviderStatus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const { error: toastError } = useToast()
  const showLoader = useDelayedLoading(loading, 300)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    adminService.getEmailDeliveryLogs({
      page,
      limit: EMAIL_PAGE_SIZE,
      search: search.trim() || undefined,
      workflow: workflow || undefined,
      providerStatus: providerStatus || undefined,
      startDate: startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59.999`).toISOString() : undefined,
    }).then(({ data }) => {
      if (cancelled) return
      setLogs(data.logs ?? [])
      setPagination(data.pagination ?? { total: 0, page, limit: EMAIL_PAGE_SIZE, totalPages: 0 })
    }).catch((err) => {
      if (!cancelled) {
        const msg = err.response?.data?.message || 'Failed to load email delivery logs.'
        setError(msg)
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [page, search, workflow, providerStatus, startDate, endDate, refreshKey])

  // Pass refresh function to parent
  useEffect(() => {
    if (onRefresh) {
      onRefresh(() => setRefreshKey((key) => key + 1))
    }
  }, [onRefresh])

  const updateFilter = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  const emailStats = useMemo(() => {
    const total = pagination.total
    const sent = logs.filter((l) => ['sent', 'delivered', 'opened', 'clicked'].includes(l.provider_status)).length
    const failed = logs.filter((l) => ['failed', 'bounced', 'complained'].includes(l.provider_status)).length
    const pending = logs.filter((l) => ['queued', 'delivery_delayed'].includes(l.provider_status)).length
    return { total, sent, failed, pending }
  }, [logs, pagination.total])

  if (loading && !showLoader) return null

  return (
    <div className="space-y-6">
      {/* Email Stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total emails" value={emailStats.total.toLocaleString()} />
        <StatCard label="Delivered" value={emailStats.sent.toLocaleString()} />
        <StatCard label="Failed" value={emailStats.failed.toLocaleString()} />
        <StatCard label="Pending" value={emailStats.pending.toLocaleString()} />
      </div>

      {/* Filters */}
      <Card>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="relative sm:col-span-2 xl:col-span-1">
            <span className="sr-only">Search recipient email</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-v-text-subtle" />
            <input
              className={`${INPUT_CLASS} pl-9`}
              value={search}
              onChange={updateFilter(setSearch)}
              placeholder="Recipient email"
            />
          </label>
          <label>
            <span className="sr-only">Workflow</span>
            <input className={INPUT_CLASS} value={workflow} onChange={updateFilter(setWorkflow)} placeholder="Workflow" />
          </label>
          <label>
            <span className="sr-only">Delivery status</span>
            <select className={INPUT_CLASS} value={providerStatus} onChange={updateFilter(setProviderStatus)}>
              <option value="">All statuses</option>
              {['queued', 'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed', 'skipped_duplicate', 'skipped_quota'].map((status) => (
                <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Start date</span>
            <input aria-label="Start date" className={INPUT_CLASS} type="date" value={startDate} onChange={updateFilter(setStartDate)} />
          </label>
          <label>
            <span className="sr-only">End date</span>
            <input aria-label="End date" className={INPUT_CLASS} type="date" value={endDate} onChange={updateFilter(setEndDate)} />
          </label>
        </div>
      </Card>

      {/* Error State */}
      {error && (
        <Card>
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-v-danger" strokeWidth={1.5} />
            <div>
              <p className="font-medium text-v-danger">{error}</p>
              <p className="mt-1 text-sm text-v-text-muted">Check the console for more details.</p>
            </div>
            <Button size="sm" onClick={() => setRefreshKey((k) => k + 1)}>Try again</Button>
          </div>
        </Card>
      )}

      {/* Table */}
      {!error && (
        <Card padding="sm">
          {loading || showLoader ? (
            <div className="p-8 text-center v-caption">Loading email delivery history…</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center">
              <Mail className="mx-auto mb-2 h-6 w-6 text-v-text-subtle" />
              <p className="text-sm font-medium text-v-text">No email delivery records found</p>
              <p className="v-caption mt-1">Records appear after the email audit migration is applied and sends are processed.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg">
                <table className="v-table min-w-[900px]">
                  <thead>
                    <tr>
                      <th>Time</th><th>Recipient</th><th>Workflow</th><th>Subject</th><th>Status</th><th>Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-v-border">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-v-surface-elevated/50">
                        <td className="whitespace-nowrap">{formatEmailDate(log.created_at)}</td>
                        <td>{log.recipient}</td>
                        <td>{log.workflow}</td>
                        <td>{log.subject || log.template_name || '—'}</td>
                        <td><Badge tone={statusTone(log.provider_status)}>{log.provider_status}</Badge></td>
                        <td className="max-w-xs whitespace-normal">
                          {log.provider_error || (log.retryable ? 'Retryable error' : log.provider_message_id ? `Provider ID: ${log.provider_message_id}` : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v-border px-4 py-3">
                <p className="v-caption">{pagination.total} record(s) · Page {pagination.page} of {Math.max(1, pagination.totalPages)}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</Button>
                  <Button variant="secondary" size="sm" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}

// ─── Utility: safe ISO date format ───────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return EMPTY_VALUE
  try {
    return format(parseISO(iso), 'MMM d, yyyy HH:mm')
  } catch {
    return iso
  }
}

// ─── Utility: format summary ────────────────────────────────────────────────

function formatDetailsSummary(log) {
  if (!log) return EMPTY_VALUE
  const action = log.action || ''
  const role = log.actor?.role || 'system'
  const formattedRole = role.charAt(0).toUpperCase() + role.slice(1)

  if (action.includes('LOGIN_SUCCESS')) return `${formattedRole} logged in successfully`
  if (action.includes('LOGIN_FAILED')) return `${formattedRole} failed to log in`
  if (action.includes('LOGOUT')) return `${formattedRole} logged out`
  
  const name = log.details?.title || log.details?.name || log.details?.email || log.entityId || ''
  
  if (action.includes('CREATE') || action.includes('INSERT')) {
    return `Created ${log.entity || 'record'}${name ? `: ${name}` : ''}`
  }
  if (action.includes('UPDATE') || action.includes('PATCH') || action.includes('CHANGE')) {
    return `Updated ${log.entity || 'record'}${name ? `: ${name}` : ''}`
  }
  if (action.includes('DELETE') || action.includes('REMOVE')) {
    return `Deleted ${log.entity || 'record'}${name ? `: ${name}` : ''}`
  }

  if (log.details?.message) return log.details.message

  return 'Action completed'
}

function formatDetailValue(value) {
  if (value === null || value === undefined || value === '') return 'Not provided'
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(formatDetailValue).join(', ') : 'None'
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, entry]) => `${key.replace(/([A-Z])/g, ' $1').trim()}: ${formatDetailValue(entry)}`)
      .join('; ')
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function formatDetailLabel(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim()
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function TableSkeleton({ rows = 8 }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-v-border">
          {Array.from({ length: 6 }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 w-full animate-pulse rounded bg-v-surface-elevated" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function AuditDetailModal({ log, onClose }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard
      .writeText(JSON.stringify(log, null, 2))
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      })
      .catch(() => {})
  }

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!log) return null

  const sections = [
    {
      title: 'Action',
      content: (
        <div className="space-y-2 text-sm text-v-text">
          <Row label="Action" value={<Badge tone={actionTone(log.action)}>{log.action}</Badge>} />
          <Row label="Entity" value={log.entity ?? EMPTY_VALUE} />
          <Row label="Entity ID" value={log.entityId ?? EMPTY_VALUE} mono />
          <Row label="Timestamp" value={formatDate(log.createdAt)} />
        </div>
      ),
    },
    {
      title: 'Actor',
      content: (
        <div className="space-y-2 text-sm text-v-text">
          <Row label="Email" value={log.actor?.email ?? 'System'} />
          <Row label="Role" value={<span className="capitalize">{log.actor?.role ?? 'system'}</span>} />
          <Row label="User ID" value={log.actor?.id ?? log.userId ?? EMPTY_VALUE} mono />
        </div>
      ),
    },
    {
      title: 'Details',
      content: log.details && Object.keys(log.details).length > 0 ? (
        <div className="space-y-2 rounded-lg bg-v-surface-elevated p-4 text-sm text-v-text">
          {Object.entries(log.details).map(([key, value]) => (
            <div key={key} className="flex flex-col sm:flex-row sm:gap-4 border-b border-v-border/50 pb-2 last:border-0 last:pb-0">
              <span className="w-1/3 shrink-0 font-medium text-v-text-subtle capitalize">
                {formatDetailLabel(key)}
              </span>
              <span className="min-w-0 break-all text-v-text">
                {formatDetailValue(value)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-v-text-subtle italic">No additional details recorded.</p>
      ),
    },
  ]

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Audit log detail"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-v-border bg-v-surface shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-v-border p-5">
            <div>
              <h2 className="text-base font-semibold text-v-text">Audit Log Detail</h2>
              <p className="v-caption mt-0.5 font-mono text-xs">{log.id}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCopy}
                className="text-xs!"
              >
                {copied ? (
                  <><Check className="h-3.5 w-3.5" strokeWidth={2} /> Copied</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" strokeWidth={1.5} /> Copy JSON</>
                )}
              </Button>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-v-text-muted hover:bg-v-surface-elevated hover:text-v-text"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Sections */}
          <div className="min-h-0 divide-y divide-v-border overflow-y-auto">
            {sections.map((section) => (
              <div key={section.title} className="p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-v-text-subtle">
                  {section.title}
                </h3>
                {section.content}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

function Row({ label, value, mono = false }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-24 shrink-0 text-v-text-subtle">{label}</span>
      <span className={`min-w-0 break-all text-v-text ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const { success: toastSuccess, error: toastError } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialEntity = searchParams.get('entity') || ''
  const initialEntityId = searchParams.get('entityId') || ''

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState(() => {
    return searchParams.get('view') === 'email' ? 'email' : 'system'
  })

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams)
    if (tab === 'email') {
      params.set('view', 'email')
    } else {
      params.delete('view')
    }
    setSearchParams(params)
  }

  // ── Email refresh handler ──
  const [emailRefreshFn, setEmailRefreshFn] = useState(null)

  // ── Data state ──
  const [logs, setLogs]           = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 })
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  // ── Filter / search state ──
  const [search, setSearch]           = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [actionFilter, setActionFilter]     = useState('')
  const [entityFilter, setEntityFilter]     = useState(initialEntity)
  const [entityIdFilter, setEntityIdFilter] = useState(initialEntityId)
  const [startDate, setStartDate]           = useState('')
  const [endDate, setEndDate]               = useState('')

  // ── Pagination state ──
  const [page, setPage]       = useState(1)
  const [limit, setLimit]     = useState(50)

  // ── Sort state ──
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'

  // ── Detail modal ──
  const [selectedLog, setSelectedLog] = useState(null)

  // ── Available filter options (derived from current page data) ──
  const actionOptions = useMemo(() => {
    const values = new Set(logs.map((l) => l.action).filter(Boolean))
    return Array.from(values).sort()
  }, [logs])

  const entityOptions = useMemo(() => {
    const values = new Set(logs.map((l) => l.entity).filter(Boolean))
    return Array.from(values).sort()
  }, [logs])

  // ── Debounce search input ──
  const debounceRef = useRef(null)
  const handleSearchChange = (e) => {
    const val = e.target.value
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(val)
      setPage(1)
    }, 350)
  }

  // ── Active filter count (for the indicator badge) ──
  const activeFilterCount = [
    debouncedSearch,
    actionFilter,
    entityFilter,
    entityIdFilter,
    startDate,
    endDate,
  ].filter(Boolean).length

  // ── Clear all filters ──
  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setActionFilter('')
    setEntityFilter('')
    setEntityIdFilter('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchLogs = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const { data } = await adminService.getAuditLogs({
        page,
        limit,
        search: debouncedSearch || undefined,
        action: actionFilter || undefined,
        entity: entityFilter || undefined,
        entityId: entityIdFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })

      // Backend sends { success, logs, pagination }
      setLogs(data.logs ?? [])
      setPagination(data.pagination ?? { total: 0, page, limit, totalPages: 0 })
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load audit logs'
      setError(msg)
      if (silent) toastError(msg)
    } finally {
      setLoading(false)
    }
  }, [page, limit, debouncedSearch, actionFilter, entityFilter, entityIdFilter, startDate, endDate, toastError])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // ── Delayed loader (avoids flash on fast connections) ──
  const showLoader = useDelayedLoading(loading, 300)

  // ── Local sort (sorts the current page) ──
  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      const tA = new Date(a.createdAt).getTime()
      const tB = new Date(b.createdAt).getTime()
      return sortDir === 'desc' ? tB - tA : tA - tB
    })
  }, [logs, sortDir])

  // ── Summary stats (current page) ──
  const summary = useMemo(() => {
    const total     = pagination.total
    const adminAct  = logs.filter((l) => l.actor?.role === 'admin').length
    const orgAct    = logs.filter((l) => l.actor?.role === 'organizer').length
    const sysAct    = logs.filter((l) => !l.actor).length
    return { total, adminAct, orgAct, sysAct }
  }, [logs, pagination.total])

  // ── Export helpers ──────────────────────────────────────────────────────

  const exportCSV = () => {
    const headers = ['Timestamp', 'Action', 'User', 'Role', 'Entity', 'Entity ID', 'Details']
    const rows = sortedLogs.map((l) => [
      formatDate(l.createdAt),
      l.action,
      l.actor?.email ?? 'System',
      l.actor?.role ?? 'system',
      l.entity ?? '',
      l.entityId ?? '',
      l.details ? JSON.stringify(l.details) : '',
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `audit-logs-page${page}-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toastSuccess('CSV exported')
  }

  const [serverExporting, setServerExporting] = useState(false)
  const exportServerCSV = async () => {
    setServerExporting(true)
    try {
      const { data } = await adminService.exportAuditLogs({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-logs-full-${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toastSuccess('Full audit log exported')
    } catch {
      toastError('Export failed')
    } finally {
      setServerExporting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const isInitialLoad = loading && !showLoader && logs.length === 0

  if (isInitialLoad) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description={
          activeTab === 'system'
            ? "Security and compliance trail for all administrative actions."
            : "Provider send and delivery status history for all outbound emails."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => activeTab === 'system' ? fetchLogs({ silent: true }) : emailRefreshFn?.()}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
            Refresh
          </Button>
          {activeTab === 'system' ? (
            <>
              <Button size="sm" variant="secondary" onClick={exportCSV} disabled={logs.length === 0}>
                <Download className="h-4 w-4" strokeWidth={1.5} />
                Export page
              </Button>
              <Button size="sm" variant="secondary" onClick={exportServerCSV} loading={serverExporting}>
                <Download className="h-4 w-4" strokeWidth={1.5} />
                Export full
              </Button>
            </>
          ) : null}
          </div>
        }
      />

      {/* Tab Switcher */}
      <div className="flex gap-1 rounded-lg bg-v-surface-elevated p-1">
        <button
          type="button"
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            activeTab === 'system'
              ? 'bg-v-surface text-v-text shadow-sm'
              : 'text-v-text-muted hover:text-v-text'
          }`}
          onClick={() => handleTabChange('system')}
        >
          System Logs
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            activeTab === 'email'
              ? 'bg-v-surface text-v-text shadow-sm'
              : 'text-v-text-muted hover:text-v-text'
          }`}
          onClick={() => handleTabChange('email')}
        >
          Email Delivery
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'email' ? (
        <EmailDeliveryTab onRefresh={(fn) => setEmailRefreshFn(() => fn)} />
      ) : (
        <>
      {/* Summary stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total logs" value={summary.total.toLocaleString()} />
        <StatCard label="Admin actions" value={summary.adminAct.toLocaleString()} />
        <StatCard label="Organizer actions" value={summary.orgAct.toLocaleString()} />
        <StatCard label="System actions" value={summary.sysAct.toLocaleString()} />
      </div>

      {/* Main card */}
      <Card>
        {error ? (
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-v-danger" strokeWidth={1.5} />
            <div>
              <p className="font-medium text-v-danger">{error}</p>
              <p className="mt-1 text-sm text-v-text-muted">Check the console for more details.</p>
            </div>
            <Button size="sm" onClick={() => fetchLogs()}>Try again</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search + filter bar */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <SearchInput
                placeholder="Search actions, users, entities…"
                value={search}
                onChange={handleSearchChange}
                className="lg:max-w-sm"
              />

              {/* Date range */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
                  className="v-input text-sm"
                  title="Start date"
                  aria-label="Filter start date"
                />
                <span className="text-v-text-subtle">–</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
                  className="v-input text-sm"
                  title="End date"
                  aria-label="Filter end date"
                />
              </div>

              {/* Action filter */}
              {actionOptions.length > 0 && (
                <select
                  value={actionFilter}
                  onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
                  className="v-input text-sm"
                  aria-label="Filter by action"
                >
                  <option value="">All actions</option>
                  {actionOptions.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              )}

              {/* Entity filter */}
              {entityOptions.length > 0 && (
                <select
                  value={entityFilter}
                  onChange={(e) => { setEntityFilter(e.target.value); setPage(1) }}
                  className="v-input text-sm"
                  aria-label="Filter by entity"
                >
                  <option value="">All entities</option>
                  {entityOptions.map((e) => (
                    <option key={e} value={e} className="capitalize">{e}</option>
                  ))}
                </select>
              )}

              {/* Clear filters */}
              {activeFilterCount > 0 && (
                <Button size="sm" variant="ghost" onClick={clearFilters} className="shrink-0">
                  Clear
                  <span className="ml-1 rounded-full bg-v-primary px-1.5 py-0.5 text-xs text-white">
                    {activeFilterCount}
                  </span>
                </Button>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg">
              <table className="v-table w-full min-w-175 text-sm">
                <thead>
                  <tr>
                    <th
                      className="whitespace-nowrap"
                      title="Sort by timestamp"
                      scope="col"
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-left"
                        onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                        aria-label={`Sort by timestamp ${sortDir === 'desc' ? 'ascending' : 'descending'}`}
                        aria-pressed={sortDir === 'asc'}
                      >
                        <span>Timestamp</span>
                        {sortDir === 'desc' ? (
                          <ChevronDown className="h-3.5 w-3.5 text-v-text-subtle" strokeWidth={2} />
                        ) : (
                          <ChevronUp className="h-3.5 w-3.5 text-v-text-subtle" strokeWidth={2} />
                        )}
                      </button>
                    </th>
                    <th>Action</th>
                    <th>User</th>
                    <th>Entity</th>
                    <th>Details</th>
                    <th className="text-right">View</th>
                  </tr>
                </thead>

                {loading || showLoader ? (
                  <TableSkeleton rows={limit > 25 ? 8 : 5} />
                ) : sortedLogs.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-v-text-subtle">
                        <div className="flex flex-col items-center gap-3">
                          <FileSearch className="h-12 w-12 text-v-border" strokeWidth={1} />
                          <p className="text-sm font-medium">No audit logs found</p>
                          {activeFilterCount > 0 && (
                            <p className="text-xs">
                              Try adjusting your filters or{' '}
                              <button className="text-v-primary underline" onClick={clearFilters}>
                                clear them
                              </button>
                              .
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  <tbody className="divide-y divide-v-border">
                    {sortedLogs.map((log) => (
                      <tr
                        key={log.id}
                        className="hover:bg-v-surface-elevated/50 transition-colors"
                      >
                        {/* Timestamp */}
                        <td className="whitespace-nowrap font-mono text-xs text-v-text-muted">
                          {formatDate(log.createdAt)}
                        </td>

                        {/* Action */}
                        <td>
                          <Badge tone={actionTone(log.action)} className="whitespace-nowrap">
                            {log.action}
                          </Badge>
                        </td>

                        {/* User */}
                        <td>
                          <div className="space-y-0.5">
                            <p className="font-medium text-v-text">
                              {log.actor?.email ?? 'System'}
                            </p>
                            <p className="v-caption capitalize">
                              {log.actor?.role ?? 'system'}
                            </p>
                            <ActingUserNote log={log} />
                          </div>
                        </td>

                        {/* Entity */}
                        <td className="capitalize text-v-text-muted">
                          {log.entity ?? EMPTY_VALUE}
                        </td>

                        {/* Details preview */}
                        <td className="max-w-60 truncate text-xs text-v-text-muted" title={log.details ? formatDetailsSummary(log) : undefined}>
                          {log.details
                            ? formatDetailsSummary(log)
                            : <span className="italic">—</span>
                          }
                        </td>

                        {/* View button */}
                        <td className="text-right">
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-v-primary hover:bg-v-surface-elevated transition-colors"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
            </div>

            {/* Pagination bar */}
            {pagination.totalPages > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v-border pt-4 text-sm">
                {/* Row count info */}
                <p className="text-v-text-muted">
                  {pagination.total === 0
                    ? 'No records'
                    : `Showing ${((page - 1) * limit) + 1}–${Math.min(page * limit, pagination.total)} of ${pagination.total.toLocaleString()} records`}
                </p>

                <div className="flex items-center gap-3">
                  {/* Rows per page */}
                  <div className="flex items-center gap-2 text-v-text-muted">
                    <span>Rows:</span>
                    <select
                      value={limit}
                      onChange={(e) => {
                        setLimit(Number(e.target.value))
                        setPage(1)
                      }}
                      className="v-input w-20 text-sm"
                      aria-label="Rows per page"
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>

                  {/* Page navigation */}
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage(1)}
                      aria-label="First page"
                    >
                      «
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => p - 1)}
                      aria-label="Previous page"
                    >
                      ‹
                    </Button>

                    {/* Page number pills */}
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      // Build a window of up to 5 pages centred on current page
                      const half  = 2
                      let start = Math.max(1, page - half)
                      const end = Math.min(pagination.totalPages, start + 4)
                      start = Math.max(1, end - 4)
                      return start + i
                    })
                      .filter((n) => n >= 1 && n <= pagination.totalPages)
                      .map((n) => (
                        <Button
                          key={n}
                          size="sm"
                          variant={n === page ? 'primary' : 'secondary'}
                          onClick={() => setPage(n)}
                          disabled={loading}
                          aria-label={`Page ${n}`}
                          aria-current={n === page ? 'page' : undefined}
                        >
                          {n}
                        </Button>
                      ))}

                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={page >= pagination.totalPages || loading}
                      onClick={() => setPage((p) => p + 1)}
                      aria-label="Next page"
                    >
                      ›
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={page >= pagination.totalPages || loading}
                      onClick={() => setPage(pagination.totalPages)}
                      aria-label="Last page"
                    >
                      »
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Detail modal */}
      {selectedLog && (
        <AuditDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
      </>
      )}
    </div>
  )
}
