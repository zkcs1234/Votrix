import { useEffect, useMemo, useState } from 'react'
import { Lock, Users, UserMinus, Send } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'

// Phase 5: organizers invite existing students by cohort (Program or Year &
// Section) instead of registering accounts. Shared by the election voters page
// and the polling respondents page.
//
// Props:
//   eventId          – the event
//   service          – { getCohorts, inviteCohort, removeParticipant, listVoters }
//   participantLabel – e.g. "voters" | "respondents"
//   rosterLocked     – true once the event is active (no roster changes)
export default function CohortInviteManager({ eventId, service, participantLabel = 'participants', rosterLocked = false }) {
  const [cohorts, setCohorts] = useState({ programs: [], sections: [] })
  const [enrolled, setEnrolled] = useState([])
  const [loading, setLoading] = useState(true)
  const [cohortType, setCohortType] = useState('program')
  const [selected, setSelected] = useState(() => new Set())
  const [notify, setNotify] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [error, setError] = useState(null)
  const { success, error: toastError } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const [{ data: cohortData }, { data: listData }] = await Promise.all([
        service.getCohorts(eventId),
        service.listVoters(eventId),
      ])
      setCohorts({ programs: cohortData.programs ?? [], sections: cohortData.sections ?? [] })
      setEnrolled(Array.isArray(listData.voters) ? listData.voters : [])
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load cohorts'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const list = cohortType === 'program' ? cohorts.programs : cohorts.sections

  // Reset the selection whenever the cohort dimension changes.
  const switchType = (type) => {
    setCohortType(type)
    setSelected(new Set())
  }

  const toggle = (value) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const selectedTotal = useMemo(() => {
    return list
      .filter((c) => selected.has(c.value))
      .reduce((sum, c) => sum + (c.poolCount - c.enrolledCount), 0)
  }, [list, selected])

  const handleInvite = async () => {
    if (selected.size === 0) return
    setInviting(true)
    setError(null)
    try {
      const { data } = await service.inviteCohort(eventId, {
        cohortType,
        values: [...selected],
        notify,
      })
      success(
        `Enrolled ${data.enrolled} ${participantLabel}` +
          (data.alreadyEnrolled ? ` (${data.alreadyEnrolled} already enrolled)` : '') +
          (notify ? ` · ${data.notified} emailed` : ''),
      )
      setSelected(new Set())
      await load()
    } catch (err) {
      const message = getErrorMessage(err, 'Invite failed')
      setError(message)
      toastError(message)
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (userId) => {
    setRemovingId(userId)
    try {
      await service.removeParticipant(eventId, userId)
      success('Removed from event')
      await load()
    } catch (err) {
      toastError(getErrorMessage(err, 'Failed to remove'))
    } finally {
      setRemovingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-32 animate-pulse rounded-xl bg-v-surface-elevated" />
        <div className="h-64 animate-pulse rounded-xl bg-v-surface-elevated" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {rosterLocked && (
        <FormAlert variant="warning">
          <span className="inline-flex items-center gap-2">
            <Lock className="h-4 w-4" strokeWidth={1.5} />
            This event is active — the roster is locked and can no longer be changed.
          </span>
        </FormAlert>
      )}

      {!rosterLocked && (
        <Card>
          <div className="space-y-4 p-5">
            <div>
              <h2 className="v-section-title">Invite a cohort</h2>
              <p className="v-caption mt-1">
                Choose a Program or Year &amp; Section to enroll all its students as {participantLabel}.
                Already-enrolled students are skipped.
              </p>
            </div>

            <div className="inline-flex rounded-lg border border-v-border p-0.5">
              {[
                { id: 'program', label: 'By Program' },
                { id: 'year_section', label: 'By Year & Section' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => switchType(opt.id)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    cohortType === opt.id ? 'bg-v-primary text-white' : 'text-v-text-muted hover:text-v-text'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {list.length === 0 ? (
              <p className="v-caption">
                No {cohortType === 'program' ? 'programs' : 'sections'} found in the voter pool. Ask an
                admin to register voters and set up the taxonomy.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => {
                  const remaining = c.poolCount - c.enrolledCount
                  const checked = selected.has(c.value)
                  return (
                    <label
                      key={c.value}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition ${
                        checked ? 'border-v-primary bg-v-primary/5' : 'border-v-border hover:bg-v-surface-elevated'
                      }`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggle(c.value)} className="h-4 w-4" />
                      <span className="flex-1 text-v-text">{c.value}</span>
                      <span className="v-caption">
                        {remaining} new{c.enrolledCount ? ` · ${c.enrolledCount} in` : ''}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v-border pt-4">
              <label className="flex items-center gap-2 text-sm text-v-text-muted">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4" />
                Email an invitation to newly enrolled {participantLabel}
              </label>
              <Button onClick={handleInvite} loading={inviting} disabled={selected.size === 0}>
                <Send className="h-4 w-4" strokeWidth={2} />
                Invite {selected.size ? `${selectedTotal} ${participantLabel}` : ''}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {error && <FormAlert variant="error">{error}</FormAlert>}

      <Card padding="sm">
        <div className="flex items-center gap-2 px-4 pt-4">
          <Users className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
          <h2 className="v-section-title">Enrolled {participantLabel} ({enrolled.length})</h2>
        </div>
        {enrolled.length === 0 ? (
          <div className="p-8 text-center v-caption">No {participantLabel} enrolled yet.</div>
        ) : (
          <div className="v-table-wrap mt-3">
            <table className="v-table">
              <thead>
                <tr>
                  <th>School ID</th><th>Name</th><th>Email</th><th>Program</th><th>Year &amp; Section</th>
                  {!rosterLocked && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {enrolled.map((v) => (
                  <tr key={v.id}>
                    <td>{v.schoolId || '—'}</td>
                    <td>{[v.firstName, v.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td>{v.email}</td>
                    <td>{v.program || '—'}</td>
                    <td>{v.yearSection || '—'}</td>
                    {!rosterLocked && (
                      <td>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={removingId === v.voterId}
                            onClick={() => handleRemove(v.voterId)}
                          >
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
    </div>
  )
}
