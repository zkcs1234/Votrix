import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal dialog. Handles what the ad-hoc `fixed inset-0` overlays did
 * not: focus trap, Escape-to-close, backdrop click, body scroll-lock, restoring
 * focus to the trigger on close, and the correct dialog ARIA roles.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} [props.title]           Rendered as the dialog heading + aria-label.
 * @param {React.ReactNode} props.children
 * @param {string} [props.size]            'sm' | 'md' | 'lg' (default 'md')
 * @param {boolean} [props.closeOnBackdrop] Default true.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdrop = true,
}) {
  const dialogRef = useRef(null)
  const previouslyFocused = useRef(null)

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      // Focus trap: keep Tab / Shift+Tab inside the dialog.
      const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE)
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement
    const { body } = document
    const prevOverflow = body.style.overflow
    body.style.overflow = 'hidden'

    // Move focus into the dialog once it mounts.
    const focusTarget = dialogRef.current?.querySelector(FOCUSABLE) ?? dialogRef.current
    focusTarget?.focus?.()

    return () => {
      body.style.overflow = prevOverflow
      // Restore focus to whatever opened the modal.
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus()
      }
    }
  }, [open])

  if (!open) return null

  const maxWidth = size === 'lg' ? 'max-w-3xl' : size === 'sm' ? 'max-w-md' : 'max-w-2xl'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        // Only close when the backdrop itself is pressed, not the dialog.
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.()
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
        className={`w-full ${maxWidth} max-h-[85vh] overflow-auto rounded-lg bg-v-surface p-6 shadow-xl`}
      >
        {title && (
          <div className="mb-4 flex items-start justify-between gap-4">
            <h3 className="v-page-title">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-v-text-muted transition hover:bg-v-surface-elevated hover:text-v-text"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
