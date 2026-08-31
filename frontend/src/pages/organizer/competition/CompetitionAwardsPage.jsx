import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Trophy } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/hooks/useToast'
import { HELPER_TEXT, INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'

const inputClass = `${INPUT_CLASS} w-full`
const EMPTY = { name: '', description: '', method: 'score', sourceRoundId: '', sourceCriteriaId: '', divisionId: '', categoryId: '' }

export default function CompetitionAwardsPage() {
  const { eventId } = useParams()
  const [foundation, setFoundation] = useState(null)
  const [awards, setAwards] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const { error: showError, success: showSuccess } = useToast()

  const load = useCallback(async () => {
    try {
      const [{ data: f }, { data: w }] = await Promise.all([
        pageantService.getFoundation(eventId),
        pageantService.getAwardWinners(eventId).catch(() => ({ data: { awards: [] } })),
      ])
      setFoundation(f.foundation)
      setAwards(w.awards ?? [])
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { load() }, [load])

  const enabled = foundation?.event?.awards_enabled ?? false
  const divisionsEnabled = foundation?.event?.divisions_enabled ?? false
  const divisions = foundation?.divisions ?? []
  const categories = foundation?.categories ?? []
  const rounds = foundation?.rounds ?? []
  const criteria = foundation?.criteria ?? []

  const toggleEnabled = async () => {
    setSaving(true)
    try {
      await pageantService.setAwardsEnabled(eventId, !enabled)
      setLoading(true)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await pageantService.createAward(eventId, {
        ...form,
        divisionId: form.divisionId || null,
        categoryId: form.categoryId || null,
        sourceRoundId: form.sourceRoundId || null,
        sourceCriteriaId: form.sourceCriteriaId || null,
      })
      setForm(EMPTY)
      setLoading(true)
      await load()
      showSuccess?.('Award added')
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add award')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this award?')) return
    await pageantService.deleteAward(eventId, id)
    setLoading(true)
    load()
  }

  const setStatus = async (id, status) => {
    try {
      await pageantService.setAwardStatus(eventId, id, status)
      setLoading(true)
      await load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to update award')
    }
  }

  const isInteractive = (a) => a.method === 'vote' || a.method === 'selection'
  const methodLabel = { score: 'Score', criteria: 'Criteria', vote: 'Vote', selection: 'Judge Selection' }

  if (loading) {
    return <div className="flex justify-center py-20"><LoadingSpinner /></div>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-v-text">Awards</h2>
        <p className="mt-1 text-sm text-v-text-subtle">
          Optional. Special awards decided from existing round or criterion scores — no extra scoring for judges.
        </p>
      </div>

      {/* Enable toggle (mirrors Divisions) */}
      <div className="v-card p-6 flex flex-wrap items-center justify-between gap-4 border border-v-primary/30 bg-v-primary/5">
        <div>
          <h3 className="text-lg font-semibold text-v-text">Enable Awards</h3>
          <p className="text-sm text-v-text-subtle mt-1">
            Turn on to add special awards (e.g., Best in Talent, Best Stage Presence). Off by default — nothing changes if unused.
          </p>
        </div>
        <button
          onClick={toggleEnabled}
          disabled={saving}
          className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${
            enabled ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-v-primary text-white hover:bg-v-primary/90'
          }`}
        >
          {enabled ? 'Disable Awards' : 'Enable Awards'}
        </button>
      </div>

      {!enabled && (
        <div className="rounded-lg border border-dashed border-v-border px-4 py-10 text-center text-sm text-v-text-subtle">
          Awards are off. This competition doesn't use any — enable above only if you want special awards.
        </div>
      )}

      {enabled && (
        <>
          {/* Add award */}
          <form onSubmit={handleCreate} className="grid gap-4 v-card p-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={LABEL_CLASS}>Award name</label>
              <input
                className={inputClass}
                placeholder="e.g. Best in Talent"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className={LABEL_CLASS}>Description (optional)</label>
              <input
                className={inputClass}
                placeholder="Optional note shown with the award"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Method</label>
              <select
                className={inputClass}
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value, sourceRoundId: '', sourceCriteriaId: '' })}
              >
                <option value="score">Score — highest score in a round</option>
                <option value="criteria">Criteria — highest in one criterion</option>
                <option value="vote">Vote — judges each pick one</option>
                <option value="selection">Judge Selection — judges each pick one</option>
              </select>
              <p className={HELPER_TEXT}>
                {form.method === 'vote' || form.method === 'selection'
                  ? 'Judges pick one contestant during a live award session you open in Live Control.'
                  : 'Decided automatically from scores judges already give.'}
              </p>
            </div>

            {form.method === 'score' && (
              <div>
                <label className={LABEL_CLASS}>Source round</label>
                <select
                  className={inputClass}
                  value={form.sourceRoundId}
                  onChange={(e) => setForm({ ...form, sourceRoundId: e.target.value })}
                  required
                >
                  <option value="">Select a round…</option>
                  {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}

            {form.method === 'criteria' && (
              <div>
                <label className={LABEL_CLASS}>Source criterion</label>
                <select
                  className={inputClass}
                  value={form.sourceCriteriaId}
                  onChange={(e) => setForm({ ...form, sourceCriteriaId: e.target.value })}
                  required
                >
                  <option value="">Select a criterion…</option>
                  {criteria.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {divisionsEnabled && (
              <div>
                <label className={LABEL_CLASS}>Division (optional)</label>
                <select className={inputClass} value={form.divisionId} onChange={(e) => setForm({ ...form, divisionId: e.target.value })}>
                  <option value="">— All divisions —</option>
                  {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}

            {categories.length > 0 && (
              <div>
                <label className={LABEL_CLASS}>Category (optional)</label>
                <select className={inputClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">— None —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-v-primary px-4 py-2 text-sm font-medium text-white hover:bg-v-primary/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> {saving ? 'Adding…' : 'Add award'}
            </button>
          </form>

          {/* Award list + current winner */}
          <ul className="space-y-2">
            {awards.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-v-border bg-v-surface px-4 py-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Trophy className="mt-0.5 h-5 w-5 text-v-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-v-text">{a.name}</p>
                    {a.description && <p className="text-xs text-v-text-subtle">{a.description}</p>}
                    <p className="mt-0.5 text-xs text-v-text-subtle">
                      <span className="rounded bg-v-surface-elevated px-1.5 py-0.5">{methodLabel[a.method]}</span>{' '}
                      {a.method === 'score'
                        ? `· Highest score in ${rounds.find((r) => r.id === a.sourceRoundId)?.name ?? 'round'}`
                        : a.method === 'criteria'
                          ? `· Highest in ${criteria.find((c) => c.id === a.sourceCriteriaId)?.name ?? 'criterion'}`
                          : `· ${a.status}`}
                      {a.divisionId && divisions.find((d) => d.id === a.divisionId) ? ` · ${divisions.find((d) => d.id === a.divisionId).name}` : ''}
                    </p>
                    <p className="mt-1 text-sm">
                      {isInteractive(a) ? (
                        a.winner
                          ? <span className="font-medium text-v-success">Leading: #{a.winner.contestantNumber} {a.winner.contestantName} ({a.votes} vote{a.votes !== 1 ? 's' : ''}){a.tie ? ' · tie' : ''}</span>
                          : <span className="text-v-text-subtle">{a.submitted ?? 0}/{a.totalJudges ?? 0} judges submitted</span>
                      ) : (
                        a.winner
                          ? <span className="font-medium text-v-success">Leading: #{a.winner.contestantNumber} {a.winner.contestantName} ({a.winner.value})</span>
                          : <span className="text-v-text-subtle">No scores yet</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isInteractive(a) && a.status === 'draft' && (
                    <button type="button" onClick={() => setStatus(a.id, 'open')} className="rounded-lg bg-v-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-v-primary/90">Open</button>
                  )}
                  {isInteractive(a) && a.status === 'open' && (
                    <button type="button" onClick={() => setStatus(a.id, 'closed')} className="rounded-lg border border-v-border px-2.5 py-1 text-xs font-medium text-v-text-muted hover:bg-v-surface-elevated">Close</button>
                  )}
                  {isInteractive(a) && a.status === 'closed' && (
                    <button type="button" onClick={() => setStatus(a.id, 'finalized')} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20">Finalize</button>
                  )}
                  <button type="button" onClick={() => remove(a.id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-v-danger hover:bg-v-danger-bg">
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              </li>
            ))}
            {!awards.length && (
              <li className="rounded-lg border border-dashed border-v-border px-4 py-6 text-center text-sm text-v-text-subtle">
                No awards yet. Add one above.
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}
