import OriginalJudgeSheetModal from './OriginalJudgeSheetModal'
import { judgeSubmissionStatus } from '@/utils/originalJudgeSheet'
import { CheckCircle2, FileText, History, ShieldCheck, Users } from 'lucide-react'
import { tabulationMethodName } from '@/utils/competitionTabulationPresentation'
import { DEDUCTION_LABELS, effectiveDeductionMode, applicableDeductionRules } from '../../../../../shared/competition-deductions.js'

const formatDate = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded'
function Panel({ title, icon: Icon, children, className = '' }) { return <section className={`v-tab-panel ${className}`}><h2>{Icon && <Icon size={16} aria-hidden/>}{title}</h2>{children}</section> }

export function TabulationMetrics({ view }) {
  const submitted = (view.progress ?? []).filter(judge => judge.submitted).length, count = view.progress?.length ?? 0
  const calculation = view.complete ? view.calculation : null
  const status = calculation?.finalized ? 'Finalized' : calculation?.verified ? 'Verified' : calculation ? 'Pending verification' : view.complete ? 'Ready for tabulation' : 'Awaiting submissions'
  return <div className="v-tab-metrics" aria-label="Round totals">
    <div><Users size={20} aria-hidden/><span>Contestants<strong>{view.session?.entry_ids?.length ?? 0}</strong></span></div>
    <div><Users size={20} aria-hidden/><span>Judges<strong>{count}</strong></span></div>
    <div><CheckCircle2 size={20} aria-hidden/><span>Submission progress<strong>{count ? Math.round(submitted / count * 100) : 0}%</strong><small>{submitted}/{count} submitted</small></span></div>
    <div><ShieldCheck size={20} aria-hidden/><span>Result status<strong className="v-tab-metric-status">{status}</strong><small>{calculation && !calculation.finalized ? 'Pending final approval' : 'Current round'}</small></span></div>
  </div>
}

export function TabulationOverviewCards({ view, choice, criteria, method, onStage, onExport, reviewer, busy, hasDeductions }) {
  const configuration = view.rules?.configuration_snapshot, round = configuration?.rounds?.find(item => item.id === choice.roundId)
  const submitted = (view.progress ?? []).filter(judge => judge.submitted).length, count = view.progress?.length ?? 0
  const percent = count ? Math.round(submitted / count * 100) : 0
  const invalidSheets = (view.progress ?? []).filter(judge => ['incomplete', 'stale_rules', 'unauthorized'].includes(judge.submissionState)).length
  const organizerRules = applicableDeductionRules(configuration, choice.roundId, 'organizer')
  const pendingReviews = (view.deductions ?? []).filter(record => record.status === 'pending').length
  const calculationCurrent = view.complete && !!view.calculation && !view.calculationStale
  return <div className="v-tab-overview-cards">
    <Panel title="Category overview" icon={FileText}>
      <p className="v-tab-panel-caption">{choice.competitionName} · {choice.roundName}</p>
      <dl className="v-tab-facts"><div><dt>Scoring</dt><dd>{tabulationMethodName(method, configuration?.scoringConfig)}</dd></div><div><dt>Criteria</dt><dd>{criteria.length || '—'}</dd></div><div><dt>Round contribution</dt><dd>{!round ? 'Single round · 100%' : round.progression === 'weighted' ? `${round.weight ?? 100}%` : round.progression === 'carry_forward' ? 'Carry forward' : 'Back to zero'}</dd></div><div><dt>Deductions</dt><dd>{configuration ? DEDUCTION_LABELS[effectiveDeductionMode(configuration, choice.roundId)] : 'Sources pending'}</dd></div></dl>
    </Panel>
    <Panel title="Submission progress" icon={CheckCircle2}>
      <div className="v-tab-progress-layout"><div className="v-tab-progress-ring" style={{ '--tab-progress': `${percent}%` }} role="img" aria-label={`${percent}% of judges submitted`}><span><strong>{percent}%</strong><small>{submitted}/{count}</small></span></div><dl className="v-tab-facts"><div><dt>Submitted</dt><dd>{submitted}</dd></div><div><dt>Pending</dt><dd>{Math.max(0, count - submitted)}</dd></div></dl></div>
    </Panel>
    <Panel title="Validation status" icon={ShieldCheck}><dl className="v-tab-facts"><div><dt>Missing sheets</dt><dd>{Math.max(0, count - submitted - invalidSheets)}</dd></div><div><dt>Invalid sheets</dt><dd>{invalidSheets}</dd></div>{organizerRules.length > 0 && <div><dt>Pending deduction reviews</dt><dd>{pendingReviews}</dd></div>}<div><dt>Calculation</dt><dd>{calculationCurrent ? 'Current' : 'Pending'}</dd></div></dl><button type="button" className="v-tab-text-button" disabled={!view.complete || view.session?.status !== 'closed'} onClick={() => onStage('calculate')}>Open validation</button></Panel>
    <Panel title="Quick actions" icon={FileText}><div className="v-tab-quick-actions"><button type="button" className="is-primary" onClick={() => onStage('entries')}>View Score Matrix</button><button type="button" disabled={!view.complete || busy || reviewer} onClick={() => onExport('judge')}>Download Score Sheets</button><button type="button" disabled={!view.complete || busy || reviewer} onClick={() => onExport('tabulation')}>Export Report</button>{hasDeductions && <button type="button" onClick={() => onStage('deductions')}>Open Deductions</button>}</div></Panel>
  </div>
}

export function tabulationAuditEvents(view) {
  const events = (view.progress ?? []).filter(judge => judge.submitted && judge.submittedAt).map(judge => ({ id: `submission:${judge.judgeId}`, date: judge.submittedAt, label: 'Judge sheet submitted', actor: judge.judgeName ?? 'Assigned judge' }))
  if (view.complete) {
    const calculation = view.calculation
    if (calculation?.created_at) events.push({ id: `calculation:${calculation.id}`, date: calculation.created_at, label: `Calculation version ${calculation.version} saved`, actor: 'Official calculation' })
    for (const record of view.allDeductions ?? view.deductions ?? []) {
      if (record.created_at) events.push({ id: `deduction:${record.id}`, date: record.created_at, label: 'Organizer deduction recorded', actor: record.proposedByName ?? 'Organizer' })
      if (record.review?.created_at) events.push({ id: `review:${record.id}:${record.review.version}`, date: record.review.created_at, label: `Deduction ${record.review.action}`, actor: record.review.actorName ?? 'Authorized reviewer' })
    }
  }
  return events.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
}
export function TabulationAuditTrail({ view, compact = false, onFullAudit }) {
  const events = tabulationAuditEvents(view)
  return <Panel title="Audit trail" icon={History}><ol className="v-tab-audit-list">{(compact ? events.slice(0, 3) : events).map(event => <li key={event.id}><time dateTime={event.date}>{formatDate(event.date)}</time><strong>{event.label}</strong><span>{event.actor}</span></li>)}</ol>{!events.length && <p className="v-tab-panel-caption">No current activity timestamps are available.</p>}{compact && <button type="button" className="v-tab-text-button" onClick={onFullAudit}>View full audit</button>}</Panel>
}

export function TabulationJudgeSubmissions({ view, choice, selection, onSelect, onDownload, reviewer, busy }) {
  const judges = view.progress ?? []
  return <section className="v-tab-panel v-tab-submissions" id="judge-submissions" aria-labelledby="judge-submissions-heading">
    <div className="v-tab-panel-title"><h2 id="judge-submissions-heading">Judge submissions</h2><span>{judges.filter(judge => judge.submitted).length}/{judges.length} submitted</span></div>
    <div className="v-tab-grid-scroll"><table className="v-tab-grid"><caption className="sr-only">Current required judge submissions</caption><thead><tr><th>#</th><th>Judge</th><th>Status</th><th>Submitted at</th><th>Actions</th></tr></thead><tbody>{judges.map((judge, index) => <tr key={judge.judgeId}><td>{index + 1}</td><th scope="row">{judge.judgeName ?? 'Judge'}</th><td>{judgeSubmissionStatus(judge)}</td><td>{formatDate(judge.submittedAt)}</td><td><div className="v-tab-inline-actions"><button type="button" className="v-tab-small-button" disabled={busy} aria-haspopup="dialog" onClick={() => onSelect({ judgeId: judge.judgeId, submissionId: judge.submissionId })}>View Sheet</button>{!reviewer && <button type="button" className="v-tab-small-button" aria-label={`Download ${judge.judgeName ?? 'Judge'} CSV`} disabled={!view.complete || !judge.submitted || !judge.submissionId || busy} onClick={() => onDownload(judge.judgeId, judge.judgeName, judge.submissionId)}>Download CSV</button>}</div></td></tr>)}</tbody></table></div>
    {!view.complete && <p className="v-tab-empty">{view.qualificationCurrent === false ? 'The confirmed qualification is stale or missing. Confirm the source-round roster before continuing.' : 'Every required judge must submit a complete current sheet before worksheets or results can be viewed.'}</p>}
    {selection && <OriginalJudgeSheetModal key={`${selection.judgeId}:${selection.submissionId}`} view={view} choice={choice} selection={selection} onClose={() => onSelect(null)} onDownload={onDownload} reviewer={reviewer} busy={busy}/>}
  </section>
}

export function TabulationJudgeDeductions({ records, complete }) {
  return <section className="v-tab-panel"><h2>Submitted judge deductions</h2><p className="v-tab-panel-caption">Read-only records submitted with the judge sheets.</p>{!complete ? <p className="v-tab-empty">Complete current submissions are required.</p> : !records.length ? <p className="v-tab-empty">No submitted judge deductions.</p> : <div className="v-tab-grid-scroll"><table className="v-tab-grid"><thead><tr><th>Judge</th><th>Rule</th><th>Amount</th><th>Violation</th><th>Reason</th></tr></thead><tbody>{records.map(record => <tr key={record.id}><th scope="row">{record.judgeName ?? 'Assigned judge'}</th><td>{record.description}</td><td>{record.amount} {record.units}</td><td>{record.offense_key}</td><td>{record.reason}</td></tr>)}</tbody></table></div>}</section>
}
