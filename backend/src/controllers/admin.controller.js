import { asyncHandler } from '../utils/asyncHandler.js'
import { createOrganizer } from '../services/user.service.js'
import { validateCreateOrganizer } from '../validators/auth.validator.js'
import { getAdminDashboardStats, getAdminAnalytics } from '../services/dashboard.service.js'
import { 
  getOrganizersList, 
  getGlobalEvents as fetchGlobalEvents, 
  getSystemSettings as fetchSystemSettings, 
  saveSystemSetting, 
  getAuditLogs as fetchAuditLogs,
  createAuditLog
} from '../services/admin.service.js'

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

  res.status(201).json({
    success: true,
    message: 'Organizer account created',
    user,
    email,
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
  const { key, value, description } = req.body
  
  if (!key || value === undefined) {
    return res.status(400).json({ success: false, message: 'Key and value are required' })
  }

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

export const getAuditLogs = asyncHandler(async (_req, res) => {
  const logs = await fetchAuditLogs()
  res.json({ success: true, logs })
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
