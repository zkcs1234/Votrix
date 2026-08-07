import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileEdit, FilePlus2, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import UnsavedChangesDialog from '@/components/ui/UnsavedChangesDialog'

/**
 * "Unfinished draft" banner shown on a module's events list when a
 * Create-session draft exists in localStorage. Offers Resume / Start New /
 * Delete Draft.
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

  const resume = () => {
    // Drafts are Create-only; the create route reads the draft on mount.
    navigate(newEventPath)
  }

  const startNew = () => {
    onDelete()
    navigate(newEventPath)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-v-primary/40 bg-v-primary/5 p-4">
      <div className="flex items-center gap-3">
        <FileEdit className="h-5 w-5 text-v-primary" strokeWidth={2} />
        <div>
          <p className="text-sm font-semibold text-v-text">
            You have an unfinished {moduleLabel} draft.
          </p>
          <p className="text-xs text-v-text-muted">
            {draft.title ? `"${draft.title}"` : 'Untitled'} · saved {formatWhen(draft.updatedAt)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={resume}>
          <FileEdit className="h-4 w-4" strokeWidth={2} />
          Resume Draft
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          Delete Draft
        </Button>
        <Button size="sm" onClick={startNew}>
          <FilePlus2 className="h-4 w-4" strokeWidth={2} />
          Start New
        </Button>
      </div>

      {confirming && (
        <UnsavedChangesDialog
          variant="resume"
          title="Delete draft?"
          message="This will permanently remove your unfinished draft. This cannot be undone."
          onPrimary={() => {
            setConfirming(false)
            onDelete()
          }}
          onSecondary={() => setConfirming(false)}
          onCancel={() => setConfirming(false)}
          primaryLabel="Delete Draft"
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
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
