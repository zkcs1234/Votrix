import { Router } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { validateRouteUUIDParams } from '../utils/sanitize.js'
import * as service from '../services/competition-child.service.js'
import * as native from '../services/competition-native.service.js'
import * as scoring from '../services/competition-native-scoring.service.js'
import * as tabulation from '../services/competition-native-tabulation.service.js'
import * as results from '../services/competition-native-results.service.js'
import * as enrollment from '../controllers/competition.controller.js'
import { nativeSetupEnabled } from '../modules/competition-native-configuration.js'
import { ApiError } from '../utils/ApiError.js'

const router = Router({ mergeParams: true })
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
router.use(validateRouteUUIDParams)
// Enrollment is an explicit parent resource, distinct from child assignments.
// Reuse the existing owned pool/role rules without bypassing the legacy guard.
router.use('/enrollments', (req, _res, next) => next(nativeSetupEnabled() ? undefined : new ApiError(503, 'Native competition setup is disabled')))
router.get('/enrollments', enrollment.listJudgesV2)
router.get('/enrollments/pool', enrollment.getJudgePool)
router.post('/enrollments/pick', asyncHandler(async (req, _res, next) => {
  if (req.body?.notify) throw new ApiError(400, 'Use the separately authorized invitation workflow to send messages')
  next()
}), enrollment.pickJudges)
router.patch('/enrollments/:judgeId', enrollment.updateJudgeV2)
router.get('/:competitionId/results',asyncHandler(async(req,res)=>{res.set('Cache-Control','no-store');res.json({success:true,...await results.ownedResults(req.params.eventId,req.params.competitionId,req.user.id,req.query.roundId??null)})}))
router.post('/:competitionId/results/publication',asyncHandler(async(req,res)=>res.json({success:true,...await results.publishResults(req.params.eventId,req.params.competitionId,req.user.id,req.body)})))
router.get('/:competitionId/results/export',asyncHandler(async(req,res)=>{const data=await results.exportResults(req.params.eventId,req.params.competitionId,req.user.id,req.query);res.set({'Cache-Control':'no-store','Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${data.filename}"`});res.send(data.csv)}))
router.get('/:competitionId/tabulation',asyncHandler(async(req,res)=>res.json({success:true,...await tabulation.tabulationWorkspaceSnapshot(req.params.eventId,req.params.competitionId,req.user.id,req.query.roundId??null)})))
router.post('/:competitionId/tabulation/reviewer',asyncHandler(async(req,res)=>res.json({success:true,policy:await tabulation.appointReviewer(req.params.eventId,req.params.competitionId,req.user.id,req.body?.participantId)})))
router.post('/:competitionId/tabulation/calculate',asyncHandler(async(req,res)=>res.json({success:true,...await tabulation.calculateNative(req.params.eventId,req.params.competitionId,req.user.id,req.body)})))
router.post('/:competitionId/tabulation/finalize',asyncHandler(async(req,res)=>res.json({success:true,...await tabulation.transitionNative(req.params.eventId,req.params.competitionId,req.user.id,{...req.body,action:'finalize'})})))
router.post('/:competitionId/tabulation/deductions',asyncHandler(async(req,res)=>res.json({success:true,...await tabulation.deductionNative(req.params.eventId,req.params.competitionId,req.user.id,req.body)})))
router.post('/:competitionId/tabulation/qualification',asyncHandler(async(req,res)=>res.json({success:true,...await tabulation.qualificationNative(req.params.eventId,req.params.competitionId,req.user.id,req.body,false)})))
router.post('/:competitionId/tabulation/qualification/confirm',asyncHandler(async(req,res)=>res.json({success:true,...await tabulation.qualificationNative(req.params.eventId,req.params.competitionId,req.user.id,req.body,true)})))
router.get('/live-activity',asyncHandler(async(req,res)=>res.json({success:true,activity:await scoring.liveActivity(req.params.eventId,req.user.id)})))
router.post('/live/activate',asyncHandler(async(req,res)=>res.json({success:true,...await scoring.activateLiveControl(req.params.eventId,req.user.id)})))
router.get('/scoring-contexts', asyncHandler(async (req,res)=>res.json({success:true,...await scoring.scoringChoicesResponse(req.params.eventId,req.user.id,true)})))
router.get('/creation-review', asyncHandler(async(req,res)=>res.json({success:true,...await native.creationParentReview(req.params.eventId,req.user.id)})))
router.get('/:competitionId/live', asyncHandler(async (req,res)=>res.json({success:true,...await scoring.liveView(req.params.eventId,req.params.competitionId,req.user.id,req.query.roundId??null,true)})))
router.post('/:competitionId/live/:action', asyncHandler(async (req,res)=>res.json({success:true,...await scoring.liveControl(req.params.eventId,req.params.competitionId,req.user.id,req.body.roundId??null,req.params.action,req.body)})))
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, ...await service.listChildCompetitions(req.params.eventId, req.user.id) })))
router.post('/complete-creation', asyncHandler(async (req,res)=>res.json({success:true,...await native.completeNativeCreation(req.params.eventId,req.user.id,req.body)})))
router.patch('/:competitionId', asyncHandler(async(req,res)=>res.json({success:true,competition:await native.editNativeDraftChild(req.params.eventId,req.params.competitionId,req.user.id,req.body)})))
router.delete('/:competitionId', asyncHandler(async(req,res)=>res.json({success:true,...await native.removeNativeDraftChild(req.params.eventId,req.params.competitionId,req.user.id,req.body)})))
router.post('/', asyncHandler(async (req, res) => res.status(201).json({ success: true, competition: await service.createChildCompetition(req.params.eventId, req.user.id, req.body) })))
router.post('/legacy-mapping', asyncHandler(async (req, res) => res.json({ success: true, competition: await service.mapLegacyCompetition(req.params.eventId, req.user.id) })))
router.get('/:competitionId/entries', asyncHandler(async (req, res) => res.json({ success: true, entries: await service.listCompetitionEntries(req.params.eventId, req.user.id, req.params.competitionId) })))
router.post('/:competitionId/entries', asyncHandler(async (req, res) => res.status(201).json({ success: true, participation: await service.addCompetitionEntry(req.params.eventId, req.user.id, req.params.competitionId, req.body) })))
router.delete('/:competitionId/entries/:entryId',asyncHandler(async(req,res)=>res.json({success:true,...await native.removeNativeDraftEntry(req.params.eventId,req.params.competitionId,req.user.id,req.params.entryId,req.body)})))
router.get('/:competitionId/foundation', asyncHandler(async (req, res) => res.json({ success: true, ...await native.nativeFoundation(req.params.eventId, req.params.competitionId, req.user.id) })))
router.put('/:competitionId/configuration', asyncHandler(async (req, res) => res.json({ success: true, ...await native.saveNativeConfiguration(req.params.eventId, req.params.competitionId, req.user.id, req.body) })))
router.post('/:competitionId/judge-assignments', asyncHandler(async (req, res) => res.json({ success: true, assignment: await native.assignNativeJudge(req.params.eventId, req.params.competitionId, req.user.id, req.body) })))
router.delete('/:competitionId/judge-assignments', asyncHandler(async (req, res) => res.json({ success: true, assignment: await native.assignNativeJudge(req.params.eventId, req.params.competitionId, req.user.id, req.body, true) })))
router.post('/:competitionId/rules/freeze', asyncHandler(async (req, res) => res.json({ success: true, rules: await native.freezeNativeRules(req.params.eventId, req.params.competitionId, req.user.id, req.body) })))
export default router
