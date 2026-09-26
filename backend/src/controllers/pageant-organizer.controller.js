import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import * as pageantService from '../services/pageant.service.js'
import { uploadImageFile, UPLOAD_KIND } from '../services/upload.service.js'
import {
  validateCompetitionEvent,
  validateContestant,
  validateCriteria,
  validateMinorCriteria,
  validateScoringToggle,
} from '../validators/competition.validator.js'
import { listTemplates as listCompetitionTemplates } from '../modules/competition-templates.js'

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await pageantService.getOrganizerDashboard(req.user.id)
  res.json({ success: true, ...data })
})

export const listEvents = asyncHandler(async (req, res) => {
  const events = await pageantService.listCompetitionEvents(req.user.id)
  res.json({ success: true, events })
})

export const listTemplates = asyncHandler(async (_req, res) => {
  const templates = listCompetitionTemplates()
  res.json({ success: true, templates })
})

export const createEvent = asyncHandler(async (req, res) => {
  const payload = validateCompetitionEvent(req.body, true)
  const event = await pageantService.createCompetitionEvent(req.user.id, payload)
  res.status(201).json({ success: true, event })
})

export const getEvent = asyncHandler(async (req, res) => {
  const event = await pageantService.getCompetitionEvent(req.params.eventId, req.user.id)
  res.json({ success: true, event })
})

export const updateEvent = asyncHandler(async (req, res) => {
  const payload = validateCompetitionEvent(req.body)
  const event = await pageantService.updateCompetitionEvent(
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

export const publishEvent = asyncHandler(async (req, res) => {
  const event = await pageantService.publishCompetitionEvent(req.params.eventId, req.user.id)
  res.json({ success: true, event })
})

export const unpublishEvent = asyncHandler(async (req, res) => {
  const event = await pageantService.unpublishCompetitionEvent(req.params.eventId, req.user.id)
  res.json({ success: true, event })
})

export const uploadBanner = asyncHandler(async (req, res) => {
  const result = await uploadImageFile(req.file, UPLOAD_KIND.BANNER, `competition-${req.params.eventId}`)
  const event = await pageantService.updateCompetitionEvent(req.params.eventId, req.user.id, {
    banner: result.secure_url,
    image_asset_id: result.image_asset_id ?? null,
  })
  res.json({ success: true, url: result.secure_url, event })
})

export const listContestants = asyncHandler(async (req, res) => {
  const contestants = await pageantService.listContestants(req.params.eventId, req.user.id)
  res.json({ success: true, contestants })
})

export const getNextContestantNumber = asyncHandler(async (req, res) => {
  const divisionId = req.query.divisionId || null
  const next = await pageantService.getNextContestantNumber(req.params.eventId, req.user.id, divisionId)
  res.json({ success: true, nextContestantNumber: next })
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
    { photo: result.secure_url, image_asset_id: result.image_asset_id ?? null },
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

export const listMinorCriteria = asyncHandler(async (req, res) => {
  const minorCriteria = await pageantService.listMinorCriteria(
    req.params.eventId,
    req.user.id,
    req.params.criteriaId,
  )
  res.json({ success: true, minorCriteria })
})

export const createMinorCriteria = asyncHandler(async (req, res) => {
  const payload = validateMinorCriteria(req.body, true)
  const minorCriteria = await pageantService.createMinorCriteria(
    req.params.eventId,
    req.user.id,
    req.params.criteriaId,
    payload,
  )
  res.status(201).json({ success: true, minorCriteria })
})

export const updateMinorCriteria = asyncHandler(async (req, res) => {
  const payload = validateMinorCriteria(req.body, false)
  const minorCriteria = await pageantService.updateMinorCriteria(
    req.params.eventId,
    req.user.id,
    req.params.criteriaId,
    req.params.minorCriteriaId,
    payload,
  )
  res.json({ success: true, minorCriteria })
})

export const deleteMinorCriteria = asyncHandler(async (req, res) => {
  await pageantService.deleteMinorCriteria(
    req.params.eventId,
    req.user.id,
    req.params.criteriaId,
    req.params.minorCriteriaId,
  )
  res.json({ success: true, message: 'Minor criteria deleted' })
})

export const listJudges = asyncHandler(async (req, res) => {
  const judges = await pageantService.listJudges(req.params.eventId, req.user.id)
  res.json({ success: true, judges })
})

export const getRankings = asyncHandler(async (req, res) => {
  const rankings = await pageantService.getLiveRankings(req.params.eventId, req.user.id, {
    divisionId: req.query.divisionId || null,
  })
  res.json({ success: true, ...rankings })
})

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await pageantService.getCompetitionAnalytics(req.params.eventId, req.user.id)
  res.json({ success: true, analytics })
})

export const getResults = asyncHandler(async (req, res) => {
  const results = await pageantService.getCompetitionResults(req.params.eventId, req.user.id)
  res.json({ success: true, results })
})
