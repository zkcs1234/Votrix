import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileEdit, FilePlus2, Trash2, ArrowRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import UnsavedChangesDialog from '@/components/ui/UnsavedChangesDialog'
import { EVENT_STAGES } from '@/utils/eventStages'

/**
 * "Unfinished draft" banner shown on a module's events list when a
 * Create-session draft exists in localStorage. Offers Continue / Discard.
 *
 * @param {object} props
 * @param {string} props.module - 'election' | 'competition' | 'polling'
 * @param {object} props.draft - the persisted draft (or null)
 * @param {() => void} props.onDelete - deletes the draft and refreshes state
 * @param {string} props.newEventPath - path to start a fresh Create session
 */
export default function DraftBanner({ module, draft, onDelete, newEventPath }) {
  const [confirming, setConfirming] = useState(false)
  const navigate = useNavigate()

  if (!draft) return null

  const moduleLabel =
    module === 'election' ? 'election' : module === 'competition' ? 'competition' : 'poll'

  const stages = EVENT_STAGES[module] ?? []
  const stepIndex = stages.findIndex((s) => s.key === draft.step)
  const stepNumber = stepIndex >= 0 ? stepIndex + 1 : 1
  const stepLabel = stepIndex >= 0 ? stages[stepIndex].label : 'Details'

  const resume = () => {
    navigate(newEventPath)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-v-primary/40 bg-v-primary/5 p-4">
      <div className="flex items-center gap-3">
        <div className="mt-0.5 rounded-full bg-v-primary/10 p-1.5 text-v-primary">
          <FileEdit className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-semibold text-v-text">
            Continue editing your {moduleLabel}
          </p>
          <p className="text-xs text-v-text-muted mt-0.5">
            {draft.title ? `"${draft.title}"` : 'Untitled'} · Step {stepNumber} of {stages.length}: {stepLabel} · saved {formatWhen(draft.updatedAt)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={resume}>
          Continue
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          Discard
        </Button>
      </div>

      {confirming && (
        <UnsavedChangesDialog
          variant="resume"
          title="Discard draft?"
          message="This will permanently remove your unfinished draft. This cannot be undone."
          onPrimary={() => {
            setConfirming(false)
            onDelete()
          }}
          onSecondary={() => setConfirming(false)}
          onCancel={() => setConfirming(false)}
          primaryLabel="Discard Draft"
          secondaryLabel="Keep Draft"
          cancelLabel="Cancel"
        />
      )}
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

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
