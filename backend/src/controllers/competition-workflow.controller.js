import { asyncHandler } from '../utils/asyncHandler.js'
import * as workflow from '../services/competition-workflow.service.js'
import * as workbook from '../services/competition-workbook.service.js'
export const organizerAction = action => asyncHandler(async(req,res)=>res.json({success:true,result:await workflow.organizerAction(req.params.eventId,req.user.id,action,req.body)}))
export const tabulation = asyncHandler(async(req,res)=>res.json({success:true,...await workflow.tabulationData(req.params.eventId,req.user.id,{roundId:req.query.roundId??null})}))
export const rules = asyncHandler(async(req,res)=>res.json({success:true,rules:await workflow.rulesFor(req.params.eventId)}))
export const judgeDraft = asyncHandler(async(req,res)=>res.json(await workflow.scoringWrite(req.params.eventId,req.user.id,'draft',req.body)))
export const judgeSubmit = asyncHandler(async(req,res)=>res.json(await workflow.scoringWrite(req.params.eventId,req.user.id,'submit',req.body)))
export const judgePublishedResults = asyncHandler(async(req,res)=>res.json(await workflow.judgePublishedResults(req.params.eventId,req.user.id)))
export const verify = asyncHandler(async(req,res)=>res.json({success:true,calculation:await workflow.transitionCalculation(req.params.eventId,req.user.id,req.params.calculationId,'verify',req.body)}))
export const reviewerVerify = asyncHandler(async(req,res)=>res.json({success:true,calculation:await workflow.reviewerVerify(req.params.eventId,req.user.id,req.params.calculationId,req.body)}))
export const reviewerData = asyncHandler(async(req,res)=>res.json({success:true,...await workflow.reviewerData(req.params.eventId,req.user.id)}))
export const approveDecision = asyncHandler(async(req,res)=>res.json({success:true,result:await workflow.approveDecision(req.params.eventId,req.user.id,req.body)}))
export const exportExcel = asyncHandler(async(req,res)=>{
  const file=await workbook.exportWorkbook(req.params.eventId,req.user.id,{roundId:req.query.roundId??null})
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition',`attachment; filename="votrix-competition-${req.params.eventId}.xlsx"`)
  res.send(file)
})
export const importExcel = asyncHandler(async(req,res)=>res.json({success:true,...await workbook.verifyWorkbook(req.params.eventId,req.user.id,req.file,{roundId:req.body.roundId||null})}))

export const approveAmendment=asyncHandler(async(req,res)=>res.json({success:true,result:await workflow.approveAmendment(req.params.eventId,req.user.id,req.body)}))

export const createRoundCriterion=asyncHandler(async(req,res)=>{const {db}=await import('../foundation/db.js');const {validateCriteria}=await import('../validators/competition.validator.js');const payload=validateCriteria(req.body);const {data,error}=await db().rpc('competition_create_round_criterion',{p_event:req.params.eventId,p_actor:req.user.id,p_round:req.params.roundId,p_payload:payload});workflow.workflowError(error);res.status(201).json({success:true,criteria:{...data,id:data.id,minScore:data.min_score,maxScore:data.max_score}})})
