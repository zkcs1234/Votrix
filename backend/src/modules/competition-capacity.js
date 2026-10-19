import {ApiError} from '../utils/ApiError.js'
export const COMPETITION_CAPACITY=Object.freeze({entrants:100,judgesPerRound:10,rounds:5,majorsPerRound:10,minorsPerMajor:5,rawTargetsPerRound:12000,exportBytes:10*1024*1024})
export function assertNativeCapacity(configuration,entries=[],assignments=[]){
 const limit=COMPETITION_CAPACITY,fail=message=>{throw new ApiError(413,message)}
 if(configuration.rounds.length>limit.rounds||entries.length>limit.entrants)fail('Native competition exceeds the reviewed round or entrant limit')
 for(const scope of configuration.structure==='single'?[{id:null}]:configuration.rounds){
  const criteria=configuration.criteria.filter(c=>c.roundId===scope.id),panel=new Set(assignments.filter(a=>a.round_id==null||a.round_id===scope.id).map(a=>a.participant_id)),eligible=scope.entryIds??entries
  if(criteria.length>limit.majorsPerRound||criteria.some(c=>c.minorCriteria?.length>limit.minorsPerMajor)||panel.size>limit.judgesPerRound)fail('Native competition exceeds the reviewed panel or criteria limit')
  if(eligible.length*panel.size*criteria.reduce((s,c)=>s+(c.minorCriteria?.length||1),0)>limit.rawTargetsPerRound)fail('Native round exceeds the reviewed scoring-target limit')
 }
}
