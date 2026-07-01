import { RefreshCw, FileText, FileSpreadsheet, FileDown, Braces } from 'lucide-react'

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
          className="inline-flex items-center gap-1.5 rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
          Refresh
        </button>
      )}
      {onExportCsv && (
        <button
          type="button"
          onClick={onExportCsv}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-v-border px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated disabled:opacity-50"
        >
          <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
          Export CSV
        </button>
      )}
      {onExportExcel && (
        <button
          type="button"
          onClick={onExportExcel}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-v-border px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated disabled:opacity-50"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={1.5} />
          Export Excel
        </button>
      )}
      {onExportPdf && (
        <button
          type="button"
          onClick={onExportPdf}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-v-border px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated disabled:opacity-50"
        >
          <FileDown className="h-3.5 w-3.5" strokeWidth={1.5} />
          Export PDF
        </button>
      )}
      {onExportJson && (
        <button
          type="button"
          onClick={onExportJson}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated disabled:opacity-50"
        >
          <Braces className="h-3.5 w-3.5" strokeWidth={1.5} />
          Export JSON
        </button>
      )}
    </div>
  )
}
