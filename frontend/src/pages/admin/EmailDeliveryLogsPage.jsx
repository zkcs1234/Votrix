import { useEffect, useState } from 'react'
import { Mail, RefreshCw, Search } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import FormAlert from '@/components/ui/FormAlert'
import { INPUT_CLASS } from '@/utils/uiClasses'

const PAGE_SIZE = 50

function statusTone(status = '') {
  if (['sent', 'delivered', 'opened', 'clicked'].includes(status)) return 'success'
  if (['failed', 'bounced', 'complained'].includes(status)) return 'danger'
  if (['queued', 'delivery_delayed', 'skipped_duplicate', 'skipped_quota'].includes(status)) return 'warning'
  return 'default'
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function EmailDeliveryLogsPage() {
  const [logs, setLogs] = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [workflow, setWorkflow] = useState('')
  const [providerStatus, setProviderStatus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    adminService.getEmailDeliveryLogs({
      page,
      limit: PAGE_SIZE,
      search: search.trim() || undefined,
      workflow: workflow || undefined,
      providerStatus: providerStatus || undefined,
      startDate: startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59.999`).toISOString() : undefined,
    }).then(({ data }) => {
      if (cancelled) return
      setLogs(data.logs ?? [])
      setPagination(data.pagination ?? { total: 0, page, limit: PAGE_SIZE, totalPages: 0 })
    }).catch((err) => {
      if (!cancelled) setError(err.response?.data?.message || 'Failed to load email delivery logs.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [page, search, workflow, providerStatus, startDate, endDate, refreshKey])

  const updateFilter = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="v-page-title">Email Delivery</h1>
          <p className="v-caption">Provider send and delivery status history. Provider credentials and raw payloads are not shown.</p>
        </div>
        <Button variant="secondary" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

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

      {error && <FormAlert variant="error">{error}</FormAlert>}

      <Card padding="sm">
        {loading ? (
          <div className="p-8 text-center v-caption">Loading email delivery history…</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center">
            <Mail className="mx-auto mb-2 h-6 w-6 text-v-text-subtle" />
            <p className="text-sm font-medium text-v-text">No email delivery records found</p>
            <p className="v-caption mt-1">Records appear after the email audit migration is applied and sends are processed.</p>
          </div>
        ) : (
          <>
            <div className="v-table-wrap">
              <table className="v-table">
                <thead>
                  <tr>
                    <th>Time</th><th>Recipient</th><th>Workflow</th><th>Subject</th><th>Status</th><th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap">{formatDate(log.created_at)}</td>
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
    </div>
  )
}
