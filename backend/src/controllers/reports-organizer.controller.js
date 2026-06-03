import { asyncHandler } from '../utils/asyncHandler.js'
import * as reportsService from '../services/reports.service.js'

function resolveFormat(queryFormat) {
  return queryFormat === 'csv' ? 'csv' : 'json'
}

function sendExport(res, { format, filename, csv, json }) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(csv || '')
  }

  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\.csv$/, '.json')}"`)
  return res.json({ success: true, report: json })
}

export const getOverview = asyncHandler(async (req, res) => {
  const report = await reportsService.getReportsOverview(req.user.id)
  res.json({ success: true, report })
})

export const exportOverview = asyncHandler(async (req, res) => {
  const format = resolveFormat(req.query.format)
  const exportData = await reportsService.getReportsOverviewExport(req.user.id)
  return sendExport(res, { format, ...exportData })
})

export const getElectionReport = asyncHandler(async (req, res) => {
  const report = await reportsService.getElectionReport(req.params.eventId, req.user.id)
  res.json({ success: true, report })
})

export const exportElectionReport = asyncHandler(async (req, res) => {
  const format = resolveFormat(req.query.format)
  const exportData = await reportsService.getElectionReportExport(req.params.eventId, req.user.id)
  return sendExport(res, { format, ...exportData })
})

export const getPageantReport = asyncHandler(async (req, res) => {
  const report = await reportsService.getPageantReport(req.params.eventId, req.user.id)
  res.json({ success: true, report })
})

export const exportPageantReport = asyncHandler(async (req, res) => {
  const format = resolveFormat(req.query.format)
  const exportData = await reportsService.getPageantReportExport(req.params.eventId, req.user.id)
  return sendExport(res, { format, ...exportData })
})

export const getPollingReport = asyncHandler(async (req, res) => {
  const report = await reportsService.getPollingReport(req.params.eventId, req.user.id)
  res.json({ success: true, report })
})

export const exportPollingReport = asyncHandler(async (req, res) => {
  const format = resolveFormat(req.query.format)
  const exportData = await reportsService.getPollingReportExport(req.params.eventId, req.user.id)
  return sendExport(res, { format, ...exportData })
})
