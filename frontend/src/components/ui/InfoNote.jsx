import { Info } from 'lucide-react'

// Figma indigo information strip ("Source audit is the content authority",
// "Accounts are administrator-managed" ...). Purely informational; use
// FormAlert for success/warning/error feedback.
export default function InfoNote({ title, children, icon: Icon = Info, className = '' }) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border border-v-primary/25 bg-v-info-bg px-3.5 py-3 text-sm text-v-info ${className}`}
      role="note"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1 leading-snug">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  )
}
