import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

/**
 * Small inline indicator for auto-save status.
 *
 * @param {object} props
 * @param {'idle'|'saving'|'saved'|'error'} props.status
 * @param {string|null} props.lastSavedAt - ISO timestamp string
 */
export default function SaveStatus({ status, lastSavedAt }) {
  if (status === 'idle' && !lastSavedAt) return null

  return (
    <div className="flex items-center gap-1.5 text-xs transition-opacity duration-300">
      {status === 'saving' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-v-text-subtle" />
          <span className="text-v-text-subtle">Saving...</span>
        </>
      )}

      {status === 'saved' && (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-v-text-subtle">
            Saved {lastSavedAt ? formatTime(lastSavedAt) : ''}
          </span>
        </>
      )}

      {status === 'error' && (
        <>
          <AlertCircle className="h-3.5 w-3.5 text-v-danger" />
          <span className="text-v-danger">Save failed</span>
        </>
      )}

      {status === 'idle' && lastSavedAt && (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 opacity-50" />
          <span className="text-v-text-subtle opacity-70">
            Saved {formatTime(lastSavedAt)}
          </span>
        </>
      )}
    </div>
  )
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  
  // If today, just show time
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  
  // Otherwise show date and time
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
