import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import * as pollingService from '../services/polling.service.js'
import * as electionService from '../services/election.service.js'
import { importVotersFromCsv, previewCsv, registerVotersFromCsv } from '../services/csv-import.service.js'
import { uploadImageFile, UPLOAD_KIND } from '../services/upload.service.js'
import { validatePollEvent, validatePollQuestion } from '../validators/polling.validator.js'
import { validateInviteVoter } from '../validators/email.validator.js'
import { getEventInformationForm, setEventInformationForm } from '../services/event.service.js'

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
  const settings = await pollingService.getPollSettings(req.params.eventId, req.user.id)
  res.json({ success: true, settings })
})

export const setPollOpen = asyncHandler(async (req, res) => {
  const { open } = req.body
  const event = await pollingService.setPollOpen(req.params.eventId, req.user.id, open)
  res.json({ success: true, event })
})

export const uploadBanner = asyncHandler(async (req, res) => {
  const result = await uploadImageFile(req.file, UPLOAD_KIND.BANNER, `poll-${req.params.eventId}`)
  const event = await pollingService.updatePollEvent(req.params.eventId, req.user.id, {
    banner: result.secure_url,
    image_asset_id: result.image_asset_id ?? null,
  })
  res.json({ success: true, url: result.secure_url, event })
})

export const uploadGenericImage = asyncHandler(async (req, res) => {
  const result = await uploadImageFile(req.file, UPLOAD_KIND.PHOTO, `poll-${req.params.eventId}-img`)
  res.json({ 
    success: true, 
    url: result.secure_url,
    image_asset_id: result.image_asset_id ?? null,
  })
})

export const listQuestions = asyncHandler(async (req, res) => {
  const questions = await pollingService.listQuestions(req.params.eventId, req.user.id)
  res.json({ success: true, questions })
})

export const createQuestion = asyncHandler(async (req, res) => {
  const payload = validatePollQuestion(req.body)
  const question = await pollingService.createQuestion(req.params.eventId, req.user.id, payload)
  res.status(201).json({ success: true, question })
})

export const reorderQuestions = asyncHandler(async (req, res) => {
  // Accept either:
  //   { orders: [{ id, sortOrder }] }   (sent by the builder page)
  //   { questionIds: ['id1', 'id2'] }   (legacy format)
  const { questionIds, orders } = req.body

  const eventId = req.params.eventId
  const questions = await pollingService.listQuestions(eventId, req.user.id)

  if (Array.isArray(orders)) {
    // New format: explicit { id, sortOrder } pairs
    for (const entry of orders) {
      if (!entry.id) throw new ApiError(400, 'Each order entry must have an id')
      const q = questions.find((qq) => qq.id === entry.id)
      if (!q) throw new ApiError(400, `Question ${entry.id} not found`)
      await pollingService.updateQuestion(eventId, req.user.id, entry.id, {
        sortOrder: entry.sortOrder,
      })
    }
  } else if (Array.isArray(questionIds)) {
    // Legacy format: ordered array of IDs
    for (let i = 0; i < questionIds.length; i++) {
      const q = questions.find((qq) => qq.id === questionIds[i])
      if (!q) throw new ApiError(400, `Question ${questionIds[i]} not found`)
      await pollingService.updateQuestion(eventId, req.user.id, questionIds[i], { sortOrder: i })
    }
  } else {
    throw new ApiError(400, 'orders array or questionIds array required')
  }

  res.json({ success: true, message: 'Questions reordered' })
})

export const updateQuestion = asyncHandler(async (req, res) => {
  const payload = validatePollQuestion(req.body)
  const question = await pollingService.updateQuestion(
    req.params.eventId,
    req.user.id,
    req.params.questionId,
    payload,
  )
  res.json({ success: true, question })
})

export const deleteQuestion = asyncHandler(async (req, res) => {
  await pollingService.deleteQuestion(req.params.eventId, req.user.id, req.params.questionId)
  res.json({ success: true, message: 'Question deleted' })
})

export const duplicateQuestion = asyncHandler(async (req, res) => {
  const question = await pollingService.duplicateQuestion(
    req.params.eventId,
    req.user.id,
    req.params.questionId,
  )
  res.status(201).json({ success: true, question })
})

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await pollingService.getPollAnalytics(req.params.eventId, req.user.id)
  res.json({ success: true, analytics })
})

export const listQuestionTypes = asyncHandler(async (req, res) => {
  const types = await pollingService.listQuestionTypes(req.user.id)
  res.json({ success: true, types })
})

export const listCustomQuestionTypes = asyncHandler(async (req, res) => {
  const types = await pollingService.listCustomQuestionTypes(req.user.id)
  res.json({ success: true, types })
})

export const createCustomQuestionType = asyncHandler(async (req, res) => {
  const type = await pollingService.createCustomQuestionType(req.user.id, req.body)
  res.status(201).json({ success: true, type })
})

export const updateCustomQuestionType = asyncHandler(async (req, res) => {
  const type = await pollingService.updateCustomQuestionType(
    req.params.typeId,
    req.user.id,
    req.body,
  )
  res.json({ success: true, type })
})

export const deleteCustomQuestionType = asyncHandler(async (req, res) => {
  await pollingService.deleteCustomQuestionType(req.params.typeId, req.user.id)
  res.json({ success: true, message: 'Custom question type deleted' })
})

export const listRespondents = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1
  const limit = parseInt(req.query.limit, 10) || 50
  const result = await pollingService.listEventRespondents(
    req.params.eventId,
    req.user.id,
    page,
    limit,
  )
  res.json({ success: true, ...result })
})

export const registerRespondent = asyncHandler(async (req, res) => {
  const payload = validateInviteVoter(req.body)
  const result = await pollingService.registerRespondentToPoll({
    eventId: req.params.eventId,
    email: payload.email,
    organizerId: req.user.id,
    temporaryPassword: payload.temporaryPassword,
    resetPasswordForExisting: false,
  })
  res.status(201).json({ success: true, ...result })
})

export const registerExistingRespondent = asyncHandler(async (req, res) => {
  const { email } = req.body
  if (!email) throw new ApiError(400, 'Email is required')

  const result = await pollingService.registerExistingRespondent({
    eventId: req.params.eventId,
    email,
    organizerId: req.user.id,
  })

  res.json({
    success: true,
    message: 'Respondent registered successfully',
    respondent: result.user,
  })
})

export const sendRespondentInvitation = asyncHandler(async (req, res) => {
  const result = await pollingService.sendRespondentInvitation({
    eventId: req.params.eventId,
    voterId: req.params.voterId,
    organizerId: req.user.id,
  })

  res.json({
    success: true,
    message: result.invitationSent ? 'Invitation sent' : 'Failed to send invitation',
    invitationSent: result.invitationSent,
    email: result.email,
  })
})

export const sendAllRespondentInvitations = asyncHandler(async (req, res) => {
  const result = await pollingService.sendAllPendingRespondentInvitations({
    eventId: req.params.eventId,
    organizerId: req.user.id,
  })

  res.json({
    success: true,
    total: result.total,
    sent: result.sent,
    failed: result.failed,
    results: result.results,
  })
})

export const previewRespondentsCsv = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'CSV file required')
  const result = await previewCsv(req.params.eventId, req.user.id, req.file.buffer)
  res.json({ success: true, ...result })
})

export const registerRespondentsCsv = asyncHandler(async (req, res) => {
  const { data } = req.body
  if (!data || !Array.isArray(data)) {
    throw new ApiError(400, 'Invalid import data')
  }

  const result = await registerVotersFromCsv(req.params.eventId, req.user.id, data)
  res.json({ success: true, ...result })
})

// ——— Participant Information Form ———

export const getInformationForm = asyncHandler(async (req, res) => {
  const result = await getEventInformationForm(req.params.eventId, req.user.id)
  res.json({ success: true, ...result })
})

export const updateInformationForm = asyncHandler(async (req, res) => {
  const result = await setEventInformationForm(req.params.eventId, req.user.id, req.body)
  res.json({ success: true, ...result })
})
