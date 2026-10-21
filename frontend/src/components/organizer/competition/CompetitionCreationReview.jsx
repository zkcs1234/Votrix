import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { nativeCompetitionService as service } from '@/services/competition-native.service'
import {fetchCompetitionSetupData, invalidateCompetitionSetupData} from '@/services/competition-setup-cache'
import Button from '@/components/ui/Button'
import StageFooter from '@/components/ui/StageFooter'
import { competitionSetupIssues } from '../../../../../shared/competition-creation-flow.js'

const isPublishedEvent = event => Boolean(
  event?.status && event.status !== 'draft'
)

export default function CompetitionCreationReview({ eventId }) {
  const navigate = useNavigate(), sequence = useRef(0), operation = useRef(false)
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [ack, setAck] = useState(false)
  const invalidate = useCallback(() => { sequence.current++ }, [])
  const load = useCallback(async () => {
    const request = ++sequence.current
    const [ev, list, enrolled] = await Promise.all([
      fetchCompetitionSetupData(eventId,'parent-review',()=>service.parentReview(eventId)),
      fetchCompetitionSetupData(eventId,'competitions',()=>service.list(eventId)),
      fetchCompetitionSetupData(eventId,'enrollments',()=>service.enrollments(eventId)),
    ])
    const branches = await Promise.all((list.data.competitions ?? []).filter(c => c.origin === 'native' && (
      ev.data.event.competitionType !== 'pageant'
      || (c.competition_type ?? c.competitionType) !== 'pageant'
      || c.name.trim().toLowerCase() === 'pageant'
    )).map(async child => {
      const [foundation, participation] = await Promise.all([
        fetchCompetitionSetupData(eventId,`foundation:${child.id}`,()=>service.foundation(eventId,child.id)),
        fetchCompetitionSetupData(eventId,`entries:${child.id}`,()=>service.entries(eventId,child.id)),
      ])
      const branch = {...foundation.data, entries:participation.data.entries ?? [], judges:enrolled.data.judges ?? []}
      if (branch.competition.id !== child.id || branch.competition.event_id !== eventId) throw new Error('Competition review identity mismatch')
      branch.issues = competitionSetupIssues({...branch, competition:{...branch.competition,rulesCurrent:branch.rulesCurrent}})
      return branch
    }))
    if (sequence.current !== request) return
    const isPublished = isPublishedEvent(ev.data.event)
    if (!isPublished && !/^[a-f0-9]{32}$/.test(ev.data.parentReviewToken ?? '')) throw new Error('Reload the event review before publishing')
    setData({event:ev.data.event,parentReviewToken:ev.data.parentReviewToken,branches}); setError(''); setAck(false)
  }, [eventId])
  useEffect(() => { setData(null); load().catch(e => setError(e.response?.data?.message || e.message)); return invalidate }, [load, invalidate])
  const isPublished = isPublishedEvent(data?.event)
  const complete = !!data?.event.title?.trim() && !!data.event.competitionType && !!data.event.startDate && !!data.event.endDate && new Date(data.event.endDate)>=new Date(data.event.startDate) && !!data.branches.length && data.branches.every(b => !b.issues.length)
  const create = async () => {
    if (isPublished || operation.current || !complete || !ack) return
    operation.current = true; setBusy(true)
    try {
      await service.complete(eventId,{acknowledged:true,parentReviewToken:data.parentReviewToken,competitions:data.branches.map(b => ({id:b.competition.id,setupRevision:b.competition.setup_revision,inputRevision:b.competition.input_revision}))})
      navigate(`/organizer/competition/events/${eventId}/published`, {
        state: {
          eventTitle: data.event.title,
          eventStatus: 'scheduled',
          startDate: data.event.startDate,
          endDate: data.event.endDate,
        },
      })
    } catch (e) {
      await invalidateCompetitionSetupData(eventId)
      await load().catch(() => setData(null))
      setError(e.response?.data?.message || e.message)
    }
    finally { operation.current = false; setBusy(false) }
  }
  return <section className="space-y-5">
    <header><h1 className="v-page-title">Step 8 — Review &amp; Publish</h1><p className="v-helper-text">{isPublished?'This published event setup is read-only. Review the saved event and competition details below.':'Review every competition. Publishing freezes the saved rules and assignments and releases the event to its schedule. It does not start judging; start that later from Live Control.'}</p></header>
    {error && <div role="alert"><p className="v-error-text">{error}</p><Button disabled={busy} onClick={() => load().catch(e => setError(e.message))}>Reload review</Button></div>}
    {!data && !error && <p role="status">Checking all saved competition branches…</p>}
    {data && <>
      <article className="v-card space-y-2 p-5"><h2 className="font-semibold">{data.event.title}</h2><p>{data.event.description}</p><p>{data.event.startDate ? new Date(data.event.startDate).toLocaleString() : 'Start date missing'} — {data.event.endDate ? new Date(data.event.endDate).toLocaleString() : 'End date missing'}</p><p>Competition type: {data.event.competitionType || 'Missing'}</p>{data.event.banner && <img className="max-h-48 w-full rounded-lg object-cover" src={data.event.banner} alt="Event banner preview" />}</article>
      {!data.branches.length && <p role="alert">Select at least one competition in Step 4. <Link to={`/organizer/competition/events/${eventId}/categories`}>Choose competitions</Link></p>}
      <div className="grid gap-4 lg:grid-cols-2">{data.branches.map(b => <article key={b.competition.id} className="v-card space-y-3 p-5"><h2 className="font-semibold">{b.competition.name} <span className={b.issues.length ? 'text-v-danger' : 'text-v-success'}>{b.issues.length ? '— Needs attention' : '— Complete'}</span></h2><dl className="grid grid-cols-2 gap-2 text-sm"><dt>Format</dt><dd>{b.competition.participation_format ?? 'individual'}</dd><dt>Scoring structure</dt><dd>{b.configuration?.structure === 'multiple' ? 'Multiple rounds' : 'Single scoring phase'}</dd><dt>Calculation</dt><dd>{b.configuration?.scoringConfig.calculationMethod ?? 'Missing'}</dd><dt>Entries</dt><dd>{b.entries.length}</dd><dt>Assigned judges</dt><dd>{new Set(b.assignments.map(a => a.participant_id)).size}</dd></dl>{(b.configuration?.structure === 'multiple' ? b.configuration.rounds : [{id:null,name:'Single scoring phase'}]).map(r => <p key={r.id ?? 'single'} className="v-helper-text">{r.name}: {b.configuration?.criteria.filter(c => c.roundId === r.id).length ?? 0} criteria</p>)}{b.issues.map((issue,i) => <p key={i} className="text-sm text-v-danger">{issue.message} <Link className="underline" to={`/organizer/competition/events/${eventId}/${issue.step}?competitionId=${b.competition.id}`}>Fix this step</Link></p>)}</article>)}</div>
      {!isPublished&&<label className="flex items-start gap-3 v-card p-4"><input type="checkbox" disabled={!complete || busy} checked={ack} onChange={e => setAck(e.target.checked)} />I reviewed the event details and all competition rules, entries, and judge assignments.</label>}
    </>}
    <StageFooter module="competition" currentKey="review" eventId={eventId} saving={busy} {...(!isPublished?{nextLabel:'Review & Publish Event',onNext:create,nextDisabled:!complete||!ack||!!error}:{})} />
  </section>
}
