import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import * as pageantService from '../services/pageant.service.js'
import { importJudgesFromCsv } from '../services/pageant-csv.service.js'
import { uploadImageFile, UPLOAD_KIND } from '../services/upload.service.js'
import { updateOrganizationLogo } from '../services/organization.service.js'
import { ORG_TYPES } from '../utils/constants.js'
import {
  validatePageantEvent,
  validateContestant,
  validateCriteria,
  validateScoringToggle,
} from '../validators/pageant.validator.js'
import { validateInviteVoter } from '../validators/email.validator.js'

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await pageantService.getOrganizerDashboard(req.user.id)
  res.json({ success: true, ...data })
})

export const listEvents = asyncHandler(async (req, res) => {
  const events = await pageantService.listPageantEvents(req.user.id)
  res.json({ success: true, events })
})

export const createEvent = asyncHandler(async (req, res) => {
  const payload = validatePageantEvent(req.body, true)
  const event = await pageantService.createPageantEvent(req.user.id, payload)
  res.status(201).json({ success: true, event })
})

export const getEvent = asyncHandler(async (req, res) => {
  const event = await pageantService.getPageantEvent(req.params.eventId, req.user.id)
  res.json({ success: true, event })
})

export const updateEvent = asyncHandler(async (req, res) => {
  const payload = validatePageantEvent(req.body)
  const event = await pageantService.updatePageantEvent(
    req.params.eventId,
    req.user.id,
    payload,
  )
  res.json({ success: true, event })
})

export const setScoring = asyncHandler(async (req, res) => {
  const enabled = validateScoringToggle(req.body)
  const event = await pageantService.setEventScoring(req.params.eventId, req.user.id, enabled)
  res.json({ success: true, event })
})

export const uploadOrganizationLogo = asyncHandler(async (req, res) => {
  const result = await uploadImageFile(req.file, UPLOAD_KIND.LOGO, `pageant-${req.user.id}`)
  const organization = await updateOrganizationLogo(
    req.user.id,
    ORG_TYPES.PAGEANT,
    result.secure_url,
  )
  res.json({ success: true, url: result.secure_url, organization })
})

export const uploadBanner = asyncHandler(async (req, res) => {
  const result = await uploadImageFile(req.file, UPLOAD_KIND.BANNER, `pageant-${req.params.eventId}`)
  const event = await pageantService.updatePageantEvent(req.params.eventId, req.user.id, {
    banner: result.secure_url,
  })
  res.json({ success: true, url: result.secure_url, event })
})

export const listContestants = asyncHandler(async (req, res) => {
  const contestants = await pageantService.listContestants(req.params.eventId, req.user.id)
  res.json({ success: true, contestants })
})

export const createContestant = asyncHandler(async (req, res) => {
  const payload = validateContestant(req.body)
  const contestant = await pageantService.createContestant(
    req.params.eventId,
    req.user.id,
    payload,
  )
  res.status(201).json({ success: true, contestant })
})

export const updateContestant = asyncHandler(async (req, res) => {
  const payload = validateContestant(req.body)
  const contestant = await pageantService.updateContestant(
    req.params.eventId,
    req.user.id,
    req.params.contestantId,
    payload,
  )
  res.json({ success: true, contestant })
})

export const uploadContestantPhoto = asyncHandler(async (req, res) => {
  const result = await uploadImageFile(
    req.file,
    UPLOAD_KIND.CONTESTANT_PHOTO,
    req.params.contestantId,
  )
  const contestant = await pageantService.updateContestant(
    req.params.eventId,
    req.user.id,
    req.params.contestantId,
    { photo: result.secure_url },
  )
  res.json({ success: true, url: result.secure_url, contestant })
})

export const deleteContestant = asyncHandler(async (req, res) => {
  await pageantService.deleteContestant(
    req.params.eventId,
    req.user.id,
    req.params.contestantId,
  )
  res.json({ success: true, message: 'Contestant deleted' })
})

export const listCriteria = asyncHandler(async (req, res) => {
  const criteria = await pageantService.listCriteria(req.params.eventId, req.user.id)
  res.json({ success: true, criteria })
})

export const createCriteria = asyncHandler(async (req, res) => {
  const payload = validateCriteria(req.body)
  const criteria = await pageantService.createCriteria(
    req.params.eventId,
    req.user.id,
    payload,
  )
  res.status(201).json({ success: true, criteria })
})

export const updateCriteria = asyncHandler(async (req, res) => {
  const payload = validateCriteria(req.body)
  const criteria = await pageantService.updateCriteria(
    req.params.eventId,
    req.user.id,
    req.params.criteriaId,
    payload,
  )
  res.json({ success: true, criteria })
})

export const deleteCriteria = asyncHandler(async (req, res) => {
  await pageantService.deleteCriteria(
    req.params.eventId,
    req.user.id,
    req.params.criteriaId,
  )
  res.json({ success: true, message: 'Criteria deleted' })
})

export const listJudges = asyncHandler(async (req, res) => {
  const judges = await pageantService.listJudges(req.params.eventId, req.user.id)
  res.json({ success: true, judges })
})

export const inviteJudge = asyncHandler(async (req, res) => {
  const payload = validateInviteVoter(req.body)
  const result = await pageantService.inviteJudge(req.params.eventId, req.user.id, {
    email: payload.email,
    temporaryPassword: payload.temporaryPassword,
  })
  res.status(201).json({ success: true, ...result })
})

export const importJudgesCsv = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'CSV file required')
  const result = await importJudgesFromCsv(req.params.eventId, req.user.id, req.file.buffer)
  res.json({ success: true, ...result })
})

export const getRankings = asyncHandler(async (req, res) => {
  const rankings = await pageantService.getLiveRankings(req.params.eventId, req.user.id)
  res.json({ success: true, ...rankings })
})

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await pageantService.getPageantAnalytics(req.params.eventId, req.user.id)
  res.json({ success: true, analytics })
})
