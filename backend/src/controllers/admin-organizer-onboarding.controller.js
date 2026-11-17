import { asyncHandler } from '../utils/asyncHandler.js'
import { validateUUID } from '../utils/sanitize.js'
import {
  createInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
} from '../services/organizer-invitation.service.js'
import {
  approveApplication,
  declineApplication,
  getApplication,
  listApplications,
} from '../services/organizer-application.service.js'

// Admin side of the organizer invitation → application → approval flow.
// Audit rows are written inside the services (recordAudit) so every caller,
// including future ones, gets them.

export const createOrganizerInvitation = asyncHandler(async (req, res) => {
  const result = await createInvitation(req.body, req.user.id)
  res.status(201).json({ success: true, ...result })
})

export const listOrganizerInvitations = asyncHandler(async (req, res) => {
  const { status, limit, offset } = req.query
  const result = await listInvitations({ status, limit, offset })
  res.json({ success: true, ...result })
})

export const revokeOrganizerInvitation = asyncHandler(async (req, res) => {
  const invitationId = validateUUID(req.params.invitationId, 'invitationId')
  const result = await revokeInvitation(invitationId, req.user.id)
  res.json({ success: true, ...result })
})

export const resendOrganizerInvitation = asyncHandler(async (req, res) => {
  const invitationId = validateUUID(req.params.invitationId, 'invitationId')
  const result = await resendInvitation(invitationId, req.user.id)
  res.status(201).json({ success: true, ...result })
})

export const listOrganizerApplications = asyncHandler(async (req, res) => {
  const { status, limit, offset } = req.query
  const result = await listApplications({ status, limit, offset })
  res.json({ success: true, ...result })
})

export const getOrganizerApplication = asyncHandler(async (req, res) => {
  const applicationId = validateUUID(req.params.applicationId, 'applicationId')
  const result = await getApplication(applicationId)
  res.json({ success: true, ...result })
})

export const approveOrganizerApplication = asyncHandler(async (req, res) => {
  const applicationId = validateUUID(req.params.applicationId, 'applicationId')
  const result = await approveApplication(applicationId, req.user.id, req.body ?? {})
  res.json({ success: true, message: 'Application approved and organizer account created', ...result })
})

export const declineOrganizerApplication = asyncHandler(async (req, res) => {
  const applicationId = validateUUID(req.params.applicationId, 'applicationId')
  const result = await declineApplication(applicationId, req.user.id, req.body?.reason)
  res.json({ success: true, message: 'Application declined', ...result })
})
