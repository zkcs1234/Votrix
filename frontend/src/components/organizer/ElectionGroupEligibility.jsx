import { useEffect, useState } from 'react'
import { electionService } from '@/services/election.service'
import Button from '@/components/ui/Button'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'

export default function ElectionGroupEligibility({ eventId, locked }) {
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')
  const [mode, setMode] = useState('all')
  const [selected, setSelected] = useState([])
  const [voters, setVoters] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadedGroup, setLoadedGroup] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const { success } = useToast()

  useEffect(() => {
    let alive = true
    electionService.listBallotSections(eventId).then(({ data }) => {
      if (!alive) return
      setGroups(data.sections ?? [])
      setGroupId(data.sections?.[0]?.id ?? '')
      setLoading(false)
    }).catch((err) => { if (alive) { setError(err.response?.data?.message || 'Failed to load election groups'); setLoading(false) } })
    return () => { alive = false }
  }, [eventId])

  useEffect(() => {
    if (!groupId) return
    let alive = true
    setLoading(true)
    setLoadedGroup(false)
    setError('')
    electionService.getGroupEligibility(eventId, groupId).then(({ data }) => {
      if (!alive) return
      setMode(data.eligibility.mode)
      setSelected(data.eligibility.participantIds)
      setVoters(data.eligibility.voters)
      setLoadedGroup(true)
    }).catch((err) => { if (alive) setError(err.response?.data?.message || 'Failed to load group eligibility') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [eventId, groupId, refresh])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await electionService.setGroupEligibility(eventId, groupId, { mode, participantIds: mode === 'all' ? [] : selected })
      success('Election group eligibility saved')
    } catch (err) { setError(err.response?.data?.message || 'Failed to save group eligibility') }
    finally { setSaving(false) }
  }

  return (
    <section className="v-card space-y-4 p-5" aria-labelledby="group-eligibility-title">
      <h2 id="group-eligibility-title" className="v-section-title">Election Group Eligibility</h2>
      <p className="v-caption">Choose which enrolled voters can access each group ballot. Position program rules can narrow this group, but cannot add voters excluded here.</p>
      {error && <p role="alert" className="v-error-text">{error}</p>}
      {!groups.length && !loading ? <p className="v-caption">Create an election group in the Position Builder first.</p> : (
        <>
          <label className="block text-sm text-v-text-muted">
            Election Group
            <select className={`${INPUT_CLASS} mt-1 w-full`} value={groupId} disabled={saving} onChange={(event) => setGroupId(event.target.value)}>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          {loading ? <p className="v-caption">Loading eligible voters…</p> : (
            <fieldset disabled={locked || saving || !loadedGroup} className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-v-text">
                <input type="radio" name="group-eligibility-mode" checked={mode === 'all'} onChange={() => setMode('all')} />All enrolled voters
              </label>
              <label className="flex items-center gap-2 text-sm text-v-text">
                <input type="radio" name="group-eligibility-mode" checked={mode === 'selected'} onChange={() => setMode('selected')} />Selected enrolled voters
              </label>
              {mode === 'selected' && (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-v-border p-3">
                  {!voters.length && <p className="v-caption">Invite voters to this event before assigning eligibility.</p>}
                  {voters.map((voter) => (
                    <label key={voter.id} className="flex items-start gap-2 text-sm text-v-text">
                      <input type="checkbox" checked={selected.includes(voter.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, voter.id] : ids.filter((id) => id !== voter.id))} />
                      <span className="min-w-0 break-words">{voter.name || voter.email}<span className="ml-2 text-xs text-v-text-subtle">{voter.program} {voter.yearSection}</span></span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setRefresh((value) => value + 1)}>Refresh voters</Button>
                {!locked && <Button onClick={save} loading={saving}>Save eligibility</Button>}
              </div>
            </fieldset>
          )}
        </>
      )}
    </section>
  )
}
