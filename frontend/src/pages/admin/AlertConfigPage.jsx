import { useEffect, useState } from 'react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { useToast } from '@/hooks/useToast'

const ALERT_LABELS = {
  failedEmailDelivery: { label: 'Failed email delivery', hasThreshold: true, thresholdKey: 'threshold', thresholdLabel: 'Threshold (count)' },
  newOrganizerSignup: { label: 'New organizer signup', hasThreshold: false },
  eventCompletion: { label: 'Event completion', hasThreshold: false },
  suspiciousActivity: { label: 'Suspicious activity (failed logins)', hasThreshold: true, thresholdKey: 'failedLoginThreshold', thresholdLabel: 'Failed login threshold' },
}

export default function AlertConfigPage() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { success: toastSuccess, error: toastError } = useToast()

  useEffect(() => {
    adminService.getAlertConfig()
      .then(({ data }) => setConfig(data.config))
      .catch(() => toastError('Failed to load alert config'))
      .finally(() => setLoading(false))
  }, [toastError])

  const handleToggle = (key) => {
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }))
  }

  const handleThreshold = (key, thresholdKey, value) => {
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], [thresholdKey]: Number(value) } }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminService.updateAlertConfig(config)
      toastSuccess('Alert configuration saved')
    } catch {
      toastError('Failed to save alert configuration')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-v-surface-elevated" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="v-page-title">Alert Configuration</h1>
        <p className="v-caption">Configure which system events trigger admin alerts.</p>
      </div>

      <Card>
        <div className="divide-y divide-v-border">
          {config && Object.entries(ALERT_LABELS).map(([key, meta]) => {
            const alertCfg = config[key] ?? { enabled: false }
            return (
              <div key={key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <div className="flex-1">
                  <p className="font-medium text-v-text">{meta.label}</p>
                  {meta.hasThreshold && alertCfg.enabled && (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-sm text-v-text-muted">{meta.thresholdLabel}:</label>
                      <input
                        type="number"
                        min={1}
                        value={alertCfg[meta.thresholdKey] ?? 5}
                        onChange={(e) => handleThreshold(key, meta.thresholdKey, e.target.value)}
                        className="v-input w-24 text-sm"
                      />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={alertCfg.enabled}
                  onClick={() => handleToggle(key)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                    alertCfg.enabled ? 'bg-v-primary' : 'bg-v-border'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      alertCfg.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving}>Save configuration</Button>
      </div>
    </div>
  )
}
