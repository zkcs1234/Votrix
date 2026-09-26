import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import * as electionService from '../services/election.service.js'
import { uploadImageFile, UPLOAD_KIND } from '../services/upload.service.js'
import {
  validateCreateEvent,
  validateUpdateEvent,
  validatePosition,
  validateCandidate,
} from '../validators/election.validator.js'
import { getEventCohorts, inviteCohort as inviteCohortService, removeEventParticipant } from '../services/cohort.service.js'

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

export const uploadBanner = asyncHandler(async (req, res) => {
  const result = await uploadImageFile(req.file, UPLOAD_KIND.BANNER, `event-${req.params.eventId}`)
  const event = await electionService.updateElectionEvent(req.params.eventId, req.user.id, {
    banner: result.secure_url,
    image_asset_id: result.image_asset_id ?? null,
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
    { photo: result.secure_url, image_asset_id: result.image_asset_id ?? null },
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

// ——— Cohort invite (plan Phase 5) ———
export const getCohorts = asyncHandler(async (req, res) => {
  const result = await getEventCohorts(req.params.eventId, req.user.id)
  res.json({ success: true, ...result })
})

export const inviteCohort = asyncHandler(async (req, res) => {
  const { cohortType, values, notify } = req.body ?? {}
  const result = await inviteCohortService(req.params.eventId, req.user.id, { cohortType, values, notify })
  res.json({ success: true, ...result })
})

export const removeParticipant = asyncHandler(async (req, res) => {
  const result = await removeEventParticipant(req.params.eventId, req.user.id, req.params.userId)
  res.json({ success: true, ...result })
})

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await electionService.getElectionAnalytics(
    req.params.eventId,
    req.user.id,
  )
  res.json({ success: true, analytics })
})

export const getVotingTimeline = asyncHandler(async (req, res) => {
  const timeline = await electionService.getElectionVotingTimeline(
    req.params.eventId,
    req.user.id,
  )
  res.json({ success: true, timeline })
})

export const getBallotPreview = asyncHandler(async (req, res) => {
  const preview = await electionService.getBallotPreview(
    req.params.eventId,
    req.user.id,
  )
  res.json({ success: true, preview })
})

export const duplicateEvent = asyncHandler(async (req, res) => {
  const event = await electionService.duplicateElectionEvent(
    req.params.eventId,
    req.user.id,
  )
  res.status(201).json({ success: true, event })
})

export const finalizeEvent = asyncHandler(async (req, res) => {
  const event = await electionService.finalizeElectionEvent(
    req.params.eventId,
    req.user.id,
  )
  res.json({ success: true, event })
})

export const publishEvent = asyncHandler(async (req, res) => {
  const event = await electionService.publishElectionEvent(
    req.params.eventId,
    req.user.id,
  )
  res.json({ success: true, event })
})

export const unpublishEvent = asyncHandler(async (req, res) => {
  const event = await electionService.unpublishElectionEvent(
    req.params.eventId,
    req.user.id,
  )
  res.json({ success: true, event })
})

