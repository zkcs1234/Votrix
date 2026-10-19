import { Router } from 'express'
import { judgeScoreLimiter } from '../middleware/rateLimiter.js'
import { requireEventParticipant } from '../middleware/auth.js'
import { PARTICIPANT_TYPES } from '../utils/constants.js'
import * as ctrl from '../controllers/pageant-judge.controller.js'
import * as sessionCtrl from '../controllers/competition-session.controller.js'
import { requireOperationalEvent } from '../middleware/eventGuards.js'
import * as workflowCtrl from '../controllers/competition-workflow.controller.js'
import { requireLegacyCompetitionContext } from '../middleware/competition-context.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { nativeJudgeContext } from '../services/competition-native.service.js'
import * as scoring from '../services/competition-native-scoring.service.js'
import * as tabulation from '../services/competition-native-tabulation.service.js'
import {nativeJudgeScoreLimiter} from '../middleware/competition-rate-policy.js'
import {getCompetitionDashboard} from '../services/voter.service.js'

const router = Router()
router.get('/dashboard',asyncHandler(async(req,res)=>{res.set('Cache-Control','no-store');res.json({success:true,events:await getCompetitionDashboard(req.user.id)})}))
router.use('/events/:eventId/competitions', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
router.get('/events/:eventId/competitions/reviewer-contexts',requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE),asyncHandler(async(req,res)=>res.json({success:true,contexts:await tabulation.reviewerChoices(req.params.eventId,req.user.id)})))
router.get('/events/:eventId/competitions/:competitionId/tabulation/reviewer',requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE),asyncHandler(async(req,res)=>res.json({success:true,...await tabulation.tabulationSnapshot(req.params.eventId,req.params.competitionId,req.user.id,req.query.roundId??null,true)})))
router.post('/events/:eventId/competitions/:competitionId/tabulation/verify',requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE),asyncHandler(async(req,res)=>res.json({success:true,...await tabulation.transitionNative(req.params.eventId,req.params.competitionId,req.user.id,{...req.body,action:'verify'},true)})))
router.post('/events/:eventId/competitions/:competitionId/tabulation/deductions',requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE),asyncHandler(async(req,res)=>res.json({success:true,...await tabulation.deductionNative(req.params.eventId,req.params.competitionId,req.user.id,req.body,true)})))
router.get('/events/:eventId/competitions/scoring-contexts', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), asyncHandler(async(req,res)=>res.json({success:true,...await scoring.scoringChoicesResponse(req.params.eventId,req.user.id)})))
router.get('/events/:eventId/competitions/:competitionId/live', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), asyncHandler(async(req,res)=>res.json({success:true,...await scoring.liveView(req.params.eventId,req.params.competitionId,req.user.id,req.query.roundId??null)})))
router.post('/events/:eventId/competitions/:competitionId/scores/:action', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), requireOperationalEvent, nativeJudgeScoreLimiter, asyncHandler(async(req,res)=>res.json({success:true,...await scoring.scoreWrite(req.params.eventId,req.params.competitionId,req.user.id,req.body.roundId??null,req.params.action,req.body)})))
// Authorized context metadata only. No native score or live-session endpoint.
router.get('/events/:eventId/competitions/:competitionId/context', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), asyncHandler(async (req, res) => res.json({ success: true, context: await nativeJudgeContext(req.params.eventId, req.params.competitionId, req.user.id, req.query.roundId ?? null) })))
router.use('/events/:eventId', requireLegacyCompetitionContext({ judge: true }))
router.get('/events/:eventId/published-results', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), workflowCtrl.judgePublishedResults)
router.post('/events/:eventId/amendments/approve', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), workflowCtrl.approveAmendment)
router.get('/events/:eventId/verification', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), workflowCtrl.reviewerData)
router.post('/events/:eventId/decisions/approve', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), workflowCtrl.approveDecision)
router.post('/events/:eventId/session-draft', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), requireOperationalEvent, judgeScoreLimiter, workflowCtrl.judgeDraft)
router.post('/events/:eventId/submit-round', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), requireOperationalEvent, judgeScoreLimiter, workflowCtrl.judgeSubmit)
router.post('/events/:eventId/calculations/:calculationId/verify', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), workflowCtrl.reviewerVerify)

router.get('/events', ctrl.listMyEvents)
router.get('/events/:eventId/score', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), ctrl.getScoringSheet)
router.post('/events/:eventId/score', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), requireOperationalEvent, judgeScoreLimiter, ctrl.submitScores)

// Live session judge endpoints
router.get('/events/:eventId/session-view', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), sessionCtrl.getJudgeSessionView)
router.post('/events/:eventId/session-score', requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE), requireOperationalEvent, judgeScoreLimiter, sessionCtrl.submitJudgeSessionScore)

export default router
