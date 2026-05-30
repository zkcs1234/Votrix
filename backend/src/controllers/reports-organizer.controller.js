import { asyncHandler } from '../utils/asyncHandler.js'
import * as reportsService from '../services/reports.service.js'

export const getOverview = asyncHandler(async (req, res) => {
  const report = await reportsService.getReportsOverview(req.user.id)
  res.json({ success: true, report })
})

export const getElectionReport = asyncHandler(async (req, res) => {
  const report = await reportsService.getElectionReport(req.params.eventId, req.user.id)
  res.json({ success: true, report })
})

export const getPageantReport = asyncHandler(async (req, res) => {
  const report = await reportsService.getPageantReport(req.params.eventId, req.user.id)
  res.json({ success: true, report })
})

export const getPollingReport = asyncHandler(async (req, res) => {
  const report = await reportsService.getPollingReport(req.params.eventId, req.user.id)
  res.json({ success: true, report })
})
