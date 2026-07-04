import { asyncHandler } from '../utils/asyncHandler.js'
import { createOrganizer } from '../services/user.service.js'
import { validateCreateOrganizer } from '../validators/auth.validator.js'
import { getAdminDashboardStats, getAdminAnalytics } from '../services/dashboard.service.js'
import { ACCOUNT_STATUS } from '../utils/constants.js'
import {
  getOrganizersList,
  getGlobalEvents as fetchGlobalEvents,
  getSystemSettings as fetchSystemSettings,
  saveSystemSetting,
  getAuditLogs as fetchAuditLogs,
  createAuditLog,
  updateOrganizerAccountStatus,
} from '../services/admin.service.js'
import { createAdminAlert, createNotification } from '../services/notification.service.js'
import { ApiError } from '../utils/ApiError.js'
import { validateUUID } from '../utils/sanitize.js'

// CWE-20: Allowlist for system setting keys — alphanumeric + underscores only.
const SETTING_KEY_RE = /^[a-zA-Z0-9_]{1,100}$/

function isSerializableSettingValue(value) {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isSerializableSettingValue)
  }
  if (typeof value === 'object') {
    return Object.values(value).every((entry) => isSerializableSettingValue(entry))
  }
  return false
}

function validateSystemSetting(body) {
  const { key, value, description } = body ?? {}
  if (!key || value === undefined) {
    throw new ApiError(400, 'Key and value are required')
  }
  if (typeof key !== 'string' || !SETTING_KEY_RE.test(key)) {
    throw new ApiError(400, 'Setting key must be alphanumeric with underscores only (max 100 chars)')
  }
  if (typeof description === 'string' && description.length > 500) {
    throw new ApiError(400, 'Description must be 500 characters or fewer')
  }
  if (!isSerializableSettingValue(value)) {
    throw new ApiError(400, 'Setting value must be a JSON-serializable primitive or object')
  }
  return { key, value, description }
}

export const createOrganizerAccount = asyncHandler(async (req, res) => {
  const payload = validateCreateOrganizer(req.body)
  const { user, email } = await createOrganizer({
    email: payload.email,
    password: payload.password,
    mustChangePassword: true,
    sendInvitationEmail: req.body?.sendEmail !== false,
  })

  // Log the action
  await createAuditLog({
    userId: req.user.id,
    action: 'CREATE_ORGANIZER',
    entity: 'users',
    entityId: user.id,
    details: { email: user.email }
  })

  await createAdminAlert({
    type: 'organizer.pending',
    title: 'New organizer pending approval',
    message: `${user.email} was created and is waiting for approval.`,
    actionUrl: '/admin/organizers',
    entity: 'users',
    entityId: user.id,
    metadata: { email: user.email },
  })

  res.status(201).json({
    success: true,
    message: 'Organizer account created and pending approval',
    user,
    email,
  })
})

export const updateOrganizerStatus = asyncHandler(async (req, res) => {
  const organizerId = validateUUID(req.params.organizerId, 'organizerId')
  const { accountStatus } = req.body ?? {}

  if (!Object.values(ACCOUNT_STATUS).includes(accountStatus)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid account status',
    })
  }

  const updatedOrganizer = await updateOrganizerAccountStatus(organizerId, accountStatus)

  await createNotification({
    userId: updatedOrganizer.id,
    type: 'organizer.status',
    title: 'Your organizer account status changed',
    message:
      accountStatus === 'active'
        ? 'Your account has been approved. You can now access the organizer dashboard.'
        : accountStatus === 'suspended'
          ? 'Your account has been suspended. Access is temporarily disabled.'
          : 'Your account status has been updated.',
    actionUrl: '/notifications',
    entity: 'users',
    entityId: updatedOrganizer.id,
    metadata: { accountStatus },
  })

  await createAuditLog({
    userId: req.user.id,
    action: 'UPDATE_ORGANIZER_STATUS',
    entity: 'users',
    entityId: updatedOrganizer.id,
    details: {
      email: updatedOrganizer.email,
      accountStatus: updatedOrganizer.account_status,
    },
  })

  res.json({
    success: true,
    message: 'Organizer status updated',
    organizer: updatedOrganizer,
  })
})

export const getOrganizers = asyncHandler(async (_req, res) => {
  const organizers = await getOrganizersList()
  res.json({ success: true, organizers })
})

export const getGlobalEvents = asyncHandler(async (_req, res) => {
  const events = await fetchGlobalEvents()
  res.json({ success: true, events })
})

export const getSystemSettings = asyncHandler(async (_req, res) => {
  const settings = await fetchSystemSettings()
  res.json({ success: true, settings })
})

export const updateSystemSettings = asyncHandler(async (req, res) => {
  const { key, value, description } = validateSystemSetting(req.body)

  const updatedSetting = await saveSystemSetting(key, value, description)

  await createAuditLog({
    userId: req.user.id,
    action: 'UPDATE_SYSTEM_SETTING',
    entity: 'system_settings',
    entityId: updatedSetting.id,
    details: { key }
  })

  res.json({ success: true, setting: updatedSetting })
})

export const getAuditLogs = asyncHandler(async (req, res) => {
  const {
    page = '1',
    limit = '50',
    search = '',
    action,
    entity,
    startDate,
    endDate,
  } = req.query ?? {}

  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200)
  const safePage  = Math.max(1, parseInt(page, 10) || 1)
  const offset    = (safePage - 1) * safeLimit

  const { logs, total } = await fetchAuditLogs({
    search: search || undefined,
    action: action || undefined,
    entity: entity || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: safeLimit,
    offset,
  })

  res.json({
    success: true,
    logs,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  })
})

export const getAdminOverview = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    message: 'Admin area — more features in later phases',
  })
})

export const getDashboard = asyncHandler(async (_req, res) => {
  const dashboard = await getAdminDashboardStats()
  res.json({ success: true, ...dashboard })
})

export const getAnalytics = asyncHandler(async (_req, res) => {
  const analytics = await getAdminAnalytics()
  res.json({ success: true, ...analytics })
})
