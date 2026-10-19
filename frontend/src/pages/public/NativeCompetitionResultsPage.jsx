import { divisionStandings } from '../../../../shared/competition-division-standings.js'
import {useEffect,useRef,useState} from 'react'
import {useParams,useSearchParams} from 'react-router-dom'
import {nativeResultsService} from '@/services/competition-native-results.service'
export default function NativeCompetitionResultsPage(){
 const {eventId,competitionId}=useParams(),[params]=useSearchParams(),roundId=params.get('roundId')??null
 const identity=`${eventId}:${competitionId}:${roundId}`,identityRef=useRef(identity);identityRef.current=identity
 const [data,setData]=useState(null),[error,setError]=useState(null)
 useEffect(()=>{
  let alive=true,sequence=0,lastVersion=0
  setData(null);setError(null)
  const refresh=async()=>{
   if(document.visibilityState==='hidden')return
   const request=++sequence
   try{
    const {data:result}=await nativeResultsService.public(eventId,competitionId,roundId)
    if(!alive||identityRef.current!==identity||request!==sequence)return
    if(!Number.isSafeInteger(result.publicationVersion)||result.publicationVersion<1)throw new Error('Invalid publication version')
    if(result.publicationVersion<lastVersion)return
    if(result.withdrawn===true){lastVersion=result.publicationVersion;setData(null);setError('Published results are unavailable.');return}
    if(result.results?.eventId!==eventId||result.results.competitionId!==competitionId||result.results.roundId!==roundId)throw new Error('Published result context mismatch')
    // Only a validated selected-context response may advance this watermark.
    lastVersion=result.publicationVersion;setData(result);setError(null)
   }catch{if(alive&&request===sequence){setData(null);setError('Published results are unavailable.')}}
  }
  void refresh();const timer=setInterval(refresh,15000)
  const visible=()=>{if(document.visibilityState!=='hidden')void refresh()}
  window.addEventListener('focus',visible);window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible)
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',visible);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible)}
 },[identity,eventId,competitionId,roundId])
 const results=data?.results?.eventId===eventId&&data.results.competitionId===competitionId&&data.results.roundId===roundId?data.results:null
 return (
  <main
   data-module="competition-scoring"
   className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6"
  >
   <header className="v-card-md">
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-v-primary">
     Competition Scoring
    </p>
    <h1 className="v-page-title">Published competition results</h1>
   </header>
   {error&&(
    <div role="status" className="v-card-md border-v-danger/30 bg-v-danger-bg text-sm text-v-danger">
     {error}
    </div>
   )}
   {!results&&!error&&(
    <div role="status" className="v-card-md text-sm text-v-text-muted">
     Loading published snapshot…
    </div>
   )}
   {results&&(
    <section className="v-card-md space-y-4" aria-labelledby="published-results-title">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
       <h2 id="published-results-title" className="v-section-title">
        {results.eventName} — {results.competitionName}
       </h2>
       <p className="v-caption mt-1">
        {results.roundName} · publication {data.publicationVersion} · published {data.publishedAt}
       </p>
      </div>
      <span className="inline-flex items-center rounded-full bg-v-success-bg px-3 py-1 text-xs font-semibold text-v-success">
       Official results
      </span>
     </div>
     <div className="rounded-lg border border-v-primary/20 bg-v-primary-soft/50 p-4 text-sm text-v-text-muted">
      <p>This is the approved published snapshot. Corrections require an explicit replacement or withdrawal.</p>
      {results.deductionSettings?.judge&&(
       <p className="mt-2">Official scores include submitted judge deductions.</p>
      )}
      <p className="mt-2">Method: {results.method} · ties: {results.tiePolicy}</p>
     </div>
     <div className="v-table-wrap">
      {divisionStandings(results.standings, results.divisionRanking).map((division) => (
       <section key={division.id} aria-label={division.name || 'Competition standings'}>
        {division.name && <h3 className="mb-2 text-lg font-semibold text-v-text">{division.name}</h3>}
        <table className="v-table min-w-[40rem]">
         <thead>
          <tr>
           <th>Rank</th>
           <th>Entry</th>
           <th>Official score / placement</th>
           {(results.deductionSettings?.organizer ?? true) && <th>Organizer aggregate deductions</th>}
          </tr>
         </thead>
         <tbody>
          {division.rows.map((row) => (
           <tr key={row.participationId}>
            <td className="font-semibold">{row.rank}{row.tied ? ' (tie)' : ''}</td>
            <td>#{row.entryNumber} {row.name}</td>
            <td>{row.manual ? `Manual placement ${row.rank}` : row.score}</td>
            {(results.deductionSettings?.organizer ?? true) && (
             <td>{row.deductionTotal ?? '—'} {row.manual ? '' : row.deductionUnits}</td>
            )}
           </tr>
          ))}
         </tbody>
        </table>
       </section>
      ))}
     </div>
    </section>
   )}
  </main>
 )
}
