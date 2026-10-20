import { Info, ShieldCheck } from 'lucide-react'
import Card from '@/components/ui/Card'
import InfoNote from '@/components/ui/InfoNote'
import SaveStatus from '@/components/ui/SaveStatus'

const THIRD_STEP = {
  election: 'Configure positions and candidates',
  competition: 'Configure structure and scoring',
  polling: 'Configure settings and questions',
}

/**
 * Right-hand column of the event wizard (Figma "Your setup journey" + "Draft
 * protection"). Static guidance only; the save indicator reuses the page's real
 * draft status.
 */
export default function EventSetupAside({ module, saveStatus = 'idle', lastSavedAt = null, showSaveStatus = false }) {
  const steps = [
    'Complete event details',
    'Add an optional banner',
    THIRD_STEP[module] ?? 'Configure the event',
    'Review readiness and publish',
  ]

  return (
    <aside className="space-y-4" aria-label="Setup guidance">
      <Card padding="sm">
        <h3 className="v-section-title">Your setup journey</h3>
        <ol className="mt-3 space-y-2 text-sm text-v-text-muted">
          {steps.map((label, index) => (
            <li key={label} className="flex gap-2">
              <span className="w-4 shrink-0 font-semibold text-v-text-subtle">{index + 1}.</span>
              {label}
            </li>
          ))}
        </ol>
        <InfoNote icon={Info} title="Publishing schedules your event" className="mt-4">
          It does not immediately open voting, a poll, or a competition scoring session.
        </InfoNote>
      </Card>

      <Card padding="sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-v-primary" strokeWidth={1.75} aria-hidden />
          <h3 className="v-section-title">Draft protection</h3>
        </div>
        <p className="mt-2 text-sm text-v-text-subtle">
          Changes are saved as a draft while you work. Leaving with unsaved changes offers Save &amp;
          leave, Leave without saving, or Cancel.
        </p>
        {showSaveStatus && (
          <div className="mt-3">
            <SaveStatus status={saveStatus} lastSavedAt={lastSavedAt} />
          </div>
        )}
      </Card>
    </aside>
  )
}
