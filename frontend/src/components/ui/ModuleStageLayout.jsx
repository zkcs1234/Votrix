import { useEffect } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { stageKeyFromPath } from '@/utils/eventStages'
import useEventProgress from '@/hooks/useEventProgress'
import EventStepper from '@/components/ui/EventStepper'
import StageFooter from '@/components/ui/StageFooter'

// Stages that are part of the multi-step create/edit wizard and already render
// their own EventStepper + per-step StageFooter inside the form pages.
const FORM_WIZARD_STAGES = {
  election: ['details', 'branding', 'information-form'],
  competition: ['details', 'branding', 'information-form'],
  polling: ['details', 'branding', 'settings', 'information-form'],
}

/**
 * Wraps module page content with the EventStepper (top) and StageFooter
 * (bottom) so every page of a module shows the stage navigation, not just the
 * event-creation form. Tracks stage completion in localStorage via
 * useEventProgress so completed stages stay checked even when editing.
 */
export default function ModuleStageLayout({ module, children }) {
  const { eventId } = useParams()
  const location = useLocation()
  const { completedKeys, markComplete } = useEventProgress(module, eventId)

  const currentKey = stageKeyFromPath(module, location.pathname)
  const isFormWizard = currentKey && (FORM_WIZARD_STAGES[module] ?? []).includes(currentKey)

  const enabled = Boolean(eventId && eventId !== 'new' && currentKey && !isFormWizard)

  // Auto-mark the current stage as completed once the user visits it, so the
  // stepper keeps it checked on subsequent edits.
  useEffect(() => {
    if (enabled && currentKey) markComplete(currentKey)
  }, [enabled, currentKey, markComplete])

  if (!enabled) return <>{children}</>

  return (
    <div className="space-y-6">
      <EventStepper
        module={module}
        currentKey={currentKey}
        eventId={eventId}
        completedKeys={completedKeys}
      />
      {children}
      <StageFooter module={module} currentKey={currentKey} eventId={eventId} />
    </div>
  )
}
