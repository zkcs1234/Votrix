/**
 * ReportActionsBar — toolbar of report actions (refresh + exports).
 * Pure: each handler is provided by the caller. Components never assume
 * the source of the data.
 */
export default function ReportActionsBar({
  onRefresh,
  onExportCsv,
  onExportExcel,
  onExportPdf,
  onExportJson,
  busy = false,
  className = '',
}) {
  return (
    <div className={`flex flex-wrap gap-2 print:hidden ${className}`}>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated"
        >
          Refresh
        </button>
      )}
      {onExportCsv && (
        <button
          type="button"
          onClick={onExportCsv}
          disabled={busy}
          className="rounded-lg border border-v-border px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated disabled:opacity-50"
        >
          Export CSV
        </button>
      )}
      {onExportExcel && (
        <button
          type="button"
          onClick={onExportExcel}
          disabled={busy}
          className="rounded-lg border border-v-border px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated disabled:opacity-50"
        >
          Export Excel
        </button>
      )}
      {onExportPdf && (
        <button
          type="button"
          onClick={onExportPdf}
          disabled={busy}
          className="rounded-lg border border-v-border px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated disabled:opacity-50"
        >
          Export PDF
        </button>
      )}
      {onExportJson && (
        <button
          type="button"
          onClick={onExportJson}
          disabled={busy}
          className="rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated disabled:opacity-50"
        >
          Export JSON
        </button>
      )}
    </div>
  )
}
