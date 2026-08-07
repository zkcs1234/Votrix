import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Database, Cloud, Mail } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

const SERVICE_ICONS = {
  database: Database,
  cloudinary: Cloud,
  resend: Mail,
}

function StatusIcon({ status }) {
  if (status === 'healthy') return <CheckCircle2 className="h-5 w-5 text-v-success" strokeWidth={2} />
  if (status === 'degraded') return <AlertCircle className="h-5 w-5 text-v-warning" strokeWidth={2} />
  return <XCircle className="h-5 w-5 text-v-danger" strokeWidth={2} />
}

function statusBg(status) {
  if (status === 'healthy') return 'border-v-success/30 bg-v-success-bg'
  if (status === 'degraded') return 'border-v-warning/30 bg-v-warning-bg'
  return 'border-v-danger/30 bg-v-danger-bg'
}

export default function HealthDashboardPage() {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await adminService.getSystemHealth()
      setHealth(data)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch system health')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHealth() }, [fetchHealth])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="v-page-title">System Health</h1>
          <p className="v-caption">Live status of platform services.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={fetchHealth} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-v-danger bg-v-danger-bg px-4 py-3 text-sm text-v-danger">{error}</div>
      )}

      {health && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${statusBg(health.overall)}`}>
          Overall status: <span className="capitalize">{health.overall}</span>
          {health.checkedAt && (
            <span className="ml-2 font-normal text-v-text-muted">
              — checked {format(parseISO(health.checkedAt), 'HH:mm:ss')}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !health
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-v-surface-elevated" />
            ))
          : health?.services?.map((svc) => {
              const Icon = SERVICE_ICONS[svc.service] ?? AlertCircle
              return (
                <Card key={svc.service} className={`border ${statusBg(svc.status)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-v-text-muted" strokeWidth={1.5} />
                      <div>
                        <p className="font-medium capitalize text-v-text">{svc.service}</p>
                        {svc.message && <p className="v-caption mt-0.5">{svc.message}</p>}
                        {svc.schemaReady === false && (
                          <p className="v-caption mt-0.5 text-v-warning">Schema not ready — run migrations</p>
                        )}
                      </div>
                    </div>
                    <StatusIcon status={svc.status} />
                  </div>
                </Card>
              )
            })}
      </div>
    </div>
  )
}
