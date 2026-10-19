import '../src/index.css'
import React from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import Workspace from '../src/components/organizer/competition/NativeTabulationWorkspace'
import {nativeTabulationService as service} from '../src/services/competition-native-tabulation.service'
import {useAuthStore} from '../src/store/auth.store'
import snapshot from './pageant-tabulation-snapshot.json'
useAuthStore.setState({user:{id:'owner'},isAuthenticated:true,isBootstrapping:false})
service.snapshot=async()=>({data:structuredClone(snapshot)})
const choices=[{competitionId:'pageant',competitionName:'Pageant',roundId:null,roundName:'Preliminary',eventName:'MR & MS Campus 2026'}]
createRoot(document.getElementById('root')).render(<MemoryRouter><main style={{maxWidth:1440,padding:16,margin:'auto',minWidth:0}}><Workspace eventId="event" choices={choices}/></main></MemoryRouter>)
