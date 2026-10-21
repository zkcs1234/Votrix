import { useEffect, useState } from 'react'
import { Save, ShieldAlert } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import Badge from '@/components/ui/Badge'
import PageHeader from '@/components/ui/PageHeader'
import ParticipantTaxonomyPanel from '@/components/admin/ParticipantTaxonomyPanel'
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

// These settings have dedicated admin editors below or on their own page.
// Keeping them out of the generic editor prevents raw JSON from leaking into the UI.
const MANAGED_SETTING_KEYS = new Set(['participant_taxonomy', 'admin_alert_config'])

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
    if (MANAGED_SETTING_KEYS.has(setting.setting_key)) continue
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
        const settingsResult = await adminService.getSystemSettings()
        const settingsData = settingsResult.data
        setSettings(hydrateSettings(settingsData.settings || []))
        setError(null)
      } catch {
        setError('Failed to load system settings')
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [])

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

  const platformSettings = settings.filter((setting) =>
    DEFAULT_SETTINGS.some((defaultSetting) => defaultSetting.key === setting.key),
  )
  const customSettings = settings.filter((setting) =>
    !DEFAULT_SETTINGS.some((defaultSetting) => defaultSetting.key === setting.key),
  )
  const renderSetting = (setting) => (
    <section key={setting.key} className="rounded-xl border border-v-border bg-v-surface p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="v-section-title">{setting.label}</h3>
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
  )

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
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="System settings"
        description="Platform-wide configuration for event participation, delivery, and administration."
        actions={
          <Button type="submit" form="system-settings-form" loading={saving}>
            <Save className="h-4 w-4" strokeWidth={2} />
            Save settings
          </Button>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card padding="sm">
          <form id="system-settings-form" onSubmit={handleSave} className="space-y-6 p-1 sm:p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">
                <ShieldAlert className="mr-1 h-3 w-3" strokeWidth={2} aria-hidden />
                Admin only
              </Badge>
              <span className="v-caption">Changes take effect immediately after saving.</span>
            </div>

            <section className="space-y-4">
              <div>
                <h2 className="v-section-title">Platform</h2>
                <p className="v-caption mt-1">Core application behavior and account capacity.</p>
              </div>
              {platformSettings.map(renderSetting)}
            </section>

            {customSettings.length > 0 && (
              <section className="space-y-4 border-t border-v-border pt-5">
                <div>
                  <h2 className="v-section-title">Custom typed values</h2>
                  <p className="v-caption mt-1">Additional platform settings with their stored value types.</p>
                </div>
                {customSettings.map(renderSetting)}
              </section>
            )}

            {error && <FormAlert variant="error">{error}</FormAlert>}
            {success && <FormAlert variant="success">{success}</FormAlert>}
          </form>
        </Card>

        <ParticipantTaxonomyPanel />
      </div>
    </div>
  )
}
