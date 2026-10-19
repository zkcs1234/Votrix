import crypto from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { db } from '../foundation/db.js'
import { collectRows } from '../foundation/collectRows.js'
import { ApiError } from '../utils/ApiError.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { mapEvent } from '../foundation/mapper.js'
import { getCompetitionFoundation } from './competition.service.js'
import { judgeAccess, allowsScoring } from './competition-access.service.js'
import { criteriaSource, evaluateCriteriaReadiness, isCriteriaActive, scoringInputBounds } from '../../../shared/competition-criteria-readiness.js'
import { scoringRuleReadiness, activeScoringJudge } from '../../../shared/competition-rule-configuration.js'
import { progressionSources, effectiveRoundRules, nextRound, potentialRoundEntries, registrationSource, roundAcceptsEntry } from '../../../shared/competition-participation.js'
import {progressionIssues} from '../../../shared/competition-progression-validation.js'
import { calculateOfficial, roundField, championshipField, scopeAllows, OFFICIAL_METHODS } from '../../../shared/competition-calculation.js'
import { selectQualifiers, applyQualifierOverride } from '../modules/advancement.js'
import { recordAudit } from '../foundation/audit.js'
import { emitToEvent, emitToEventOrganizer, emitToUser } from '../websocket/ws-emitter.js'

export function workflowError(error) {
  if (!error) return
  if (['42P01','42703','PGRST202','PGRST205'].includes(error.code)) throw new ApiError(503, 'Competition workflow migrations through 100 are required. No scoring data was changed.')
  const message = error.message ?? 'Competition workflow operation failed'
  throw new ApiError(/FORBIDDEN|NOT_IN_RULES/.test(message) ? 403 : /STALE|CHANGED|CONFLICT|LOCKED|SUBMITTED|CLOSED|INCOMPLETE|MISSING|CONFIRMED|FINALIZED/.test(message) ? 409 : 400, message)
}
export function assertCriteriaReady(foundation) {
  const readiness = evaluateCriteriaReadiness(foundation)
  if (!readiness.allReady) {
    const incomplete = readiness.scopes.filter(scope => !scope.ready)
    throw new ApiError(400, `Complete scoring criteria before continuing: ${incomplete.map(scope => `${scope.name}: ${scope.issues.map(issue => issue.message).join(' ')}`).join('; ')}`, { criteriaReadiness: readiness })
  }
  return readiness
}
async function query(table, eventId) {
  const { data, error } = await collectRows(()=>db().from(table).select('*',{count:'exact'}).eq('event_id',eventId).order('id',{ascending:true}))
  workflowError(error); return data ?? []
}
export async function rulesFor(eventId) {
  const { data, error } = await db().from('competition_rule_versions').select('*').eq('event_id',eventId).order('version',{ascending:false}).limit(1).maybeSingle()
  workflowError(error)
  if(!data)return null
  const rules={...data.snapshot,id:data.id,version:data.version}
  const {data:decisions,error:decisionError}=await db().from('competition_advancement_decisions').select('*').eq('event_id',eventId).eq('rules_version',data.id)
  workflowError(decisionError)
  const eligibility=await query('competition_eligibility_decisions',eventId)
  return effectiveRoundRules(rules,decisions ?? [],eligibility)
}
export async function freezeRules(eventId, actor, body) {
  const event = await assertOrganizerOwnsEvent(eventId,actor)
  const setupRevision = event.competition_setup_revision
  if (body?.acknowledged!==true) throw new ApiError(400,'Confirm the official competition rules before publishing')
  if (event.status !== 'draft') throw new ApiError(409,'Only a draft competition can publish new rules')
  const f = await getCompetitionFoundation(eventId,actor)
  if(f.event.divisions_enabled && f.contestants.some(entry=>!f.divisions.some(d=>d.id===entry.divisionId)))throw new ApiError(400,'Assign every registered entry to a configured division before publishing')
  assertCriteriaReady(f)
  requireRevision(setupRevision)
  const validatedSource = criteriaSource(f)
  const { data: currentSource, error: sourceError } = await db().rpc('competition_criteria_source', { p_event: eventId })
  workflowError(sourceError)
  if (!isDeepStrictEqual(validatedSource, currentSource)) throw new ApiError(409, 'Criteria changed during review. Reload saved criteria before publishing.')
  // The saved, confirmed configuration governs publication. A request cannot
  // replace it with unpersisted settings after review.
  if (body.scoringConfig && !isDeepStrictEqual(body.scoringConfig, f.scoringConfig)) throw new ApiError(409,'Save and confirm scoring settings before publishing')
  const config = { ...f.scoringConfig }
  const ruleReadiness = scoringRuleReadiness(f, config, actor)
  if (!ruleReadiness.readyForPublication) throw new ApiError(400, [...ruleReadiness.issues, ...ruleReadiness.pending].map(issue => issue.message).join(' '), { scoringRulesReadiness: ruleReadiness })
  if (config.confirmed!==true || !OFFICIAL_METHODS.includes(config.calculationMethod) || config.calculationMethod==='undecided') throw new ApiError(400,'Choose and confirm an official scoring method in Scoring Rules')
  if (!['shared','highest_criterion'].includes(config.tiePolicy)) throw new ApiError(400,'Confirm a tie policy')
  if(config.calculationMethod==='rank_based'&&config.tiePolicy!=='shared')throw new ApiError(400,'Rank-based ties use shared Judge placements and shared final ranks')
  if (!Number.isInteger(Number(config.decimalPlaces)) || config.decimalPlaces<0 || config.decimalPlaces>6) throw new ApiError(400,'Precision must be 0-6')
  if (config.calculationMethod==='manual' && !String(config.manualBasis ?? '').trim()) throw new ApiError(400,'Manual results require a documented rule basis')
  if ((config.independentApproval!==false||config.calculationMethod==='manual') && !f.judges.some(j=>j.judgeId===config.verifierId&&j.isActive&&j.role==='score_reviewer')) throw new ApiError(400,'Choose an active enrolled independent score reviewer')
  config.deductionRules = config.deductionRules ?? []
  if(!Array.isArray(config.deductionRules)||new Set(config.deductionRules.map(r=>r.id)).size!==config.deductionRules.length)throw new ApiError(400,'Deduction rule IDs must be unique')
  if (config.deductionRules.some(r => !r.id || !r.description || !Number.isFinite(Number(r.amount)) || r.amount<=0 || !['points','placements'].includes(r.units))) throw new ApiError(400,'Every deduction requires an ID, description, positive amount and exact units')
  if (config.deductionRules.some(r => r.units !== (config.calculationMethod==='rank_based' ? 'placements' : 'points'))) throw new ApiError(400,'Deduction units must match the official method')
  if(config.calculationMethod==='manual'&&config.deductionRules.length)throw new ApiError(400,'Manual placement decisions use eligibility sanctions, not automatic numeric penalties')
  const judges=f.judges.filter(j => j.role === 'score_reviewer' ? j.isActive && (!j.accountStatus || j.accountStatus === 'active') : activeScoringJudge(j)).map(j => ({ ...j,assignments:f.assignments.filter(a => a.judgeId===j.id) }))
  const criteria=f.criteria.filter(isCriteriaActive).map(c => ({ ...c,isActive:true,minScore:Number(c.minScore),maxScore:Number(c.maxScore), minorCriteria:c.minorCriteria.filter(isCriteriaActive).map(m => {
    const bounds=scoringInputBounds(m)
    return { ...m,minScore:bounds.min,maxScore:bounds.max }
  }) }))
  for (const rule of config.deductionRules) {
    if (rule.roundId && !f.rounds.some(r=>r.id===rule.roundId)) throw new ApiError(400,'Penalty rule references another round')
    if (rule.criteriaId && !criteria.some(c=>c.id===rule.criteriaId)) throw new ApiError(400,'Penalty rule references another criterion')
    if (rule.roundId && rule.criteriaId && !f.rounds.find(r=>r.id===rule.roundId).criteriaIds.includes(rule.criteriaId)) throw new ApiError(400,'Penalty criterion must belong to its configured round')
    rule.reporter='organizer';rule.approver='appointed_verifier'
  }
  if(config.deductionRules.length && !f.judges.some(j=>j.judgeId===config.verifierId&&j.isActive&&j.role==='score_reviewer'))throw new ApiError(400,'Penalty decisions require an appointed independent verifier')
  const activeCriterionIds=new Set(criteria.map(c=>c.id))
  const scoringRounds=f.rounds.map(round=>({...round,criteriaIds:round.criteriaIds.filter(id=>activeCriterionIds.has(id))}))
  const rules={ id:crypto.randomUUID(),participationModel:2,setupRevision,event:mapEvent(event),scoringConfig:config,rounds:scoringRounds,criteria,criteriaSource:validatedSource,registrationSource:registrationSource(f),contestants:f.contestants,categories:f.categories,divisions:f.divisions,judges }
  const {error:participationError}=await db().rpc('competition_validate_participation',{p_event:eventId,p_actor:actor,p_source:rules.registrationSource})
  workflowError(participationError)
  if (!judges.some(j=>['judge','head_judge'].includes(j.role)) || !criteria.length || !rules.contestants.length) throw new ApiError(400,'Entries, active scoring judges and criteria are required')
  for (const round of rules.rounds.length ? rules.rounds : [{id:null}]) {
    const invalidProgression=progressionIssues(round,rules.rounds,config.calculationMethod)
    if(invalidProgression.length)throw new ApiError(400,`${round.name ?? 'Round'}: ${invalidProgression.join(' ')}`)
    const field=roundField(rules,round.id)
    const sources=progressionSources(rules.rounds,round.id)
    if(sources.length>1)throw new ApiError(400,'Each sequenced round must have one source round')
    if(round.divisionId&&sources.some(source=>['top_n','top_percent','threshold'].includes(source.advancementType))&&potentialRoundEntries(rules,sources[0].id).some(entry=>!roundAcceptsEntry(round,entry)))throw new ApiError(400,'An automatic qualification destination must accommodate its source field divisions. Use matching source and destination scopes.')
    if(sources.length)field.entries=potentialRoundEntries(rules,round.id)
    if(field.entries.some(entry=>!roundAcceptsEntry(round,entry)))throw new ApiError(400,'Round entries must belong to its configured division')
    if (!field.entries.length || !field.criteria.length) throw new ApiError(400,`Assign entries and criteria to ${round.name ?? 'the competition'}`)
    if (field.entries.some(e => !judges.some(j=>['judge','head_judge'].includes(j.role)&&scopeAllows(j,e,field.round,eventId)))) throw new ApiError(400,'Every eligible entry requires an assigned active judge')
    if(config.calculationMethod==='rank_based') {
      const panels=field.entries.map(e=>({division:e.divisionId,panel:judges.filter(j=>j.role!=='score_reviewer'&&scopeAllows(j,e,field.round,eventId)).map(j=>j.judgeId).sort().join(':')}))
      for(const panel of panels)if(panels.some(other=>(!config.perDivision||other.division===panel.division)&&other.panel!==panel.panel))throw new ApiError(400,'Rank-based aggregation requires the same judge panel within each ranking scope')
    }
    if(config.calculationMethod==='rank_based'&&round.advancementType==='threshold')throw new ApiError(400,'Rank-based advancement uses placement cutoff or manual selection')
    if(config.calculationMethod==='lowest_removal' && field.entries.some(e=>judges.filter(j=>j.role!=='score_reviewer'&&scopeAllows(j,e,field.round,eventId)).length<=Number(config.dropHighest??0)+Number(config.dropLowest??0)))throw new ApiError(400,'Removal counts must retain at least one judge in each scoring panel')
    if (round.nextRoundId && !rules.rounds.some(r=>r.id===round.nextRoundId && r.displayOrder>round.displayOrder)) throw new ApiError(400,'Next round must be a later round in this event')
  }
  const final=rules.rounds.find(r=>r.id===config.finalRoundId)??rules.rounds.filter(r=>r.purpose==='final').at(-1)
  const weighted=rules.rounds.filter(r=>r.purpose!=='special' && r.progression==='weighted')
  if(rules.rounds.length>1&&!final&&!weighted.length)throw new ApiError(400,'Select the official final result round for independent rounds')
  if(final?.progression!=='back_to_zero'&&final?.progression!=='carry_forward'&&weighted.length){
    if(rules.categories.length){
      for(const category of rules.categories){const group=weighted.filter(r=>r.categoryId===category.id);if(group.length&&Math.abs(group.reduce((n,r)=>n+Number(r.weight),0)-100)>0.001)throw new ApiError(400,'Round contributions within each category must total 100%')}
      const total=rules.categories.reduce((n,c)=>n+Number(c.weight),0)+weighted.filter(r=>!r.categoryId).reduce((n,r)=>n+Number(r.weight),0)
      if(Math.abs(total-100)>0.001)throw new ApiError(400,'Category and uncategorized contributions must total 100%')
    }else if(Math.abs(weighted.reduce((s,r)=>s+Number(r.weight),0)-100)>0.001)throw new ApiError(400,'Cumulative weighted contributions must total 100%')
  }
  const { data,error }=await db().rpc('competition_publish_rules',{p_event:eventId,p_actor:actor,p_id:rules.id,p_snapshot:rules})
  workflowError(error);await notifyWorkflow(eventId,'rules-published',{},rules);emitToEvent(eventId,'competition:updated',{eventId});return data
}
function requireRevision(value) {
  if (!/^[1-9]\d*$/.test(String(value ?? ''))) throw new ApiError(503,'Apply competition migration 100 before creating or approving current calculations. No scoring data was changed.')
  return value
}
function assertRoundScope(rules, roundId) {
  if (roundId !== null && !rules.rounds.some(round=>round.id===roundId)) throw new ApiError(400,'Round does not belong to this competition')
}
// Messages are invalidation hints only. They are emitted after successful DB
// operations; failure to resolve a room must not turn a committed write into a
// misleading failed request. Recipients also reconcile through bounded GETs.
async function notifyWorkflow(eventId,action,details={},rules=null) {
  const message={eventId,action,...details}
  emitToEventOrganizer(eventId,'competition:workflow-updated',message)
  try {
    const current=rules ?? await rulesFor(eventId)
    if (current?.scoringConfig?.verifierId) emitToUser(current.scoringConfig.verifierId,'competition:workflow-updated',message)
  } catch { console.warn('[competition] Reviewer invalidation unavailable; authoritative refresh remains available') }
}
export async function activeWorkflow(eventId) {
  const { data,error }=await db().from('competition_sessions').select('*').eq('event_id',eventId).order('started_at',{ascending:false}).limit(1).maybeSingle()
  workflowError(error);return data
}
export async function scoringWrite(eventId,judgeId,action,body) {
  if (!body?.context?.sessionId || body.context.judgeId!==judgeId || !body.context.rulesVersion || !('roundId' in body.context)) throw new ApiError(409,'Refresh scoring context before saving')
  const {data,error}=await db().rpc('competition_scoring_write',{p_event:eventId,p_judge:judgeId,p_context:body.context,p_action:action,p_payload:body})
  workflowError(error)
  emitToEventOrganizer(eventId,'session:judge-score-submitted',{eventId,sessionId:body.context.sessionId,judgeId,action})
  let calculation
  if(action==='submit') {
    await notifyWorkflow(eventId,'round-submitted')
    emitToEventOrganizer(eventId,'rankings:updated',{eventId})
    calculation=await automaticallyCalculateWorkflow(eventId,body.context.roundId??null)
  }
  return {success:true,...data,...(calculation?{calculation}: {})}
}
export async function judgeSheet(eventId,judgeId) {
  const access=await judgeAccess(eventId,judgeId), rules=await rulesFor(eventId), session=await activeWorkflow(eventId)
  if (!rules || !session?.rules_version) return null
  if (!rules.judges.some(j=>j.judgeId===judgeId&&j.role!=='score_reviewer')) throw new ApiError(403,'You are outside the scoring panel for this rules version')
  const field=roundField(rules,session.current_round_id)
  const eligibility = await query('competition_eligibility_decisions',eventId)
  const entries=field.entries.filter(e=>access.permits({roundId:field.round?.id,categoryId:field.round?.categoryId,divisionId:e.divisionId}) && !eligibility.some(d=>d.rules_version===rules.id && d.contestant_id===e.id && d.status==='approved' && (!d.round_id || d.round_id===field.round?.id)))
  const ids=entries.map(e=>e.id)
  const rows=(await query('competition_session_judge_scores',eventId)).filter(r=>r.session_id===session.id && r.judge_id===judgeId && r.round_id===session.current_round_id && r.rules_version===rules.id && ids.includes(r.contestant_id))
  const drafts=(await query('competition_judge_drafts',eventId)).filter(r=>r.session_id===session.id && r.judge_id===judgeId && r.round_id===session.current_round_id && r.rules_version===rules.id && ids.includes(r.contestant_id))
  const submitted=(await query('competition_round_submissions',eventId)).find(r=>r.session_id===session.id && r.judge_id===judgeId && r.round_id===session.current_round_id && r.status==='submitted')
  const gate=(g,id)=>!g||g.mode==='all'||g.mode==='selected'&&g.ids.includes(id)
  const lineup=(await query('competition_lineups',eventId)).find(l=>l.id===session.lineup_id)
  const criteria=field.criteria.map(c=>({...c,open:gate(session.access_config?.criteria,c.id),minors:c.minorCriteria}))
  const required=entries.length*criteria.length,locked=rows.reduce((n,r)=>n+criteria.filter(c=>r.locked_criteria.includes(c.id)).length,0)
  return { event:mapEvent(await getEventById(eventId)), session:{id:session.id,eventId,status:session.status,currentRoundId:session.current_round_id,currentDivisionId:session.current_division_id,contestantOrder:session.contestant_order.filter(id=>ids.includes(id)),activeContestantId:session.active_contestant_id,revision:session.revision,currentStageEntryIds:lineup?.slots?.[session.active_slot]??[session.active_contestant_id]},
    context:{judgeId,sessionId:session.id,roundId:session.current_round_id,rulesVersion:rules.id},rulesVersion:rules.id,roundId:session.current_round_id,roundName:field.round?.name,
    contestants:entries.map(e=>{const row=rows.find(r=>r.contestant_id===e.id);return {...e,open:session.status==='active'&&gate(session.access_config?.entries,e.id),existingScores:row?.scores??{},lockedCriteria:row?.locked_criteria??[],hasSubmitted:!!submitted,intersections:session.access_config?.intersections??{},divisionName:rules.divisions.find(d=>d.id===e.divisionId)?.name,rowColor:rules.divisions.find(d=>d.id===e.divisionId)?.row_color??rules.divisions.find(d=>d.id===e.divisionId)?.rowColor} }),
    criteria,scoringConfig:rules.scoringConfig,divisionsEnabled:!!rules.divisions.length,allowedDivisions:rules.divisions.filter(d=>entries.some(e=>e.divisionId===d.id)),drafts,submission:submitted??null,completion:{required,locked,ready:required>0&&locked===required&&!drafts.length},submissionWindow:session.submission_window }
}
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function tabulationData(eventId,actor,{roundId=null}={}) {
  const event=await assertOrganizerOwnsEvent(eventId,actor)
  const sourceInputRevision=event.competition_input_revision ?? null
  const rules=await rulesFor(eventId)
  if (!rules) throw new ApiError(409,'Historical scores require an explicit acknowledged rules transition; they are not submitted rounds')
  assertRoundScope(rules,roundId)
  const session=await activeWorkflow(eventId)
  const submissions=(await query('competition_round_submissions',eventId)).filter(s=>s.status==='submitted'&&s.rules_version===rules.id&&s.session_id===session?.id)
  const {data:accounts,error:accountError}=await db().from('users').select('id,account_status').in('id',rules.judges.map(j=>j.judgeId));workflowError(accountError)
  const inactive=rules.judges.filter(j=>j.role!=='score_reviewer'&&!accounts?.some(u=>u.id===j.judgeId&&u.account_status==='active'))
  const deductions=(await query('competition_deductions',eventId)).filter(d=>d.rules_version===rules.id)
  const eligibility=(await query('competition_eligibility_decisions',eventId)).filter(d=>d.rules_version===rules.id)
  const calculated=rules.scoringConfig.calculationMethod==='manual'?{results:[],worksheets:[],missing:[],ready:false}:calculateOfficial(rules,submissions,{roundId,deductions,eligibility})
  const pending=deductions.some(d=>d.decision_status==='pending')||eligibility.some(d=>d.status==='pending')
  const requiredInactive=inactive.filter(j=>calculated.worksheets.some(w=>w.judgeId===j.judgeId))
  if(requiredInactive.length){calculated.ready=false;calculated.missing.push(...requiredInactive.map(j=>({judgeId:j.judgeId,reason:'Required judge is inactive; approved rules amendment needed'})))}
  const sorted=rows=>[...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)))
  const sources=sorted(submissions.map(s=>({id:s.id,version:s.version}))), inputDigest=digest({sources,deductions:sorted(deductions),eligibility:sorted(eligibility),accounts:sorted(accounts??[]),rulesVersion:rules.id,roundId})
  const field=roundId===null?championshipField(rules,{eligibility}):roundField(rules,roundId)
  const eligibleEntries=field.entries.filter(e=>!eligibility.some(d=>d.contestant_id===e.id&&d.status==='approved'&&(!d.round_id||d.round_id===field.round?.id)))
  return {event:mapEvent(event),rules,session,roundId,eligibleEntries,submissions,deductions,eligibility,lockedSources:(await query('competition_session_judge_scores',eventId)).filter(r=>r.rules_version===rules.id&&r.session_id===session?.id),...calculated,ready:calculated.ready&&!pending,pending,sourceVersions:sources,sourceDigest:inputDigest,sourceInputRevision}
}
// Manual results have no live numeric worksheets. Advancement must read their
// saved, verified placement snapshot rather than infer readiness from an empty
// numeric calculation. Existing snapshots are read only.
export async function advancementData(eventId, actor, roundId, calculationId = null) {
  const state = await tabulationData(eventId, actor, { roundId })
  if (state.rules.scoringConfig.calculationMethod !== 'manual') return state
  let query = db().from('competition_result_calculations').select('*').eq('event_id', eventId).eq('round_id', roundId).eq('rules_version', state.rules.id)
  if (calculationId) query = query.eq('id', calculationId)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()
  workflowError(error)
  const validRows = Array.isArray(data?.result_snapshot) && data.result_snapshot.length > 0 && data.result_snapshot.every(row => row.manual && Number.isInteger(row.rank) && row.rank > 0)
  const current = data?.source_digest === state.sourceDigest && data?.source_input_revision != null && String(data.source_input_revision)===String(state.sourceInputRevision) && !state.pending
  return { ...state, results: validRows ? data.result_snapshot : [], ready: Boolean(validRows && current && data.verified_at && ['under_verification', 'finalized', 'published'].includes(data.status)) }
}
export function publicResults(state) {
  return state.results.map(row=>({...row,weightedScore:row.finalScore,rankingScore:row.finalScore,perRound:Array.isArray(row.perRound)?row.perRound:Object.values(row.perRound??{}),perCategory:Array.isArray(row.perCategory)?row.perCategory:Object.values(row.perCategory??{}),criteriaBreakdown:state.rules.criteria.map(c=>{const values=state.worksheets.flatMap(w=>w.entryId===row.contestantId&&w.complete?w.criteria.filter(v=>v.criteriaId===c.id):[]);return {criteriaId:c.id,criteriaName:c.name,percentage:c.percentage,average:values.length?values.reduce((n,v)=>n+v.average,0)/values.length:null,judgeCount:values.length}})}))
}
export function progressFromSources(state, participants, assignments) {
  const { rules, session, lockedSources, submissions, eligibility } = state
  const field = roundField(rules, session.current_round_id)
  const entries = field.entries.filter(e => !eligibility.some(d => d.contestant_id === e.id && d.status === 'approved' && (!d.round_id || d.round_id === field.round?.id)))
  const judges = participants.filter(p => rules.judges.some(j => j.judgeId === p.user_id && j.role !== 'score_reviewer')).map(p => {
    const scopes = assignments.filter(a => a.participant_id === p.id)
    const allowedEntryIds = entries.filter(e => allowsScoring(p, scopes, {eventId: rules.event.id, roundId: field.round?.id, categoryId: field.round?.categoryId, divisionId: e.divisionId})).map(e => e.id)
    const submission = submissions.find(s => s.judge_id === p.user_id && s.round_id === session.current_round_id)
    return {judgeId:p.user_id,judgeRowId:p.id,displayName:[p.users?.first_name,p.users?.last_name].filter(Boolean).join(' ') || p.display_name || 'Judge',role:p.judge_role,allowedEntryIds,roundSubmitted:!!submission,submissionVersion:submission?.version,submittedAt:submission?.submitted_at}
  }).filter(j => j.allowedEntryIds.length)
  const progress = judges.flatMap(j => entries.filter(e => j.allowedEntryIds.includes(e.id)).map(e => {
    const row = lockedSources.find(r => r.judge_id === j.judgeId && r.contestant_id === e.id && r.round_id === session.current_round_id)
    const locks = field.criteria.filter(c => row?.locked_criteria?.includes(c.id)).map(c => c.id)
    return {judgeId:j.judgeId,contestantId:e.id,lockedCriteria:locks,lockedCount:locks.length,fullyLocked:locks.length === field.criteria.length && locks.length > 0,roundSubmitted:j.roundSubmitted}
  }))
  return {roundId:session.current_round_id,divisionId:session.current_division_id,contestantId:session.active_contestant_id,judges,contestants:entries,progress,submitted:progress.filter(p => p.fullyLocked),criteria:field.criteria.map(c => ({id:c.id,name:c.name})),criteriaTotal:field.criteria.length,totalJudges:judges.length,requiredCells:progress.length,roundSubmissions:judges.filter(j => j.roundSubmitted)}
}
export async function judgeProgress(eventId, actor) {
  const state = await tabulationData(eventId, actor)
  if (!state.session) return {judges:[],contestants:[],progress:[],submitted:[]}
  const {data:participants,error} = await db().from('event_participants').select('*,users!inner(account_status,first_name,last_name)').eq('event_id',eventId).eq('participant_type','COMPETITION_JUDGE')
  workflowError(error)
  const ids = participants.map(p => p.id)
  const {data:assignments,error:assignmentError} = ids.length ? await db().from('competition_judge_assignments').select('*').in('participant_id',ids) : {data:[],error:null}
  workflowError(assignmentError)
  return progressFromSources(state, participants, assignments)
}
export async function calculate(eventId,actor,body={}) {
  const state=await tabulationData(eventId,actor,body)
  requireRevision(state.sourceInputRevision)
  if (body.method&&body.method!==state.rules.scoringConfig.calculationMethod) throw new ApiError(409,'Official method is frozen; use the confirmed rules')
  if(state.rules.scoringConfig.calculationMethod!=='manual')throw new ApiError(403,'Numeric score calculations run automatically when current sources are ready')
  if (!String(body.reason??'').trim() || !Array.isArray(body.results) || !body.results.length) throw new ApiError(400,'Manual result entry requires results and a reason')
  const valid=new Set(state.eligibleEntries.map(e=>e.id))
  if (body.results.length!==valid.size || new Set(body.results.map(r=>r.contestantId)).size!==body.results.length || body.results.some(r=>!valid.has(r.contestantId)||!Number.isInteger(r.rank)||r.rank<1)) throw new ApiError(400,'Invalid manual results')
  state.results=body.results.map(r=>{const entry=state.rules.contestants.find(e=>e.id===r.contestantId);return{contestantId:entry.id,contestantName:entry.name,contestantNumber:entry.contestantNumber,divisionId:entry.divisionId,photo:entry.photo,rank:r.rank,manual:true,status:'Manual decision',judgeTotals:[],baseScore:null,deductionTotal:null,finalScore:null,perCriterion:{},perRound:{},perCategory:{}}}).sort((a,b)=>a.rank-b.rank);state.ready=!state.pending
  const {data,error}=await db().from('competition_result_calculations').insert({event_id:eventId,session_id:state.session?.id,round_id:body.roundId??null,status:state.ready?'ready_for_verification':state.submissions.length?'provisional':'awaiting_submissions',rules_version:state.rules.id,source_versions:state.sourceVersions,source_digest:state.sourceDigest,source_input_revision:state.sourceInputRevision,configuration_snapshot:{...state.rules.scoringConfig,method:state.rules.scoringConfig.calculationMethod,ruleVersion:state.rules.version,worksheets:state.worksheets,missing:state.missing,reason:body.reason??null},result_snapshot:publicResults(state),created_by:actor}).select('*').single()
  workflowError(error);await audit(actor,eventId,'calculate',{calculationId:data.id});await notifyWorkflow(eventId,'calculated',{calculationId:data.id},state.rules);return {success:true,calculationId:data.id,status:data.status,configuration:data.configuration_snapshot,results:data.result_snapshot,calculation:data}
}
async function saveAutomaticCalculation(eventId,actor,state) {
  const payload={
    session_id:state.session?.id??null,
    status:'ready_for_verification',
    rules_version:state.rules.id,
    source_versions:state.sourceVersions,
    source_digest:state.sourceDigest,
    source_input_revision:state.sourceInputRevision,
    configuration_snapshot:{...state.rules.scoringConfig,method:state.rules.scoringConfig.calculationMethod,ruleVersion:state.rules.version,worksheets:state.worksheets,missing:state.missing},
    result_snapshot:publicResults(state),
  }
  const {data,error}=await db().rpc('competition_save_auto_calculation',{p_event:eventId,p_actor:actor,p_round:state.roundId,p_payload:payload})
  if(['PGRST202','PGRST204','PGRST205'].includes(error?.code))throw new ApiError(503,'Apply reviewed migration 127 before automatic calculation')
  workflowError(error)
  if(!data?.id)throw new ApiError(503,'Automatic calculation did not return a saved result')
  if(!data.reused){
    await audit(actor,eventId,'calculate',{calculationId:data.id,automatic:true})
    await notifyWorkflow(eventId,'calculated',{calculationId:data.id},state.rules)
  }
  return data
}
export async function automaticallyCalculateWorkflow(eventId,roundId=null) {
  try {
    const event=await getEventById(eventId)
    const actor=event.organizations?.organizer_id
    if(!actor)throw new ApiError(503,'Competition organizer identity is unavailable for automatic calculation')
    const state=await tabulationData(eventId,actor,{roundId})
    if(state.rules.scoringConfig.calculationMethod==='manual')return {status:'needs_review'}
    if(!state.ready||state.pending)return {status:'incomplete'}
    const calculation=await saveAutomaticCalculation(eventId,actor,state)
    return {status:'up_to_date',calculationId:calculation.id}
  } catch(error) {
    console.error('[competition-workflow] Automatic calculation failed',{eventId,roundId,code:error.code??'unknown',message:error.message})
    return {status:'needs_review',message:'Automatic calculation needs administrator review. Saved judge and deduction records remain unchanged.'}
  }
}
async function audit(actor,eventId,action,details) { await recordAudit({userId:actor,action:`competition.workflow.${action}`,entity:'events',entityId:eventId,details}) }
export async function transitionCalculation(eventId,actor,id,action,body={}) {
  await assertOrganizerOwnsEvent(eventId,actor)
  const {data:calculation,error}=await db().from('competition_result_calculations').select('*').eq('id',id).eq('event_id',eventId).single()
  workflowError(error)
  if (!calculation.rules_version) throw new ApiError(409,'Legacy snapshots remain historical; create a versioned calculation')
  const state=await tabulationData(eventId,actor,{roundId:calculation.round_id})
  if (calculation.source_input_revision==null || String(calculation.source_input_revision)!==String(state.sourceInputRevision) || state.sourceDigest!==calculation.source_digest || (state.rules.scoringConfig.calculationMethod!=='manual'&&!state.ready)||state.pending) throw new ApiError(409,'Calculation inputs changed or submissions are incomplete; recalculate')
  if (action==='verify' && actor===calculation.created_by && state.rules.scoringConfig.independentApproval!==false) {
    // An enrolled reviewer may verify through a separately authorized endpoint.
    throw new ApiError(403,'Verification must be performed by the appointed independent reviewer')
  }
  const {data,error:transitionError}=await db().rpc('competition_result_transition',{p_event:eventId,p_actor:actor,p_calculation:id,p_action:action,p_digest:state.sourceDigest,p_reason:body.reason??''})
  workflowError(transitionError);emitToEventOrganizer(eventId,'rankings:updated',{eventId});await notifyWorkflow(eventId,action,{calculationId:id},state.rules)
  if(action==='publish'&&!calculation.round_id)emitToEvent(eventId,'competition:results-published',{eventId})
  if(action==='publish'&&!calculation.round_id&&state.session)emitToEvent(eventId,'session:status-changed',{session:{id:state.session.id,eventId,status:'completed'}})
  return data
}
export async function reviewerVerify(eventId,actor,id,body) {
  const {data:ep,error}=await db().from('event_participants').select('*,users!inner(account_status)').eq('event_id',eventId).eq('user_id',actor).eq('participant_type','COMPETITION_JUDGE').single()
  workflowError(error)
  if (!ep.is_active || ep.judge_role!=='score_reviewer' || ep.users.account_status!=='active') throw new ApiError(403,'An active appointed score reviewer is required')
  const {data:calc,error:calcError}=await db().from('competition_result_calculations').select('*').eq('id',id).eq('event_id',eventId).single();workflowError(calcError)
  const rules=await rulesFor(eventId)
  if (!rules.judges.some(j=>j.judgeId===actor&&j.role==='score_reviewer') && rules.scoringConfig.verifierId!==actor) throw new ApiError(403,'You are not the frozen-rules verifier')
  if (calc.created_by===actor) throw new ApiError(403,'Independent approval is required')
  const event=await getEventById(eventId)
  const current=await tabulationData(eventId,event.organizations.organizer_id,{roundId:calc.round_id})
  if (calc.source_input_revision==null || String(calc.source_input_revision)!==String(current.sourceInputRevision) || current.sourceDigest!==calc.source_digest || current.pending || (rules.scoringConfig.calculationMethod!=='manual'&&!current.ready)) throw new ApiError(409,'Sources changed or are incomplete; recalculate before verification')
  const {data,error:err}=await db().rpc('competition_result_transition',{p_event:eventId,p_actor:actor,p_calculation:id,p_action:'verify',p_digest:calc.source_digest,p_reason:body.reason??''});workflowError(err);await notifyWorkflow(eventId,'verified',{calculationId:id},rules);return data
}
export async function reviewerData(eventId,actor) {
  const rules=await rulesFor(eventId)
  const {data:ep,error}=await db().from('event_participants').select('*,users!inner(account_status)').eq('event_id',eventId).eq('user_id',actor).maybeSingle();workflowError(error)
  if(!ep?.is_active||ep.judge_role!=='score_reviewer'||ep.users.account_status!=='active'||rules?.scoringConfig.verifierId!==actor)throw new ApiError(403,'Appointed reviewer access is required')
  const event=await getEventById(eventId)
  const state=await tabulationData(eventId,event.organizations.organizer_id)
  return {...state,calculations:await query('competition_result_calculations',eventId),amendments:await query('competition_rule_amendments',eventId)}
}
export async function judgePublishedResults(eventId,actor) {
  await judgeAccess(eventId,actor)
  const event=await getEventById(eventId)
  let publicationQuery=db().from('competition_result_calculations').select('result_snapshot,published_at,rules_version,configuration_snapshot').eq('event_id',eventId).eq('status','published').is('round_id',null)
  publicationQuery=event.official_rules_id?publicationQuery.eq('rules_version',event.official_rules_id):publicationQuery.is('rules_version',null)
  const {data,error}=await publicationQuery.order('published_at',{ascending:false}).limit(1).maybeSingle()
  workflowError(error)
  // Explicit allowlist: never expose private worksheets, judge totals, raw
  // sources, verification evidence or provisional calculations to judges.
  const results=(Array.isArray(data?.result_snapshot)?data.result_snapshot:[]).map(row=>({contestantId:row.contestantId,contestantName:row.contestantName,contestantNumber:row.contestantNumber,divisionId:row.divisionId??null,rank:row.rank,finalScore:row.finalScore??null,manual:row.manual===true}))
  return {success:true,results,publishedAt:data?.published_at??null,rulesVersion:data?.rules_version??null,method:data?.configuration_snapshot?.method??data?.configuration_snapshot?.calculationMethod??null}
}
export async function approveAmendment(eventId,actor,body) {
  await reviewerData(eventId,actor)
  const {data:amendment,error:amendmentError}=await db().from('competition_rule_amendments').select('id').eq('event_id',eventId).eq('id',body.id).maybeSingle()
  workflowError(amendmentError)
  if(!amendment)throw new ApiError(404,'Amendment does not belong to this competition')
  const {data,error}=await db().rpc('competition_approve_amendment',{p_id:body.id,p_actor:actor,p_reason:body.reason??''});workflowError(error);await notifyWorkflow(eventId,'amendment-approved');emitToEvent(eventId,'competition:updated',{eventId});emitToEvent(eventId,'session:contestant-changed',{eventId,refresh:true});return data
}
export async function approveDecision(eventId,actor,body) {
  await reviewerData(eventId,actor)
  const table=String(body.kind??'').startsWith('deduction')?'competition_deductions':String(body.kind??'').startsWith('eligibility')?'competition_eligibility_decisions':null
  if(!table)throw new ApiError(400,'Invalid decision kind')
  const {data:decision,error:decisionError}=await db().from(table).select('round_id').eq('event_id',eventId).eq('id',body.id).maybeSingle()
  workflowError(decisionError)
  if(!decision)throw new ApiError(404,'Decision not found')
  const {data,error}=await db().rpc('competition_approve_decision',{p_event:eventId,p_actor:actor,p_kind:body.kind,p_id:body.id,p_reason:body.reason??''});workflowError(error);await notifyWorkflow(eventId,'decision-approved');emitToEvent(eventId,'session:contestant-changed',{eventId,refresh:true});emitToEventOrganizer(eventId,'rankings:updated',{eventId});const calculation=await automaticallyCalculateWorkflow(eventId,decision.round_id??null);return {...data,calculation}
}
export async function organizerAction(eventId,actor,action,body={}) {
  const event=await assertOrganizerOwnsEvent(eventId,actor)
  if (event.status==='archived'||event.status==='cancelled') throw new ApiError(409,'Competition operations are closed')
  if (action==='reconciliation-preview') {
    const {reconciliationPreview}=await import('./competition-reconciliation.service.js')
    return reconciliationPreview(eventId,actor,body.sessionId)
  }
  if (action==='reconciliation-apply') {
    if(body.confirmed!==true||!body.sessionId||!String(body.reason??'').trim())throw new ApiError(400,'An explicit session, confirmation and repair reason are required')
    const {data,error}=await db().rpc('competition_reconcile_projection',{p_event:eventId,p_actor:actor,p_session:body.sessionId,p_reason:body.reason});workflowError(error);await notifyWorkflow(eventId,action);emitToEventOrganizer(eventId,'rankings:updated',{eventId});return data
  }
  const session=await activeWorkflow(eventId),rules=await rulesFor(eventId)
  if (action==='start') {
    if (!rules) throw new ApiError(409,'Official rules must be confirmed and published before live scoring')
    assertCriteriaReady(rules)
  }
  if (action==='lineup-save') {
    assertRoundScope(rules,body.roundId??session?.current_round_id??null)
    const field=roundField(rules,body.roundId??session?.current_round_id),ids=new Set(field.entries.map(e=>e.id))
    const slots=body.slots??[];const members=slots.flat()
    if (!slots.length||slots.some(s=>!Array.isArray(s)||!s.length)||members.some(id=>!ids.has(id))||new Set(members).size!==members.length||members.length!==ids.size) throw new ApiError(400,'Lineup slots must contain each eligible entry exactly once')
    if (body.criteriaId&&!field.criteria.some(c=>c.id===body.criteriaId)) throw new ApiError(400,'Criterion is outside the round')
    const {data,error}=await db().from('competition_lineups').insert({event_id:eventId,round_id:field.round?.id,criteria_id:body.criteriaId??null,rules_version:rules.id,name:body.name,mode:body.mode??'custom',slots,created_by:actor}).select('*').single();workflowError(error);await audit(actor,eventId,action,{lineupId:data.id});await notifyWorkflow(eventId,action,{},rules);return data
  }
  if (action==='lineups') return query('competition_lineups',eventId)
  if (action==='amendment-request') {
    if(!rules||!String(body.reason??'').trim()||!body.scoringConfig?.confirmed||!OFFICIAL_METHODS.includes(body.scoringConfig.calculationMethod)||body.scoringConfig.calculationMethod==='undecided')throw new ApiError(400,'A confirmed supported configuration and amendment reason are required')
    const config={...rules.scoringConfig,...body.scoringConfig}
    if(config.calculationMethod==='manual'&&!String(config.manualBasis??'').trim())throw new ApiError(400,'Manual results require a documented basis')
    if(config.deductionRules?.some(r=>r.units!==(config.calculationMethod==='rank_based'?'placements':'points')))throw new ApiError(400,'Amended method conflicts with penalty units')
    if(config.decimalPlaces<0||config.decimalPlaces>6||!Number.isInteger(config.decimalPlaces))throw new ApiError(400,'Invalid amendment precision')
    if(!['shared','highest_criterion'].includes(config.tiePolicy)||![config.dropHighest??0,config.dropLowest??0].every(n=>Number.isInteger(n)&&n>=0))throw new ApiError(400,'Invalid amendment tie/removal policy')
    if(config.finalRoundId&&!rules.rounds.some(r=>r.id===config.finalRoundId&&r.purpose!=='special'))throw new ApiError(400,'Invalid final result round')
    if((config.independentApproval!==false||config.calculationMethod==='manual'||config.deductionRules?.length)&&!rules.judges.some(j=>j.judgeId===config.verifierId&&j.role==='score_reviewer'))throw new ApiError(400,'Amended approval procedure requires an appointed reviewer')
    if(config.calculationMethod==='rank_based'&&config.tiePolicy!=='shared')throw new ApiError(400,'Amended rank-based ties require shared placements')
    if(config.calculationMethod==='manual'&&config.deductionRules?.length)throw new ApiError(400,'Manual placements cannot use automatic numeric deductions')
    if(config.calculationMethod==='rank_based'||config.calculationMethod==='lowest_removal')for(const round of rules.rounds.length?rules.rounds:[{id:null}]){
      const field=roundField(rules,round.id),panels=field.entries.map(e=>({division:e.divisionId,ids:rules.judges.filter(j=>j.role!=='score_reviewer'&&(!body.scoringJudgeIds||Array.isArray(body.scoringJudgeIds)&&body.scoringJudgeIds.includes(j.judgeId))&&scopeAllows(j,e,field.round,eventId)).map(j=>j.judgeId).sort()}))
      if(config.calculationMethod==='rank_based'&&panels.some(p=>panels.some(q=>(!config.perDivision||p.division===q.division)&&p.ids.join(':')!==q.ids.join(':'))))throw new ApiError(400,'Amended rank method requires the same judge panel')
      if(config.calculationMethod==='lowest_removal'&&panels.some(p=>p.ids.length<=(config.dropHighest??0)+(config.dropLowest??0)))throw new ApiError(400,'Amended removal exhausts the judge panel')
    }
    if(body.scoringJudgeIds!==undefined){
      const ids=body.scoringJudgeIds
      if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!rules.judges.some(j=>j.judgeId===id&&j.role!=='score_reviewer')))throw new ApiError(400,'Choose a nonempty existing scoring panel for the amended rules')
      const {data:accounts,error:accountError}=await db().from('users').select('id,account_status').in('id',ids);workflowError(accountError)
      if(accounts.length!==ids.length||accounts.some(a=>a.account_status!=='active'))throw new ApiError(400,'The amended scoring panel must contain active accounts')
      config.scoringJudgeIds=ids
      for(const round of rules.rounds.length?rules.rounds:[{id:null}]){
        const field=roundField(rules,round.id),panels=field.entries.map(e=>rules.judges.filter(j=>ids.includes(j.judgeId)&&scopeAllows(j,e,field.round,eventId)).map(j=>j.judgeId).sort())
        if(panels.some(p=>!p.length))throw new ApiError(400,'The amended panel must cover every eligible entry')
        if(config.calculationMethod==='lowest_removal'&&panels.some(p=>p.length<=(config.dropHighest??0)+(config.dropLowest??0)))throw new ApiError(400,'Amended removal exhausts the selected panel')
      }
    }
    const {data,error}=await db().from('competition_rule_amendments').insert({event_id:eventId,previous_rules:rules.id,proposed_config:config,reason:body.reason,requested_by:actor}).select('*').single();workflowError(error);await audit(actor,eventId,action,{amendmentId:data.id});await notifyWorkflow(eventId,action,{},rules);return data
  }
  if (action==='round-order') {
    if (event.status!=='draft') throw new ApiError(409,'Round ordering is frozen after publication')
    const {data,error}=await db().rpc('competition_reorder_rounds',{p_event:eventId,p_actor:actor,p_ids:body.roundIds});workflowError(error);await notifyWorkflow(eventId,action,{},rules);return data
  }
  if (action==='deduction-report') {
    const rule=rules?.scoringConfig.deductionRules?.find(r=>r.id===body.ruleId)
    if (!rule||!String(body.reason??'').trim()) throw new ApiError(400,'Choose a frozen deduction rule and supply reason/evidence')
    if (!rules.contestants.some(e=>e.id===body.contestantId)||body.roundId&&!rules.rounds.some(r=>r.id===body.roundId)) throw new ApiError(400,'Invalid deduction target')
    if (rule.roundId&&rule.roundId!==body.roundId) throw new ApiError(400,'Deduction rule is for a different round')
    if(!String(body.offenseKey??'').trim())throw new ApiError(400,'An offense reference is required to prevent duplicate penalties')
    const {data,error}=await db().from('competition_deductions').insert({event_id:eventId,contestant_id:body.contestantId,round_id:body.roundId??null,rules_version:rules.id,rule_id:rule.id,amount:rule.amount,reason:body.reason,evidence:body.evidence??'',offense_key:body.offenseKey,applied_by_user_id:actor,authority_type:'organizer',decision_status:'pending'}).select('*').single();workflowError(error);await audit(actor,eventId,action,{deductionId:data.id});await notifyWorkflow(eventId,action,{},rules);return data
  }
  if (action==='eligibility-report') {
    if (!rules?.contestants.some(e=>e.id===body.contestantId)||body.roundId&&!rules.rounds.some(r=>r.id===body.roundId)||!String(body.reason??'').trim()) throw new ApiError(400,'A known entry and reason are required')
    const {data,error}=await db().from('competition_eligibility_decisions').insert({event_id:eventId,round_id:body.roundId??null,contestant_id:body.contestantId,rules_version:rules.id,decision:'non_competing',reason:body.reason,evidence:body.evidence??'',reported_by:actor}).select('*').single();workflowError(error);await audit(actor,eventId,action,{decisionId:data.id});await notifyWorkflow(eventId,action,{},rules);return data
  }
  if (action==='advancement') {
    const state=await advancementData(eventId,actor,body.roundId,body.calculationId),round=state.rules.rounds.find(r=>r.id===body.roundId)
    if(!round)throw new ApiError(404,'Round not found')
    if((round.advancementType ?? 'none')==='none')throw new ApiError(409,'No elimination is configured. Eligible entries continue when the organizer activates the next round in Live Control.')
    const invalidProgression=progressionIssues(round,state.rules.rounds,state.rules.scoringConfig.calculationMethod)
    if(invalidProgression.length)throw new ApiError(409,invalidProgression.join(' '))
    if(!state.ready)throw new ApiError(409,'Complete and verify the round before advancement')
    const groups=state.rules.scoringConfig.perDivision?[...new Set(state.results.map(r=>r.divisionId))].map(id=>state.results.filter(r=>r.divisionId===id)):[state.results]
    const auto=new Set(groups.flatMap(group=>[...selectQualifiers(group.map(r=>({contestantId:r.contestantId,rank:r.rank,score:r.finalScore})),round.advancementType,round.advancementValue)]))
    const qualifiers=[...applyQualifierOverride(auto,body.overrides)]
    if(round.advancementType!=='manual' && (qualifiers.length!==auto.size || qualifiers.some(id=>!auto.has(id))))throw new ApiError(403,'The published advancement rule does not permit manual seeding or qualifier exceptions')
    if(round.advancementType==='manual' && !String(body.reason??'').trim())throw new ApiError(400,'Approved manual qualification requires a recorded reason')
    if (body.overrides&&(!String(body.reason??'').trim()||qualifiers.some(id=>!state.results.some(r=>r.contestantId===id)))) throw new ApiError(400,'An eligible override and recorded reason are required')
    const nextRoundId=nextRound(state.rules.rounds,round)?.id ?? null
    const {data,error}=await db().rpc('competition_confirm_advancement',{p_event:eventId,p_actor:actor,p_round:round.id,p_next:nextRoundId,p_calculation:body.calculationId,p_qualifiers:qualifiers,p_reason:body.reason??''});workflowError(error);await notifyWorkflow(eventId,action,{},rules);return data
  }
  const {data,error}=await db().rpc('competition_operational_action',{p_event:eventId,p_actor:actor,p_session:session?.id??null,p_action:action,p_payload:body});workflowError(error)
  emitToEvent(eventId,'session:contestant-changed',{eventId,session:{id:data?.id??session?.id,eventId},refresh:true});await notifyWorkflow(eventId,action,{},rules)
  if(['start','end-performance','reopen-performance','pause','resume'].includes(action))emitToEvent(eventId,'competition:updated',{eventId})
  if(action==='correction'){
    emitToEventOrganizer(eventId,'rankings:updated',{eventId})
    const calculation=await automaticallyCalculateWorkflow(eventId,body.roundId??session?.current_round_id??null)
    return {...data,calculation}
  }
  return data
}

export async function competitionResults(eventId,actor) {
 const state=await tabulationData(eventId,actor),all=await query('competition_result_calculations',eventId)
 const published=all.filter(c=>c.status==='published').sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)))
 const official=published.find(c=>!c.round_id),rows=official?.result_snapshot??publicResults(state)
 const leaders=list=>{const rank=Math.min(...list.filter(r=>r.rank!=null).map(r=>r.rank));return list.filter(r=>r.rank===rank)}
 const champions=official&&!state.rules.scoringConfig.perDivision?leaders(rows):[]
 const categoryAwards=state.rules.categories.flatMap(c=>{const values=rows.map(r=>({row:r,value:(r.perCategory??[]).find(p=>p.categoryId===c.id)?.value})).filter(p=>p.value!=null);if(!values.length)return[];const best=state.rules.scoringConfig.calculationMethod==='rank_based'?Math.min(...values.map(p=>p.value)):Math.max(...values.map(p=>p.value));return values.filter(p=>p.value===best).map(p=>({categoryId:c.id,categoryName:c.name,contestantId:p.row.contestantId,contestantName:p.row.contestantName,contestantNumber:p.row.contestantNumber,weightedScore:p.value,categoryScore:p.value}))})
 const decisions=await query('competition_advancement_decisions',eventId)
 const rounds=state.rules.rounds.map(r=>{const calc=published.find(c=>c.round_id===r.id),decision=decisions.find(d=>d.round_id===r.id&&d.rules_version===state.rules.id),snapshot=calc??all.find(c=>c.id===decision?.calculation_id);return{roundId:r.id,roundName:r.name,finalizedAt:decision?.confirmed_at??calc?.finalized_at??null,standings:(snapshot?.result_snapshot??[]).map(row=>({...row,score:row.finalScore,qualified:decision?.qualifiers.includes(row.contestantId)??false}))}})
 return{divisionsEnabled:!!state.rules.divisions.length,champion:champions.length===1?champions[0]:null,champions,overall:rows,publishedCalculationId:official?.id??null,publishedAt:official?.published_at??null,tabulationMethod:official?.configuration_snapshot?.method??null,categoryAwards,divisions:state.rules.divisions.map(d=>({divisionId:d.id,name:d.name,winner:official&&leaders(rows.filter(r=>r.divisionId===d.id)).length===1?leaders(rows.filter(r=>r.divisionId===d.id))[0]:null,winners:official?leaders(rows.filter(r=>r.divisionId===d.id)):[],rankings:rows.filter(r=>r.divisionId===d.id)})),rounds,specialAwards:rounds.filter(r=>state.rules.rounds.find(q=>q.id===r.roundId)?.purpose==='special')}
}

export async function competitionAnalytics(eventId, actor) {
  const state=await tabulationData(eventId,actor),all=await query('competition_result_calculations',eventId)
  const published=all.filter(c=>c.status==='published'&&!c.round_id).sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)))[0]
  const rankings=published?.result_snapshot??publicResults(state)
  const expected=[...new Set(state.worksheets.map(w=>w.judgeId))]
  const complete=expected.filter(id=>state.worksheets.filter(w=>w.judgeId===id).every(w=>w.complete))
  const turnout=expected.length?Math.round(complete.length/expected.length*10000)/100:0
  return {totalContestants:state.rules.contestants.length,totalJudges:expected.length,totalCategories:state.rules.categories.length,totalRounds:state.rules.rounds.length,scoresSubmitted:state.worksheets.filter(w=>w.complete).reduce((n,w)=>n+w.criteria.reduce((n,c)=>n+c.minors.length,0),0),judgeCompletionRate:turnout,
    judgeTurnout:{totalJudges:expected.length,submittedCount:complete.length,pendingCount:expected.length-complete.length,turnoutPercentage:turnout},rankings,isOfficial:!!published,publishedAt:published?.published_at??null,tabulationMethod:state.rules.scoringConfig.calculationMethod,
    criteriaAnalytics:state.rules.criteria.map(c=>{const values=state.worksheets.filter(w=>w.complete).flatMap(w=>w.criteria.filter(p=>p.criteriaId===c.id).map(p=>p.average));return{criteriaId:c.id,criteriaName:c.name,averageScore:values.length?values.reduce((n,v)=>n+v,0)/values.length:null,highestScore:values.length?Math.max(...values):null,lowestScore:values.length?Math.min(...values):null}}),
    categoryRankings:state.rules.categories.map(c=>({categoryId:c.id,categoryName:c.name,contestants:rankings.filter(r=>r.perCategory?.some(p=>p.categoryId===c.id)).map(r=>({contestantId:r.contestantId,contestantName:r.contestantName,weightedScore:r.perCategory.find(p=>p.categoryId===c.id).value}))})),
    judgeActivity:state.rules.judges.filter(j=>j.role!=='score_reviewer').map(j=>({judgeId:j.judgeId,judgeName:j.displayName??j.email,submittedCount:state.worksheets.filter(w=>w.judgeId===j.judgeId&&w.complete).length,totalAssigned:state.worksheets.filter(w=>w.judgeId===j.judgeId).length})),
    rounds:state.rules.rounds.map(r=>({roundId:r.id,name:r.name,submittedCount:state.submissions.filter(s=>s.round_id===r.id).length}))}
}
