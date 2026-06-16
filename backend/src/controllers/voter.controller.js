import { asyncHandler } from '../utils/asyncHandler.js'
import * as voterService from '../services/voter.service.js'

export const getVoterOverview = asyncHandler(async (req, res) => {
  const dashboard = await voterService.getVoterDashboard(req.user.id)
  res.json({ success: true, ...dashboard })
})

export const getVoterLoginRedirect = asyncHandler(async (req, res) => {
  const redirect = await voterService.getVoterLoginRedirect(req.user.id)
  res.json({ success: true, redirect })
})
