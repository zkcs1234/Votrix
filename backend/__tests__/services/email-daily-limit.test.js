import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { makeWorld } from '../helpers/officer-world.js'

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))

import { env } from '../../src/config/env.js'
import { checkAndRecordEmailSend, resolveEmailQuotaSettings } from '../../src/services/emailGuard.js'
import { invalidatePlatformSettings } from '../../src/services/platform-settings.service.js'

const setSetting = (key, value) => {
  const rows = world.raw('system_settings')
  const existing = rows.find((r) => r.setting_key === key)
  if (existing) existing.setting_value = value
  else rows.push({ setting_key: key, setting_value: value })
}

let counter = 0
// Each call is a different recipient, so the duplicate guard never interferes.
const send = () => checkAndRecordEmailSend({ to: `person${++counter}@example.com`, subject: 'Hello', workflow: 'test' })

// Emails already sent today (what the guard counts).
const sentToday = (n) => {
  for (let i = 0; i < n; i += 1) {
    world.raw('email_delivery_logs').push({
      id: `log-${counter}-${i}`, provider_status: 'sent', created_at: new Date().toISOString(),
    })
  }
}

const originalDaily = env.resend.dailyLimit
const originalMonthly = env.resend.monthlyLimit

beforeEach(() => {
  world = makeWorld({ extra: { system_settings: [], email_delivery_logs: [] } })
  invalidatePlatformSettings()
  env.resend.dailyLimit = originalDaily
  env.resend.monthlyLimit = 100000 // keep the monthly cap out of the way
  counter += 1000
})

afterEach(() => {
  env.resend.dailyLimit = originalDaily
  env.resend.monthlyLimit = originalMonthly
})

describe('daily email limit setting', () => {
  test('the admin value is the limit in force', async () => {
    setSetting('email_daily_limit', 7)
    expect((await resolveEmailQuotaSettings()).dailyLimit).toBe(7)
  })

  test('with no admin value the env value is used', async () => {
    env.resend.dailyLimit = '12'
    expect((await resolveEmailQuotaSettings()).dailyLimit).toBe(12)
  })

  test('with neither, the default is 50', async () => {
    env.resend.dailyLimit = undefined
    expect((await resolveEmailQuotaSettings()).dailyLimit).toBe(50)
  })

  test('the admin value wins over the env value', async () => {
    env.resend.dailyLimit = '12'
    setSetting('email_daily_limit', 30)
    expect((await resolveEmailQuotaSettings()).dailyLimit).toBe(30)
  })

  test('an unusable stored value is ignored and the fallback is used', async () => {
    env.resend.dailyLimit = '12'
    setSetting('email_daily_limit', 'lots')
    expect((await resolveEmailQuotaSettings()).dailyLimit).toBe(12)
  })

  test('sending is allowed below the limit and blocked at it, with the limit in the reason', async () => {
    setSetting('email_daily_limit', 3)
    sentToday(2)
    expect((await send()).allowed).toBe(true) // 3rd email of the day
    expect(world.raw('email_delivery_logs')).toHaveLength(3) // the guard logged it

    const blocked = await send()
    expect(blocked).toMatchObject({ allowed: false, quotaType: 'daily', limit: 3 })
    expect(blocked.reason).toMatch(/Daily email quota exceeded \(3\)/)
  })

  test('raising the limit lets the very next email through, despite the cache', async () => {
    setSetting('email_daily_limit', 2)
    sentToday(2)
    expect((await send()).allowed).toBe(false)

    setSetting('email_daily_limit', 5) // no invalidate: the guard reads fresh
    expect((await send()).allowed).toBe(true)
  })

  test('lowering the limit below what was already sent blocks further email', async () => {
    setSetting('email_daily_limit', 100)
    sentToday(10)
    expect((await send()).allowed).toBe(true)

    setSetting('email_daily_limit', 5)
    expect((await send()).allowed).toBe(false)
  })

  test('without an admin value the env limit still blocks', async () => {
    env.resend.dailyLimit = '2'
    sentToday(2)
    expect((await send()).allowed).toBe(false)
  })

  test('a database error reading the setting does not stop email: the env limit applies', async () => {
    env.resend.dailyLimit = '2'
    world.failNext('system_settings', 'select', 'db down')
    const settings = await resolveEmailQuotaSettings()
    expect(settings.dailyLimit).toBe(2)
  })
})
