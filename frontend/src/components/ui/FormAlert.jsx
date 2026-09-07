import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'

/**
 * Inline, contextual message banner — the counterpart to the top-center Toast.
 *
 * Use this for feedback that belongs next to the thing it's about: form-submit
 * errors, validation summaries, or a success confirmation inside a card. It
 * shares the Toast's design language (tokens, icons, radius) so the whole
 * system reads as one.
 *
 * @param {object} props
 * @param {'error'|'success'|'warning'|'info'} [props.variant='error']
 * @param {string} [props.title] - Optional bold headline above the message.
 * @param {React.ReactNode} [props.children] - Message body (or use `message`).
 * @param {string} [props.message] - Message body when not passing children.
 * @param {string} [props.className]
 */

const styles = {
  success: 'border-v-success/25 bg-v-success-bg text-v-success',
  error: 'border-v-danger/25 bg-v-danger-bg text-v-danger',
  warning: 'border-v-warning/25 bg-v-warning-bg text-v-warning',
  info: 'border-v-border bg-v-surface text-v-text',
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const roles = {
  success: 'status',
  info: 'status',
  warning: 'alert',
  error: 'alert',
}

export default function FormAlert({
  variant = 'error',
  title,
  children,
  message,
  className = '',
}) {
  const body = children ?? message
  if (!title && (body === null || body === undefined || body === false || body === '')) {
    return null
  }

  const Icon = icons[variant] ?? Info

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${styles[variant]} ${className}`}
      role={roles[variant] ?? 'status'}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      <div className="flex-1 leading-snug">
        {title && <p className="font-semibold">{title}</p>}
        {body !== null && body !== undefined && body !== false && body !== '' && (
          <p className={title ? 'mt-0.5 opacity-90' : ''}>{body}</p>
        )}
      </div>
    </div>
  )
}
