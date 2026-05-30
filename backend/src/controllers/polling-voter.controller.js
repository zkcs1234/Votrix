import { asyncHandler } from '../utils/asyncHandler.js'
import * as pollingService from '../services/polling.service.js'
import { validatePollAnswers } from '../validators/polling.validator.js'

export const listMyPolls = asyncHandler(async (req, res) => {
  const events = await pollingService.listVoterPollEvents(req.user.id)
  res.json({ success: true, events })
})

export const getPoll = asyncHandler(async (req, res) => {
  const data = await pollingService.getPollForVoter(req.params.eventId, req.user.id)
  res.json({ success: true, ...data })
})

export const submitPoll = asyncHandler(async (req, res) => {
  const answers = validatePollAnswers(req.body)
  const result = await pollingService.submitPollResponse(
    req.params.eventId,
    req.user.id,
    answers,
  )
  res.json(result)
})
