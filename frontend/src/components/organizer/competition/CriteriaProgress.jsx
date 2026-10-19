import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Circle } from 'lucide-react'
import { formatCriteriaPercent } from '../../../../../shared/competition-criteria-readiness.js'

export function criteriaProgressState(readiness, saveState, loadError = '') {
  const scopes = readiness.scopes.map(scope => {
    const affected = saveState.scopeIds.includes(scope.roundId)
    const error = loadError || (affected ? saveState.error : '')
    const pending = affected && saveState.pending
    return error || pending ? { ...scope, ready: false, status: error ? 'Needs Attention' : 'In Progress',
      issues: [...scope.issues, { code: 'save_confirmation', message: error ? `Saved configuration needs confirmation: ${error}` : 'Saving and checking saved criteria…' }] } : scope
  })
  return { ...readiness, scopes, readyCount: scopes.filter(s => s.ready).length, allReady: scopes.every(s => s.ready) && !saveState.pending && !saveState.error && !loadError }
}

const Icon = ({ scope }) => {
  const StatusIcon = scope.ready ? CheckCircle2 : scope.status === 'Needs Attention' ? AlertCircle : Circle
  return <StatusIcon className={`h-4 w-4 shrink-0 ${scope.ready ? 'text-v-success' : scope.status === 'Needs Attention' ? 'text-v-warning' : 'text-v-text-muted'}`} aria-hidden />
}

export default function CriteriaProgress({ progress, selectedRoundId, onSelect }) {
  return <section aria-label="Round Setup Progress" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-v-text">{progress.hasRounds ? 'Round Setup Progress' : 'Criteria Setup Progress'}</h3>
      <span className="text-xs text-v-text-muted" aria-live="polite">{progress.readyCount} of {progress.scopes.length} ready</span>
    </div>
    <div className={progress.scopes.length > 2 ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : progress.scopes.length === 2 ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
      {progress.scopes.map(scope => <button key={scope.roundId ?? 'flat'} type="button"
        aria-label={`Configure ${scope.name}: ${formatCriteriaPercent(scope.total)}%, ${scope.status}`}
        aria-pressed={scope.roundId === selectedRoundId} onClick={() => onSelect(scope.roundId)}
        className={`flex min-w-0 flex-col items-stretch justify-start rounded-xl border bg-v-surface p-3 text-left transition hover:border-v-primary ${scope.roundId === selectedRoundId ? 'border-v-primary ring-1 ring-v-primary/20' : 'border-v-border'}`}>
        <span className="flex items-start gap-2"><Icon scope={scope} /><span className="min-w-0 break-words text-sm font-medium text-v-text">{progress.hasRounds ? `${scope.number}. ` : ''}{scope.name}</span></span>
        <span className="mt-1.5 block text-xs text-v-text-muted">{formatCriteriaPercent(scope.total)}% · {scope.status}</span>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-v-border"><span className={`block h-full ${scope.ready ? 'bg-v-success' : 'bg-v-primary'}`} style={{ width: `${Math.min(100, Math.max(0, scope.total))}%` }} /></span>
        {!scope.ready && <span className="mt-2 block text-xs leading-relaxed text-v-text-subtle">{scope.issues[0]?.message}</span>}
      </button>)}
    </div>
  </section>
}

export function CriteriaCompletion({ progress, selectedRoundId, onSelect, pending }) {
  const index = progress.scopes.findIndex(s => s.roundId === selectedRoundId)
  const current = progress.scopes[index] ?? progress.scopes[0]
  const previous = progress.scopes[index - 1]
  const next = progress.scopes[index + 1]
  return <section aria-label="Criteria Completion" className="space-y-4 rounded-xl border border-v-border bg-v-surface p-4 sm:p-5">
    <h3 className="text-sm font-semibold text-v-text">Criteria Completion</h3>
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium text-v-text">{current.name}</span><span className="text-v-text-muted">{formatCriteriaPercent(current.total)} / 100%</span></div>
    <div role="progressbar" aria-label={`${current.name} criteria weight`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, current.total))} aria-valuetext={`${formatCriteriaPercent(current.total)} of 100 percent, ${current.status}`} className="h-2 overflow-hidden rounded-full bg-v-border">
      <div className={`h-full ${current.ready ? 'bg-v-success' : 'bg-v-primary'}`} style={{ width: `${Math.min(100, Math.max(0, current.total))}%` }} />
    </div>
    <div aria-live="polite">{current.ready ? <p className="flex items-center gap-2 text-sm text-v-success"><Icon scope={current} />{progress.hasRounds ? `${current.name} Round Complete` : 'Event-wide Criteria Complete'}</p>
      : <ul className="space-y-1 text-sm text-v-text-muted">{current.issues.map((issue, i) => <li key={`${issue.code}-${i}`}>{issue.message}</li>)}</ul>}</div>
    {progress.allReady ? <div className="border-t border-v-border pt-3"><p className="text-sm font-semibold text-v-success">{progress.hasRounds ? 'All Rounds Ready' : 'Scoring Criteria Ready'}</p><p className="mt-1 text-xs text-v-text-muted">All required scoring criteria are configured. Continue to Divisions below.</p></div>
      : <div className="border-t border-v-border pt-3 text-xs text-v-text-muted"><p>Complete these {progress.hasRounds ? 'rounds' : 'criteria'} to continue to Divisions:</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{progress.scopes.filter(s => !s.ready).map(s => <button key={s.roundId ?? 'flat'} type="button" onClick={() => onSelect(s.roundId)} className="min-h-8 underline underline-offset-2 hover:text-v-primary">{s.name}</button>)}</div></div>}
    {progress.hasRounds && <div className="flex flex-col gap-3 border-t border-v-border pt-4 sm:flex-row sm:justify-between">
      <button type="button" disabled={!previous} onClick={() => onSelect(previous.roundId)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-v-border px-4 text-sm text-v-text-muted disabled:opacity-50"><ArrowLeft className="h-4 w-4" aria-hidden />Previous Round</button>
      {next && <button type="button" disabled={!current.ready || pending} onClick={() => onSelect(next.roundId)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-v-primary px-4 text-sm font-medium text-v-sidebar-active disabled:opacity-50">Next: {next.name}<ArrowRight className="h-4 w-4" aria-hidden /></button>}
    </div>}
  </section>
}
