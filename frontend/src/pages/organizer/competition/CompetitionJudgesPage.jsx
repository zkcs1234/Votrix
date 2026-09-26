import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Lock, Users, UserMinus, Send, Search } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import FormAlert from '@/components/ui/FormAlert'
import JudgeAssignmentPanel from '@/components/organizer/competition/JudgeAssignmentPanel'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { isParticipantsLocked } from '@/utils/constants'

// Phase 6: organizers no longer register or CSV-import judges. Judge accounts
// are created by the admin; here the organizer PICKS judges from the pool into
// this competition, then scopes them via the assignment panel.
function judgeName(j) {
  return j.displayName || [j.firstName, j.lastName].filter(Boolean).join(' ') || j.email
}

export default function CompetitionJudgesPage() {
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
  const { success, error: showError } = useToast()

  const rosterLocked = isParticipantsLocked(eventStatus)

  const loadJudges = useCallback(async () => {
    try {
      const { data } = await pageantService.listJudges(eventId)
      setJudges(Array.isArray(data?.judges) ? data.judges : [])
    } catch {
      setJudges([])
    }
  }, [eventId])

  const loadPool = useCallback(async () => {
    try {
      const { data } = await pageantService.getJudgePool(eventId, search ? { search } : {})
      setPool(Array.isArray(data?.judges) ? data.judges : [])
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load judge pool'))
    }
  }, [eventId, search])

  const loadFoundation = useCallback(async () => {
    try {
      const { data } = await pageantService.getFoundation(eventId)
      setFoundation(data.foundation)
    } catch {
      setFoundation(null)
    }
  }, [eventId])

  useEffect(() => {
    pageantService.getEvent(eventId).then(({ data }) => setEventStatus(data.event?.status ?? null)).catch(() => {})
    loadJudges()
    loadFoundation()
  }, [eventId, loadJudges, loadFoundation])

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
    if (selected.size === 0) return
    setPicking(true)
    setError(null)
    try {
      const { data } = await pageantService.pickJudges(eventId, { userIds: [...selected], notify })
      success(
        `Added ${data.enrolled} judge(s)` +
          (data.alreadyEnrolled ? ` (${data.alreadyEnrolled} already in)` : '') +
          (notify ? ` · ${data.notified} emailed` : ''),
      )
      setSelected(new Set())
      await Promise.all([loadJudges(), loadPool(), loadFoundation()])
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to add judges')
      setError(message)
      showError(message)
    } finally {
      setPicking(false)
    }
  }

  const handleRemove = async (participantId) => {
    setRemovingId(participantId)
    try {
      await pageantService.deleteJudgeV2(eventId, participantId)
      success('Judge removed from event')
      await Promise.all([loadJudges(), loadPool(), loadFoundation()])
    } catch (err) {
      showError(getErrorMessage(err, 'Failed to remove judge'))
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="v-page-title">Judges</h1>
        <p className="v-caption">
          Pick judges from the registered pool for this competition, then scope their assignments below.
        </p>
      </div>

      {rosterLocked && (
        <FormAlert variant="warning">
          <span className="inline-flex items-center gap-2">
            <Lock className="h-4 w-4" strokeWidth={1.5} />
            This event is active — the judge roster is locked and can no longer be changed.
          </span>
        </FormAlert>
      )}

      {!rosterLocked && (
        <Card>
          <div className="space-y-4 p-5">
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

            {pool.length === 0 ? (
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
                      className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm transition ${
                        j.enrolled
                          ? 'border-v-border bg-v-surface-elevated opacity-60'
                          : checked
                            ? 'cursor-pointer border-v-primary bg-v-primary/5'
                            : 'cursor-pointer border-v-border hover:bg-v-surface-elevated'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={j.enrolled || checked}
                        disabled={j.enrolled}
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
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4" />
                Email an invitation to newly added judges
              </label>
              <span className="v-caption">{selectableCount} available to add</span>
              <Button onClick={handlePick} loading={picking} disabled={selected.size === 0}>
                <Send className="h-4 w-4" strokeWidth={2} />
                Add {selected.size || ''} judge{selected.size === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {error && <FormAlert variant="error">{error}</FormAlert>}

      <Card padding="sm">
        <div className="flex items-center gap-2 px-4 pt-4">
          <Users className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
          <h2 className="v-section-title">Judges in this event ({judges.length})</h2>
        </div>
        {judges.length === 0 ? (
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
                    <td>{j.role}</td>
                    <td><Badge tone={j.hasScored ? 'success' : 'default'}>{j.hasScored ? 'Submitted' : 'Pending'}</Badge></td>
                    {!rosterLocked && (
                      <td>
                        <div className="flex justify-end">
                          <Button size="sm" variant="ghost" loading={removingId === j.id} onClick={() => handleRemove(j.id)}>
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
        <JudgeAssignmentPanel foundation={foundation} reload={loadFoundation} />
      </div>
    </div>
  )
}
