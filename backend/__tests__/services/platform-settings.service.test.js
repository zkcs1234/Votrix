import { beforeEach, describe, expect, test, vi } from 'vitest'
import { IDS, makeWorld } from '../helpers/officer-world.js'

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))
// The backend loads a real .env: never let a test reach a real mail provider.
vi.mock('../../src/services/mailer.service.js', () => ({
  sendOrganizerInviteLinkEmail: vi.fn(async () => ({ sent: true })),
  sendOrganizerInvitationEmail: vi.fn(async () => ({ sent: true })),
}))

import {
  PLATFORM_DEFAULTS,
  assertOrganizerCapacity,
  assertPlatformAvailableFor,
  countOrganizers,
  getPlatformSettings,
  invalidatePlatformSettings,
  normalizePlatformSettings,
  validatePlatformSettingValue,
} from '../../src/services/platform-settings.service.js'
import { createOrganizer } from '../../src/services/user.service.js'
import { createInvitation, resendInvitation } from '../../src/services/organizer-invitation.service.js'

const row = (setting_key, setting_value) => ({ setting_key, setting_value })
const setSetting = (key, value) => {
  const rows = world.raw('system_settings')
  const existing = rows.find((r) => r.setting_key === key)
  if (existing) existing.setting_value = value
  else rows.push(row(key, value))
}
async function rejection(promise) {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('expected the promise to reject')
}

beforeEach(() => {
  world = makeWorld({ extra: { system_settings: [] } })
  invalidatePlatformSettings()
})

describe('normalizePlatformSettings', () => {
  test('uses the defaults when nothing is saved', () => {
    expect(normalizePlatformSettings([])).toEqual(PLATFORM_DEFAULTS)
  })

  test('reads saved values', () => {
    expect(normalizePlatformSettings([row('maintenance_mode', true), row('max_organizers', 7)]))
      .toEqual({ ...PLATFORM_DEFAULTS, maintenanceMode: true, maxOrganizers: 7 })
  })

  test.each([['BISU Votes'], [''], ['x'.repeat(200)], [42], [null]])(
    'the platform name is FIXED: a stored name (%j) is ignored',
    (stored) => {
      expect(normalizePlatformSettings([row('platform_name', stored)]).platformName).toBe('Votrix')
    },
  )

  test('only true / "true" turn maintenance on', () => {
    for (const on of [true, 'true']) expect(normalizePlatformSettings([row('maintenance_mode', on)]).maintenanceMode).toBe(true)
    for (const off of [false, 'false', 1, 'yes', null, undefined]) expect(normalizePlatformSettings([row('maintenance_mode', off)]).maintenanceMode).toBe(false)
  })

  test.each([[0], [-3], [1.5], ['abc'], [null], [1e9]])('an unusable organizer limit (%j) falls back to the default', (bad) => {
    expect(normalizePlatformSettings([row('max_organizers', bad)]).maxOrganizers).toBe(100)
  })

  test('a numeric string is accepted (older saves)', () => {
    expect(normalizePlatformSettings([row('max_organizers', '25')]).maxOrganizers).toBe(25)
  })
})

describe('getPlatformSettings', () => {
  test('reads from system_settings', async () => {
    setSetting('maintenance_mode', true)
    setSetting('max_organizers', 12)
    expect(await getPlatformSettings()).toEqual({ ...PLATFORM_DEFAULTS, maintenanceMode: true, maxOrganizers: 12 })
  })

  test('never even reads a stored platform name', async () => {
    setSetting('platform_name', 'BISU Votes')
    expect((await getPlatformSettings()).platformName).toBe('Votrix')
  })

  test('is cached briefly, refreshed on invalidate, and force bypasses the cache', async () => {
    const from = vi.spyOn(world.client, 'from')
    await getPlatformSettings()
    await getPlatformSettings()
    expect(from).toHaveBeenCalledTimes(1)

    setSetting('max_organizers', 5)
    expect((await getPlatformSettings()).maxOrganizers).toBe(100) // still the cached value
    invalidatePlatformSettings()
    expect((await getPlatformSettings()).maxOrganizers).toBe(5)

    setSetting('max_organizers', 6)
    expect((await getPlatformSettings({ force: true })).maxOrganizers).toBe(6)
  })

  test('a database error never turns maintenance on: last known value, else defaults', async () => {
    world.failNext('system_settings', 'select', 'db down')
    expect(await getPlatformSettings()).toEqual(PLATFORM_DEFAULTS)

    setSetting('max_organizers', 9)
    await getPlatformSettings({ force: true })
    world.failNext('system_settings', 'select', 'db down')
    expect((await getPlatformSettings({ force: true })).maxOrganizers).toBe(9) // last known value
  })
})

describe('validatePlatformSettingValue', () => {
  test('the platform name is fixed: any attempt to set it is refused', () => {
    for (const value of ['BISU Votes', 'Votrix', '', null, 5]) {
      expect(() => validatePlatformSettingValue('platform_name', value)).toThrow(/platform name is fixed/i)
    }
  })

  test('maintenance mode must be a real boolean', () => {
    expect(validatePlatformSettingValue('maintenance_mode', true)).toBe(true)
    for (const bad of ['true', 1, null]) expect(() => validatePlatformSettingValue('maintenance_mode', bad)).toThrow(/true or false/)
  })

  test('organizer limit must be a whole number from 1', () => {
    expect(validatePlatformSettingValue('max_organizers', 25)).toBe(25)
    for (const bad of [0, -1, 2.5, '5', null, 1e9]) expect(() => validatePlatformSettingValue('max_organizers', bad)).toThrow(/whole number/)
  })

  test('every error is a 400 and any other key passes through untouched', () => {
    let err
    try { validatePlatformSettingValue('max_organizers', 0) } catch (e) { err = e }
    expect(err.statusCode).toBe(400)
    expect(validatePlatformSettingValue('some_custom_key', { a: 1 })).toEqual({ a: 1 })
  })
})

describe('daily email limit setting', () => {
  test('is unset by default (the email guard then falls back to env / 50)', () => {
    expect(normalizePlatformSettings([]).emailDailyLimit).toBeNull()
  })

  test('reads a saved value, including an older numeric string', () => {
    expect(normalizePlatformSettings([row('email_daily_limit', 80)]).emailDailyLimit).toBe(80)
    expect(normalizePlatformSettings([row('email_daily_limit', '80')]).emailDailyLimit).toBe(80)
  })

  test.each([[0], [-1], [2.5], ['abc'], [null], [10001]])('an unusable value (%j) is treated as unset', (bad) => {
    expect(normalizePlatformSettings([row('email_daily_limit', bad)]).emailDailyLimit).toBeNull()
  })

  test('must be a whole number from 1 to 10000 when saved', () => {
    expect(validatePlatformSettingValue('email_daily_limit', 1)).toBe(1)
    expect(validatePlatformSettingValue('email_daily_limit', 10000)).toBe(10000)
    for (const bad of [0, -5, 1.5, '50', null, 10001]) {
      expect(() => validatePlatformSettingValue('email_daily_limit', bad)).toThrow(/Daily email limit must be a whole number from 1 to 10000/)
    }
  })
})

describe('default invitation expiry setting', () => {
  test('defaults to 7 days', () => {
    expect(normalizePlatformSettings([]).invitationExpiryDays).toBe(7)
  })

  test('reads a saved value', () => {
    expect(normalizePlatformSettings([row('invitation_expiry_days', 14)]).invitationExpiryDays).toBe(14)
  })

  test.each([[0], [31], [2.5], ['x'], [null]])('an unusable value (%j) falls back to 7', (bad) => {
    expect(normalizePlatformSettings([row('invitation_expiry_days', bad)]).invitationExpiryDays).toBe(7)
  })

  test('must be a whole number of days from 1 to 30 when saved', () => {
    expect(validatePlatformSettingValue('invitation_expiry_days', 30)).toBe(30)
    for (const bad of [0, 31, 1.5, '7', null]) {
      expect(() => validatePlatformSettingValue('invitation_expiry_days', bad)).toThrow(/whole number of days from 1 to 30/)
    }
  })

  const daysUntilExpiry = (invitation) => Math.round((new Date(invitation.expiresAt) - Date.now()) / 86_400_000)

  test('a new invitation uses the configured default', async () => {
    setSetting('invitation_expiry_days', 14)
    const { invitation } = await createInvitation({ email: 'invitee@example.com' }, IDS.ADMIN)
    expect(daysUntilExpiry(invitation)).toBe(14)
  })

  test('an expiry typed for one invitation still beats the default', async () => {
    setSetting('invitation_expiry_days', 14)
    const { invitation } = await createInvitation({ email: 'invitee@example.com', expiresInDays: 3 }, IDS.ADMIN)
    expect(daysUntilExpiry(invitation)).toBe(3)
  })

  test('changing the default applies to the very next invitation, despite the cache', async () => {
    await getPlatformSettings() // warm the cache with the default
    setSetting('invitation_expiry_days', 21)
    const { invitation } = await createInvitation({ email: 'invitee@example.com' }, IDS.ADMIN)
    expect(daysUntilExpiry(invitation)).toBe(21)
  })

  test('with nothing saved the default is still 7 days', async () => {
    const { invitation } = await createInvitation({ email: 'invitee@example.com' }, IDS.ADMIN)
    expect(daysUntilExpiry(invitation)).toBe(7)
  })

  test('a resent link gets the current default, not the old link’s length', async () => {
    const first = await createInvitation({ email: 'invitee@example.com', expiresInDays: 3 }, IDS.ADMIN)
    setSetting('invitation_expiry_days', 10)
    const second = await resendInvitation(first.invitation.id, IDS.ADMIN)
    expect(daysUntilExpiry(second.invitation)).toBe(10)
  })
})

describe('maintenance mode', () => {
  test('is off by default: everyone passes', async () => {
    for (const role of ['admin', 'organizer', 'participant']) await expect(assertPlatformAvailableFor(role)).resolves.toBeUndefined()
  })

  test('when on, only administrators pass; everyone else gets a 503', async () => {
    setSetting('maintenance_mode', true)

    await expect(assertPlatformAvailableFor('admin')).resolves.toBeUndefined()
    for (const role of ['organizer', 'participant', 'voter', undefined]) {
      const err = await rejection(assertPlatformAvailableFor(role))
      expect(err.statusCode).toBe(503)
      expect(err.details).toMatchObject({ code: 'MAINTENANCE_MODE' })
      expect(err.message).toMatch(/Votrix is under maintenance/)
    }
  })
})

describe('organizer limit', () => {
  test('counts organizers, excluding archived ones', async () => {
    expect(await countOrganizers()).toBe(2)
    world.raw('users').find((u) => u.id === IDS.ORG2).account_status = 'archived'
    expect(await countOrganizers()).toBe(1)
  })

  test('allows creation below the limit and blocks it at the limit with a clear 409', async () => {
    setSetting('max_organizers', 3)
    await expect(assertOrganizerCapacity()).resolves.toBeUndefined()

    setSetting('max_organizers', 2)
    const err = await rejection(assertOrganizerCapacity())
    expect(err.statusCode).toBe(409)
    expect(err.details).toMatchObject({ code: 'ORGANIZER_LIMIT_REACHED', limit: 2, current: 2 })
    expect(err.message).toMatch(/limit of 2 organizers/)
    expect(err.message).toMatch(/Maximum organizers allowed/)
  })

  test('archiving an organizer frees a slot', async () => {
    setSetting('max_organizers', 2)
    await rejection(assertOrganizerCapacity())
    world.raw('users').find((u) => u.id === IDS.ORG2).account_status = 'archived'
    await expect(assertOrganizerCapacity()).resolves.toBeUndefined()
  })

  test('raising the limit works at once, even though settings are cached', async () => {
    setSetting('max_organizers', 2)
    await getPlatformSettings() // warm the cache with the old limit
    await rejection(assertOrganizerCapacity())

    setSetting('max_organizers', 5) // no invalidate: the capacity check reads fresh
    await expect(assertOrganizerCapacity()).resolves.toBeUndefined()
  })

  test('the default limit (100) applies when nothing is saved', async () => {
    await expect(assertOrganizerCapacity()).resolves.toBeUndefined()
  })

  test('createOrganizer (used by CSV import, approval and the API) is blocked at the limit and creates nothing', async () => {
    setSetting('max_organizers', 2)
    const before = world.rows('users').length
    const err = await rejection(createOrganizer({ email: 'new@example.com', sendInvitationEmail: false }))

    expect(err.statusCode).toBe(409)
    expect(err.details.code).toBe('ORGANIZER_LIMIT_REACHED')
    expect(world.rows('users')).toHaveLength(before)
  })

  test('createOrganizer works again once there is room', async () => {
    setSetting('max_organizers', 3)
    const { user } = await createOrganizer({ email: 'new@example.com', sendInvitationEmail: false })
    expect(user.email).toBe('new@example.com')
    expect(await countOrganizers()).toBe(3)

    // ...and now the platform is full again.
    expect((await rejection(createOrganizer({ email: 'another@example.com', sendInvitationEmail: false }))).statusCode).toBe(409)
  })

  test('an organizer invitation is refused when the platform is full', async () => {
    setSetting('max_organizers', 2)
    const err = await rejection(createInvitation({ email: 'invitee@example.com' }, IDS.ADMIN))
    expect(err.statusCode).toBe(409)
    expect(world.rows('organizer_invitations')).toHaveLength(0)

    setSetting('max_organizers', 10)
    await expect(createInvitation({ email: 'invitee@example.com' }, IDS.ADMIN)).resolves.toBeTruthy()
  })
})
