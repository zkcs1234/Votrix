import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { originalJudgeSheet, printOriginalJudgeSheet, sheetTargetLabel } from '@/utils/originalJudgeSheet'
import './OriginalJudgeSheetModal.css'

const date = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded'
const valueText = value => value == null ? 'Missing' : String(value)

export default function OriginalJudgeSheetModal({ view, choice, selection, onClose, onDownload, reviewer, busy }) {
  const [printError, setPrintError] = useState('')
  const sheet = originalJudgeSheet(view, selection)
  const timestamp = date(sheet.submission?.submitted_at ?? sheet.judge?.submittedAt)
  const canExport = !reviewer && !!sheet.submission && !sheet.incomplete && !busy
  const deductions = sheet.rows?.flatMap(row => row.cells.flatMap(cell => (cell.source?.deductions ?? []).map(record => ({ ...record, entry: row.entry.name, criterion: cell.group.name })))) ?? []
  const print = () => {
    if (!canExport) return
    if (!printOriginalJudgeSheet(sheet, { ...choice, timestamp })) setPrintError('Allow pop-ups to print this score sheet.')
  }
  return <Modal open title="Judge Score Sheet" id="original-judge-score-sheet" size="lg" onClose={onClose} footer={<div className="v-original-sheet-actions">{!reviewer && <><Button variant="secondary" disabled={!canExport} onClick={print}>Print / Save PDF</Button><Button variant="secondary" disabled={!canExport} onClick={() => onDownload(sheet.judge.judgeId, sheet.judge.judgeName, sheet.submission.id)}>Download CSV</Button></>}<Button onClick={onClose}>Close Sheet</Button></div>}>
    <header className="v-original-sheet-header">
      <span className="v-original-sheet-status">{sheet.status}</span>
      <p>{choice.eventName || 'Event name unavailable'} · {choice.competitionName} · {choice.roundName}</p>
      <p>Judge: {sheet.judge?.judgeName ?? 'Unavailable'}</p>
      <p>Submission timestamp: {timestamp}</p>
      {sheet.submission && <><small>Current submission · {sheet.submission.id} · submitted {timestamp}</small><small>Frozen rule revision {view.rules.version ?? view.rules.id}. Original scores are read-only.</small></>}
    </header>
    {sheet.message ? <p role="status" className="v-original-sheet-message">{sheet.message}</p> : <>
      <h4 className="v-original-sheet-title">Contestant Scores</h4>
      {sheet.incomplete && <p role="status">The saved sheet is incomplete. Missing scores are shown explicitly.</p>}
      <div className="v-original-sheet-scroll" tabIndex={0} role="region" aria-label="Original judge scores, horizontally scrollable"><table className="v-original-sheet-table">
        <caption className="sr-only">Original submitted scores for {sheet.judge.judgeName}</caption>
        <thead><tr><th rowSpan={2} scope="col">No.</th><th rowSpan={2} scope="col">Contestant</th>{sheet.groups.map(group => <th key={group.id} scope="colgroup" colSpan={group.targets.length + (group.targets.length > 1 ? 1 : 0)}>{group.name}{group.percentage != null && <> <small>{group.percentage}% weight</small></>}</th>)}<th rowSpan={2} scope="col">Raw score total</th></tr>
          <tr>{sheet.groups.flatMap(group => [...group.targets.map(target => <th key={`${group.id}:${target.id}`} scope="col">{sheetTargetLabel(target)}</th>), ...(group.targets.length > 1 ? [<th key={`${group.id}:subtotal`} scope="col">Raw subtotal</th>] : [])])}</tr></thead>
        <tbody>{sheet.rows.map(row => <tr key={row.entry.id}><td>{String(row.entry.contestantNumber ?? '—').padStart(3, '0')}</td><th scope="row">{row.entry.name}</th>{row.cells.flatMap(cell => [...cell.values.map((value, i) => <td key={`${cell.group.id}:${cell.group.targets[i].id}`}>{valueText(value)}</td>), ...(cell.values.length > 1 ? [<td key={`${cell.group.id}:subtotal`} className="v-original-sheet-subtotal">{valueText(cell.subtotal)}</td>] : [])])}<td className="v-original-sheet-subtotal">{valueText(row.total)}</td></tr>)}</tbody>
      </table></div>
      <p className="v-original-sheet-note">Raw subtotals add this judge’s submitted scores before weighting or deductions. Official calculated results are separate.</p>
      {deductions.length > 0 && <section className="v-original-sheet-deductions"><h4>Recorded judge deductions</h4><ul>{deductions.map(record => <li key={record.id}>{record.entry} · {record.criterion} · {view.rules.configuration_snapshot.scoringConfig.deductionRules?.find(rule => rule.id === record.ruleId)?.description ?? record.ruleId}: {record.reason || 'Applied using the Deduct button.'}</li>)}</ul></section>}
    </>}
    {printError && <p role="alert">{printError}</p>}
  </Modal>
}
