import { FileEdit, Check, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import { EVENT_STAGES } from '@/utils/eventStages'

/**
 * Inline banner shown at the top of a Create form when an unfinished draft exists.
 * Replaces the old UnsavedChangesDialog modal prompt.
 *
 * @param {object} props
 * @param {string} props.module - 'election' | 'competition' | 'polling'
 * @param {object} props.draft - the persisted draft
 * @param {() => void} props.onRestore - called to restore the draft into the form
 * @param {() => void} props.onDiscard - called to discard the draft and start fresh
 */
export default function DraftRecoveryBanner({ module, draft, onRestore, onDiscard }) {
  if (!draft) return null

  const stages = EVENT_STAGES[module] ?? []
  const stepIndex = stages.findIndex((s) => s.key === draft.step)
  const stepNumber = stepIndex >= 0 ? stepIndex + 1 : 1
  const stepLabel = stepIndex >= 0 ? stages[stepIndex].label : 'Details'

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-v-primary/40 bg-v-primary/5 shadow-sm">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-v-primary/10 p-1.5 text-v-primary">
            <FileEdit className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <h3 className="font-semibold text-v-text">Continue your previous work</h3>
            <p className="mt-0.5 text-sm font-medium text-v-text-muted">
              {draft.title ? `"${draft.title}"` : 'Untitled event'}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-v-text-subtle">
              <span>Step {stepNumber} of {stages.length}: {stepLabel}</span>
              <span>·</span>
              <span>Saved {formatWhen(draft.updatedAt)}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Button type="button" onClick={onRestore}>
            <Check className="h-4 w-4" strokeWidth={2} />
            Continue
          </Button>
          <Button type="button" variant="ghost" onClick={onDiscard}>
            <RefreshCw className="h-4 w-4" strokeWidth={2} />
            Start fresh
          </Button>
        </div>
      </div>
    </div>
  )
}

function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  
  const now = new Date()
  const diffMs = now - d
  const diffMins = Math.round(diffMs / 60000)
  
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`
  
  const diffHours = Math.round(diffMins / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 14) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`

  // Fallback for older drafts
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
