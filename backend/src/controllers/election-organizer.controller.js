import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import * as electionService from '../services/election.service.js'
import { importVotersFromCsv } from '../services/csv-import.service.js'
import { uploadImageFile, UPLOAD_KIND } from '../services/upload.service.js'
import { updateOrganizationLogo } from '../services/organization.service.js'
import { ORG_TYPES } from '../utils/constants.js'
import {
  validateCreateEvent,
  validateUpdateEvent,
  validatePosition,
  validateCandidate,
  validateVotingToggle,
} from '../validators/election.validator.js'
import { validateInviteVoter } from '../validators/email.validator.js'
import { inviteVoterToEvent } from '../services/invitation.service.js'

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await electionService.getOrganizerDashboard(req.user.id)
  res.json({ success: true, ...data })
})

export const listEvents = asyncHandler(async (req, res) => {
  const events = await electionService.listElectionEvents(req.user.id)
  res.json({ success: true, events })
})

export const createEvent = asyncHandler(async (req, res) => {
  const payload = validateCreateEvent(req.body)
  const event = await electionService.createElectionEvent(req.user.id, payload)
  res.status(201).json({ success: true, event })
})

export const getEvent = asyncHandler(async (req, res) => {
  const event = await electionService.getElectionEvent(req.params.eventId, req.user.id)
  res.json({ success: true, event })
})

export const updateEvent = asyncHandler(async (req, res) => {
  const payload = validateUpdateEvent(req.body)
  const event = await electionService.updateElectionEvent(
    req.params.eventId,
    req.user.id,
    payload,
  )
  res.json({ success: true, event })
})

export const setVoting = asyncHandler(async (req, res) => {
  const enabled = validateVotingToggle(req.body)
  const event = await electionService.setEventVoting(req.params.eventId, req.user.id, enabled)
  res.json({ success: true, event })
})

export const uploadOrganizationLogo = asyncHandler(async (req, res) => {
  const result = await uploadImageFile(req.file, UPLOAD_KIND.LOGO, `election-${req.user.id}`)
  const organization = await updateOrganizationLogo(
    req.user.id,
    ORG_TYPES.ELECTION,
    result.secure_url,
  )
  res.json({ success: true, url: result.secure_url, organization })
})

export const uploadBanner = asyncHandler(async (req, res) => {
  const result = await uploadImageFile(req.file, UPLOAD_KIND.BANNER, `event-${req.params.eventId}`)
  const event = await electionService.updateElectionEvent(req.params.eventId, req.user.id, {
    banner: result.secure_url,
  })
  res.json({ success: true, url: result.secure_url, event })
})

export const listPositions = asyncHandler(async (req, res) => {
  const positions = await electionService.listPositions(req.params.eventId, req.user.id)
  res.json({ success: true, positions })
})

export const createPosition = asyncHandler(async (req, res) => {
  const payload = validatePosition(req.body)
  const position = await electionService.createPosition(
    req.params.eventId,
    req.user.id,
    payload,
  )
  res.status(201).json({ success: true, position })
})

export const updatePosition = asyncHandler(async (req, res) => {
  const payload = validatePosition(req.body)
  const position = await electionService.updatePosition(
    req.params.eventId,
    req.user.id,
    req.params.positionId,
    payload,
  )
  res.json({ success: true, position })
})

export const deletePosition = asyncHandler(async (req, res) => {
  await electionService.deletePosition(
    req.params.eventId,
    req.user.id,
    req.params.positionId,
  )
  res.json({ success: true, message: 'Position deleted' })
})

export const listCandidates = asyncHandler(async (req, res) => {
  const candidates = await electionService.listCandidates(
    req.params.eventId,
    req.user.id,
    req.query.positionId,
  )
  res.json({ success: true, candidates })
})

export const createCandidate = asyncHandler(async (req, res) => {
  const payload = validateCandidate(req.body)
  const candidate = await electionService.createCandidate(
    req.params.eventId,
    req.user.id,
    req.params.positionId,
    payload,
  )
  res.status(201).json({ success: true, candidate })
})

export const updateCandidate = asyncHandler(async (req, res) => {
  const payload = validateCandidate(req.body)
  const candidate = await electionService.updateCandidate(
    req.params.eventId,
    req.user.id,
    req.params.candidateId,
    payload,
  )
  res.json({ success: true, candidate })
})

export const uploadCandidatePhoto = asyncHandler(async (req, res) => {
  const result = await uploadImageFile(
    req.file,
    UPLOAD_KIND.CANDIDATE_PHOTO,
    req.params.candidateId,
  )

  const candidate = await electionService.updateCandidate(
    req.params.eventId,
    req.user.id,
    req.params.candidateId,
    { photo: result.secure_url },
  )

  res.json({ success: true, url: result.secure_url, candidate })
})

export const deleteCandidate = asyncHandler(async (req, res) => {
  await electionService.deleteCandidate(
    req.params.eventId,
    req.user.id,
    req.params.candidateId,
  )
  res.json({ success: true, message: 'Candidate deleted' })
})

export const listVoters = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1
  const limit = parseInt(req.query.limit, 10) || 50
  const result = await electionService.listEventVoters(req.params.eventId, req.user.id, page, limit)
  res.json({ success: true, ...result })
})

export const inviteVoter = asyncHandler(async (req, res) => {
  const payload = validateInviteVoter(req.body)
  const result = await inviteVoterToEvent({
    eventId: req.params.eventId,
    email: payload.email,
    organizerId: req.user.id,
    temporaryPassword: payload.temporaryPassword,
  })
  res.status(201).json({ success: true, ...result })
})

export const importCsv = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'CSV file required')

  const result = await importVotersFromCsv(req.params.eventId, req.user.id, req.file.buffer)
  res.json({ success: true, ...result })
})

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await electionService.getElectionAnalytics(
    req.params.eventId,
    req.user.id,
  )
  res.json({ success: true, analytics })
})
