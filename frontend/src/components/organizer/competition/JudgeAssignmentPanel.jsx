import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import Button from '@/components/ui/Button'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { getErrorMessage } from '@/utils/getErrorMessage'

function itemsFor(scope, foundation) {
  return foundation?.[scope === 'division' ? 'divisions' : scope === 'category' ? 'categories' : 'rounds'] ?? []
}
export default function JudgeAssignmentPanel({ foundation, reload, readOnly = false }) {
  const { eventId } = useParams()
  const [scope, setScope] = useState('event'), [scopeId, setScopeId] = useState(eventId || '')
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(null)
  const busyRef = useRef(false)
  const publishedFrozen = Boolean(foundation?.event?.official_rules_id ?? foundation?.event?.officialRulesId)
  const frozen = readOnly || publishedFrozen
  const targetId = scope === 'event' ? eventId : scopeId
  const scopeItems = itemsFor(scope, foundation), judges = foundation?.judges ?? []
  const assignmentsFor = id => (foundation?.assignments ?? []).filter(item => item.judgeId === id)
  const judgeLabel = judge => judge.displayName || judge.email || judge.id
  useEffect(() => {
    if (scope === 'event') { setScopeId(eventId || ''); return }
    const items = itemsFor(scope, foundation)
    setScopeId(current => items.some(item => item.id === current) ? current : items[0]?.id ?? '')
  }, [scope, eventId, foundation])
  const refreshSaved = async () => {
    try { await reload(); setFeedback(current => current ? { ...current, refreshError: null } : current) } catch {
      setFeedback(current => ({ ...current, refreshError: 'Saved assignments could not refresh. Reload the saved list.' }))
    }
  }
  const assign = async (targets, retryTarget = null) => {
    if (frozen || busyRef.current) return
    const selectedScope = retryTarget?.scope ?? scope, selectedId = retryTarget?.scopeId ?? targetId
    if (!selectedId) { setFeedback({ error: 'Choose a saved division, category or round first.' }); return }
    const pending = targets.filter(judge => !assignmentsFor(judge.id).some(item => item.scope === selectedScope && item.scopeId === selectedId))
    const skipped = targets.length - pending.length
    busyRef.current = true; setBusy(true); setFeedback(null)
    try {
      const results = await Promise.allSettled(pending.map(judge => pageantService.createJudgeAssignment(eventId, judge.id, { scope: selectedScope, scopeId: selectedId })))
      const failed = results.flatMap((result, index) => result.status === 'rejected' ? [{ judge: pending[index], message: getErrorMessage(result.reason, 'Assignment failed') }] : [])
      setFeedback({ added: pending.length - failed.length, skipped, failed, target: { scope: selectedScope, scopeId: selectedId } })
      await refreshSaved()
    } catch (error) {
      setFeedback({ error: getErrorMessage(error, 'Could not save judge assignments. Reload the saved list before retrying.') })
    } finally { busyRef.current = false; setBusy(false) }
  }
  const remove = async (judge, assignment) => {
    if (frozen || busyRef.current) return
    busyRef.current = true; setBusy(true); setFeedback(null)
    try {
      await pageantService.deleteJudgeAssignment(eventId, judge.id, assignment.id)
      setFeedback({ message: `Assignment removed for ${judgeLabel(judge)}.` })
      await refreshSaved()
    } catch (error) { setFeedback({ error: getErrorMessage(error, 'Could not remove assignment') }) }
    finally { busyRef.current = false; setBusy(false) }
  }
  const scopeLabel = a => a.scope === 'event' ? 'Event-wide' : `${a.scope}: ${itemsFor(a.scope, foundation).find(item => item.id === a.scopeId)?.name ?? a.scopeId}`
  const scopeSelect = label => <>
    <select aria-label={`${label} assignment scope`} className={INPUT_CLASS} value={scope} disabled={frozen || busy} onChange={e => setScope(e.target.value)}>
      <option value="event">Event</option>{foundation?.event?.divisions_enabled && <option value="division">Division</option>}<option value="category">Category</option><option value="round">Round</option>
    </select>
    {scope !== 'event' && <select aria-label={`${label} assignment target`} className={INPUT_CLASS} value={scopeId} onChange={e => setScopeId(e.target.value)} disabled={frozen || busy || !scopeItems.length}>
      <option value="">Select {scope}</option>{scopeItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>}
  </>
  return <div className="space-y-3">
    <div><h3 className="text-base font-semibold text-v-text">Round Assignments</h3><p className="text-sm text-v-text-subtle">Scope enrolled judges to saved rounds, divisions or categories. No assignments means event-wide scoring.</p></div>
    {publishedFrozen && <p className="v-caption">The published judge panel and assignments are frozen. Changes require the authorized scoring amendment procedure.</p>}
    {feedback && <div role={feedback.error || feedback.failed?.length || feedback.refreshError ? 'alert' : 'status'} className="v-card p-3 space-y-2 text-sm">
      {feedback.error ? <p className="v-error-text">{feedback.error}</p> : feedback.message ? <p>{feedback.message}</p> : <p>{feedback.added} assignment(s) saved; {feedback.skipped} already assigned; {feedback.failed?.length ?? 0} failed.</p>}
      {!!feedback.failed?.length && <><ul>{feedback.failed.map(item => <li key={item.judge.id}>{judgeLabel(item.judge)}: {item.message}</li>)}</ul><Button variant="secondary" disabled={frozen || busy} onClick={() => assign(feedback.failed.map(item => item.judge), feedback.target)}>Retry failed assignments</Button></>}
      {feedback.refreshError && <><p>{feedback.refreshError}</p><Button variant="secondary" onClick={refreshSaved} disabled={busy}>Reload saved assignments</Button></>}
    </div>}
    {judges.length > 0 && <div className="flex flex-wrap items-end gap-2 rounded-lg border border-v-border bg-v-surface px-3 py-2.5 text-sm">
      <span className="text-xs uppercase tracking-wider text-v-text-muted">Assign all judges to</span>{scopeSelect('All judges')}
      <Button size="sm" onClick={() => assign(judges)} disabled={frozen || busy || !targetId}>{busy ? 'Saving assignments…' : 'Assign all'}</Button>
    </div>}
    <ul className="space-y-2">{judges.map(judge => {
      const assignments = assignmentsFor(judge.id)
      return <li key={judge.id} className="space-y-3 rounded-xl border border-v-border px-4 py-3">
        <div><p className="font-medium text-v-text">{judgeLabel(judge)}</p><p className="text-xs text-v-text-subtle">{judge.email} · {judge.role}</p></div>
        <div className="space-y-1 rounded-lg bg-v-surface-elevated px-3 py-2 text-sm"><p className="text-v-text-muted">Assignments</p>
          {!assignments.length && <p className="text-xs text-v-text-subtle">No assignments yet — defaults to event-wide.</p>}
          {assignments.map(a => <div key={a.id} className="flex items-center justify-between text-xs"><span>{scopeLabel(a)}</span><button type="button" className="text-v-danger disabled:opacity-50" disabled={frozen || busy} aria-label={`Remove ${scopeLabel(a)} assignment for ${judgeLabel(judge)}`} onClick={() => remove(judge, a)}>Remove</button></div>)}
        </div>
        <div className="flex flex-wrap items-end gap-2 text-sm">{scopeSelect(judgeLabel(judge))}
          {scope !== 'event' && !scopeItems.length && <span className="v-caption">No {scope}s yet — create one first in Structure &amp; Scoring.</span>}
          <Button size="sm" variant="secondary" disabled={frozen || busy || !targetId} onClick={() => assign([judge])}>Add assignment</Button>
        </div>
      </li>
    })}{!judges.length && <li className="rounded-lg border border-dashed border-v-border px-4 py-6 text-center text-sm text-v-text-subtle">No judges yet — enroll judges above, then assign their scope here.</li>}</ul>
  </div>
}
