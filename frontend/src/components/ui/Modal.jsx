import { useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE =
  'a[href], button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'

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
 * @param {string} [props.variant] 'modal' (default) or a viewport-height 'drawer'.
 * @param {React.ReactNode} [props.footer] Dialog footer outside its scroll body.
 * @param {object} [props.restoreFocusRef] Optional originating trigger ref.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdrop = true,
  variant = 'modal',
  footer,
  restoreFocusRef,
  closeDisabled = false,
  id,
  constrainToRef,
}) {
  const dialogRef = useRef(null)
  const previouslyFocused = useRef(null)
  const [constraintBounds, setConstraintBounds] = useState(null)

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (!closeDisabled) onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      // Focus trap: keep Tab / Shift+Tab inside the dialog.
      const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE)
      if (!focusable || focusable.length === 0) {
        e.preventDefault()
        dialogRef.current?.focus()
        return
      }
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
    [onClose, closeDisabled],
  )

  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = restoreFocusRef?.current ?? document.activeElement
    const { body } = document
    const prevOverflow = body.style.overflow
    body.style.overflow = 'hidden'

    // Move focus into the dialog once it mounts.
    const focusTarget = (variant === 'drawer' ? dialogRef.current?.querySelector('[data-modal-autofocus]:not(:disabled)') : null)
      ?? dialogRef.current?.querySelector(FOCUSABLE) ?? dialogRef.current
    focusTarget?.focus?.()

    return () => {
      body.style.overflow = prevOverflow
      // Restore focus to whatever opened the modal.
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus()
      }
    }
  }, [open, variant, restoreFocusRef])

  useEffect(() => {
    if (!open || !constrainToRef?.current) {
      setConstraintBounds(null)
      return undefined
    }

    const container = constrainToRef.current.closest('main') || constrainToRef.current
    const updateBounds = () => {
      const rect = container.getBoundingClientRect()
      const top = Math.max(0, rect.top)
      const bottom = Math.min(window.innerHeight, rect.bottom)
      setConstraintBounds({
        left: Math.max(0, rect.left),
        top,
        width: Math.max(0, Math.min(window.innerWidth, rect.right) - Math.max(0, rect.left)),
        height: Math.max(0, bottom - top),
      })
    }

    updateBounds()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateBounds) : null
    observer?.observe(container)
    window.addEventListener('resize', updateBounds)
    window.addEventListener('scroll', updateBounds, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateBounds)
      window.removeEventListener('scroll', updateBounds, true)
    }
  }, [open, constrainToRef])

  if (!open) return null

  const maxWidth = size === 'lg' ? 'max-w-3xl' : size === 'sm' ? 'max-w-md' : 'max-w-2xl'
  const constraintStyle = constraintBounds
    ? {
        position: 'fixed',
        left: constraintBounds.left,
        top: constraintBounds.top,
        width: constraintBounds.width,
        height: constraintBounds.height,
      }
    : undefined

  return createPortal(
    <div
      className={variant === 'drawer' ? 'fixed inset-0 z-50 flex justify-end bg-black/40' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'}
      style={constraintStyle}
      onMouseDown={(e) => {
        // Only close when the backdrop itself is pressed, not the dialog.
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.()
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        id={id}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
        className={variant === 'drawer' ? 'v-rounds flex h-dvh w-full min-w-0 flex-col bg-v-surface shadow-xl sm:max-w-lg sm:border-l sm:border-v-border' : `w-full ${maxWidth} max-h-[85vh] overflow-auto rounded-lg bg-v-surface p-6 shadow-xl`}
      >
        {title && (
          <div className={variant === 'drawer' ? 'flex shrink-0 items-center justify-between gap-3 border-b border-v-border px-5 py-4' : 'mb-4 flex items-start justify-between gap-4'}>
            <h3 className={variant === 'drawer' ? 'min-w-0 break-words text-base font-semibold text-v-text' : 'v-page-title'}>{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              disabled={closeDisabled}
              className={variant === 'drawer' ? 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-v-text-muted transition hover:bg-v-surface-elevated hover:text-v-text disabled:opacity-50' : 'rounded-md p-1 text-v-text-muted transition hover:bg-v-surface-elevated hover:text-v-text'}
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        )}
        {variant === 'drawer' ? <div data-drawer-content className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div> : children}
        {footer && <div className="shrink-0 border-t border-v-border px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
