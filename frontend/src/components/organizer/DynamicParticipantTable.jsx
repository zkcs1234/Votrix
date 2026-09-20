import { useState } from 'react'
import Button from '@/components/ui/Button'
import FilterBar from '@/components/ui/FilterBar'
import useTableFilter from '@/hooks/useTableFilter'

// Read a participant's value for a schema field, trying label (legacy) then id.
function readField(participant, field) {
  const meta = participant.metadata || {}
  return meta[field.label] ?? meta[field.id]
}

/**
 * DynamicParticipantTable
 *
 * A reusable table for event participants (voters, judges, respondents) with
 * columns derived from the event's information_form_schema. Search matches the
 * email and every metadata column, and each dropdown/text field becomes a facet
 * filter with live counts (answers "how many voters are BSCS?").
 *
 * Props:
 *   participants       - Array of participant objects (each with .email, .metadata, etc.)
 *   formSchema         - Object { enabled, fields } from the event's information_form_schema
 *   loading            - Boolean for skeleton state
 *   onExportCsv        - truthy to show the export button
 *   exportLabel        - String for export button (default "Export CSV")
 *   statusKey          - Key in participant for status display: "hasVoted" | "hasScored" | "hasResponded"
 *   statusLabel        - { active: string, done: string } e.g. { active: "Pending", done: "Voted" }
 *   renderActions      - (participant, 'row' | 'toolbar') => JSX | null — custom action content
 *   emptyMessage       - String when there are no participants at all
 *   searchPlaceholder  - String for search input
 *   noun               - Plural label for the "Showing X of Y" summary (default "participants")
 *   invitationKey      - Key in participant for invitation: "invitationSent" (default)
 */
export default function DynamicParticipantTable({
  participants = [],
  formSchema = null,
  loading = false,
  onExportCsv,
  exportLabel = 'Export CSV',
  statusKey = 'hasVoted',
  statusLabel = { active: 'Pending', done: 'Completed' },
  renderActions,
  emptyMessage = 'No participants yet',
  searchPlaceholder = 'Search by email or details',
  noun = 'participants',
  invitationKey = 'invitationSent',
}) {
  const [showSkeleton, setShowSkeleton] = useState(false)

  // Derive dynamic columns from the form schema
  const customFields = formSchema?.enabled ? (Array.isArray(formSchema.fields) ? formSchema.fields : []) : []

  // Search matches email + every metadata value; each custom field is a facet.
  const searchKeys = ['email', ...customFields.map((f) => (p) => readField(p, f))]
  const facetFields = customFields.map((f) => ({
    id: f.id,
    label: f.label,
    accessor: (p) => readField(p, f),
  }))

  const {
    search,
    setSearch,
    activeFilters,
    setFilter,
    clearFilters,
    filtered,
    facets,
    resultCount,
    totalCount,
    hasActiveFilters,
  } = useTableFilter({ rows: participants, searchKeys, facetFields })

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

  // ─── Get dynamic field value (for display) ───────────────────────────────
  function getFieldValue(participant, field) {
    return readField(participant, field) ?? '-'
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

  const noMatches = filtered.length === 0

  return (
    <div className="v-table-wrap">
      {/* Toolbar */}
      <div className="p-4 border-b border-v-border flex flex-wrap gap-3 justify-between items-start">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={searchPlaceholder}
          facetFields={facetFields}
          facets={facets}
          activeFilters={activeFilters}
          onFilterChange={setFilter}
          onClear={clearFilters}
          hasActiveFilters={hasActiveFilters}
          resultCount={resultCount}
          totalCount={totalCount}
          noun={noun}
          actions={
            onExportCsv && filtered.length > 0 ? (
              <Button variant="secondary" size="sm" onClick={handleExportCsv}>
                {exportLabel}
              </Button>
            ) : null
          }
        />
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
          {noMatches ? (
            <tr>
              <td colSpan={customFields.length + 4} className="text-center v-caption py-8">
                {hasActiveFilters ? `No ${noun} match your search` : emptyMessage}
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
