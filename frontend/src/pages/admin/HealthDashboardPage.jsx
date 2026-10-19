import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Database, Cloud, Mail } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import FormAlert from '@/components/ui/FormAlert'
import PageHeader from '@/components/ui/PageHeader'

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

function StatusBadge({ status }) {
  const tone = status === 'healthy' ? 'success' : status === 'degraded' ? 'warning' : status === 'down' ? 'danger' : 'default'
  return <Badge tone={tone} dot className="capitalize">{status || 'Unknown'}</Badge>
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

  const database = health?.services?.find((service) => service.service === 'database')
  const schemaStatus = database?.schemaReady === true
    ? { label: 'Ready', tone: 'success' }
    : database?.schemaReady === false
      ? { label: 'Needs migrations', tone: 'warning' }
      : { label: 'Not reported', tone: 'default' }

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        description="Live status of platform services."
        actions={
          <Button size="sm" variant="secondary" onClick={fetchHealth} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
            Refresh
          </Button>
        }
      />

      {error && (
        <FormAlert variant="error">{error}</FormAlert>
      )}

      {health && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusIcon status={health.overall} />
            <div>
              <p className="font-semibold text-v-text">Platform status</p>
              <p className="v-caption">Current availability of connected services</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={health.overall} />
            {health.checkedAt && (
              <span className="v-caption">
                Checked {format(parseISO(health.checkedAt), 'HH:mm:ss')}
              </span>
            )}
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !health
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-v-surface-elevated" />
            ))
          : health?.services?.map((svc) => {
              const Icon = SERVICE_ICONS[svc.service] ?? AlertCircle
              return (
                <Card key={svc.service} className="border border-v-border bg-v-surface">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-v-surface-elevated">
                        <Icon className="h-5 w-5 text-v-text-muted" strokeWidth={1.5} />
                      </span>
                      <div>
                        <p className="font-medium capitalize text-v-text">{svc.service}</p>
                        {svc.message && <p className="v-caption mt-0.5">{svc.message}</p>}
                      </div>
                    </div>
                    <StatusBadge status={svc.status} />
                  </div>
                </Card>
              )
            })}
      </div>

      {health && (
        <section aria-labelledby="schema-readiness-title" className="space-y-3">
          <div>
            <h2 id="schema-readiness-title" className="text-base font-semibold text-v-text">Database schema readiness</h2>
            <p className="v-caption mt-1">Readiness reflects the checks reported by the health service.</p>
          </div>
          <Card padding="sm">
            <div className="v-table-wrap">
              <table className="v-table min-w-[480px]">
                <thead>
                  <tr><th>Check</th><th>Status</th><th>Details</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-medium text-v-text">Database connection</td>
                    <td><StatusBadge status={database?.status ?? 'unknown'} /></td>
                    <td>{database?.message || 'No additional details reported.'}</td>
                  </tr>
                  <tr>
                    <td className="font-medium text-v-text">Database schema</td>
                    <td><Badge tone={schemaStatus.tone}>{schemaStatus.label}</Badge></td>
                    <td>{database?.schemaReady === false ? 'Run the database migrations before using the platform.' : 'Schema readiness is only shown when reported by the health service.'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}
    </div>
  )
}
