import {writeFileSync} from 'node:fs'
const checks=[]
for(const [path,needle]of [['/organizer/competition','/src/main.jsx'],['/src/routes/index.jsx','CompetitionDashboardPage'],['/src/pages/organizer/competition/CompetitionDashboardPage.jsx','Manage competitions']]){
 const response=await fetch('http://localhost:5173'+path,{signal:AbortSignal.timeout(5000),redirect:'error'}),text=await response.text();checks.push({path,status:response.status,expectedModuleOrEntryPresent:text.includes(needle)});if(!response.ok||!text.includes(needle))throw new Error('Running Vite source verification failed: '+path)
}
const unauthenticatedApi=[]
// Existing backend only. authenticate() rejects missing cookies before user/DB
// lookup. No login, refresh, RPC, authenticated request or backend startup.
for(const path of ['/api/organizer/competition/dashboard','/api/organizer/competition/events/00000000-0000-4000-8000-000000000000/competitions']){
 const response=await fetch('http://localhost:5000'+path,{credentials:'omit',signal:AbortSignal.timeout(5000),redirect:'error'});unauthenticatedApi.push({path,status:response.status});if(response.status!==401)throw new Error('Unexpected unauthenticated response; stop before further probing')
}
writeFileSync('audits/competition-localhost-integration-2026-10-14/served-route-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),url:'http://localhost:5173/organizer/competition',checks,unauthenticatedApi,frontendSourceServed:true,authenticatedDomVerified:false,realLoginVerified:false,backendStarted:false,authenticatedBackendRequests:false,nativeDatabaseWrites:false,nativeActivationVerified:false},null,2));console.log('Running Vite serves the exact route entry/router/dashboard; existing backend denies no-cookie reads with401. Authenticated/native acceptance remains blocked')
