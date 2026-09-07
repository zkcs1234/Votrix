import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToastStore } from '@/store/toast.store'

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

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:top-6"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon = icons[toast.type] ?? Info
        return (
          <div
            key={toast.id}
            className={`v-toast-enter pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-v-shadow-md ${styles[toast.type]}`}
            role={roles[toast.type] ?? 'status'}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <div className="flex-1 leading-snug">
              {toast.title && <p className="font-semibold">{toast.title}</p>}
              {toast.message && (
                <p className={toast.title ? 'mt-0.5 opacity-90' : ''}>{toast.message}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(toast.id)}
              className="shrink-0 opacity-50 transition-opacity hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
