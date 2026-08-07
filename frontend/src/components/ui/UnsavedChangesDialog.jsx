import Button from '@/components/ui/Button'

/**
 * Reusable modal for two draft-related flows:
 *
 * 1) Leaving a dirty Create session:
 *    [Save as Draft] [Discard] [Cancel]
 * 2) Reopening Create when a draft exists:
 *    [Resume Draft] [Start New] [Delete Draft]
 *
 * @param {object} props
 * @param {string} props.variant - 'leave' | 'resume'
 * @param {string} props.title
 * @param {string} props.message
 * @param {() => void} props.onPrimary
 * @param {() => void} props.onSecondary
 * @param {() => void} props.onCancel
 * @param {string} props.primaryLabel
 * @param {string} props.secondaryLabel
 * @param {string} props.cancelLabel
 */
export default function UnsavedChangesDialog({
  variant = 'leave',
  title,
  message,
  onPrimary,
  onSecondary,
  onCancel,
  primaryLabel,
  secondaryLabel,
  cancelLabel,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-v-border bg-v-surface p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-v-text">{title}</h3>
        <p className="mt-2 text-sm text-v-text-muted">{message}</p>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {variant === 'leave' ? (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={onSecondary}>
                {secondaryLabel ?? 'Discard'}
              </Button>
              <Button type="button" size="sm" onClick={onPrimary}>
                {primaryLabel ?? 'Save as Draft'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                {cancelLabel ?? 'Cancel'}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onSecondary}>
                {secondaryLabel ?? 'Delete Draft'}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={onPrimary}>
                {primaryLabel ?? 'Resume Draft'}
              </Button>
              <Button type="button" size="sm" onClick={onCancel}>
                {cancelLabel ?? 'Start New Event'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
