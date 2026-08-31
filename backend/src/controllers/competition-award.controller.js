import { asyncHandler } from '../utils/asyncHandler.js'
import * as awardService from '../services/competition-award.service.js'

/** GET /api/organizer/competition/events/:eventId/awards */
export const listAwards = asyncHandler(async (req, res) => {
  const awards = await awardService.listAwards(req.params.eventId, req.user.id)
  res.json({ success: true, awards })
})

/** GET /api/organizer/competition/events/:eventId/awards/winners */
export const getAwardWinners = asyncHandler(async (req, res) => {
  const awards = await awardService.computeAwardWinners(req.params.eventId, req.user.id)
  res.json({ success: true, awards })
})

/** POST /api/organizer/competition/events/:eventId/awards */
export const createAward = asyncHandler(async (req, res) => {
  const award = await awardService.createAward(req.params.eventId, req.user.id, req.body ?? {})
  res.status(201).json({ success: true, award })
})

/** PATCH /api/organizer/competition/events/:eventId/awards/:awardId */
export const updateAward = asyncHandler(async (req, res) => {
  const award = await awardService.updateAward(
    req.params.eventId,
    req.user.id,
    req.params.awardId,
    req.body ?? {},
  )
  res.json({ success: true, award })
})

/** DELETE /api/organizer/competition/events/:eventId/awards/:awardId */
export const deleteAward = asyncHandler(async (req, res) => {
  const result = await awardService.deleteAward(req.params.eventId, req.user.id, req.params.awardId)
  res.json(result)
})

/** PATCH /api/organizer/competition/events/:eventId/awards-enabled */
export const setAwardsEnabled = asyncHandler(async (req, res) => {
  const result = await awardService.setAwardsEnabled(
    req.params.eventId,
    req.user.id,
    req.body?.enabled === true,
  )
  res.json({ success: true, ...result })
})

/** PATCH /api/organizer/competition/events/:eventId/awards/:awardId/status */
export const setAwardStatus = asyncHandler(async (req, res) => {
  const award = await awardService.setAwardStatus(
    req.params.eventId,
    req.user.id,
    req.params.awardId,
    req.body?.status,
  )
  res.json({ success: true, award })
})

// --- Judge endpoints (mounted under /api/voter/competition) ---

/** GET /api/voter/competition/events/:eventId/award-tasks */
export const getJudgeAwardTasks = asyncHandler(async (req, res) => {
  const awards = await awardService.getJudgeAwardTasks(req.params.eventId, req.user.id)
  res.json({ success: true, awards })
})

/** POST /api/voter/competition/events/:eventId/awards/:awardId/select */
export const submitAwardSelection = asyncHandler(async (req, res) => {
  const result = await awardService.submitAwardSelection(
    req.params.eventId,
    req.user.id,
    req.params.awardId,
    req.body?.contestantId,
  )
  res.json(result)
})
