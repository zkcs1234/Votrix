import { Link } from 'react-router-dom'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import {
  OUTCOME_TONE,
  eventPath,
  formatDate,
  formatDateTime,
  formatWindow,
  outcomeReason,
} from '@/utils/participantFormat'

function Detail({ label, children }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
      <dt className="text-v-text-subtle">{label}</dt>
      <dd className="min-w-0 text-v-text">{children}</dd>
    </div>
  )
}

function PartsTable({ columns, rows }) {
  return (
    <div className="v-table-wrap mt-3">
      <table className="v-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index}>
              {cells.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReceiptBody({ receipt }) {
  if (receipt.kind === 'sections') {
    if (!receipt.rows.length) return null
    return (
      <PartsTable
        columns={['Ballot section', 'Submitted', 'Status']}
        rows={receipt.rows.map((row) => [
          row.name,
          row.submittedAt ? formatDateTime(row.submittedAt) : '—',
          <Badge key="s" tone={row.status === 'Submitted' ? 'success' : 'neutral'}>{row.status}</Badge>,
        ])}
      />
    )
  }
  if (receipt.kind === 'rounds') {
    if (!receipt.rows.length) return null
    return (
      <PartsTable
        columns={['Round', 'Submitted', 'Status']}
        rows={receipt.rows.map((row) => [
          row.name,
          row.submittedAt ? formatDateTime(row.submittedAt) : '—',
          <Badge key="s" tone={row.status === 'Submitted' ? 'success' : 'neutral'}>{row.status}</Badge>,
        ])}
      />
    )
  }
  if (receipt.kind === 'poll') {
    return (
      <dl className="mt-3 space-y-1">
        <Detail label="Recorded">
          {receipt.responses === 1 ? '1 response' : `${receipt.responses} responses`}
        </Detail>
        <Detail label="Privacy">
          {receipt.anonymous ? 'Anonymous poll: your answers are not linked to you.' : 'Your answers are not shown here.'}
        </Detail>
      </dl>
    )
  }
  return null
}

// A read-only confirmation of what the participant did. It deliberately never
// carries selections, poll answers or any judge's scores.
export default function HistoryReceipt({ row }) {
  const reason = outcomeReason(row)
  const isJudge = row.eventType === 'competition_scoring'

  return (
    <div className="space-y-3 rounded-xl border border-v-border bg-v-surface-elevated/40 p-4" aria-label={`Participation receipt for ${row.title}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-v-text">Participation receipt</h3>
        <span className="v-caption">Read only</span>
      </div>

      <dl className="space-y-1">
        <Detail label="Event">{row.title}</Detail>
        <Detail label="Organization">{row.organizationName ?? '—'}</Detail>
        <Detail label="Your role">{row.role}</Detail>
        <Detail label="Event window">{formatWindow(row.window?.start, row.window?.end)}</Detail>
        <Detail label="Outcome">
          <Badge tone={OUTCOME_TONE[row.outcome] ?? 'neutral'}>{row.outcome}</Badge> <span className="text-v-text-muted">{row.summary}</span>
        </Detail>
        {row.completedAt && <Detail label="Completed">{formatDateTime(row.completedAt)}</Detail>}
      </dl>

      {reason && <p className="text-sm text-v-text-muted">{reason}</p>}
      <ReceiptBody receipt={row.receipt} />

      <p className="v-caption">
        {isJudge
          ? 'Other judges’ scores are never shown.'
          : 'Your selections and answers are never shown in History.'}
      </p>

      <div className="flex flex-wrap gap-2">
        <Link to={eventPath(row.eventType, row.eventId)}>
          <Button variant="secondary" size="sm">View event</Button>
        </Link>
        {row.results?.state === 'available' && (
          <Link to="/participant/results">
            <Button variant="secondary" size="sm">
              View results{row.results.publishedAt ? ` (published ${formatDate(row.results.publishedAt)})` : ''}
            </Button>
          </Link>
        )}
        {row.results?.state === 'pending' && (
          <span className="self-center text-sm text-v-text-muted">
            Results appear after {row.eventType === 'polling' ? 'the poll' : 'voting'} closes{row.results.availableAfter ? ` on ${formatDate(row.results.availableAfter)}` : ''}.
          </span>
        )}
        {row.scoresheetPath && (
          <Link to={row.scoresheetPath}>
            <Button variant="secondary" size="sm">Open scoresheet</Button>
          </Link>
        )}
        <Button variant="ghost" size="sm" onClick={() => window.print()}>Print receipt</Button>
      </div>
    </div>
  )
}
