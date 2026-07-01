import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useToastStore } from '@/store/toast.store'

const styles = {
  success: 'border-v-success/20 bg-v-success-bg text-v-success',
  error: 'border-v-danger/20 bg-v-danger-bg text-v-danger',
  info: 'border-v-border bg-v-surface text-v-text shadow-v-shadow-md',
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:bottom-6 sm:right-6 sm:px-0"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon = icons[toast.type] ?? Info
        return (
          <div
            key={toast.id}
            className={`v-toast-enter pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-v-shadow-md ${styles[toast.type]}`}
            role="alert"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <p className="flex-1 leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => remove(toast.id)}
              className="shrink-0 opacity-50 hover:opacity-100"
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
