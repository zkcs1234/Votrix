import '../src/index.css'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import Workspace from '../src/components/voter/competition/NativeCompetitionWorkspace'
import { nativeCompetitionService as service } from '../src/services/competition-native.service'
import { useAuthStore } from '../src/store/auth.store'
const criteria = [{id:'stage',name:'Production Number & Casual Wear',percentage:40,minors:[{id:'energy',name:'Stage Energy & Charm',minScore:1,maxScore:20},{id:'precision',name:'Precision & Routine Execution',minScore:1,maxScore:20}],open:true},{id:'attire',name:'Creative / Themed Attire',percentage:40,minors:[{id:'creative',name:'Creativity & Concept',minScore:1,maxScore:20},{id:'poise',name:'Poise & Carriage',minScore:1,maxScore:20}],open:true},{id:'wit',name:'Introduction & Wit Segment',percentage:20,minors:[{id:'delivery',name:'Delivery & Voice Projection',minScore:1,maxScore:10},{id:'audience',name:'Audience Impact',minScore:1,maxScore:10}],open:true}]
const contestants=Array.from({length:10},(_,i)=>({id:`entry-${i}`,name:['Adrian Reyes','Maya Santos','Liam Cruz','Anna Torres','Noah Reyes','Maria Garcia','Lucas Valdez','Jen Flores','Mark Diaz','Jane Lim'][i],contestantNumber:i+1,registrationNumber:Math.floor(i/2)+1,divisionId:i%2?'women':'men',divisionName:i%2?'WOMEN':'MEN',open:true,lockedCriteria:[]}))
const view={context:{eventId:'event',competitionId:'pageant',roundId:'pre',sessionId:'session',sessionRevision:1,rulesVersion:'rules',setupRevision:1,inputRevision:1},viewerJudgeId:'judge',session:{id:'session',status:'active',revision:1,source_revision:1,entry_ids:contestants.map(e=>e.id)},criteria,contestants,drafts:[],progress:[],submission:null,scoringAvailable:true}
useAuthStore.setState({user:{id:'judge'},isAuthenticated:true,isBootstrapping:false})
service.view=async()=>({data:structuredClone(view)})
service.score=async()=>{throw new Error('Visual fixture is read-only')}
const choices=[{competitionId:'pageant',competitionName:'Pageant',roundId:'pre',roundName:'Preliminary',state:'open'},{competitionId:'pageant',competitionName:'Pageant',roundId:'final',roundName:'Final',state:'waiting'}]
createRoot(document.getElementById('root')).render(<MemoryRouter><div style={{maxWidth:1800,margin:'auto',padding:20,minWidth:0}}><Workspace eventId="event" eventName="MR & MS Campus 2026" choices={choices}/></div></MemoryRouter>)
