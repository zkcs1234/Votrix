import { useEffect, useState } from 'react'
import { Archive, Play, RefreshCw, Info, CheckCircle2 } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { useToast } from '@/hooks/useToast'

export default function ArchivalPolicyPage() {
  const [policy, setPolicy] = useState({ enabled: false, daysAfterCompletion: 90 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [lastRunMessage, setLastRunMessage] = useState('')
  const { success: toastSuccess, error: toastError } = useToast()

  useEffect(() => {
    adminService.getArchivalPolicy()
      .then(({ data }) => setPolicy(data.policy))
      .catch(() => toastError('Failed to load archival policy'))
      .finally(() => setLoading(false))
  }, [toastError])

  const handleToggle = () => {
    setPolicy((prev) => ({ ...prev, enabled: !prev.enabled }))
  }

  const handleDaysChange = (value) => {
    const num = Number(value) || 90
    setPolicy((prev) => ({ ...prev, daysAfterCompletion: Math.min(Math.max(1, num), 3650) }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data } = await adminService.updateArchivalPolicy(policy)
      setPolicy(data.policy)
      toastSuccess('Archival policy saved')
    } catch {
      toastError('Failed to save archival policy')
    } finally {
      setSaving(false)
    }
  }

  const handleRunNow = async () => {
    setRunning(true)
    try {
      const { data } = await adminService.runArchivalNow()
      setLastRunMessage(data.message || `Archived ${data.archived} event(s)`)
      toastSuccess(data.message || `Archived ${data.archived} event(s)`)
    } catch {
      toastError('Archival run failed')
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-v-surface-elevated" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="v-page-title">Event archival policy</h1>
          <p className="v-caption">Auto-archive completed events after a configurable period.</p>
        </div>
        <Button
          variant="secondary"
          onClick={handleRunNow}
          loading={running}
          disabled={!policy.enabled}
        >
          {running ? <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <Play className="h-4 w-4" strokeWidth={1.5} />}
          Run now
        </Button>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-v-primary" aria-hidden />
          <div className="space-y-1 text-sm text-v-text-muted">
            <p className="font-medium text-v-text">What this policy does</p>
            <p>
              Archival changes only events with a <strong className="text-v-text">Completed</strong> status.
              An event is archived when its end date is older than the number of days below.
              Active, scheduled, draft, and cancelled events are never affected.
            </p>
            <p>
              When enabled, the system checks automatically once a day. Use <strong className="text-v-text">Run now</strong> to check immediately.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="divide-y divide-v-border">
          <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div>
              <p className="font-medium text-v-text">Enable automatic archival</p>
              <p className="v-caption mt-0.5">
                When enabled, completed events older than the threshold can be archived.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={policy.enabled}
              onClick={handleToggle}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                policy.enabled ? 'bg-v-primary' : 'bg-v-border'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  policy.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div>
              <p className="font-medium text-v-text">Days after completion</p>
              <p className="v-caption mt-0.5">
                Events completed more than this many days ago will be archived on the next run.
              </p>
            </div>
            <input
              type="number"
              min={1}
              max={3650}
              value={policy.daysAfterCompletion}
              onChange={(e) => handleDaysChange(e.target.value)}
              className="v-input w-28 text-sm"
              disabled={!policy.enabled}
            />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        {lastRunMessage && (
          <p className="mr-auto inline-flex items-center gap-2 self-center text-sm text-v-text-muted">
            <CheckCircle2 className="h-4 w-4 text-v-success" aria-hidden />
            {lastRunMessage}
          </p>
        )}
        <Button onClick={handleSave} loading={saving}>
          <Archive className="h-4 w-4" strokeWidth={1.5} />
          Save policy
        </Button>
      </div>
    </div>
  )
}
