import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
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

// Score type lives on each MINOR criterion (not the criterion / event). This is
// the single source of truth for the range a judge types; the event-level
// scoring config only carries how scores COMBINE (calc method, decimals, drops).
const SCORE_TYPE_OPTIONS = [
  { value: 'range_1_100', label: '1–100' },
  { value: 'range_1_10', label: '1–10' },
  { value: 'decimal', label: 'Decimal (0–10)' },
  { value: 'custom_range', label: 'Custom range' },
]

function minorBoundsLabel(m) {
  switch (m.scoreType) {
    case 'range_1_10':
      return '1–10'
    case 'decimal':
      return '0–10'
    case 'custom_range':
      return `${m.customMin ?? '?'}–${m.customMax ?? '?'}`
    case 'range_1_100':
    default:
      return '1–100'
  }
}

// Minor criteria sit beneath a criterion. Judges score THESE. They carry no
// percentage (equal weight within the criterion) and each owns its score type.
function MinorCriteriaManager({ eventId, criterion, onChanged, showError }) {
  const minors = criterion.minorCriteria ?? []
  // A3: default the next minor's score type to the last one added on this
  // criterion, so the organizer isn't re-picking the same scale each time.
  const lastScoreType = minors.length ? minors[minors.length - 1].scoreType ?? 'range_1_100' : 'range_1_100'
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', scoreType: lastScoreType, customMin: '', customMax: '' })
  const [busy, setBusy] = useState(false)

  const openAdd = () => {
    setForm({ name: '', scoreType: lastScoreType, customMin: '', customMax: '' })
    setAdding(true)
  }

  const add = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      showError('Enter a minor criteria name')
      return
    }
    const payload = { name: form.name.trim(), scoreType: form.scoreType }
    if (form.scoreType === 'custom_range') {
      payload.customMin = Number(form.customMin)
      payload.customMax = Number(form.customMax)
      if (Number.isNaN(payload.customMin) || Number.isNaN(payload.customMax) || payload.customMax <= payload.customMin) {
        showError('Enter a valid custom range (max greater than min)')
        return
      }
    }
    setBusy(true)
    try {
      await pageantService.createMinorCriteria(eventId, criterion.id, payload)
      setForm({ name: '', scoreType: form.scoreType, customMin: '', customMax: '' })
      setAdding(false)
      onChanged()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add minor criteria')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (minorId) => {
    try {
      await pageantService.deleteMinorCriteria(eventId, criterion.id, minorId)
      onChanged()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to delete minor criteria')
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-v-border/70 bg-v-surface-elevated/40 p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-v-text-muted">
        Minor criteria — judges score these
      </p>
      {minors.length > 0 ? (
        <ul className="space-y-1.5">
          {minors.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 rounded-md border border-v-border bg-v-surface px-3 py-1.5 text-sm"
            >
              <span className="min-w-0 truncate text-v-text">{m.name}</span>
              <span className="flex items-center gap-2">
                <span className="rounded-full bg-v-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-v-primary">
                  {minorBoundsLabel(m)}
                </span>
                <button
                  type="button"
                  className="rounded p-1 text-v-danger hover:bg-v-danger-bg"
                  onClick={() => remove(m.id)}
                  title="Delete minor criterion"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-v-text-subtle">
          No minor criteria yet. Add at least one so judges can score this criterion.
        </p>
      )}

      {adding ? (
        <form onSubmit={add} className="mt-2 flex flex-wrap items-end gap-2">
          <input
            className={`${inputClass} flex-1 min-w-[10rem]`}
            placeholder="Minor criterion name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
          <select
            className={`${inputClass} w-auto`}
            value={form.scoreType}
            onChange={(e) => setForm({ ...form, scoreType: e.target.value })}
          >
            {SCORE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {form.scoreType === 'custom_range' && (
            <>
              <input
                type="number"
                className={`${inputClass} w-20`}
                placeholder="min"
                value={form.customMin}
                onChange={(e) => setForm({ ...form, customMin: e.target.value })}
              />
              <input
                type="number"
                className={`${inputClass} w-20`}
                placeholder="max"
                value={form.customMax}
                onChange={(e) => setForm({ ...form, customMax: e.target.value })}
              />
            </>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-v-primary px-3 py-2 text-sm font-medium text-v-sidebar-active hover:bg-v-primary-hover disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-v-border px-3 py-2 text-sm text-v-text-muted hover:text-v-text"
            onClick={() => setAdding(false)}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-v-border px-2.5 py-1.5 text-xs text-v-text-muted hover:text-v-text"
          onClick={openAdd}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
          Add minor criterion
        </button>
      )}
    </div>
  )
}

// Round-aware criteria editor, embedded as the workspace's Criteria tab. When the
// event has rounds, pick a round and configure the criteria that belong to it —
// each round's criteria total 100% within that round. With no rounds, it's a flat
// event-wide criteria list. Each criterion holds minor criteria; judges score the
// minor criteria and the score type lives on each.
//
// Consumes the already-loaded `foundation` and the parent's `reload` — it does not
// fetch its own data, so it stays in sync with the rest of the workspace.
export default function CriteriaManager({ eventId, foundation, reload }) {
  const list = foundation?.criteria ?? [] // all event criteria
  const rounds = foundation?.rounds ?? []
  const roundIdsKey = rounds.map((r) => r.id).join(',')

  const [selectedRoundId, setSelectedRoundId] = useState(() => rounds[0]?.id ?? null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', percentage: '', divisionId: '' })
  const [attachId, setAttachId] = useState('')
  const { error: showError } = useToast()

  // Keep the selected round valid as rounds change (added/removed elsewhere).
  useEffect(() => {
    setSelectedRoundId((cur) => {
      if (!rounds.length) return null
      if (cur && rounds.some((r) => r.id === cur)) return cur
      return rounds[0].id
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIdsKey])

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
  // §1: weight budget. Block adding once the scope is full (100%).
  const remaining = Math.max(0, 100 - totalPct)
  const isFull = remaining <= 0.01
  const scopeLabel = hasRounds ? 'this round' : 'the criteria budget'

  const handleCreate = async (e) => {
    e.preventDefault()
    const percentage = Number(form.percentage)
    if (!form.name.trim() || !Number.isFinite(percentage) || percentage <= 0) {
      showError('Enter a criteria name and a weight greater than 0')
      return
    }
    if (percentage > remaining + 0.01) {
      showError(`Only ${remaining.toFixed(2)}% left in ${scopeLabel}. Lower the weight to add this criterion.`)
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
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add criteria')
    } finally {
      setSaving(false)
    }
  }

  const removeFromRound = async (criteriaId) => {
    try {
      await pageantService.removeRoundCriteria(eventId, selectedRoundId, criteriaId)
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to remove from round')
    }
  }

  const attachExisting = async () => {
    if (!attachId) return
    const picked = list.find((c) => c.id === attachId)
    if (picked && Number(picked.percentage) > remaining + 0.01) {
      showError(
        `Attaching “${picked.name}” (${Number(picked.percentage).toFixed(0)}%) would exceed 100% — only ${remaining.toFixed(2)}% left in ${scopeLabel}.`,
      )
      return
    }
    try {
      await pageantService.addRoundCriteria(eventId, selectedRoundId, attachId)
      setAttachId('')
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to attach criteria')
    }
  }

  const deleteCriterion = async (criteriaId) => {
    try {
      await pageantService.deleteCriteria(eventId, criteriaId)
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to delete criteria')
    }
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
                Rounds are created in the <strong>Rounds</strong> tab. Configure each round&apos;s
                criteria here.
              </p>
            </div>
          )}

          {list.length === 0 && (
            <div className="mb-3 rounded-lg border border-v-border bg-v-surface px-4 py-2.5 text-xs text-v-text-muted">
              Add a criterion with its <strong>weight %</strong>, then add{' '}
              <strong>minor criteria</strong> beneath it — judges score the minor criteria, and each
              one carries its own <strong>score type</strong> (1–100, 1–10, …). The criterion&apos;s
              score is the average of its minor criteria.
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
                max={remaining || 100}
                step="0.01"
                className={inputClass}
                placeholder="e.g. 40"
                value={form.percentage}
                onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                disabled={isFull}
              />
              <p className={HELPER_TEXT}>
                {isFull
                  ? `${scopeLabel[0].toUpperCase()}${scopeLabel.slice(1)} is full (100%).`
                  : `${hasRounds ? 'Within this round: ' : 'After adding: '}${previewTotalPct.toFixed(1)}% · ${remaining.toFixed(1)}% left.`}
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
              disabled={saving || isFull}
              title={isFull ? `${scopeLabel[0].toUpperCase()}${scopeLabel.slice(1)} already totals 100%` : undefined}
              className={`inline-flex items-center justify-center gap-2 rounded-lg bg-v-primary px-4 py-2 text-sm font-medium text-v-sidebar-active hover:bg-v-primary-hover disabled:opacity-50 ${
                !hasRounds && divisionsEnabled ? 'sm:col-span-3' : 'sm:col-span-2'
              }`}
            >
              <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              {saving ? 'Adding...' : isFull ? 'Full (100%)' : hasRounds ? 'Add to round' : 'Add criteria'}
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
                className="rounded-xl border border-v-border bg-v-surface px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    <div>
                      <p className="font-medium text-v-text">{c.name}</p>
                      <p className="mt-1 text-xs text-v-text-subtle">
                        Weight: {Number(c.percentage).toFixed(2)}%
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
                </div>
                <MinorCriteriaManager
                  eventId={eventId}
                  criterion={c}
                  onChanged={reload}
                  showError={showError}
                />
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
