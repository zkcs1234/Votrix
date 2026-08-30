import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import { INPUT_CLASS } from '@/utils/uiClasses'

// Judge assignment — scope existing judges to specific rounds / divisions /
// categories (or event-wide). Lives on the Judges page, AFTER judges are added,
// so both prerequisites (the judges and the scopes) already exist. `foundation`
// and `reload` come from the Judges page.
export default function JudgeAssignmentPanel({ foundation, reload }) {
  const { eventId } = useParams()
  const [scope, setScope] = useState('event')
  const [scopeId, setScopeId] = useState(eventId || '')

  const getScopeItems = (currentScope, currentFoundation) => {
    if (currentScope === 'event') return null
    if (currentScope === 'division') return currentFoundation?.divisions ?? []
    if (currentScope === 'category') return currentFoundation?.categories ?? []
    return currentFoundation?.rounds ?? []
  }

  useEffect(() => {
    if (scope === 'event') {
      setScopeId(eventId || '')
      return
    }
    const items = getScopeItems(scope, foundation)
    if (!items?.length) {
      setScopeId('')
      return
    }
    setScopeId((current) => {
      if (current && items.some((item) => item.id === current)) return current
      return items[0].id
    })
  }, [scope, eventId, foundation])

  const addAssignment = async (judge) => {
    const targetScopeId = scope === 'event' ? eventId : scopeId
    if (!targetScopeId) {
      alert('Pick a category, division, or round')
      return
    }
    try {
      await pageantService.createJudgeAssignment(eventId, judge.id, { scope, scopeId: targetScopeId })
      reload()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add assignment')
    }
  }

  const removeAssignment = async (judge, assignment) => {
    await pageantService.deleteJudgeAssignment(eventId, judge.id, assignment.id)
    reload()
  }

  const assignmentsByJudge = (judgeId) =>
    (foundation?.assignments ?? []).filter((a) => a.judgeId === judgeId)

  const scopeLabel = (a) => {
    if (a.scope === 'event') return 'Event-wide'
    if (a.scope === 'division')
      return `Division: ${foundation?.divisions?.find((d) => d.id === a.scopeId)?.name ?? a.scopeId}`
    if (a.scope === 'category')
      return `Category: ${foundation?.categories?.find((c) => c.id === a.scopeId)?.name ?? a.scopeId}`
    return `Round: ${foundation?.rounds?.find((r) => r.id === a.scopeId)?.name ?? a.scopeId}`
  }

  const divisionsEnabled = foundation?.event?.divisions_enabled
  const scopeItems = getScopeItems(scope, foundation)
  const isEventScope = scope === 'event'
  const scopeOptions = { event: 'Event', division: 'Division', category: 'Category', round: 'Round' }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-v-text">Judge assignments</h3>
        <p className="text-sm text-v-text-subtle">
          Scope each judge to specific rounds, divisions, or categories. Leave a judge unassigned for
          event-wide scoring.
        </p>
      </div>

      <ul className="space-y-2">
        {(foundation?.judges ?? []).map((judge) => {
          const list = assignmentsByJudge(judge.id)
          return (
            <li key={judge.id} className="space-y-3 rounded-xl border border-v-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-v-text">{judge.displayName || judge.email}</p>
                  <p className="text-xs text-v-text-subtle">
                    {judge.email} · {judge.role}
                  </p>
                </div>
              </div>

              <div className="space-y-1 rounded-lg bg-v-surface-elevated px-3 py-2 text-sm">
                <p className="text-v-text-muted">Assignments</p>
                {list.length === 0 && (
                  <p className="text-xs text-v-text-subtle">No assignments yet — defaults to event-wide.</p>
                )}
                {list.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-xs">
                    <span className="text-v-text-muted">{scopeLabel(a)}</span>
                    <button type="button" className="text-v-danger" onClick={() => removeAssignment(judge, a)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-2 text-sm">
                <select className={INPUT_CLASS} value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="event">Event</option>
                  {divisionsEnabled && <option value="division">Division</option>}
                  <option value="category">Category</option>
                  <option value="round">Round</option>
                </select>

                {!isEventScope && (
                  <select
                    className={INPUT_CLASS}
                    value={scopeId}
                    onChange={(e) => setScopeId(e.target.value)}
                    disabled={!scopeItems?.length}
                  >
                    <option value="">Select {scopeOptions[scope]}</option>
                    {(scopeItems ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                )}

                {!isEventScope && !scopeItems?.length && (
                  <span className="text-[11px] text-amber-300/90">
                    No {scopeOptions[scope]}s yet — create one first in Structure &amp; Scoring.
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => addAssignment(judge)}
                  className="rounded-lg border border-v-border px-3 py-1.5 text-v-text-muted"
                >
                  Add assignment
                </button>
              </div>
            </li>
          )
        })}
        {!foundation?.judges?.length && (
          <li className="rounded-lg border border-dashed border-v-border px-4 py-6 text-center text-sm text-v-text-subtle">
            No judges yet — add judges above, then assign them here.
          </li>
        )}
      </ul>
    </div>
  )
}
