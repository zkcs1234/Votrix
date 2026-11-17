import { Download } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import CsvImportResults from '@/components/admin/CsvImportResults'
import { downloadCsv } from '@/utils/csvDownload'

/**
 * Review step of a CSV import, shared by the student and judge imports: shows the
 * rows that will be registered, the rows that will be skipped (with a downloadable
 * list), the columns in the file that were not used, and then the per-person results.
 *
 * `preview` is the server's preview ({ total, valid, errors, data, ignoredColumns,
 * summary }) with `importResult` added once registered. `columns` is
 * [{ header, cell(row) }] for the review table.
 */
export default function CsvImportPreview({
  preview,
  columns,
  noun = 'accounts',
  resultsFilename,
  errorsFilename,
  onClose,
  onRegister,
  registering = false,
}) {
  const ignored = preview.ignoredColumns ?? []
  return (
    <Modal open onClose={onClose} title={preview.importResult ? 'Import results' : 'Review & Register'} size="lg">
      {preview.importResult ? (
        <CsvImportResults result={preview.importResult} filename={resultsFilename} onDone={onClose} />
      ) : (
        <>
          {preview.errors?.length > 0 && (
            <div className="mb-4 rounded-lg border border-v-danger/30 bg-v-danger/10 p-3">
              <p className="v-error-text mb-2 font-semibold">{preview.errors.length} row error(s) — these will be skipped</p>
              <ul className="v-error-text list-inside list-disc text-sm">
                {preview.errors.slice(0, 6).map((err, i) => <li key={i}>{err}</li>)}
                {preview.errors.length > 6 && <li>…and {preview.errors.length - 6} more</li>}
              </ul>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => downloadCsv(errorsFilename, ['Issue'], preview.errors.map((issue) => [issue]))}
              >
                <Download className="h-4 w-4" strokeWidth={1.5} /> Download errors
              </Button>
            </div>
          )}

          {ignored.length > 0 && (
            <p className="v-caption mb-3" data-testid="ignored-columns">
              These columns are not used by the import and were ignored: {ignored.join(', ')}.
            </p>
          )}

          <div className="mb-3 flex flex-wrap gap-4">
            <span className="v-label">{preview.valid} of {preview.total} ready</span>
            <span className="v-caption">New {noun}: {preview.summary?.newAccounts ?? 0}</span>
            <span className="v-caption">Profile updates: {preview.summary?.existingAccounts ?? 0}</span>
          </div>

          <div className="v-table-wrap mb-4 max-h-80 overflow-auto">
            <table className="v-table">
              <thead>
                <tr>
                  {columns.map((column) => <th key={column.header}>{column.header}</th>)}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(preview.data ?? []).map((row, i) => (
                  <tr key={i}>
                    {columns.map((column) => <td key={column.header}>{column.cell(row) || '—'}</td>)}
                    <td><Badge tone={row.type === 'new' ? 'success' : 'default'}>{row.type === 'new' ? 'New' : 'Update'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2 border-t border-v-border pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={onRegister} loading={registering} disabled={!preview.data?.length}>
              Register {preview.data?.length ?? 0}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
