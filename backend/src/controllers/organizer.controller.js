import { asyncHandler } from '../utils/asyncHandler.js'
import { inviteVoterToEvent, resendVoterInvitation } from '../services/invitation.service.js'
import { notifyEventParticipants } from '../services/event.service.js'
import { validateInviteVoter, validateEventNotification } from '../validators/email.validator.js'
import {
  getOrganizerDashboardStats,
  getOrganizerAnalytics,
} from '../services/dashboard.service.js'

export const getOrganizerOverview = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    message: 'Organizer area — organization management in later phases',
  })
})

export const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await getOrganizerDashboardStats(req.user.id)
  res.json({ success: true, ...dashboard })
})

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await getOrganizerAnalytics(req.user.id)
  res.json({ success: true, ...analytics })
})

export const inviteVoter = asyncHandler(async (req, res) => {
  const payload = validateInviteVoter(req.body)
  const result = await inviteVoterToEvent({
    eventId: req.params.eventId,
    email: payload.email,
    organizerId: req.user.id,
    temporaryPassword: payload.temporaryPassword,
  })

  res.status(201).json({
    success: true,
    message: 'Voter invitation processed',
    ...result,
  })
})

export const resendInvitation = asyncHandler(async (req, res) => {
  const result = await resendVoterInvitation({
    eventId: req.params.eventId,
    voterId: req.params.voterId,
    organizerId: req.user.id,
  })

  res.json({
    success: true,
    message: 'Invitation resent',
    ...result,
  })
})

export const sendEventNotification = asyncHandler(async (req, res) => {
  const { message } = validateEventNotification(req.body)
  const result = await notifyEventParticipants(req.params.eventId, req.user.id, {
    message,
  })

  res.json({
    success: true,
    ...result,
  })
})
