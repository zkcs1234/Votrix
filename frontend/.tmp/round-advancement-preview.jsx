// Isolated synthetic UI fixture: never requests the API or opens a real session.
import '../src/index.css'
import React from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter,Routes,Route,useParams,useLocation} from 'react-router-dom'
import Workspace from '../src/components/organizer/competition/NativeTabulationWorkspace'
import {nativeTabulationService as service} from '../src/services/competition-native-tabulation.service'
import {useAuthStore} from '../src/store/auth.store'
import saved from './pageant-tabulation-snapshot.json'

useAuthStore.setState({user:{id:'owner'},isAuthenticated:true,isBootstrapping:false})
const state=structuredClone(saved), pending=new URLSearchParams(location.search).has('pending')
state.roundId='pre'
state.calculation.verified=!pending
state.calculation.finalized=!pending
const cfg=state.rules.configuration_snapshot
cfg.structure='multiple'
cfg.rounds=[{id:'pre',name:'Preliminary',displayOrder:0,weight:30,advancementType:'top_n',advancementValue:1},{id:'final',name:'Final',displayOrder:1,weight:70,progression:'weighted'}]
cfg.criteria.forEach(c=>{c.roundId='pre'})
state.advancement={fromRoundId:'pre',fromRoundName:'Preliminary',toRoundId:'final',nextRoundName:'Final',nextRound:cfg.rounds[1],policy:'top_n',value:1,perDivision:true,qualificationCurrent:false,qualifiedEntryIds:[]}
service.snapshot=async(eventId,competitionId,roundId)=>({data:roundId==='final'?{eventId,competitionId,roundId,viewerId:'owner',qualificationCurrent:state.advancement.qualificationCurrent}:structuredClone(state)})
service.qualification=async(eventId,competitionId,body,confirm)=>{
 const automatic=['entry-0','entry-4']
 if(confirm){state.advancement.qualificationCurrent=true;state.advancement.qualifiedEntryIds=automatic;return {data:{qualificationId:'synthetic'}}}
 return {data:{fromRound:'pre',toRound:'final',policy:'top_n',automatic,standings:state.calculation.output_snapshot.results}}
}
const choices=cfg.rounds.map(round=>({competitionId:'pageant',competitionName:'Pageant',roundId:round.id,roundName:round.name,eventName:'MR & MS Campus 2026'}))
function Tabulation(){const {section}=useParams();return <Workspace eventId="event" choices={choices} initialSection={section}/>}
function Live(){const route=useLocation();return <h1>Final Live Control {route.search}</h1>}
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/organizer/competition/events/event/tabulation/advancement']}><main style={{maxWidth:1440,padding:16,margin:'auto',minWidth:0}}><Routes><Route path="/organizer/competition/events/:eventId/tabulation/:section" element={<Tabulation/>}/><Route path="/organizer/competition/events/:eventId/live" element={<Live/>}/></Routes></main></MemoryRouter>)
