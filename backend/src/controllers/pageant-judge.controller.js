import { asyncHandler } from '../utils/asyncHandler.js'
import * as pageantService from '../services/pageant.service.js'
import { validateJudgeScores } from '../validators/competition.validator.js'

export const listMyEvents = asyncHandler(async (req, res) => {
  const events = await pageantService.listJudgeCompetitionEvents(req.user.id)
  res.json({ success: true, events })
})

export const getScoringSheet = asyncHandler(async (req, res) => {
  const { divisionId } = req.query
  const sheet = await pageantService.getJudgeScoringSheet(
    req.params.eventId,
    req.user.id,
    { divisionId: divisionId || null }
  )
  res.json({ success: true, ...sheet })
})

export const submitScores = asyncHandler(async (req, res) => {
  const scores = validateJudgeScores(req.body)
  const result = await pageantService.submitJudgeScores(
    req.params.eventId,
    req.user.id,
    scores,
  )
  res.json(result)
})

