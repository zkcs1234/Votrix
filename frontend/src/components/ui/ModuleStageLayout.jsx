import { useParams, useLocation } from 'react-router-dom'
import { stageKeyFromPath } from '@/utils/eventStages'
import useEventProgress from '@/hooks/useEventProgress'
import useEventStatus from '@/hooks/useEventStatus'
import EventStepper from '@/components/ui/EventStepper'
import StageFooter from '@/components/ui/StageFooter'
import { electionService } from '@/services/election.service'
import { pageantService } from '@/services/pageant.service'
import { pollingService } from '@/services/polling.service'

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
  // (WorkspaceStageFooter) into #stage-footer-portal, so the layout must not
  // add a second one — otherwise two footers stack in the portal.
  competition: ['review', 'workspace'],
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
  const { completedKeys } = useEventProgress(module, eventId)
  const { status: eventStatus } = useEventStatus(EVENT_SERVICES[module], eventId)

  const currentKey = stageKeyFromPath(module, location.pathname)
  const isFormWizard = currentKey && (FORM_WIZARD_STAGES[module] ?? []).includes(currentKey)
  const pageOwnsFooter = currentKey && (PAGE_OWNS_FOOTER[module] ?? []).includes(currentKey)

  const enabled = Boolean(eventId && eventId !== 'new' && currentKey && !isFormWizard)

  if (!enabled) return <>{children}</>

  return (
    <div className="space-y-6">
      <EventStepper
        module={module}
        currentKey={currentKey}
        eventId={eventId}
        completedKeys={completedKeys}
        eventStatus={eventStatus}
        readOnly={eventStatus != null && eventStatus !== 'draft'}
      />
      {children}
      {!pageOwnsFooter && (
        <StageFooter module={module} currentKey={currentKey} eventId={eventId} />
      )}
    </div>
  )
}
