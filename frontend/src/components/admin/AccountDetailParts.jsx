import Badge from '@/components/ui/Badge'

// Shared building blocks for the admin "View details" modals (students, judges,
// organizers), so the three read exactly the same.

export const ACCOUNT_STATUS_TONE = { active: 'success', suspended: 'danger', archived: 'default', pending: 'warning' }

export function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-v-border py-3 last:border-b-0">
      <span className="text-sm font-medium text-v-text-secondary">{label}</span>
      <span className="break-words text-right text-sm text-v-text">{value || '—'}</span>
    </div>
  )
}

export function DetailSection({ title, children }) {
  return (
    <fieldset className="space-y-2">
      <legend className="v-section-title">{title}</legend>
      <div className="rounded-lg border border-v-border bg-v-surface">{children}</div>
    </fieldset>
  )
}

/** Name + email + status banner at the top of a details modal. */
export function DetailHeader({ name, email, status }) {
  return (
    <div className="rounded-lg border border-v-border bg-v-surface-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-v-text">{name || '—'}</h3>
          <p className="break-words text-sm text-v-text-secondary">{email}</p>
        </div>
        <Badge tone={ACCOUNT_STATUS_TONE[status] || 'default'}>{status}</Badge>
      </div>
    </div>
  )
}
