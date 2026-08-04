import { useState } from 'react'
import Button from '@/components/ui/Button'
import SearchInput from '@/components/ui/SearchInput'

/**
 * DynamicParticipantTable
 *
 * A reusable table component for displaying event participants (voters, judges, respondents)
 * with dynamically rendered columns based on the event's information_form_schema.
 *
 * Props:
 *   participants       - Array of participant objects (each with .email, .metadata, etc.)
 *   formSchema         - Object { enabled, fields } from the event's information_form_schema
 *   loading            - Boolean for skeleton state
 *   search             - Current search string (controlled)
 *   onSearchChange     - (value) => void
 *   onExportCsv        - () => void (optional)
 *   exportLabel        - String for export button (default "Export CSV")
 *   statusKey          - Key in participant for status display: "hasVoted" | "hasScored" | "hasResponded"
 *   statusLabel        - { active: string, done: string } e.g. { active: "Pending", done: "Voted" }
 *   renderActions      - (participant) => JSX | null — custom action column content
 *   emptyMessage       - String when no participants match
 *   searchPlaceholder  - String for search input
 *   tableLabel         - String for table heading (optional)
 *   invitationKey      - Key in participant for invitation: "invitationSent" (default)
 */
export default function DynamicParticipantTable({
  participants = [],
  formSchema = null,
  loading = false,
  search = '',
  onSearchChange,
  onExportCsv,
  exportLabel = 'Export CSV',
  statusKey = 'hasVoted',
  statusLabel = { active: 'Pending', done: 'Completed' },
  renderActions,
  emptyMessage = 'No participants found',
  searchPlaceholder = 'Search by email',
  invitationKey = 'invitationSent',
}) {
  const [showSkeleton, setShowSkeleton] = useState(false)

  // Derive dynamic columns from the form schema
  const customFields = formSchema?.enabled ? (Array.isArray(formSchema.fields) ? formSchema.fields : []) : []

  // Filter by search
  const filtered = participants.filter((p) =>
    p.email?.toLowerCase().includes(search.toLowerCase()),
  )

  // ─── Skeleton ────────────────────────────────────────────────────────────
  if (loading) {
    if (!showSkeleton) {
      setTimeout(() => setShowSkeleton(true), 300)
      return null
    }
    const totalCols = 5 + customFields.length
    return (
      <div className="v-table-wrap animate-pulse">
        <table className="v-table">
          <thead>
            <tr>
              {['Email', 'Status', 'Invitation', ...customFields.map((f) => f.label), 'Actions'].map((h, i) => (
                <th key={i}><div className="h-4 w-24 rounded bg-v-surface-elevated" /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: totalCols }).map((__, c) => (
                  <td key={c}><div className="h-4 w-20 rounded bg-v-surface-elevated" /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ─── Status helper ───────────────────────────────────────────────────────
  function getStatus(participant) {
    if (participant[statusKey]) return 'done'
    return 'active'
  }

  // ─── Get dynamic field value ─────────────────────────────────────────────
  function getFieldValue(participant, field) {
    const meta = participant.metadata || {}
    // Try by label (legacy) then by field id (current schema)
    return meta[field.label] ?? meta[field.id] ?? '-'
  }

  // ─── Export CSV ──────────────────────────────────────────────────────────
  function handleExportCsv() {
    const headers = ['Email', 'Status', ...customFields.map((f) => f.label)]
    const rows = filtered.map((p) => {
      const statusVal = p[statusKey] ? statusLabel.done : statusLabel.active
      const customVals = customFields.map((f) => getFieldValue(p, f))
      return [p.email, statusVal, ...customVals]
    })
    downloadCsv(`participants.csv`, headers, rows)
  }

  return (
    <div className="v-table-wrap">
      {/* Toolbar */}
      <div className="p-4 border-b border-v-border flex flex-wrap gap-3 justify-between items-center">
        <div className="flex flex-wrap items-center gap-3">
          {onSearchChange && (
            <SearchInput
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="max-w-xs"
            />
          )}
          {onExportCsv && filtered.length > 0 && (
            <Button variant="secondary" size="sm" onClick={handleExportCsv}>
              {exportLabel}
            </Button>
          )}
        </div>
        {renderActions && renderActions(participants, 'toolbar')}
      </div>

      {/* Table */}
      <table className="v-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Status</th>
            <th>Invitation</th>
            {customFields.map((field) => (
              <th key={field.id}>{field.label}</th>
            ))}
            {renderActions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={customFields.length + 4} className="text-center v-caption py-8">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            filtered.map((p) => (
              <tr key={p.id || p.userId}>
                <td className="text-v-text-muted">{p.email}</td>
                <td>
                  <span className={getStatus(p) === 'done' ? 'v-badge v-badge-success' : 'v-badge'}>
                    {getStatus(p) === 'done' ? statusLabel.done : statusLabel.active}
                  </span>
                </td>
                <td>
                  {p[invitationKey] === true ? (
                    <span className="v-badge v-badge-success">Sent</span>
                  ) : p[invitationKey] === false ? (
                    <span className="v-badge v-badge-warning">Pending</span>
                  ) : (
                    <span className="v-badge v-badge-warning">Pending</span>
                  )}
                </td>
                {customFields.map((field) => (
                  <td key={field.id} className="text-sm text-v-text-muted">
                    {getFieldValue(p, field)}
                  </td>
                ))}
                {renderActions && (
                  <td>{renderActions(p, 'row')}</td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function downloadCsv(filename, headers, rows) {
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
