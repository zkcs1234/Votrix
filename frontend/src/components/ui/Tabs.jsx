// Figma "Organizers · Participants" style tab strip (used by User Management and
// other tabbed admin pages). Controlled: pass `value` and `onChange`, or render
// links by giving a tab an `href` (then `onChange` is optional).
import { Link } from 'react-router-dom'

export default function Tabs({ tabs, value, onChange, label = 'Sections', className = '', variant = 'underline' }) {
  const segmented = variant === 'segmented'
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`${segmented ? 'inline-flex flex-wrap gap-1 rounded-lg border border-v-border p-1' : 'flex flex-wrap items-center gap-1 border-b border-v-border'} ${className}`}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value
        const base = segmented
          ? 'rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v-primary'
          : 'relative -mb-px inline-flex min-h-10 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v-primary'
        const state = segmented
          ? selected
            ? 'bg-v-primary text-white'
            : 'text-v-text-muted hover:bg-v-surface-elevated hover:text-v-text'
          : selected
            ? 'border-v-primary text-v-text'
            : 'border-transparent text-v-text-muted hover:text-v-text'
        const content = (
          <>
            {tab.label}
            {tab.count != null && (
              <span className="rounded-full bg-v-surface-elevated px-1.5 text-[11px] font-semibold text-v-text-muted">
                {tab.count}
              </span>
            )}
          </>
        )
        if (tab.href) {
          return (
            <Link
              key={tab.value}
              to={tab.href}
              role="tab"
              aria-selected={selected}
              className={`${base} ${state}`}
              onClick={() => onChange?.(tab.value)}
            >
              {content}
            </Link>
          )
        }
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={tab.disabled}
            className={`${base} ${state} disabled:cursor-not-allowed disabled:opacity-50`}
            onClick={() => onChange?.(tab.value)}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
