import { workflowService } from '@/services/competition-workflow.service'
import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import { useToast } from '@/hooks/useToast'
import ManagementWorkspace from '@/components/ui/ManagementWorkspace'
import { HELPER_TEXT, INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'
// §8C: the score range is owned by the event scale (scoring_config.scoreType),
// not per-criterion, and each minor criterion carries its own score type. Both
// live in the shared helper so this editor and the organizer previews agree.
import { resolveScaleBounds, minorScoreLabel } from '@/utils/scoreScale'
import CriteriaProgress, { CriteriaCompletion } from './CriteriaProgress'
import { CRITERIA_WEIGHT_TOLERANCE, isCriteriaActive } from '../../../../../shared/competition-criteria-readiness.js'

const inputClass = `${INPUT_CLASS} w-full`

// Score type lives on each MINOR criterion (not the criterion / event). This is
// the single source of truth for the range a judge types; the event-level
// scoring config only carries how scores COMBINE (calc method, decimals, drops).
const SCORE_TYPE_OPTIONS = [
  { value: 'range_1_100', label: '1–100' },
  { value: 'range_1_10', label: '1–10' },
  { value: 'decimal', label: 'Decimal (0–10)' },
  { value: 'custom_range', label: 'Custom range' },
]

// Minor criteria sit beneath a criterion. Judges score THESE. They carry no
// percentage (equal weight within the criterion) and each owns its score type.
function MinorCriteriaManager({ eventId, criterion, mutate, showError }) {
  const minors = criterion.minorCriteria ?? []
  // A3: default the next minor's score type to the last one added on this
  // criterion, so the organizer isn't re-picking the same scale each time.
  const lastScoreType = minors.length ? minors[minors.length - 1].scoreType ?? 'range_1_100' : 'range_1_100'
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', scoreType: lastScoreType, customMin: '', customMax: '' })
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const openAdd = () => {
    setEditingId(null)
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
      if (!form.customMin.trim() || !form.customMax.trim() || !Number.isFinite(payload.customMin) || !Number.isFinite(payload.customMax) || payload.customMax <= payload.customMin || payload.customMax <= 0) {
        showError('Enter a valid custom range (max greater than min)')
        return
      }
    }
    setBusy(true)
    try {
      const saved = await mutate(() => editingId ? pageantService.updateMinorCriteria(eventId, criterion.id, editingId, payload) : pageantService.createMinorCriteria(eventId, criterion.id, payload), criterion.id)
      if (!saved) return
      setForm({ name: '', scoreType: form.scoreType, customMin: '', customMax: '' })
      setAdding(false)
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add minor criteria')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (minorId) => {
    await mutate(() => pageantService.deleteMinorCriteria(eventId, criterion.id, minorId), criterion.id)
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
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-v-border bg-v-surface px-3 py-1.5 text-sm"
            >
              <span className="min-w-0 break-words text-v-text">{m.name}</span>
              <button type="button" aria-label={`${isCriteriaActive(m) ? 'Disable' : 'Enable'} ${m.name}`} className="v-caption underline" onClick={() => mutate(() => pageantService.updateMinorCriteria(eventId, criterion.id, m.id, { isActive: !isCriteriaActive(m) }), criterion.id)}>{isCriteriaActive(m) ? 'Enabled' : 'Disabled'}</button>
              <button type="button" className="v-caption" onClick={() => mutate(() => pageantService.updateMinorCriteria(eventId, criterion.id, m.id, { displayOrder: Math.max(0, (m.displayOrder ?? 0) - 1) }), criterion.id)}>Earlier</button>
              <button type="button" aria-label={`Edit ${m.name}`} className="v-caption underline" onClick={() => { setEditingId(m.id); setForm({ name: m.name, scoreType: m.scoreType ?? 'range_1_100', customMin: m.customMin == null ? '' : String(m.customMin), customMax: m.customMax == null ? '' : String(m.customMax) }); setAdding(true) }}>Edit</button>
              <span className="flex items-center gap-2">
                <span className="rounded-full bg-v-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-v-primary">
                  {minorScoreLabel(m, { placeholder: '?' })}
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
          No minor criteria yet. Judges use the major criterion&apos;s saved score range, or you can add minor criteria.
        </p>
      )}

      {adding ? (
        <form onSubmit={add} className="mt-2 flex flex-wrap items-end gap-2">
          <input
            className={`${inputClass} flex-1 min-w-[10rem]`}
            placeholder="Minor criterion name"
            aria-label="Minor criterion name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
          <select
            className={`${inputClass} w-auto`}
            aria-label="Minor score type"
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
                aria-label="Minimum score"
                value={form.customMin}
                onChange={(e) => setForm({ ...form, customMin: e.target.value })}
              />
              <input
                type="number"
                className={`${inputClass} w-20`}
                placeholder="max"
                aria-label="Maximum score"
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
            {busy ? 'Saving…' : editingId ? 'Save minor' : 'Add'}
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
export default function CriteriaManager({ eventId, foundation, initialRoundId = null, onRoundChange, progress, saveCriteria, saveState, recoverSave, readOnly = false }) {
  const list = foundation?.criteria ?? [] // all event criteria
  const rounds = [...(foundation?.rounds ?? [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
  const editorTop = useRef(null)
  const roundIdsKey = rounds.map((r) => r.id).join(',')

  const [selectedRoundId, setSelectedRoundId] = useState(() => rounds.find(round => round.id === initialRoundId)?.id ?? rounds[0]?.id ?? null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', percentage: '', divisionId: '' })
  const [attachId, setAttachId] = useState('')
  const { error: showError } = useToast()

  // Keep the selected round valid as rounds change (added/removed elsewhere).
  useEffect(() => {
    setSelectedRoundId((cur) => {
      if (!rounds.length) return null
      if (initialRoundId && rounds.some(round => round.id === initialRoundId)) return initialRoundId
      if (cur && rounds.some((r) => r.id === cur)) return cur
      return rounds[0].id
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIdsKey, initialRoundId])

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
  const currentProgress = progress.scopes.find(scope => scope.roundId === selectedRoundId) ?? progress.scopes[0]
  const totalPct = currentProgress.total
  const previewTotalPct = totalPct + Number(form.percentage || 0)
  // §1: weight budget. Block adding once the scope is full (100%).
  const remaining = Math.max(0, 100 - totalPct)
  const isFull = remaining <= CRITERIA_WEIGHT_TOLERANCE
  const scopeLabel = hasRounds ? 'this round' : 'the criteria budget'

  const selectRound = roundId => {
    setSelectedRoundId(roundId)
    setAttachId('')
    onRoundChange?.(roundId)
    editorTop.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }
  const mutate = async (operation, criterionId = null) => {
    const affected = hasRounds ? criterionId ? rounds.filter(r => r.criteriaIds?.includes(criterionId)).map(r => r.id) : [selectedRoundId] : [null]
    try { await saveCriteria(operation, affected); return true }
    catch (error) { showError(error.response?.data?.message || error.message || 'Could not save criteria.'); return false }
  }
  const handleCreate = async e => {
    e.preventDefault()
    const percentage = Number(form.percentage)
    if (!form.name.trim() || !Number.isFinite(percentage) || percentage <= 0) { showError('Enter a criteria name and a weight greater than 0'); return }
    if (percentage > remaining + CRITERIA_WEIGHT_TOLERANCE) { showError(`Only ${remaining.toFixed(2)}% left in ${scopeLabel}. Lower the weight to add this criterion.`); return }
    setSaving(true)
    const create = hasRounds && selectedRoundId ? payload => workflowService.createRoundCriterion(eventId, selectedRoundId, payload) : payload => pageantService.createCriteria(eventId, payload)
    if (await mutate(() => create({ name: form.name.trim(), percentage, minScore: scoreBounds.min, maxScore: scoreBounds.max, divisionId: hasRounds ? null : form.divisionId || null }))) setForm({ name: '', percentage: '', divisionId: '' })
    setSaving(false)
  }
  const removeFromRound = criteriaId => mutate(() => pageantService.removeRoundCriteria(eventId, selectedRoundId, criteriaId), criteriaId)
  const attachExisting = async () => {
    if (!attachId) return
    const picked = list.find(c => c.id === attachId)
    if (picked && isCriteriaActive(picked) && Number(picked.percentage) > remaining + CRITERIA_WEIGHT_TOLERANCE) { showError(`Only ${remaining.toFixed(2)}% left in ${scopeLabel}. Lower the weight before attaching this criterion.`); return }
    if (await mutate(() => pageantService.addRoundCriteria(eventId, selectedRoundId, attachId))) setAttachId('')
  }
  const deleteCriterion = criteriaId => mutate(() => pageantService.deleteCriteria(eventId, criteriaId), criteriaId)
  const editMajor = async criterion => {
    const name = window.prompt('Major criterion name', criterion.name)
    if (!name) return
    const weight = window.prompt('Major contribution percentage', String(criterion.percentage))
    if (weight === null) return
    const percentage = Number(weight)
    if (!weight.trim() || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) { showError('Enter a weight greater than 0 and no more than 100%.'); return }
    await mutate(() => pageantService.updateCriteria(eventId, criterion.id, { name, percentage }), criterion.id)
  }
  const editingBlocked = readOnly || saveState.pending || Boolean(saveState.error)

  return (
    <div ref={editorTop} className="v-rounds min-w-0 space-y-5 scroll-mt-5">
      <CriteriaProgress progress={progress} selectedRoundId={selectedRoundId} onSelect={selectRound} />
      <p className="text-sm text-v-text-muted">Currently configuring: <strong className="text-v-text">{currentProgress.name}</strong></p>
      {saveState.error && <div role="alert" className="space-y-2 rounded-lg border border-v-warning/30 bg-v-warning-bg p-3 text-sm text-v-text">
        <p>{saveState.phase === 'reload' ? 'Your change was saved, but the current configuration could not be confirmed.' : 'Your change could not be saved. Your entries are preserved. Use saved configuration before trying again.'} {saveState.error}</p>
        <button type="button" disabled={saveState.pending} onClick={recoverSave} className="min-h-9 underline underline-offset-2">{saveState.phase === 'reload' ? 'Reload saved criteria' : 'Use saved configuration'}</button>
      </div>}
      <fieldset disabled={editingBlocked} className="min-w-0">
      <ManagementWorkspace
      formWidthClass="lg:grid-cols-[minmax(0,40fr)_minmax(0,60fr)]"
      formPanel={
        <>
          <h3 className="mb-3 text-sm font-semibold text-v-text">Add Major Criterion</h3>
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
        <div className="min-w-0"><h3 className="mb-3 text-sm font-semibold text-v-text">Existing Criteria</h3><ul className="space-y-2">
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
                      <p className="break-words font-medium text-v-text">{c.name}</p>
                      <div className="flex gap-2">
                        <button type="button" aria-label={`${isCriteriaActive(c) ? 'Disable' : 'Enable'} ${c.name}`} className="v-caption underline" onClick={() => mutate(() => pageantService.updateCriteria(eventId, c.id, { isActive: !isCriteriaActive(c) }), c.id)}>{isCriteriaActive(c) ? 'Disable' : 'Enable'}</button>
                        <button type="button" aria-label={`Edit major ${c.name}`} className="v-caption underline" onClick={() => editMajor(c)}>Edit major</button>
                      </div>
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
                  mutate={mutate}
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
        </ul></div>
      }
    />
    </fieldset>
    <CriteriaCompletion progress={progress} selectedRoundId={selectedRoundId} onSelect={selectRound} pending={saveState.pending} />
    </div>
  )
}
