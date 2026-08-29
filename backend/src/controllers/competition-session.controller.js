import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import * as sessionService from '../services/competition-session.service.js'

// ---------------------------------------------------------------------------
// Session status & information
// ---------------------------------------------------------------------------

/** GET /api/organizer/competition/events/:eventId/session/active */
export const getActiveSession = asyncHandler(async (req, res) => {
  const session = await sessionService.getActiveSession(req.params.eventId)
  res.json({ success: true, session })
})

/** GET /api/organizer/competition/events/:eventId/sessions */
export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await sessionService.listSessions(req.params.eventId, req.user.id)
  res.json({ success: true, sessions })
})

/** GET /api/organizer/competition/events/:eventId/sessions/:sessionId */
export const getSession = asyncHandler(async (req, res) => {
  const session = await sessionService.getSession(
    req.params.sessionId,
    req.params.eventId,
    req.user.id,
  )
  res.json({ success: true, session })
})

// ---------------------------------------------------------------------------
// Session controls (organizer only)
// ---------------------------------------------------------------------------

/** POST /api/organizer/competition/events/:eventId/session/start */
export const startSession = asyncHandler(async (req, res) => {
  const session = await sessionService.startSession(req.params.eventId, req.user.id)
  res.status(201).json({ success: true, session, message: 'Live session started' })
})

/** POST /api/organizer/competition/events/:eventId/session/next-contestant */
export const nextContestant = asyncHandler(async (req, res) => {
  const session = await sessionService.nextContestant(req.params.eventId, req.user.id)
  res.json({ success: true, session })
})

/** POST /api/organizer/competition/events/:eventId/session/prev-contestant */
export const previousContestant = asyncHandler(async (req, res) => {
  const session = await sessionService.previousContestant(req.params.eventId, req.user.id)
  res.json({ success: true, session })
})

/** POST /api/organizer/competition/events/:eventId/session/set-contestant */
export const setActiveContestant = asyncHandler(async (req, res) => {
  const { contestantId } = req.body
  if (!contestantId) {
    return res.status(400).json({ success: false, message: 'contestantId is required' })
  }
  const session = await sessionService.setActiveContestant(
    req.params.eventId,
    req.user.id,
    contestantId,
  )
  res.json({ success: true, session })
})

/** POST /api/organizer/competition/events/:eventId/session/set-round */
export const setActiveRound = asyncHandler(async (req, res) => {
  const { roundId } = req.body
  if (!roundId) {
    return res.status(400).json({ success: false, message: 'roundId is required' })
  }
  const session = await sessionService.setActiveRound(
    req.params.eventId,
    req.user.id,
    roundId,
  )
  res.json({ success: true, session })
})

/** POST /api/organizer/competition/events/:eventId/session/set-division */
export const setActiveDivision = asyncHandler(async (req, res) => {
  const { divisionId } = req.body
  // divisionId can be null to clear division (event-wide mode)
  const session = await sessionService.setActiveDivision(
    req.params.eventId,
    req.user.id,
    divisionId,
  )
  res.json({ success: true, session })
})

/** POST /api/organizer/competition/events/:eventId/session/pause */
export const pauseSession = asyncHandler(async (req, res) => {
  const session = await sessionService.pauseSession(req.params.eventId, req.user.id)
  res.json({ success: true, session })
})

/** POST /api/organizer/competition/events/:eventId/session/resume */
export const resumeSession = asyncHandler(async (req, res) => {
  const session = await sessionService.resumeSession(req.params.eventId, req.user.id)
  res.json({ success: true, session })
})

/** POST /api/organizer/competition/events/:eventId/session/complete */
export const completeSession = asyncHandler(async (req, res) => {
  const session = await sessionService.completeSession(req.params.eventId, req.user.id)
  res.json({ success: true, session, message: 'Competition session completed' })
})

// ---------------------------------------------------------------------------
// Round finalize & advancement (organizer) — Phase 6
// ---------------------------------------------------------------------------

/** GET /api/organizer/competition/events/:eventId/rounds/:roundId/advancement-preview */
export const previewRoundAdvancement = asyncHandler(async (req, res) => {
  const preview = await sessionService.previewRoundAdvancement(
    req.params.eventId,
    req.user.id,
    req.params.roundId,
  )
  res.json({ success: true, ...preview })
})

/** POST /api/organizer/competition/events/:eventId/session/finalize-round */
export const finalizeRound = asyncHandler(async (req, res) => {
  const { roundId, overrides } = req.body ?? {}
  if (!roundId) throw new ApiError(400, 'roundId is required')
  const result = await sessionService.finalizeRound(req.params.eventId, req.user.id, roundId, {
    overrides: overrides ?? null,
  })
  res.json({ success: true, ...result })
})

/** GET /api/organizer/competition/events/:eventId/rounds/:roundId/results */
export const getRoundResults = asyncHandler(async (req, res) => {
  const results = await sessionService.getRoundResults(
    req.params.eventId,
    req.user.id,
    req.params.roundId,
  )
  res.json({ success: true, results })
})

// ---------------------------------------------------------------------------
// Judge progress (organizer view)
// ---------------------------------------------------------------------------

/** GET /api/organizer/competition/events/:eventId/session/judge-progress */
export const getJudgeProgress = asyncHandler(async (req, res) => {
  const progress = await sessionService.getJudgeProgress(req.params.eventId, req.user.id)
  res.json({ success: true, ...progress })
})

// ---------------------------------------------------------------------------
// Judge (voter) session endpoints
// ---------------------------------------------------------------------------

/** GET /api/voter/competition/events/:eventId/session-view */
export const getJudgeSessionView = asyncHandler(async (req, res) => {
  const view = await sessionService.getJudgeSessionView(req.params.eventId, req.user.id)
  res.json({ success: true, ...view })
})

/** POST /api/voter/competition/events/:eventId/session-score */
export const submitJudgeSessionScore = asyncHandler(async (req, res) => {
  const result = await sessionService.submitJudgeSessionScore(
    req.params.eventId,
    req.user.id,
    req.body,
  )
  res.json({ success: true, ...result })
})

