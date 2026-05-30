import { useToastStore } from '@/store/toast.store'

const styles = {
  success:
    'border-v-success/20 bg-v-success-bg text-v-success',
  error: 'border-v-danger/20 bg-v-danger-bg text-v-danger',
  info: 'border-v-border bg-v-surface text-v-text shadow-v-shadow-md',
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:bottom-6 sm:right-6 sm:px-0"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${styles[toast.type]}`}
          role="alert"
        >
          <p className="flex-1 leading-snug">{toast.message}</p>
          <button
            type="button"
            onClick={() => remove(toast.id)}
            className="shrink-0 opacity-50 hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
