import { useEffect, useMemo, useState } from 'react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import StatCard from '@/components/ui/StatCard'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

const DEFAULT_SETTINGS = [
  {
    key: 'platform_name',
    label: 'Platform name',
    description: 'Shown in the app header, login screens, and notifications.',
    type: 'string',
    defaultValue: 'Votrix',
  },
  {
    key: 'maintenance_mode',
    label: 'Maintenance mode',
    description: 'When enabled, only admins should be allowed to sign in.',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'max_organizers',
    label: 'Maximum organizers allowed',
    description: 'Soft limit used for internal capacity and planning.',
    type: 'number',
    defaultValue: 100,
  },
]

function inferType(value) {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (Array.isArray(value) || (value && typeof value === 'object')) return 'json'
  return 'string'
}

function formatInputValue(type, value) {
  if (type === 'boolean') return Boolean(value)
  if (type === 'json') return JSON.stringify(value ?? {}, null, 2)
  if (value === null || value === undefined) return ''
  return String(value)
}

function hydrateSettings(apiSettings = []) {
  const settingsByKey = new Map(apiSettings.map((setting) => [setting.setting_key, setting]))
  const rows = DEFAULT_SETTINGS.map((setting) => {
    const found = settingsByKey.get(setting.key)
    const value = found?.setting_value ?? setting.defaultValue
    return {
      key: setting.key,
      label: setting.label,
      description: found?.description || setting.description,
      type: setting.type,
      value: formatInputValue(setting.type, value),
    }
  })

  for (const setting of apiSettings) {
    if (rows.some((row) => row.key === setting.setting_key)) continue
    const type = inferType(setting.setting_value)
    rows.push({
      key: setting.setting_key,
      label: setting.setting_key.replace(/_/g, ' '),
      description: setting.description || 'Custom platform setting',
      type,
      value: formatInputValue(type, setting.setting_value),
    })
  }

  return rows
}

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const showLoader = useDelayedLoading(loading, 300)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true)
        const { data } = await adminService.getSystemSettings()
        setSettings(hydrateSettings(data.settings || []))
        setError(null)
      } catch {
        setError('Failed to load system settings')
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [])

  const summary = useMemo(() => {
    const total = settings.length
    const enabled = settings.filter((setting) => setting.type === 'boolean' && setting.value === true).length
    const numeric = settings.filter((setting) => setting.type === 'number').length
    return { total, enabled, numeric }
  }, [settings])

  const updateSettingValue = (key, nextValue) => {
    setSettings((current) =>
      current.map((setting) =>
        setting.key === key ? { ...setting, value: nextValue } : setting,
      ),
    )
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      for (const setting of settings) {
        let value = setting.value

        if (setting.type === 'number') {
          const parsed = Number(value)
          if (Number.isNaN(parsed)) {
            throw new Error(`"${setting.label}" must be a valid number`)
          }
          value = parsed
        }

        if (setting.type === 'boolean') {
          value = Boolean(value)
        }

        if (setting.type === 'json') {
          try {
            value = JSON.parse(value)
          } catch {
            throw new Error(`"${setting.label}" must contain valid JSON`)
          }
        }

        await adminService.updateSystemSetting({
          key: setting.key,
          value,
          description: setting.description,
        })
      }

      setSuccess('Settings saved successfully.')
    } catch (err) {
      setError(err.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !showLoader) {
    return null
  }

  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
        </div>
        <Card>
          <div className="space-y-4 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-v-surface-elevated" />
            ))}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="v-page-title">System settings</h1>
        <p className="v-caption">
          Configure platform-wide behavior without changing the database schema.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Settings" value={summary.total} />
        <StatCard label="Boolean flags" value={summary.enabled} />
        <StatCard label="Numeric values" value={summary.numeric} />
        <StatCard label="Editable now" value={settings.length > 0 ? 'Yes' : 'No'} />
      </div>

      <Card>
        <form onSubmit={handleSave} className="space-y-6 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">Admin only</Badge>
            <span className="v-caption">
              Changes take effect immediately after saving.
            </span>
          </div>

          <div className="space-y-5">
            {settings.map((setting) => (
              <section key={setting.key} className="rounded-2xl border border-v-border p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="v-section-title">{setting.label}</h2>
                    <p className="v-caption mt-1">{setting.description}</p>
                  </div>
                  <Badge>{setting.key}</Badge>
                </div>

                {setting.type === 'boolean' ? (
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={setting.value === true}
                      onChange={(e) => updateSettingValue(setting.key, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-v-primary focus:ring-v-primary"
                    />
                    <span className="text-sm text-v-text">
                      {setting.value === true ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                ) : setting.type === 'number' ? (
                  <input
                    type="number"
                    value={setting.value}
                    onChange={(e) => updateSettingValue(setting.key, e.target.value)}
                    className={INPUT_CLASS}
                  />
                ) : setting.type === 'json' ? (
                  <textarea
                    rows={6}
                    value={setting.value}
                    onChange={(e) => updateSettingValue(setting.key, e.target.value)}
                    className={`${INPUT_CLASS} min-h-[160px]`}
                    spellCheck={false}
                  />
                ) : (
                  <input
                    type="text"
                    value={setting.value}
                    onChange={(e) => updateSettingValue(setting.key, e.target.value)}
                    className={INPUT_CLASS}
                  />
                )}
              </section>
            ))}
          </div>

          {error && <p className="text-sm text-v-danger">{error}</p>}
          {success && <p className="text-sm text-emerald-500">{success}</p>}

          <div className="flex justify-end border-t border-v-border pt-4">
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
