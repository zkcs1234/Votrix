import { asyncHandler } from '../utils/asyncHandler.js'
import { validateUUID } from '../utils/sanitize.js'
import {
  activateOfficer,
  adminDeactivateOfficer,
  adminListOfficers,
  assignOfficer,
  deactivateOfficer,
  listCandidates,
  listOfficers,
  updateOfficerPosition,
} from '../services/organization-officer.service.js'

// Owner-only endpoints (mounted behind requireOwnerOrganizer). `req.user.id` is
// the owner organizer; officers can never reach these.

export const listMyOfficers = asyncHandler(async (req, res) => {
  const result = await listOfficers(req.user.id, { status: req.query.status || 'all' })
  res.json({ success: true, ...result })
})

export const listOfficerCandidates = asyncHandler(async (req, res) => {
  const result = await listCandidates(req.user.id, { search: req.query.search, limit: req.query.limit })
  res.json({ success: true, ...result })
})

export const assignMyOfficer = asyncHandler(async (req, res) => {
  const result = await assignOfficer(req.user.id, req.body ?? {}, req.user.id)
  res.status(201).json({ success: true, ...result })
})

export const updateMyOfficer = asyncHandler(async (req, res) => {
  const officerId = validateUUID(req.params.officerId, 'officerId')
  const result = await updateOfficerPosition(req.user.id, officerId, req.body?.position)
  res.json({ success: true, ...result })
})

export const deactivateMyOfficer = asyncHandler(async (req, res) => {
  const officerId = validateUUID(req.params.officerId, 'officerId')
  const result = await deactivateOfficer(req.user.id, officerId, req.user.id)
  res.json({ success: true, ...result })
})

export const activateMyOfficer = asyncHandler(async (req, res) => {
  const officerId = validateUUID(req.params.officerId, 'officerId')
  const result = await activateOfficer(req.user.id, officerId, req.user.id)
  res.json({ success: true, ...result })
})

// ---- Admin override (read + deactivate) -----------------------------------
export const adminListOrganizerOfficers = asyncHandler(async (req, res) => {
  const organizerId = validateUUID(req.params.organizerId, 'organizerId')
  const result = await adminListOfficers(organizerId)
  res.json({ success: true, ...result })
})

export const adminDeactivateOrganizerOfficer = asyncHandler(async (req, res) => {
  const organizerId = validateUUID(req.params.organizerId, 'organizerId')
  const officerId = validateUUID(req.params.officerId, 'officerId')
  const result = await adminDeactivateOfficer(organizerId, officerId, req.user.id)
  res.json({ success: true, ...result })
})
