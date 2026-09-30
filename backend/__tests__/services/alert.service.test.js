import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../src/services/admin.service.js', () => ({
  getSystemSettings: vi.fn(),
  saveSystemSetting: vi.fn(),
}))
vi.mock('../../src/foundation/db.js', () => ({ db: vi.fn() }))
vi.mock('../../src/foundation/audit.js', () => ({ recordAudit: vi.fn() }))
vi.mock('../../src/services/notification.service.js', () => ({
  createAdminAlert: vi.fn(),
}))

import { getSystemSettings } from '../../src/services/admin.service.js'
import { db } from '../../src/foundation/db.js'
import { recordAudit } from '../../src/foundation/audit.js'
import { createAdminAlert } from '../../src/services/notification.service.js'
import {
  notifyAdminsOfEventCompletion,
  notifyAdminsOfFailedEmailDelivery,
  notifyAdminsOfFailedLoginThreshold,
} from '../../src/services/alert.service.js'

describe('notifyAdminsOfFailedLoginThreshold', () => {
  let auditQuery

  beforeEach(() => {
    vi.clearAllMocks()
    auditQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      gte: vi.fn(),
      contains: vi.fn(),
      maybeSingle: vi.fn(),
      then: vi.fn((resolve, reject) => Promise.resolve({ count: 2, error: null }).then(resolve, reject)),
    }
    auditQuery.select.mockReturnValue(auditQuery)
    auditQuery.eq.mockReturnValue(auditQuery)
    auditQuery.gte.mockReturnValue(auditQuery)
    auditQuery.contains.mockResolvedValue({ count: 2, error: null })
    auditQuery.maybeSingle.mockResolvedValue({ data: { title: 'Campus Event', event_type: 'election' }, error: null })
    db.mockReturnValue({ from: vi.fn().mockReturnValue(auditQuery) })
    recordAudit.mockResolvedValue({ id: 'audit-1' })
    getSystemSettings.mockResolvedValue([{
      setting_key: 'admin_alert_config',
      setting_value: { suspiciousActivity: { enabled: true, failedLoginThreshold: 2 } },
    }])
  })

  test('notifies admins when the configured threshold is reached', async () => {
    await notifyAdminsOfFailedLoginThreshold('person@example.com')

    expect(auditQuery.eq).toHaveBeenCalledWith('action', 'LOGIN_FAILED')
    expect(auditQuery.contains).toHaveBeenCalledWith('details', { email: 'person@example.com' })
    expect(createAdminAlert).toHaveBeenCalledWith(expect.objectContaining({
      type: 'security.suspicious_activity',
      actionUrl: '/admin/audit-logs',
      metadata: { email: 'person@example.com', failedLoginCount: 2, windowMinutes: 15 },
    }))
  })

  test('does not notify before the configured threshold', async () => {
    auditQuery.contains.mockResolvedValue({ count: 1, error: null })

    await notifyAdminsOfFailedLoginThreshold('person@example.com')

    expect(createAdminAlert).not.toHaveBeenCalled()
  })

  test('does not query or notify when suspicious activity alerts are disabled', async () => {
    getSystemSettings.mockResolvedValue([{
      setting_key: 'admin_alert_config',
      setting_value: { suspiciousActivity: { enabled: false, failedLoginThreshold: 2 } },
    }])

    await notifyAdminsOfFailedLoginThreshold('person@example.com')

    expect(db).not.toHaveBeenCalled()
    expect(createAdminAlert).not.toHaveBeenCalled()
  })

  test('notifies admins when failed email deliveries reach the configured threshold', async () => {
    getSystemSettings.mockResolvedValue([{
      setting_key: 'admin_alert_config',
      setting_value: { failedEmailDelivery: { enabled: true, threshold: 2 } },
    }])

    await notifyAdminsOfFailedEmailDelivery({ recipient: 'recipient@example.com' })

    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EMAIL_DELIVERY_FAILED',
      details: { recipient: 'recipient@example.com' },
    }))
    expect(createAdminAlert).toHaveBeenCalledWith(expect.objectContaining({
      type: 'system.email_delivery_failure',
      metadata: { failedDeliveryCount: 2, windowMinutes: 15 },
    }))
  })

  test('notifies admins when an event completes and the setting is enabled', async () => {
    getSystemSettings.mockResolvedValue([{
      setting_key: 'admin_alert_config',
      setting_value: { eventCompletion: { enabled: true } },
    }])

    await notifyAdminsOfEventCompletion('event-1')

    expect(auditQuery.maybeSingle).toHaveBeenCalled()
    expect(createAdminAlert).toHaveBeenCalledWith(expect.objectContaining({
      type: 'event.completed',
      message: '"Campus Event" has completed.',
      actionUrl: '/admin/events',
      entityId: 'event-1',
    }))
  })
})