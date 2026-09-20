import { Check, X } from 'lucide-react'

/**
 * A single publish-readiness checklist row: a green check when satisfied, a red
 * cross when not. Used on the Review & Publish pages.
 */
export default function ReadinessItem({ ok, label }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          ok ? 'bg-emerald-500 text-white' : 'bg-v-danger/15 text-v-danger'
        }`}
        aria-hidden
      >
        {ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className={ok ? 'text-v-text' : 'text-v-text-subtle'}>{label}</span>
    </li>
  )
}
