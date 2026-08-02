import { asyncHandler } from '../utils/asyncHandler.js'
import * as voterService from '../services/voter.service.js'
import * as participantService from '../services/participant.service.js'
import { getEventById } from '../services/event.service.js'
import { db } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES } from '../utils/constants.js'

export const getVoterOverview = asyncHandler(async (req, res) => {
  const dashboard = await voterService.getVoterDashboard(req.user.id)
  res.json({ success: true, ...dashboard })
})

export const getVoterLoginRedirect = asyncHandler(async (req, res) => {
  const redirect = await voterService.getVoterLoginRedirect(req.user.id)
  res.json({ success: true, redirect })
})

/**
 * GET /voter/participant-types
 * Returns a summary of all participant roles for the current user across all events.
 */
export const getMyParticipantTypes = asyncHandler(async (req, res) => {
  const roles = await participantService.listUserParticipantRoles(req.user.id)
  res.json({ success: true, roles })
})

/**
 * GET /voter/events/:eventId/my-role
 * Returns the participant type and status for a specific event.
 */
export const getMyEventRole = asyncHandler(async (req, res) => {
  const { eventId } = req.params
  const participant = await participantService.findEventParticipant(eventId, req.user.id)
  const event = await getEventById(eventId)

  if (!participant) {
    return res.status(404).json({
      success: false,
      message: 'You are not a participant in this event',
    })
  }

  res.json({
    success: true,
    participantType: participant.participant_type,
    hasVoted: participant.has_voted,
    hasScored: participant.has_scored,
    hasResponded: participant.has_responded,
    metadata: participant.metadata,
    informationFormSchema: event?.information_form_schema ?? { enabled: false, fields: [] },
  })
})

/**
 * PATCH /voter/events/:eventId/participant-information
 * Update participant information form data (stored in metadata JSONB).
 */
export const updateMyParticipantInformation = asyncHandler(async (req, res) => {
  const { eventId } = req.params
  const { metadata } = req.body

  if (!metadata || typeof metadata !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'metadata object is required',
    })
  }

  const participant = await participantService.updateParticipantInformation(
    eventId,
    req.user.id,
    metadata,
  )

  res.json({
    success: true,
    participantType: participant.participant_type,
    metadata: participant.metadata,
  })
})
