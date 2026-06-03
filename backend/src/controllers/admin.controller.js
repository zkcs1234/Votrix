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
  const { organizerId } = req.params
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
