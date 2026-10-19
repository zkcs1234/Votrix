// Isolated browser-test fixture only. Never imported by the production app.
import '../dist/assets/index-dBKVXNyr.css'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import Workspace from '../src/components/organizer/competition/NativeTabulationWorkspace'
import { nativeTabulationService as service } from '../src/services/competition-native-tabulation.service'
import { useAuthStore } from '../src/store/auth.store'

const snapshot=c=>({eventId:'event',competitionId:c,roundId:null,viewerId:'owner',complete:true,progress:[{judgeId:'judge1',judgeName:'Maria Santos',submitted:true,submittedAt:'2026-10-13T00:00:00Z'}],session:{status:'closed',entry_ids:[`entry-${c}`]},reviewPolicy:{active:true,reviewer_id:'reviewer',reviewerName:'John Reyes'},sourceDigest:'digest',deductionsResolved:true,deductions:[],entries:[{id:`entry-${c}`,name:`Dancer ${c}`,contestantNumber:1}],rules:{id:`rules-${c}`,configuration_snapshot:{rounds:[],criteria:[{id:`criterion-${c}`,name:'Technique',percentage:100,roundId:null,minorCriteria:[{id:`minor-${c}`,name:'Skill',minScore:0,maxScore:10}]}],scoringConfig:{calculationMethod:'weighted_average',decimalPlaces:2,deductionRules:[]}}},submissions:[{id:`submission-${c}`,judge_id:'judge1',submitted_at:'2026-10-13T00:00:00Z',sources:[{entry_id:`entry-${c}`,criterion_id:`criterion-${c}`,scores:{[`minor-${c}`]:8}}]}],calculation:{id:`calc-${c}`,version:1,source_digest:'digest',verified:false,finalized:false,input_snapshot:{},output_snapshot:{results:[{contestantId:`entry-${c}`,rank:1,baseScore:80,deductionTotal:0,finalScore:80}],worksheets:[{entryId:`entry-${c}`,judgeId:'judge1',roundId:null,total:80,complete:true,criteria:[{criteriaId:`criterion-${c}`,name:'Technique',percentage:100,average:80,contribution:80,minors:[{id:`minor-${c}`,name:'Skill',raw:8,normalized:80}]}]}],entryCriteriaAverages:{[`single:entry-${c}`]:{roundId:null,entryId:`entry-${c}`,criteria:{[`criterion-${c}`]:80}}}}}})
useAuthStore.setState({user:{id:'owner'},isAuthenticated:true,isBootstrapping:false})
service.snapshot=async(_event,c)=>({data:snapshot(c)})
createRoot(document.getElementById('root')).render(<MemoryRouter><main style={{maxWidth:1360,padding:'24px 16px',margin:'0 auto'}}><Workspace eventId="event" choices={[{eventId:'event',eventName:'Browser test',competitionId:'a',competitionName:'Hip-Hop',roundId:null,roundName:'Single round'},{eventId:'event',competitionId:'b',competitionName:'Contemporary',roundId:null,roundName:'Single round'}]}/></main></MemoryRouter>)
