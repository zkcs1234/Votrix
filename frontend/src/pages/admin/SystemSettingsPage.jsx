import { useEffect, useRef, useState } from 'react'
import { Lock, Save, ShieldAlert } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { wholeNumberInRange } from '@/utils/wholeNumber'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { DEFAULT_PLATFORM_NAME, usePlatformStore } from '@/store/platform.store'

// The platform name is fixed on purpose: it is part of the logo artwork, emails,
// exported reports and help text, so a setting could only ever rename some of it.
// The settings below are the ones the server really enforces (and re-validates).
const MAINTENANCE = {
  key: 'maintenance_mode',
  label: 'Maintenance mode',
  description:
    'When enabled, only administrators can use the platform. Everyone else sees a maintenance screen and cannot sign in until you turn it off.',
  defaultValue: false,
}
const MAX_ORGANIZERS = {
  key: 'max_organizers',
  label: 'Maximum organizers allowed',
  description:
    'The most organizer accounts the platform allows (archived accounts do not count). Inviting, approving or adding an organizer beyond this is blocked.',
  defaultValue: 100,
  max: 100000,
}
const EMAIL_DAILY_LIMIT = {
  key: 'email_daily_limit',
  label: 'Daily email sending limit',
  description:
    'The most emails the platform sends in one day (invitations, temporary passwords, notices). Once it is reached, further emails are skipped and recorded in the email log until the next day. Your email provider may also have a lower limit of its own.',
  defaultValue: 50,
  max: 10000,
}
const INVITATION_EXPIRY = {
  key: 'invitation_expiry_days',
  label: 'Default invitation expiry (days)',
  description:
    'How long a new organizer invitation link stays valid. Admins can still pick a different length for one invitation when they send it.',
  defaultValue: 7,
  max: 30,
}

const wholeNumberError = (setting, raw) =>
  wholeNumberInRange(raw, { label: `"${setting.label}"`, min: 1, max: setting.max })

// A number field with its live message. The message shows once the admin has
// edited the field (or tried to save), not on first load.
function NumberSetting({ setting, value, onChange, error, onBlur }) {
  const messageId = `${setting.key}-error`
  return (
    <SettingSection setting={setting}>
      <input
        type="number"
        min={1}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`${INPUT_CLASS}${error ? ' v-input-error' : ''}`}
        aria-label={setting.label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? messageId : undefined}
      />
      {error && <p id={messageId} role="alert" className="v-error-text">{error}</p>}
    </SettingSection>
  )
}

const valueOf = (rows, key, fallback) => rows.find((r) => r.setting_key === key)?.setting_value ?? fallback

function SettingSection({ setting, badge = setting.key, children }) {
  return (
    <section className="rounded-xl border border-v-border bg-v-surface p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="v-section-title">{setting.label}</h3>
          <p className="v-caption mt-1">{setting.description}</p>
        </div>
        <Badge>{badge}</Badge>
      </div>
      {children}
    </section>
  )
}

export default function SystemSettingsPage() {
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [maxOrganizers, setMaxOrganizers] = useState(String(MAX_ORGANIZERS.defaultValue))
  const [emailLimit, setEmailLimit] = useState(String(EMAIL_DAILY_LIMIT.defaultValue))
  const [expiryDays, setExpiryDays] = useState(String(INVITATION_EXPIRY.defaultValue))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [confirmMaintenance, setConfirmMaintenance] = useState(false)
  // Whether maintenance mode was already on when the page loaded / last saved.
  const savedMaintenance = useRef(false)
  // What the platform was using when the page loaded / last saved. A setting nobody
  // has saved yet (e.g. the email limit coming from the server's environment) is
  // only written when the admin actually changes it.
  const inForce = useRef({})
  const showLoader = useDelayedLoading(loading, 300)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true)
        const { data } = await adminService.getSystemSettings()
        const rows = data.settings || []
        const maintenance = valueOf(rows, MAINTENANCE.key, MAINTENANCE.defaultValue) === true
        savedMaintenance.current = maintenance
        setMaintenanceMode(maintenance)
        const effective = data.effective ?? {}
        const emailValue = valueOf(rows, EMAIL_DAILY_LIMIT.key, effective.emailDailyLimit ?? EMAIL_DAILY_LIMIT.defaultValue)
        const expiryValue = valueOf(rows, INVITATION_EXPIRY.key, effective.invitationExpiryDays ?? INVITATION_EXPIRY.defaultValue)
        inForce.current = { [EMAIL_DAILY_LIMIT.key]: Number(emailValue), [INVITATION_EXPIRY.key]: Number(expiryValue) }
        setMaxOrganizers(String(valueOf(rows, MAX_ORGANIZERS.key, MAX_ORGANIZERS.defaultValue)))
        setEmailLimit(String(emailValue))
        setExpiryDays(String(expiryValue))
        setError(null)
      } catch {
        setError('Failed to load system settings')
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [])

  // Turning maintenance mode ON locks everyone but administrators out at once, so
  // it asks first. Saving with it already on (or turning it off) does not.
  const maintenanceTurningOn = maintenanceMode && !savedMaintenance.current

  // Live validation. A field's message appears once it has been edited or left,
  // and updates on every keystroke after that. Saving with a problem reveals all of
  // them and saves nothing (so one bad value never half-saves the page).
  const [touched, setTouched] = useState({})
  const fieldErrors = {
    [MAX_ORGANIZERS.key]: wholeNumberError(MAX_ORGANIZERS, maxOrganizers),
    [EMAIL_DAILY_LIMIT.key]: wholeNumberError(EMAIL_DAILY_LIMIT, emailLimit),
    [INVITATION_EXPIRY.key]: wholeNumberError(INVITATION_EXPIRY, expiryDays),
  }
  const hasFieldErrors = Object.values(fieldErrors).some(Boolean)
  const touch = (key) => () => setTouched((t) => (t[key] ? t : { ...t, [key]: true }))
  const shownError = (key) => (touched[key] || touched.all ? fieldErrors[key] : null)
  const edit = (key, setter) => (value) => {
    setter(value)
    touch(key)()
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (hasFieldErrors) {
      // Do not ask to confirm maintenance mode for a form that cannot be saved.
      setTouched({ all: true })
      return
    }
    if (maintenanceTurningOn) {
      setConfirmMaintenance(true)
      return
    }
    void handleSave()
  }

  const handleSave = async () => {
    setConfirmMaintenance(false)
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Validate before saving anything, so one bad value never half-saves the page.
      for (const [setting, raw] of [[MAX_ORGANIZERS, maxOrganizers], [EMAIL_DAILY_LIMIT, emailLimit], [INVITATION_EXPIRY, expiryDays]]) {
        const message = wholeNumberError(setting, raw)
        if (message) throw new Error(message)
      }
      const limit = Number(maxOrganizers)

      await adminService.updateSystemSetting({ key: MAINTENANCE.key, value: maintenanceMode, description: MAINTENANCE.description })
      await adminService.updateSystemSetting({ key: MAX_ORGANIZERS.key, value: limit, description: MAX_ORGANIZERS.description })
      for (const [setting, raw] of [[EMAIL_DAILY_LIMIT, emailLimit], [INVITATION_EXPIRY, expiryDays]]) {
        const value = Number(raw)
        if (value === inForce.current[setting.key]) continue
        await adminService.updateSystemSetting({ key: setting.key, value, description: setting.description })
        inForce.current[setting.key] = value
      }

      // Apply maintenance mode to this app straight away (the server already
      // enforces it for everyone else).
      usePlatformStore.getState().apply({ maintenanceMode })
      savedMaintenance.current = maintenanceMode

      setSuccess('Settings saved. They apply immediately.')
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save settings')
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
        description="Platform-wide configuration: maintenance mode, the organizer limit, email sending and invitation expiry."
        actions={
          <Button type="submit" form="system-settings-form" loading={saving}>
            <Save className="h-4 w-4" strokeWidth={2} />
            Save settings
          </Button>
        }
      />

      <div>
        <Card padding="sm">
          {/* noValidate: the page shows its own clear messages instead of the browser's tooltips. */}
          <form id="system-settings-form" onSubmit={handleSubmit} noValidate className="space-y-6 p-1 sm:p-2">
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
                <p className="v-caption mt-1">How the platform behaves and how many organizers it allows.</p>
              </div>

              <div className="grid items-start gap-4 lg:grid-cols-2">
              <SettingSection
                setting={{
                  label: 'Platform name',
                  description: 'Fixed. The name appears in the logo, emails, exported reports and help text, so it can’t be changed from here.',
                }}
                badge={<span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" strokeWidth={2} aria-hidden />Fixed</span>}
              >
                <input type="text" value={DEFAULT_PLATFORM_NAME} readOnly disabled aria-label="Platform name" className={`${INPUT_CLASS} cursor-not-allowed opacity-70`} />
              </SettingSection>

              <SettingSection setting={MAINTENANCE}>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={maintenanceMode}
                    onChange={(e) => setMaintenanceMode(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-v-primary focus:ring-v-primary"
                  />
                  <span className="text-sm text-v-text">{maintenanceMode ? 'Enabled' : 'Disabled'}</span>
                </label>
              </SettingSection>

              <NumberSetting
                setting={MAX_ORGANIZERS}
                value={maxOrganizers}
                onChange={edit(MAX_ORGANIZERS.key, setMaxOrganizers)}
                onBlur={touch(MAX_ORGANIZERS.key)}
                error={shownError(MAX_ORGANIZERS.key)}
              />
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="v-section-title">Email &amp; invitations</h2>
                <p className="v-caption mt-1">How many emails the platform sends, and how long invitation links last.</p>
              </div>

              <div className="grid items-start gap-4 lg:grid-cols-2">
              <NumberSetting
                setting={EMAIL_DAILY_LIMIT}
                value={emailLimit}
                onChange={edit(EMAIL_DAILY_LIMIT.key, setEmailLimit)}
                onBlur={touch(EMAIL_DAILY_LIMIT.key)}
                error={shownError(EMAIL_DAILY_LIMIT.key)}
              />

              <NumberSetting
                setting={INVITATION_EXPIRY}
                value={expiryDays}
                onChange={edit(INVITATION_EXPIRY.key, setExpiryDays)}
                onBlur={touch(INVITATION_EXPIRY.key)}
                error={shownError(INVITATION_EXPIRY.key)}
              />
              </div>
            </section>

            {error && <FormAlert variant="error">{error}</FormAlert>}
            {success && <FormAlert variant="success">{success}</FormAlert>}
          </form>
        </Card>
      </div>

      <Modal
        open={confirmMaintenance}
        onClose={() => setConfirmMaintenance(false)}
        title="Turn on maintenance mode?"
        size="sm"
      >
        <p className="text-sm text-v-text">
          As soon as you save, only administrators can use the platform. Organizers, students and judges are turned away on
          their next request, and cannot sign in until you turn maintenance mode off again. You stay signed in.
        </p>
        <div className="mt-5 flex justify-end gap-2 border-t border-v-border pt-4">
          <Button type="button" variant="secondary" onClick={() => setConfirmMaintenance(false)}>Cancel</Button>
          <Button type="button" variant="danger" onClick={handleSave}>Turn on maintenance</Button>
        </div>
      </Modal>
    </div>
  )
}
