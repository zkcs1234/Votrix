import { db } from '../foundation/db.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { ApiError } from '../utils/ApiError.js'
import { validateUUID } from '../utils/sanitize.js'
import { validateNativeConfiguration, nativeCriteriaReadiness, nativeSetupEnabled } from '../modules/competition-native-configuration.js'
import {assertNativeCapacity} from '../modules/competition-capacity.js'
import { mapEvent } from '../foundation/mapper.js'
import { recordEventActivity } from '../foundation/activity.js'
import { notifyAdminsEventPublished } from './notification.service.js'
import { syncEventSchedules } from './event-schedule-sync.service.js'
import { EVENT_STATUS, PARTICIPANT_TYPES } from '../utils/constants.js'

function enabled() { if (!nativeSetupEnabled()) throw new ApiError(503, 'Native competition setup is disabled pending deployment review') }
export function nativeDatabaseError(error) {
  if (!error) return
  const message=error.message ?? ''
  if (['42P01','42703','PGRST202','PGRST204','PGRST205'].includes(error.code)) throw new ApiError(503,'Reviewed migration 104 is required before native competition setup can be enabled')
  if (error.code==='23505'||/FROZEN|REVISION_CONFLICT/.test(message)) throw new ApiError(409,'Competition setup changed or is frozen. Refresh this competition before continuing.')
  if (/FORBIDDEN|CROSS_COMPETITION|CROSS_EVENT|NATIVE_COMPETITION_REQUIRED/.test(message)) throw new ApiError(403,'The requested resource is outside the authorized competition')
  if (['23503','23514','22P02','22003'].includes(error.code)) throw new ApiError(400,'Invalid competition configuration or scoped reference')
  if(error.code==='P0001'||/REQUIRED|INVALID|UNSUPPORTED|MUST_TOTAL|EXHAUSTS|INCOMPATIBLE|ORDINAL|DUPLICATE|MINORS_USE|FINAL_HAS/.test(message)) throw new ApiError(400,/^[A-Z0-9_]+$/.test(message)?message.replaceAll('_',' '):'Invalid competition configuration')
  throw new ApiError(503,'Native competition operation is unavailable; no event-level fallback was selected')
}
async function authorize(eventId, competitionId, actor) {
  enabled(); validateUUID(eventId); validateUUID(competitionId)
  await assertOrganizerOwnsEvent(eventId, actor)
  const { data, error } = await db().from('competitions').select('*').eq('event_id', eventId).eq('id', competitionId).maybeSingle()
  nativeDatabaseError(error)
  if (!data || data.origin !== 'native') throw new ApiError(403, 'An explicit native competition is required; legacy rules retain their existing endpoints')
  return data
}
const revision = value => { if (!Number.isSafeInteger(value) || value < 1) throw new ApiError(400, 'A current positive competition revision is required'); return value }
export async function nativeFoundation(eventId, competitionId, actor) {
  await authorize(eventId, competitionId, actor)
  const { data, error } = await db().rpc('competition_native_foundation', { p_event: eventId, p_competition: competitionId, p_actor: actor })
  nativeDatabaseError(error)
  if(!data?.competition||data.competition.id!==competitionId||data.competition.event_id!==eventId)throw new ApiError(503,'Authoritative competition snapshot is unavailable')
  return { ...data, criteriaReadiness: data.configuration ? nativeCriteriaReadiness(data.configuration) : null,
    roundControls: (data.configuration?.rounds ?? []).map((r, i, all) => ({ roundId: r.id, canConfigureAdvancement: i < all.length - 1, canConfigureOutgoingCarry: i < all.length - 1 })) }
}
export async function removeNativeDraftEntry(eventId,competitionId,actor,entryId,body){
 await authorize(eventId,competitionId,actor);validateUUID(entryId)
 const {data,error}=await db().rpc('competition_remove_native_draft_entry',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_entry:entryId,p_setup:revision(body?.expectedSetupRevision),p_input:revision(body?.expectedInputRevision)})
 if(['PGRST202','42P01','42703'].includes(error?.code))throw new ApiError(503,'Reviewed migration 108 is required for draft participation removal')
 nativeDatabaseError(error);return data
}
export async function saveNativeConfiguration(eventId, competitionId, actor, body) {
  await authorize(eventId, competitionId, actor)
  const configuration = validateNativeConfiguration(body?.configuration)
  assertNativeCapacity(configuration)
  const { data, error } = await db().rpc('competition_save_native_configuration', { p_event: eventId, p_competition: competitionId, p_actor: actor, p_revision: revision(body.expectedSetupRevision), p_config: configuration })
  nativeDatabaseError(error); return data
}
export async function assignNativeJudge(eventId, competitionId, actor, body, remove = false) {
  await authorize(eventId, competitionId, actor); validateUUID(body?.participantId, 'participantId')
  if (body.roundId != null) validateUUID(body.roundId, 'roundId')
  const { data: participant, error: participantError } = await db().from('event_participants')
    .select('id,event_id,is_active,participant_type,judge_role')
    .eq('id', body.participantId).eq('event_id', eventId).maybeSingle()
  nativeDatabaseError(participantError)
  if (!participant || participant.is_active !== true || participant.participant_type !== PARTICIPANT_TYPES.COMPETITION_JUDGE || !['judge', 'head_judge'].includes(participant.judge_role)) {
    throw new ApiError(400, 'Select an active judge enrolled for this event')
  }
  const { data: saved, error: configurationError } = await db().from('competition_child_configurations')
    .select('configuration').eq('competition_id', competitionId).maybeSingle()
  nativeDatabaseError(configurationError)
  const multipleRounds = saved?.configuration?.structure === 'multiple'
  if (!remove && multipleRounds && body.roundId == null) throw new ApiError(400, 'A scoring round is required for this competition')
  if (!remove && !multipleRounds && body.roundId != null) throw new ApiError(400, 'Single-phase competitions do not accept a round assignment')
  if (body.roundId != null) {
    const { data: round, error: roundError } = await db().from('competition_child_rounds')
      .select('id').eq('id', body.roundId).eq('competition_id', competitionId).maybeSingle()
    nativeDatabaseError(roundError)
    if (!round) throw new ApiError(400, 'The selected round does not belong to this competition')
  }
  const { data, error } = await db().rpc('competition_assign_native_judge', { p_event: eventId, p_competition: competitionId, p_actor: actor, p_participant: body.participantId, p_round: body.roundId ?? null, p_remove: remove })
  nativeDatabaseError(error); return data
}
export async function freezeNativeRules(eventId, competitionId, actor, body) {
  await authorize(eventId, competitionId, actor)
  if (body?.acknowledged !== true) throw new ApiError(400, 'Acknowledge the saved competition rules before freezing')
  revision(body.expectedSetupRevision);revision(body.expectedInputRevision)
  const foundation=await nativeFoundation(eventId,competitionId,actor)
  if(foundation.configuration){const {data:entries,error}=await db().from('competition_entries').select('id').eq('event_id',eventId).eq('competition_id',competitionId);nativeDatabaseError(error);assertNativeCapacity(foundation.configuration,entries??[],foundation.assignments)}
  const { data, error } = await db().rpc('competition_freeze_native_rules', { p_event: eventId, p_competition: competitionId, p_actor: actor, p_setup: revision(body.expectedSetupRevision), p_input: revision(body.expectedInputRevision) })
  nativeDatabaseError(error); return data
}
export async function nativeJudgeContext(eventId, competitionId, judgeId, roundId = null) {
  enabled(); validateUUID(eventId); validateUUID(competitionId)
  if (roundId != null) validateUUID(roundId)
  const { data, error } = await db().rpc('competition_native_judge_context', { p_event: eventId, p_competition: competitionId, p_judge: judgeId, p_round: roundId })
  nativeDatabaseError(error); return data
}

export async function editNativeDraftChild(eventId, competitionId, actor, body) {
  await authorize(eventId, competitionId, actor)
  if (typeof body?.name !== 'string' || !body.name.trim() || body.name.length > 200 || !['individual','duo','group'].includes(body.participationFormat)) throw new ApiError(400, 'Provide a competition name and participation format')
  if (body.competitionType != null && (typeof body.competitionType !== 'string' || body.competitionType.length > 100)) throw new ApiError(400, 'Invalid competition type')
  const { data, error } = await db().rpc('competition_edit_draft_child', { p_event:eventId, p_competition:competitionId, p_actor:actor, p_setup:revision(body.expectedSetupRevision), p_name:body.name.trim(), p_type:body.competitionType??null, p_format:body.participationFormat })
  nativeDatabaseError(error); return data
}
export async function removeNativeDraftChild(eventId, competitionId, actor, body) {
  await authorize(eventId, competitionId, actor)
  const { data, error } = await db().rpc('competition_remove_draft_child', { p_event:eventId, p_competition:competitionId, p_actor:actor, p_setup:revision(body?.expectedSetupRevision), p_input:revision(body?.expectedInputRevision) })
  nativeDatabaseError(error); return data
}
export async function completeNativeCreation(eventId, actor, body) {
  enabled(); validateUUID(eventId); const event = await assertOrganizerOwnsEvent(eventId, actor)
  if (body?.acknowledged !== true || !Array.isArray(body.competitions) || !body.competitions.length) throw new ApiError(400, 'Review and acknowledge every competition before publishing')
  if (typeof body.parentReviewToken !== 'string' || !/^[a-f0-9]{32}$/.test(body.parentReviewToken)) throw new ApiError(400, 'Reload the event review before publishing')
  if (event.status !== EVENT_STATUS.DRAFT && !event.competition_created_at) throw new ApiError(409, 'Only a draft competition can be created and published')
  const children = body.competitions.map(c => ({ id:validateUUID(c.id), setupRevision:revision(c.setupRevision), inputRevision:revision(c.inputRevision) }))
  if (new Set(children.map(c=>c.id)).size !== children.length) throw new ApiError(400, 'Review each competition exactly once')
  const { data, error } = await db().rpc('competition_complete_creation', { p_event:eventId, p_actor:actor, p_children:children, p_parent_review_token:body.parentReviewToken })
  nativeDatabaseError(error)

  let published = false
  if (event.status === EVENT_STATUS.DRAFT) {
    const { data: changed, error: publishError } = await db().from('events')
      .update({ status: EVENT_STATUS.SCHEDULED })
      .eq('id', eventId)
      .eq('status', EVENT_STATUS.DRAFT)
      .select('id')
      .maybeSingle()
    if (publishError) throw new ApiError(503, 'Competition creation completed, but publication failed. Retry Review & Publish to finish.')
    published = Boolean(changed)
    if (!changed) {
      const { data: current, error: statusError } = await db().from('events').select('status').eq('id', eventId).maybeSingle()
      if (statusError) throw new ApiError(503, 'Competition creation completed, but publication status could not be confirmed. Reload before retrying.')
      if (![EVENT_STATUS.SCHEDULED, EVENT_STATUS.ACTIVE, EVENT_STATUS.COMPLETED].includes(current?.status)) {
        throw new ApiError(409, 'Competition creation completed, but the event could not be published. Reload and retry.')
      }
    }
  }

  if (published) {
    await syncEventSchedules().catch(err => console.error('[competition] schedule sync failed after native publish:', err.message))
    recordEventActivity({ eventId, action:'competition.event.publish', userId:actor, module:'competition', details:{title:event.title} })
      .catch(err => console.error('[competition] publish activity could not be recorded:', err.message))
    notifyAdminsEventPublished({eventId,title:event.title,eventType:event.event_type})
      .catch(err => console.error('[competition] admin publish notification failed (non-fatal):', err.message))
  }
  return { ...data, published:true }
}

export async function creationParentReview(eventId, actor) {
  enabled(); validateUUID(eventId); await assertOrganizerOwnsEvent(eventId, actor)
  const { data, error } = await db().rpc('competition_creation_parent_review', { p_event:eventId, p_actor:actor })
  if (['PGRST202','42P01','42703'].includes(error?.code)) throw new ApiError(503, 'Migration 115 and the matching application deployment are required for event review')
  nativeDatabaseError(error)
  if (data?.event?.id !== eventId || !/^[a-f0-9]{32}$/.test(data?.parentReviewToken ?? '')) throw new ApiError(503, 'The authoritative event review is unavailable')
  return { event:mapEvent(data.event), parentReviewToken:data.parentReviewToken }
}
