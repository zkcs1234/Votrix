import { NativeSetupBoundary } from '@/components/organizer/competition/NativeSetupWorkspace'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Lock, Users, UserMinus, Send, Search } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import FormAlert from '@/components/ui/FormAlert'
import PageHeader from '@/components/ui/PageHeader'
import JudgeAssignmentPanel from '@/components/organizer/competition/JudgeAssignmentPanel'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { isParticipantsLocked } from '@/utils/constants'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import useLatestRequest from '@/hooks/useLatestRequest'

// Phase 6: organizers no longer register or CSV-import judges. Judge accounts
// are created by the admin; here the organizer PICKS judges from the pool into
// this competition, then scopes them via the assignment panel.
function judgeName(j) {
  return j.displayName || [j.firstName, j.lastName].filter(Boolean).join(' ') || j.email
}

export default function CompetitionJudgesPage() {
  return (
    <div data-module="competition-scoring" className="mx-auto max-w-5xl">
      <NativeSetupBoundary Legacy={LegacyCompetitionJudgesPage} />
    </div>
  )
}
function LegacyCompetitionJudgesPage() {
  const { eventId } = useParams()
  const [judges, setJudges] = useState([])
  const [pool, setPool] = useState([])
  const [foundation, setFoundation] = useState(null)
  const [eventStatus, setEventStatus] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [notify, setNotify] = useState(false)
  const [picking, setPicking] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [poolLoading, setPoolLoading] = useState(true)
  const [poolError, setPoolError] = useState('')
  const [roleBusy, setRoleBusy] = useState(null)
  const mutationRef = useRef(false)
  const beginRead = useLatestRequest(eventId)
  const beginPoolRead = useLatestRequest(`${eventId}:${search}`)
  const { success, error: showError } = useToast()

  const rosterLocked = loading || !foundation || Boolean(loadError) || isParticipantsLocked(eventStatus) || Boolean(foundation?.event?.official_rules_id ?? foundation?.event?.officialRulesId) || (eventStatus !== 'draft' && !!foundation?.scoringConfig?.confirmed)
  const mutationBusy = picking || Boolean(removingId) || Boolean(roleBusy)

  const reload = useCallback(async () => {
    const isCurrent = beginRead()
    try {
      const [eventResponse, judgeResponse, foundationResponse] = await Promise.all([pageantService.getEvent(eventId), pageantService.listJudges(eventId), pageantService.getFoundation(eventId)])
      if (!isCurrent()) return
      setJudges(Array.isArray(judgeResponse.data?.judges) ? judgeResponse.data.judges : [])
      setFoundation(foundationResponse.data.foundation)
      setEventStatus(eventResponse.data.event?.status ?? null)
      setError(null)
      setLoadError(null)
    } catch (err) { if (isCurrent()) setLoadError(getErrorMessage(err, 'Could not load enrolled judges')); throw err }
    finally { if (isCurrent()) setLoading(false) }
  }, [eventId, beginRead])

  const loadPool = useCallback(async () => {
    const isCurrent = beginPoolRead()
    setPoolLoading(true)
    try {
      const { data } = await pageantService.getJudgePool(eventId, search ? { search } : {})
      if (isCurrent()) { setPool(Array.isArray(data?.judges) ? data.judges : []); setPoolError('') }
    } catch (err) {
      if (isCurrent()) setPoolError(getErrorMessage(err, 'Failed to load judge pool'))
    } finally { if (isCurrent()) setPoolLoading(false) }
  }, [eventId, search, beginPoolRead])

  useEffect(() => {
    void reload().catch(() => {})
  }, [reload])
  useCompetitionSync(eventId, reload)

  // Reload the pool as the search term changes (debounced).
  useEffect(() => {
    const t = setTimeout(loadPool, 300)
    return () => clearTimeout(t)
  }, [loadPool])

  const toggle = (id) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectableCount = useMemo(() => pool.filter((p) => !p.enrolled).length, [pool])

  const handlePick = async () => {
    if (selected.size === 0 || rosterLocked || mutationRef.current) return
    mutationRef.current = true
    setPicking(true)
    setError(null)
    try {
      const { data } = await pageantService.pickJudges(eventId, { userIds: [...selected], notify })
      success(
        `Added ${data.enrolled} judge(s)` +
          (data.alreadyEnrolled ? ` (${data.alreadyEnrolled} already in)` : '') +
          (notify ? ` · ${data.notified} invitation email(s) accepted for delivery; enrollment does not depend on email delivery` : ''),
      )
      setSelected(new Set())
      await Promise.all([reload(), loadPool()])
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to add judges')
      setError(message)
      showError(message)
    } finally {
      setPicking(false)
      mutationRef.current = false
    }
  }

  const handleRemove = async (participantId) => {
    if (rosterLocked || mutationRef.current) return
    mutationRef.current = true
    setRemovingId(participantId)
    try {
      await pageantService.deleteJudgeV2(eventId, participantId)
      success('Judge removed from event')
      await Promise.all([reload(), loadPool()])
    } catch (err) {
      showError(getErrorMessage(err, 'Failed to remove judge'))
    } finally {
      setRemovingId(null)
      mutationRef.current = false
    }
  }
  const changeRole = async (participantId, role) => {
    if (rosterLocked || mutationRef.current) return
    mutationRef.current = true; setRoleBusy(participantId)
    try { await pageantService.updateJudgeV2(eventId, participantId, { role }); await reload() }
    catch (err) { showError(getErrorMessage(err)); setError(getErrorMessage(err)) }
    finally { mutationRef.current = false; setRoleBusy(null) }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Judges"
        description="Enroll existing judge accounts, then scope their assignments. Invitations are notifications; round submission progress is shown in Live Control."
      />

      {!loading && foundation && rosterLocked && !loadError && (
        <FormAlert variant="warning">
          <span className="inline-flex items-center gap-2">
            <Lock className="h-4 w-4" strokeWidth={1.5} />
            The official judge panel and assignments are locked for this event.
          </span>
        </FormAlert>
      )}

      {!rosterLocked && (
        <Card>
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search judges by name or email"
                className={INPUT_CLASS}
              />
            </div>

            {poolError && <div role="alert"><p className="v-error-text">{poolError}</p><Button variant="secondary" onClick={loadPool}>Retry judge pool</Button></div>}
            {poolLoading ? <p className="v-caption">Loading judge pool…</p> : !poolError && pool.length === 0 ? (
              <p className="v-caption">
                No judges in the pool. Ask an admin to register judges in User Management.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {pool.map((j) => {
                  const checked = selected.has(j.id)
                  return (
                    <label
                      key={j.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-sm transition ${
                        j.enrolled
                          ? 'border-v-border bg-v-surface-elevated opacity-60'
                          : checked
                            ? 'cursor-pointer border-v-primary/40 bg-v-primary-soft'
                            : 'cursor-pointer border-v-border bg-v-surface hover:border-v-primary/40 hover:bg-v-surface-elevated'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={j.enrolled || checked}
                        disabled={j.enrolled || mutationBusy}
                        onChange={() => toggle(j.id)}
                        className="h-4 w-4"
                      />
                      <span className="flex-1">
                        <span className="text-v-text">{[j.firstName, j.lastName].filter(Boolean).join(' ') || j.email}</span>
                        <span className="v-caption block">
                          {j.email}
                          {j.profileData?.affiliation ? ` · ${j.profileData.affiliation}` : ''}
                        </span>
                      </span>
                      {j.enrolled && <Badge tone="success">Added</Badge>}
                    </label>
                  )
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v-border pt-4">
              <label className="flex items-center gap-2 text-sm text-v-text-muted">
                <input type="checkbox" disabled={mutationBusy} checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4" />
                Email an invitation to newly added judges
              </label>
              <span className="v-caption">{selectableCount} available to add</span>
              <Button onClick={handlePick} loading={picking} disabled={selected.size === 0 || mutationBusy || Boolean(poolError)}>
                <Send className="h-4 w-4" strokeWidth={2} />
                Add {selected.size || ''} judge{selected.size === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {(error || loadError) && <FormAlert variant="error">{error || loadError} <Button variant="secondary" onClick={() => { void reload().catch(() => {}) }}>Retry enrolled judges</Button></FormAlert>}

      <Card padding="sm">
        <div className="flex items-center gap-2 px-4 pt-4">
          <Users className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
          <h2 className="v-section-title">Manage Judges ({judges.length})</h2>
        </div>
        {loading ? <p className="v-caption p-5">Loading enrolled judges…</p> : !error && !loadError && judges.length === 0 ? (
          <div className="p-8 text-center v-caption">No judges added yet.</div>
        ) : (
          <div className="v-table-wrap mt-3">
            <table className="v-table">
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Role</th><th>Status</th>
                  {!rosterLocked && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {judges.map((j) => (
                  <tr key={j.id}>
                    <td>{judgeName(j)}</td>
                    <td>{j.email}</td>
                    <td>{rosterLocked?j.role:<select aria-label={`Role for ${judgeName(j)}`} className={INPUT_CLASS} disabled={mutationBusy} value={j.role} onChange={e => changeRole(j.id, e.target.value)}><option value="judge">Judge</option><option value="head_judge">Head judge</option><option value="score_reviewer">Independent score reviewer</option></select>}</td>
                    <td><Badge tone={j.isActive === false ? 'default' : 'success'}>{j.isActive === false ? 'Inactive enrollment' : 'Enrolled'}</Badge></td>
                    {!rosterLocked && (
                      <td>
                        <div className="flex justify-end">
                          <Button size="sm" variant="ghost" disabled={mutationBusy} loading={removingId === j.id} onClick={() => handleRemove(j.id)}>
                            <UserMinus className="h-4 w-4" strokeWidth={1.5} /> Remove
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Scope judges to divisions/categories/rounds once they're added. */}
      <div className="border-t border-v-border pt-6">
        <JudgeAssignmentPanel foundation={foundation} reload={reload} readOnly={rosterLocked || mutationBusy} />
      </div>
    </div>
  )
}
