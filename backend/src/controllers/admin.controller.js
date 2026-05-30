import { asyncHandler } from '../utils/asyncHandler.js'
import { createOrganizer } from '../services/user.service.js'
import { validateCreateOrganizer } from '../validators/auth.validator.js'
import { getAdminDashboardStats, getAdminAnalytics } from '../services/dashboard.service.js'

export const createOrganizerAccount = asyncHandler(async (req, res) => {
  const payload = validateCreateOrganizer(req.body)
  const { user, email } = await createOrganizer({
    email: payload.email,
    password: payload.password,
    mustChangePassword: true,
    sendInvitationEmail: req.body?.sendEmail !== false,
  })

  res.status(201).json({
    success: true,
    message: 'Organizer account created',
    user,
    email,
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
