import { asyncHandler } from '../utils/asyncHandler.js'
import { getApplicationFormContext, submitApplication } from '../services/organizer-application.service.js'

// Public, token-gated. No authentication: the invitation token is the credential.

export const getApplyForm = asyncHandler(async (req, res) => {
  const context = await getApplicationFormContext(req.params.token)
  res.json({ success: true, ...context })
})

export const submitApply = asyncHandler(async (req, res) => {
  const result = await submitApplication(req.params.token, req.body ?? {}, req.files)
  res.status(201).json({
    success: true,
    message: 'Application submitted. An administrator will review it.',
    ...result,
  })
})
