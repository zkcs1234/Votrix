import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SystemSettingsPage from './SystemSettingsPage'
import { adminService } from '@/services/admin.service'
import { DEFAULT_PLATFORM_NAME, usePlatformStore } from '@/store/platform.store'

vi.mock('@/services/admin.service', () => ({
  adminService: { getSystemSettings: vi.fn(), updateSystemSetting: vi.fn(), getParticipantTaxonomy: vi.fn() },
}))

// What a real database can hold: the two live settings, an old platform_name, and
// the keys other pages own (each has a dedicated editor elsewhere).
const stored = (overrides = {}) => [
  { setting_key: 'platform_name', setting_value: 'Left over from an old save', description: 'OLD' },
  { setting_key: 'maintenance_mode', setting_value: false, description: 'OLD: only admins should be allowed to sign in' },
  { setting_key: 'max_organizers', setting_value: 100, description: 'OLD: soft limit' },
  { setting_key: 'participant_taxonomy', setting_value: { programs: ['BSCS'], sections: ['3-A'] } },
  { setting_key: 'admin_alert_config', setting_value: { failedLogins: 5 } },
  { setting_key: 'event_archival_policy', setting_value: { enabled: true, afterDays: 90 } },
  ...Object.entries(overrides).map(([setting_key, setting_value]) => ({ setting_key, setting_value })),
]

// `effective` is what the server reports as in force (e.g. the env email limit when nothing is saved).
const EFFECTIVE = { maintenanceMode: false, maxOrganizers: 100, emailDailyLimit: 50, invitationExpiryDays: 7 }
async function renderPage(settings = stored(), effective = EFFECTIVE) {
  adminService.getSystemSettings.mockResolvedValue({ data: { settings, effective } })
  render(<SystemSettingsPage />)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'System settings' })).toBeInTheDocument(), { timeout: 3000 })
}
const limitField = () => screen.getByLabelText('Maximum organizers allowed')
const emailField = () => screen.getByLabelText('Daily email sending limit')
const expiryField = () => screen.getByLabelText('Default invitation expiry (days)')
const maintenanceBox = () => screen.getByRole('checkbox')
const save = () => fireEvent.click(screen.getByRole('button', { name: /Save settings/ }))
const updates = () => adminService.updateSystemSetting.mock.calls.map(([u]) => u)

beforeEach(() => {
  vi.resetAllMocks()
  adminService.updateSystemSetting.mockResolvedValue({ data: {} })
  usePlatformStore.setState({ platformName: DEFAULT_PLATFORM_NAME, maintenanceMode: false, loaded: true })
})

describe('System settings page', () => {
  it('shows only the platform name (fixed), maintenance mode, the organizer limit, the email limit and the invitation expiry', async () => {
    await renderPage()
    expect(screen.getByText('Platform name')).toBeInTheDocument()
    expect(screen.getByText('Maintenance mode')).toBeInTheDocument()
    expect(screen.getByText('Maximum organizers allowed')).toBeInTheDocument()
    expect(screen.getByText('Daily email sending limit')).toBeInTheDocument()
    expect(screen.getByText('Default invitation expiry (days)')).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(1) // the (disabled) name; the limit is a number input
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })

  it('the platform name is read-only and always Votrix, whatever an old save left behind', async () => {
    await renderPage()
    const name = screen.getByLabelText('Platform name')
    expect(name).toHaveValue('Votrix')
    expect(name).toBeDisabled()
    expect(name).toHaveAttribute('readonly')
    expect(screen.getByText('Fixed')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Left over from an old save')).not.toBeInTheDocument()
  })

  it('has no raw "custom typed values" editor, so settings owned by other pages are never exposed', async () => {
    await renderPage()
    expect(screen.queryByText(/Custom typed values/)).not.toBeInTheDocument()
    for (const key of ['participant_taxonomy', 'admin_alert_config', 'event_archival_policy']) {
      expect(screen.queryByText(key)).not.toBeInTheDocument()
    }
    expect(screen.queryByDisplayValue(/afterDays/)).not.toBeInTheDocument()
    expect(screen.queryByText('Participant taxonomy')).not.toBeInTheDocument()
    expect(adminService.getParticipantTaxonomy).not.toHaveBeenCalled()
  })

  it('describes the two live settings accurately, ignoring older text saved in the database', async () => {
    await renderPage()
    expect(screen.getByText(/only administrators can use the platform/i)).toBeInTheDocument()
    expect(screen.getByText(/Inviting, approving or adding an organizer beyond this is blocked/)).toBeInTheDocument()
    expect(screen.getByText(/can’t be changed from here/)).toBeInTheDocument()
    expect(screen.queryByText(/OLD/)).not.toBeInTheDocument()
  })

  it('shows what is in force for a value nobody has saved yet (e.g. the server email limit)', async () => {
    await renderPage(stored(), { ...EFFECTIVE, emailDailyLimit: 100, invitationExpiryDays: 7 })
    expect(emailField()).toHaveValue(100)
    expect(expiryField()).toHaveValue(7)
  })

  it('a saved value wins over the reported default', async () => {
    await renderPage(stored({ email_daily_limit: 80, invitation_expiry_days: 14 }), EFFECTIVE)
    expect(emailField()).toHaveValue(80)
    expect(expiryField()).toHaveValue(14)
  })

  it('describes what the email limit and expiry really do', async () => {
    await renderPage()
    expect(screen.getByText(/further emails are skipped and recorded in the email log/i)).toBeInTheDocument()
    expect(screen.getByText(/Admins can still pick a different length for one invitation/)).toBeInTheDocument()
  })

  it('loads the saved values', async () => {
    await renderPage(stored({ max_organizers: 25 }).filter((s) => !(s.setting_key === 'max_organizers' && s.setting_value === 100)))
    expect(limitField()).toHaveValue(25)
    expect(maintenanceBox()).not.toBeChecked()
  })

  it('saves only what changed among the email limit and expiry (never pins the server default by accident)', async () => {
    await renderPage()
    save()
    await screen.findByText(/Settings saved/)
    expect(updates().map((u) => u.key)).toEqual(['maintenance_mode', 'max_organizers'])

    adminService.updateSystemSetting.mockClear()
    fireEvent.change(emailField(), { target: { value: '120' } })
    fireEvent.change(expiryField(), { target: { value: '14' } })
    save()
    await waitFor(() => expect(updates()).toHaveLength(4))
    expect(updates().slice(2)).toEqual([
      expect.objectContaining({ key: 'email_daily_limit', value: 120 }),
      expect.objectContaining({ key: 'invitation_expiry_days', value: 14 }),
    ])

    // Saving again with no further change does not rewrite them.
    adminService.updateSystemSetting.mockClear()
    save()
    await waitFor(() => expect(updates()).toHaveLength(2))
  })

  describe('email limit and invitation expiry validation (nothing is saved unless all are valid)', () => {
    it.each([
      ['email limit of zero', () => emailField(), '0', /Daily email sending limit.*from 1 to 10000/],
      ['email limit above the maximum', () => emailField(), '10001', /from 1 to 10000/],
      ['email limit blank', () => emailField(), '', /Daily email sending limit.*valid number/],
      ['expiry of zero', () => expiryField(), '0', /Default invitation expiry.*from 1 to 30/],
      ['expiry above 30 days', () => expiryField(), '31', /from 1 to 30/],
      ['a fractional expiry', () => expiryField(), '2.5', /from 1 to 30/],
    ])('rejects %s without saving anything', async (_label, field, value, message) => {
      await renderPage()
      fireEvent.change(field(), { target: { value } })
      save()

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(adminService.updateSystemSetting).not.toHaveBeenCalled()
    })
  })

  it('saves exactly the live settings (never the name or anything owned by another page)', async () => {
    await renderPage()
    fireEvent.change(limitField(), { target: { value: '25' } })
    save()

    await screen.findByText(/Settings saved/)
    expect(updates()).toEqual([
      expect.objectContaining({ key: 'maintenance_mode', value: false }),
      expect.objectContaining({ key: 'max_organizers', value: 25 }),
    ])
    const keys = updates().map((u) => u.key)
    for (const never of ['platform_name', 'participant_taxonomy', 'admin_alert_config', 'event_archival_policy']) {
      expect(keys).not.toContain(never)
    }
  })

  describe('organizer limit validation (nothing is saved unless it is valid)', () => {
    it.each([
      ['zero', '0', /whole number from 1/],
      ['a fraction', '2.5', /whole number from 1/],
      ['negative', '-4', /whole number from 1/],
      ['above the maximum', '100001', /whole number from 1/],
      ['blank', '', /valid number/],
    ])('rejects %s without saving anything', async (_label, value, message) => {
      await renderPage()
      fireEvent.change(limitField(), { target: { value } })
      save()

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(adminService.updateSystemSetting).not.toHaveBeenCalled()
    })

    it('a bad limit does not leave maintenance mode half-saved', async () => {
      await renderPage()
      fireEvent.click(maintenanceBox())
      fireEvent.change(limitField(), { target: { value: '0' } })
      save()

      // The problem is shown right away, and the scary maintenance confirmation is
      // not even offered for a form that cannot be saved.
      await screen.findByText(/whole number from 1/)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(adminService.updateSystemSetting).not.toHaveBeenCalled()
      expect(usePlatformStore.getState().maintenanceMode).toBe(false)
    })
  })

  describe('maintenance mode', () => {
    it('asks for confirmation before turning it ON, and does nothing if cancelled', async () => {
      await renderPage()
      fireEvent.click(maintenanceBox())
      save()

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/only administrators can use the platform/i)).toBeInTheDocument()
      expect(adminService.updateSystemSetting).not.toHaveBeenCalled()

      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(adminService.updateSystemSetting).not.toHaveBeenCalled()
      expect(usePlatformStore.getState().maintenanceMode).toBe(false)
    })

    it('turns it on after confirming, and the app switches to maintenance for non-admins at once', async () => {
      await renderPage()
      fireEvent.click(maintenanceBox())
      save()
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Turn on maintenance' }))

      await screen.findByText(/Settings saved/)
      expect(updates().find((u) => u.key === 'maintenance_mode').value).toBe(true)
      expect(usePlatformStore.getState().maintenanceMode).toBe(true)
    })

    it('does not ask again while it is already on, and turning it OFF needs no confirmation', async () => {
      await renderPage(stored().map((s) => (s.setting_key === 'maintenance_mode' ? { ...s, setting_value: true } : s)))
      expect(maintenanceBox()).toBeChecked()

      save() // already on: no prompt
      await screen.findByText(/Settings saved/)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      adminService.updateSystemSetting.mockClear()
      fireEvent.click(maintenanceBox()) // turn it off
      save()
      await waitFor(() => expect(updates().find((u) => u.key === 'maintenance_mode')?.value).toBe(false))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(usePlatformStore.getState().maintenanceMode).toBe(false)
    })
  })

  it('shows the server’s reason when saving fails', async () => {
    await renderPage()
    adminService.updateSystemSetting.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 400, data: { message: 'Maximum organizers must be a whole number from 1 to 100000' } } }),
    )
    save()
    expect(await screen.findByText(/Maximum organizers must be a whole number/)).toBeInTheDocument()
  })

  it('shows an error if the settings cannot be loaded', async () => {
    adminService.getSystemSettings.mockRejectedValue(new Error('offline'))
    render(<SystemSettingsPage />)
    expect(await screen.findByText('Failed to load system settings', {}, { timeout: 3000 })).toBeInTheDocument()
  })
})

describe('live validation', () => {
  it('shows the problem as soon as a field is edited, before any save, and clears it when fixed', async () => {
    await renderPage()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // nothing nags on first load

    fireEvent.change(emailField(), { target: { value: '0' } })
    expect(await screen.findByText(/Daily email sending limit.*from 1 to 10000/)).toBeInTheDocument()
    expect(emailField()).toHaveAttribute('aria-invalid', 'true')
    expect(adminService.updateSystemSetting).not.toHaveBeenCalled()

    fireEvent.change(emailField(), { target: { value: '200' } })
    await waitFor(() => expect(screen.queryByText(/from 1 to 10000/)).not.toBeInTheDocument())
    expect(emailField()).not.toHaveAttribute('aria-invalid')
  })
})
