import { useEffect, useState } from 'react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import { useToast } from '@/hooks/useToast'
import { wholeNumberInRange } from '@/utils/wholeNumber'
import { FORM_LIMITS } from '../../../../shared/form-rules.js'

const ALERT_LABELS = {
  failedEmailDelivery: { label: 'Failed email delivery', description: 'Notify admins when outbound email repeatedly fails.', hasThreshold: true, thresholdKey: 'threshold', thresholdLabel: 'Threshold (count)' },
  eventCompletion: { label: 'Event completion', description: 'Notify admins when an event reaches its completion state.', hasThreshold: false },
  suspiciousActivity: { label: 'Suspicious activity (failed logins)', description: 'Notify admins after repeated failed login attempts.', hasThreshold: true, thresholdKey: 'failedLoginThreshold', thresholdLabel: 'Failed login threshold' },
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

  // The raw text of a threshold is kept in `drafts` so the admin can clear the box
  // and retype (an empty box used to turn into 0). The numeric value is written to
  // `config` only while the text is valid.
  const [drafts, setDrafts] = useState({})
  const [touched, setTouched] = useState({})
  const thresholdText = (key, meta, alertCfg) => drafts[key] ?? String(alertCfg[meta.thresholdKey] ?? 5)
  const thresholdError = (key, meta, alertCfg) =>
    wholeNumberInRange(thresholdText(key, meta, alertCfg), { label: meta.thresholdLabel, min: 1, max: FORM_LIMITS.alertThresholdMax })

  const handleThreshold = (key, thresholdKey, value) => {
    setDrafts((prev) => ({ ...prev, [key]: value }))
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }))
    const n = Number(value)
    if (value.trim() !== '' && Number.isInteger(n)) {
      setConfig((prev) => ({ ...prev, [key]: { ...prev[key], [thresholdKey]: n } }))
    }
  }

  // Only alerts that are switched on need a valid threshold.
  const invalidAlert = config && Object.entries(ALERT_LABELS).find(([key, meta]) => {
    const alertCfg = config[key] ?? { enabled: false }
    return meta.hasThreshold && alertCfg.enabled && thresholdError(key, meta, alertCfg)
  })

  const handleSave = async (event) => {
    event.preventDefault()
    if (invalidAlert) {
      setTouched((prev) => ({ ...prev, [invalidAlert[0]]: true }))
      return
    }
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
      <PageHeader
        title="Alerts"
        description="Configure operational alerts and positive trigger thresholds."
        actions={<Button type="submit" form="alert-config-form" loading={saving} disabled={!config || Boolean(invalidAlert)}>Save alerts</Button>}
      />

      <Card>
        <form id="alert-config-form" onSubmit={handleSave} noValidate>
          {invalidAlert && (
            <p className="v-caption mb-2" role="status">
              Fix the threshold for &ldquo;{invalidAlert[1].label}&rdquo; to save.
            </p>
          )}
          <h2 className="mb-2 text-sm font-semibold text-v-text">Email and event alerts</h2>
          <div className="divide-y divide-v-border">
            {config && Object.entries(ALERT_LABELS).map(([key, meta]) => {
              const alertCfg = config[key] ?? { enabled: false }
              return (
                <div key={key} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-v-text">{meta.label}</p>
                    <p className="mt-1 text-sm text-v-text-muted">{meta.description}</p>
                    {meta.hasThreshold && alertCfg.enabled && (() => {
                      const error = touched[key] ? thresholdError(key, meta, alertCfg) : null
                      return (
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-v-text-muted" htmlFor={`${key}-threshold`}>{meta.thresholdLabel} *</label>
                            <input
                              id={`${key}-threshold`}
                              type="number"
                              min={1}
                              step={1}
                              value={thresholdText(key, meta, alertCfg)}
                              onChange={(e) => handleThreshold(key, meta.thresholdKey, e.target.value)}
                              onBlur={() => setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }))}
                              className={`v-input w-24 text-sm${error ? ' v-input-error' : ''}`}
                              aria-required="true"
                              aria-invalid={error ? true : undefined}
                              aria-describedby={error ? `${key}-threshold-error` : undefined}
                            />
                          </div>
                          {error && <p id={`${key}-threshold-error`} role="alert" className="v-error-text">{error}</p>}
                        </div>
                      )
                    })()}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={alertCfg.enabled}
                    onClick={() => handleToggle(key)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v-primary focus-visible:ring-offset-2 ${
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
        </form>
      </Card>
    </div>
  )
}
