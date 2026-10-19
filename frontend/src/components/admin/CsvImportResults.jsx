import { Download } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { downloadCsv } from '@/utils/csvDownload'

const EMAIL_TONES = {
  sent: 'success',
  skipped: 'warning',
  failed: 'danger',
  not_sent: 'default',
}

export default function CsvImportResults({ result, filename, onDone }) {
  const rows = result?.results ?? []
  const downloadResults = () => {
    downloadCsv(
      filename,
      ['Email', 'Account result', 'Operation', 'Email result', 'Email reason', 'Account error'],
      rows.map((row) => [
        row.email,
        row.success ? 'success' : 'failed',
        row.operation || '',
        row.emailStatus || (row.emailSent ? 'sent' : 'not_sent'),
        row.emailReason || '',
        row.error || '',
      ]),
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-v-border p-3"><p className="v-caption">Accounts registered</p><p className="mt-1 text-xl font-semibold">{result.succeeded ?? 0}</p></div>
        <div className="rounded-lg border border-v-border p-3"><p className="v-caption">Registration failures</p><p className="mt-1 text-xl font-semibold">{result.failed ?? 0}</p></div>
        <div className="rounded-lg border border-v-border p-3"><p className="v-caption">Credential emails sent</p><p className="mt-1 text-xl font-semibold">{result.emailSent ?? rows.filter((row) => row.emailStatus === 'sent' || row.emailSent).length}</p></div>
        <div className="rounded-lg border border-v-border p-3"><p className="v-caption">Emails skipped</p><p className="mt-1 text-xl font-semibold">{result.emailSkipped ?? rows.filter((row) => row.emailStatus === 'skipped').length}</p></div>
        <div className="rounded-lg border border-v-border p-3"><p className="v-caption">Email failures</p><p className="mt-1 text-xl font-semibold">{result.emailFailed ?? rows.filter((row) => row.emailStatus === 'failed').length}</p></div>
        <div className="rounded-lg border border-v-border p-3"><p className="v-caption">No email needed</p><p className="mt-1 text-xl font-semibold">{result.emailNotSent ?? rows.filter((row) => row.emailStatus === 'not_sent').length}</p></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="v-caption">Per-recipient import and credential-email outcomes</p>
        <Button type="button" size="sm" variant="secondary" onClick={downloadResults}>
          <Download className="h-4 w-4" /> Download results
        </Button>
      </div>
      <div className="v-table-wrap max-h-80 overflow-auto">
        <table className="v-table">
          <thead><tr><th>Email</th><th>Account</th><th>Email</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((row, index) => {
              const emailStatus = row.emailStatus || (row.emailSent ? 'sent' : 'not_sent')
              return (
                <tr key={`${row.email}-${index}`}>
                  <td>{row.email}</td>
                  <td><Badge tone={row.success ? 'success' : 'danger'}>{row.operation || (row.success ? 'registered' : 'failed')}</Badge></td>
                  <td><Badge tone={EMAIL_TONES[emailStatus] || 'default'}>{emailStatus.replaceAll('_', ' ')}</Badge></td>
                  <td className="max-w-sm whitespace-normal">{row.error || row.emailReason || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end border-t border-v-border pt-4">
        <Button type="button" onClick={onDone}>Done</Button>
      </div>
    </div>
  )
}
