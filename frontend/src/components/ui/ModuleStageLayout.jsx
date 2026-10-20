import { useParams, useLocation } from 'react-router-dom'
import { stageKeyFromPath } from '@/utils/eventStages'
import useEventProgress from '@/hooks/useEventProgress'
import useEventStatus from '@/hooks/useEventStatus'
import EventStepper from '@/components/ui/EventStepper'
import StageFooter from '@/components/ui/StageFooter'
import { electionService } from '@/services/election.service'
import { pageantService } from '@/services/pageant.service'
import { pollingService } from '@/services/polling.service'
import {useEffect,useState} from 'react'
import {nativeCompetitionService} from '@/services/competition-native.service'
import { useEventContextStore } from '@/store/eventContext.store'

const EVENT_SERVICES = {
  election: electionService,
  competition: pageantService,
  polling: pollingService,
}

// Stages that are part of the multi-step create/edit wizard and already render
// their own EventStepper + per-step StageFooter inside the form pages.
const FORM_WIZARD_STAGES = {
  election: ['details', 'branding'],
  competition: ['details', 'branding'],
  polling: ['details', 'branding', 'settings'],
}

// Last setup stage of each module. These pages render their own StageFooter in
// every state — a "Finish & Publish" action while the event is still a draft,
// and the normal "Next" navigation footer once published — so the layout must
// not add a second footer here. The stepper still renders for these stages.
const PAGE_OWNS_FOOTER = {
  // 'review' renders the Finish & Publish / Unpublish footer; the roster pages
  // (Voters/Judges/Respondents) now use the layout's default navigation footer.
  election: ['review'],
  // 'workspace' (Structure & Scoring) renders its own tab-aware footer
  // (WorkspaceStageFooter); Criteria and Scoring rules use the sticky portal.
  // Rounds and Divisions keep navigation in page flow. No duplicate footer.
  competition: ['review', 'workspace', 'categories', 'type'],
  polling: ['review'],
}

/**
 * Wraps module page content with the EventStepper (top) and StageFooter
 * (bottom) so every page of a module shows the stage navigation, not just the
 * event-creation form. Tracks stage completion in localStorage via
 * useEventProgress so explicitly completed stages stay checked across visits.
 */
export default function ModuleStageLayout({ module, children }) {
  const { eventId } = useParams()
  const location = useLocation()
  const [nativeCompetition,setNativeCompetition]=useState(false)
  const [creationComplete,setCreationComplete]=useState(false)
  useEffect(()=>{
    setNativeCompetition(false);setCreationComplete(false)
    if(module!=='competition'||!eventId||eventId==='new'||import.meta.env.VITE_COMPETITION_NATIVE_SETUP_ENABLED!=='true')return
    let alive=true
    pageantService.getEvent(eventId).then(({data})=>{if(alive)setCreationComplete(!!data.event.competitionCreatedAt)}).catch(()=>{})
    nativeCompetitionService.list(eventId).then(({data})=>{if(alive)setNativeCompetition(data.competitions?.some(c=>c.origin==='native')===true)}).catch(()=>{})
    const changed=event=>{if(event.detail?.eventId===eventId)setNativeCompetition(event.detail.native===true)}
    window.addEventListener('votrix-native-contexts-changed',changed)
    return()=>{alive=false;window.removeEventListener('votrix-native-contexts-changed',changed)}
  },[module,eventId,location.pathname])
  const { completedKeys } = useEventProgress(module, eventId)
  const { status: eventStatus, title: eventTitle } = useEventStatus(EVENT_SERVICES[module], eventId)

  // Publish the event context for the shell's drawer card (no extra request).
  const setEventContext = useEventContextStore((s) => s.setContext)
  const clearEventContext = useEventContextStore((s) => s.clear)
  useEffect(() => {
    if (!eventId || eventId === 'new') {
      clearEventContext()
      return undefined
    }
    setEventContext({ eventId, title: eventTitle, status: eventStatus })
    return () => clearEventContext()
  }, [eventId, eventTitle, eventStatus, setEventContext, clearEventContext])

  const currentKey = stageKeyFromPath(module, location.pathname)
  const isFormWizard = currentKey && (FORM_WIZARD_STAGES[module] ?? []).includes(currentKey)
  const pageOwnsFooter = currentKey && ((PAGE_OWNS_FOOTER[module] ?? []).includes(currentKey) || module === 'competition' && nativeCompetition && ['contestants', 'judges'].includes(currentKey))

  const enabled = Boolean(eventId && eventId !== 'new' && currentKey && !isFormWizard)

  if (!enabled) return <>{children}</>

  return (
    <div className="space-y-6">
      <EventStepper
        module={module}
        currentKey={currentKey}
        eventId={eventId}
        completedKeys={creationComplete?[...new Set([...completedKeys,'details','branding','type','categories','workspace','contestants','judges','review'])]:completedKeys}
        eventStatus={eventStatus}
        readOnly={eventStatus != null && eventStatus !== 'draft'}
        nativeCompetition={nativeCompetition}
      />
      {children}
      {!pageOwnsFooter && (
        <StageFooter module={module} currentKey={currentKey} eventId={eventId} />
      )}
    </div>
  )
}
