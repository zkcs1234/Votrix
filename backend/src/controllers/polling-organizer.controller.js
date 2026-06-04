import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import * as pollingService from '../services/polling.service.js'
import { importVotersFromCsv } from '../services/csv-import.service.js'
import { inviteVoterToEvent } from '../services/invitation.service.js'
import {
  validatePollEvent,
  validateQuestion,
  validatePollToggle,
  validateCustomType,
} from '../validators/polling.validator.js'
import { validateInviteVoter } from '../validators/email.validator.js'
import { uploadImageFile, UPLOAD_KIND } from '../services/upload.service.js'
import { updateOrganizationLogo } from '../services/organization.service.js'
import { ORG_TYPES } from '../utils/constants.js'
import {
  loadQuestionTypeRegistry,
  listCustomTypes,
  createCustomType,
  updateCustomType,
  deleteCustomType,
} from '../services/polling-registry.service.js'
import { getOrCreatePollingOrganization } from '../services/organization.service.js'

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await pollingService.getOrganizerDashboard(req.user.id)
  res.json({ success: true, ...data })
})

export const listEvents = asyncHandler(async (req, res) => {
  const events = await pollingService.listPollEvents(req.user.id)
  res.json({ success: true, events })
})

export const createEvent = asyncHandler(async (req, res) => {
  const payload = validatePollEvent(req.body, true)
  const event = await pollingService.createPollEvent(req.user.id, payload)
  res.status(201).json({ success: true, event })
})

export const updateEvent = asyncHandler(async (req, res) => {
  const payload = validatePollEvent(req.body)
  const event = await pollingService.updatePollEvent(req.params.eventId, req.user.id, payload)
  res.json({ success: true, event })
})

export const getSettings = asyncHandler(async (req, res) => {
  const event = await pollingService.getPollSettings(req.params.eventId, req.user.id)
  res.json({ success: true, event })
})

export const uploadOrganizationLogo = asyncHandler(async (req, res) => {
  const result = await uploadImageFile(req.file, UPLOAD_KIND.LOGO, `polling-${req.user.id}`)
  const organization = await updateOrganizationLogo(
    req.user.id,
    ORG_TYPES.POLLING,
    result.secure_url,
  )
  res.json({ success: true, url: result.secure_url, organization })
})

export const uploadBanner = asyncHandler(async (req, res) => {
  const result = await uploadImageFile(req.file, UPLOAD_KIND.BANNER, `poll-${req.params.eventId}`)
  const event = await pollingService.updatePollEvent(req.params.eventId, req.user.id, {
    banner: result.secure_url,
  })
  res.json({ success: true, url: result.secure_url, event })
})

export const setPollOpen = asyncHandler(async (req, res) => {
  const enabled = validatePollToggle(req.body)
  const event = await pollingService.setPollOpen(req.params.eventId, req.user.id, enabled)
  res.json({ success: true, event })
})

export const listQuestions = asyncHandler(async (req, res) => {
  const questions = await pollingService.listQuestions(req.params.eventId, req.user.id)
  res.json({ success: true, questions })
})

export const createQuestion = asyncHandler(async (req, res) => {
  const org = await getOrCreatePollingOrganization(req.user.id)
  const payload = await validateQuestion(req.body, org.id)
  const question = await pollingService.createQuestion(
    req.params.eventId,
    req.user.id,
    payload,
  )
  res.status(201).json({ success: true, question })
})

export const updateQuestion = asyncHandler(async (req, res) => {
  const org = await getOrCreatePollingOrganization(req.user.id)
  const payload = await validateQuestion(req.body, org.id)
  const question = await pollingService.updateQuestion(
    req.params.eventId,
    req.user.id,
    req.params.questionId,
    payload,
  )
  res.json({ success: true, question })
})

export const deleteQuestion = asyncHandler(async (req, res) => {
  await pollingService.deleteQuestion(
    req.params.eventId,
    req.user.id,
    req.params.questionId,
  )
  res.json({ success: true, message: 'Question deleted' })
})

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await pollingService.getPollAnalytics(req.params.eventId, req.user.id)
  res.json({ success: true, analytics })
})

export const inviteRespondent = asyncHandler(async (req, res) => {
  const payload = validateInviteVoter(req.body)
  const result = await inviteVoterToEvent({
    eventId: req.params.eventId,
    email: payload.email,
    organizerId: req.user.id,
    temporaryPassword: payload.temporaryPassword,
  })
  res.status(201).json({ success: true, ...result })
})

export const importRespondentsCsv = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'CSV file required')
  const result = await importVotersFromCsv(req.params.eventId, req.user.id, req.file.buffer)
  res.json({ success: true, ...result })
})

// ---------------------------------------------------------------------------
// Phase 7 — Question type registry
// ---------------------------------------------------------------------------
export const listQuestionTypes = asyncHandler(async (req, res) => {
  const org = await getOrCreatePollingOrganization(req.user.id)
  const types = await loadQuestionTypeRegistry(org.id)
  res.json({ success: true, types })
})

export const listCustomQuestionTypes = asyncHandler(async (req, res) => {
  const org = await getOrCreatePollingOrganization(req.user.id)
  const types = await listCustomTypes(org.id)
  res.json({ success: true, types })
})

export const createCustomQuestionType = asyncHandler(async (req, res) => {
  const org = await getOrCreatePollingOrganization(req.user.id)
  const payload = validateCustomType(req.body)
  const type = await createCustomType(org.id, payload)
  res.status(201).json({ success: true, type })
})

export const updateCustomQuestionType = asyncHandler(async (req, res) => {
  const org = await getOrCreatePollingOrganization(req.user.id)
  const payload = validateCustomType(req.body)
  const type = await updateCustomType(org.id, req.params.typeId, payload)
  res.json({ success: true, type })
})

export const deleteCustomQuestionType = asyncHandler(async (req, res) => {
  const org = await getOrCreatePollingOrganization(req.user.id)
  await deleteCustomType(org.id, req.params.typeId)
  res.json({ success: true, message: 'Custom type removed' })
})
