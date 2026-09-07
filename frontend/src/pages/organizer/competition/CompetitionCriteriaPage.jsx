import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/hooks/useToast'
import ManagementWorkspace from '@/components/ui/ManagementWorkspace'
import { HELPER_TEXT, INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'

const inputClass = `${INPUT_CLASS} w-full`

// §8C: the score range is owned by the event scale (scoring_config.scoreType),
// not per-criterion. Mirrors the backend resolveScoreBounds.
function resolveScaleBounds(scoringConfig) {
  const cfg = scoringConfig ?? {}
  switch (cfg.scoreType) {
    case 'range_1_10':
      return { min: 1, max: 10 }
    case 'decimal':
      return { min: 0, max: 10 }
    case 'custom_range': {
      const min = Number(cfg.customMin ?? 0)
      const max = Number(cfg.customMax ?? 100)
      if (Number.isNaN(min) || Number.isNaN(max) || max < min) return { min: 0, max: 100 }
      return { min, max }
    }
    case 'range_1_100':
    default:
      return { min: 1, max: 100 }
  }
}

// Round-aware Criteria page. When the event has rounds (defined in Structure &
// Scoring), you pick a round and configure the criteria that belong to it — each
// round's criteria total 100% within that round. With no rounds, it's a flat
// event-wide criteria list (simple competitions).
export default function CompetitionCriteriaPage() {
  const { eventId } = useParams()
  const [foundation, setFoundation] = useState(null)
  const [list, setList] = useState([]) // all event criteria
  const [rounds, setRounds] = useState([])
  const [selectedRoundId, setSelectedRoundId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', percentage: '', divisionId: '' })
  const [attachId, setAttachId] = useState('')
  const { error: showError } = useToast()

  const load = useCallback(() => {
    pageantService
      .getFoundation(eventId)
      .then(({ data }) => {
        const f = data.foundation
        setFoundation(f)
        setList(f.criteria ?? [])
        const rs = f.rounds ?? []
        setRounds(rs)
        setSelectedRoundId((cur) => {
          if (!rs.length) return null
          if (cur && rs.some((r) => r.id === cur)) return cur
          return rs[0].id
        })
      })
      .finally(() => setLoading(false))
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const divisionsEnabled = foundation?.event?.divisions_enabled
  const divisions = foundation?.divisions ?? []
  const scoreBounds = resolveScaleBounds(foundation?.event?.scoring_config)
  const hasRounds = rounds.length > 0

  const selectedRound = rounds.find((r) => r.id === selectedRoundId) ?? null
  const roundCriteriaIds = new Set(selectedRound?.criteriaIds ?? [])
  const roundCriteria = list.filter((c) => roundCriteriaIds.has(c.id))
  const unassigned = list.filter((c) => !roundCriteriaIds.has(c.id))

  // Total that matters: per-round when rounds exist, else flat event-wide.
  const activeCriteria = hasRounds ? roundCriteria : list
  const totalPct = activeCriteria.reduce((s, c) => s + Number(c.percentage), 0)
  const isComplete = Math.abs(totalPct - 100) < 0.1
  const previewTotalPct = totalPct + Number(form.percentage || 0)

  const handleCreate = async (e) => {
    e.preventDefault()
    const percentage = Number(form.percentage)
    if (!form.name.trim() || !Number.isFinite(percentage) || percentage <= 0) {
      showError('Enter a criteria name and a weight greater than 0')
      return
    }
    setSaving(true)
    try {
      const { data } = await pageantService.createCriteria(eventId, {
        name: form.name.trim(),
        percentage,
        minScore: scoreBounds.min,
        maxScore: scoreBounds.max,
        divisionId: hasRounds ? null : form.divisionId || null,
      })
      const created = data?.criteria ?? data
      if (hasRounds && selectedRoundId && created?.id) {
        await pageantService.addRoundCriteria(eventId, selectedRoundId, created.id)
      }
      setForm({ name: '', percentage: '', divisionId: '' })
      setLoading(true)
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add criteria')
    } finally {
      setSaving(false)
    }
  }

  const removeFromRound = async (criteriaId) => {
    try {
      await pageantService.removeRoundCriteria(eventId, selectedRoundId, criteriaId)
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to remove from round')
    }
  }

  const attachExisting = async () => {
    if (!attachId) return
    try {
      await pageantService.addRoundCriteria(eventId, selectedRoundId, attachId)
      setAttachId('')
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to attach criteria')
    }
  }

  const deleteCriterion = async (criteriaId) => {
    try {
      await pageantService.deleteCriteria(eventId, criteriaId)
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to delete criteria')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <ManagementWorkspace
      title="Criteria"
      subtitle={
        hasRounds
          ? 'Pick a round, then configure the criteria judges score in that round.'
          : 'Create the scoring items judges will use for this competition.'
      }
      headerActions={
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            isComplete
              ? 'border-v-success/30 bg-v-success-bg text-v-success'
              : 'border-v-warning/30 bg-v-warning-bg text-v-warning'
          }`}
        >
          <span className="font-medium">
            {hasRounds ? `${selectedRound?.name ?? 'Round'} total:` : 'Saved total:'}
          </span>{' '}
          {totalPct.toFixed(1)}%
          <span className="block text-xs opacity-80">
            {hasRounds ? "Each round's criteria must total 100%" : 'Must equal 100% to open scoring'}
          </span>
        </div>
      }
      formPanel={
        <>
          {/* Round selector — defines which round the criteria below belong to. */}
          {hasRounds && (
            <div className="mb-3">
              <p className="mb-1.5 text-[11px] uppercase tracking-wider text-v-text-muted">Round</p>
              <div className="flex flex-wrap gap-2">
                {rounds.map((r) => {
                  const ids = r.criteriaIds ?? []
                  const t = list
                    .filter((c) => ids.includes(c.id))
                    .reduce((s, c) => s + Number(c.percentage ?? 0), 0)
                  const ok = ids.length > 0 && Math.abs(t - 100) < 0.1
                  const active = r.id === selectedRoundId
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRoundId(r.id)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                        active
                          ? 'border-v-primary bg-v-primary/10 text-v-text'
                          : 'border-v-border text-v-text-muted hover:text-v-text'
                      }`}
                    >
                      {r.name}
                      <span className={`ml-1.5 text-[10px] ${ok ? 'text-v-success' : 'text-amber-400'}`}>
                        {ids.length ? `${t.toFixed(0)}%` : '—'}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className={HELPER_TEXT}>
                Rounds are created in <strong>Structure &amp; Scoring → Rounds</strong>. Configure each
                round&apos;s criteria here.
              </p>
            </div>
          )}

          {!hasRounds && list.length === 0 && (
            <div className="mb-3 rounded-lg border border-v-border bg-v-surface px-4 py-2.5 text-xs text-v-text-muted">
              Every criterion inherits the event <strong>score scale</strong> (currently{' '}
              <strong>
                {scoreBounds.min}–{scoreBounds.max}
              </strong>
              ). Change it in <strong>Structure &amp; Scoring → Scoring config</strong> before adding
              criteria if you want a different scale.
            </div>
          )}

          <form
            onSubmit={handleCreate}
            className={`grid gap-5 v-card p-6 mb-4 ${
              !hasRounds && divisionsEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
            }`}
          >
            <div className={!hasRounds && divisionsEnabled ? 'sm:col-span-3' : 'sm:col-span-2'}>
              <label htmlFor="criteria-name" className={LABEL_CLASS}>
                {hasRounds ? `New criterion for “${selectedRound?.name ?? ''}”` : 'Criteria name'}
              </label>
              <input
                id="criteria-name"
                className={inputClass}
                placeholder="e.g. Technique, Stage Presence"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <p className={HELPER_TEXT}>This is the label judges will see while scoring.</p>
            </div>

            <div>
              <label htmlFor="criteria-weight" className={LABEL_CLASS}>
                Weight percentage
              </label>
              <input
                id="criteria-weight"
                type="number"
                min={0}
                max={100}
                step="0.01"
                className={inputClass}
                placeholder="e.g. 40"
                value={form.percentage}
                onChange={(e) => setForm({ ...form, percentage: e.target.value })}
              />
              <p className={HELPER_TEXT}>
                {hasRounds ? 'Within this round: ' : 'After adding: '}
                {previewTotalPct.toFixed(1)}%.
              </p>
            </div>

            {!hasRounds && divisionsEnabled && (
              <div>
                <label className={LABEL_CLASS}>Division (optional)</label>
                <select
                  className={inputClass}
                  value={form.divisionId}
                  onChange={(e) => setForm({ ...form, divisionId: e.target.value })}
                >
                  <option value="">— Event-wide —</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <p className={HELPER_TEXT}>Group by division if needed.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className={`inline-flex items-center justify-center gap-2 rounded-lg bg-v-primary px-4 py-2 text-sm font-medium text-v-sidebar-active hover:bg-v-primary-hover disabled:opacity-50 ${
                !hasRounds && divisionsEnabled ? 'sm:col-span-3' : 'sm:col-span-2'
              }`}
            >
              <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              {saving ? 'Adding...' : hasRounds ? 'Add to round' : 'Add criteria'}
            </button>
          </form>

          {/* Attach an existing criterion to this round (reuse across rounds). */}
          {hasRounds && unassigned.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                className={`${inputClass} flex-1`}
                value={attachId}
                onChange={(e) => setAttachId(e.target.value)}
              >
                <option value="">Reuse an existing criterion…</option>
                {unassigned.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({Number(c.percentage).toFixed(0)}%)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={attachExisting}
                disabled={!attachId}
                className="rounded-lg border border-v-border px-3 py-2 text-sm text-v-text-muted hover:text-v-text disabled:opacity-50"
              >
                Attach
              </button>
            </div>
          )}
        </>
      }
      recordsPanel={
        <ul className="space-y-2 pb-8">
          {activeCriteria.map((c) => {
            const currentDivisionId = c.divisionId ?? c.division_id
            const divisionName = currentDivisionId
              ? divisions.find((d) => d.id === currentDivisionId)?.name
              : null
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-v-border bg-v-surface px-4 py-3"
              >
                <div className="min-w-0 flex items-start gap-3">
                  <div>
                    <p className="font-medium text-v-text">{c.name}</p>
                    <p className="mt-1 text-xs text-v-text-subtle">
                      Weight: {Number(c.percentage).toFixed(2)}% · Score range: {scoreBounds.min}–
                      {scoreBounds.max}
                    </p>
                  </div>
                  {!hasRounds && divisionsEnabled && divisionName && (
                    <span className="mt-0.5 rounded-full bg-v-primary/10 px-2 py-0.5 text-[10px] font-medium text-v-primary uppercase tracking-wide">
                      {divisionName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {hasRounds && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-v-text-muted hover:bg-v-surface-elevated"
                      onClick={() => removeFromRound(c.id)}
                      title="Remove from this round (keeps the criterion)"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
                      Remove from round
                    </button>
                  )}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-v-danger hover:bg-v-danger-bg"
                    onClick={() => deleteCriterion(c.id)}
                    title="Delete this criterion from the event"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
          {!activeCriteria.length && (
            <li className="rounded-lg border border-dashed border-v-border px-4 py-6 text-center text-sm text-v-text-subtle">
              {hasRounds
                ? `No criteria in “${selectedRound?.name ?? 'this round'}” yet. Add one above.`
                : 'No criteria yet. Add a criteria name and weight above.'}
            </li>
          )}
        </ul>
      }
    />
  )
}
