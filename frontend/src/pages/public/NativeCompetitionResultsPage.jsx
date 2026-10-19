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
 return <main className="mx-auto max-w-4xl space-y-4 p-6"><h1>Published competition results</h1>{error&&<p role="status">{error}</p>}{!results&&!error&&<p>Loading published snapshot…</p>}{results&&<><h2>{results.eventName} — {results.competitionName}</h2><p>{results.roundName} · publication {data.publicationVersion} · published {data.publishedAt}</p><p>This is the approved published snapshot. Corrections require an explicit replacement or withdrawal.</p>{results.deductionSettings?.judge&&<p>Official scores include submitted judge deductions.</p>}<p>Method: {results.method} · ties: {results.tiePolicy}</p><table><thead><tr><th>Rank</th><th>Entry</th><th>Official score / placement</th>{(results.deductionSettings?.organizer??true)&&<th>Organizer aggregate deductions</th>}</tr></thead><tbody>{results.standings.map(r=><tr key={r.participationId}><td>{r.rank}{r.tied?' (tie)':''}</td><td>#{r.entryNumber} {r.name}</td><td>{r.manual?`Manual placement ${r.rank}`:r.score}</td><td>{r.deductionTotal??'—'} {r.manual?'':r.deductionUnits}</td></tr>)}</tbody></table></>}</main>
}
