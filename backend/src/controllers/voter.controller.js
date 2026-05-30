import { asyncHandler } from '../utils/asyncHandler.js'
import * as voterService from '../services/voter.service.js'

export const getVoterOverview = asyncHandler(async (req, res) => {
  const dashboard = await voterService.getVoterDashboard(req.user.id)
  res.json({ success: true, ...dashboard })
})
