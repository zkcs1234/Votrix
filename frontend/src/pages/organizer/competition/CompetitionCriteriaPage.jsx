import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/hooks/useToast'
import ManagementWorkspace from '@/components/ui/ManagementWorkspace'
import { HELPER_TEXT, INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'

const inputClass = `${INPUT_CLASS} w-full`

export default function CompetitionCriteriaPage() {
  const { eventId } = useParams()
  const [list, setList] = useState([])
  const [foundation, setFoundation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', percentage: 33.33, minScore: 0, maxScore: 100, divisionId: '' })
  const { error: showError } = useToast()

  const load = useCallback(() => {
    pageantService
      .getFoundation(eventId)
      .then(({ data }) => {
        setFoundation(data.foundation)
        setList(data.foundation.criteria ?? [])
      })
      .finally(() => setLoading(false))
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const divisionsEnabled = foundation?.event?.divisions_enabled
  const divisions = foundation?.divisions ?? []

  const totalPct = list.reduce((s, c) => s + Number(c.percentage), 0)
  const previewTotalPct = totalPct + Number(form.percentage || 0)
  const isReadyForScoring = Math.abs(totalPct - 100) < 0.1

  const handleCreate = async (e) => {
    e.preventDefault()

    if (Number(form.minScore) > Number(form.maxScore)) {
      showError('Minimum score cannot be higher than maximum score.')
      return
    }

    setSaving(true)
    try {
      await pageantService.createCriteria(eventId, {
        ...form,
        percentage: Number(form.percentage),
        minScore: Number(form.minScore),
        maxScore: Number(form.maxScore),
        divisionId: form.divisionId || null,
      })
      setForm({ name: '', percentage: 0, minScore: 0, maxScore: 100, divisionId: '' })
      setLoading(true)
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add criteria')
    } finally {
      setSaving(false)
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
      subtitle="Create the scoring items judges will use for this competition."
      headerActions={
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            isReadyForScoring
              ? 'border-v-success/30 bg-v-success-bg text-v-success'
              : 'border-v-warning/30 bg-v-warning-bg text-v-warning'
          }`}
        >
          <span className="font-medium">Saved total:</span> {totalPct.toFixed(1)}%
          <span className="block text-xs opacity-80">Must equal 100% to open scoring</span>
        </div>
      }
      formPanel={
        <form onSubmit={handleCreate} className={`grid gap-5 v-card p-6 mb-4 ${divisionsEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <div className={divisionsEnabled ? 'sm:col-span-3' : 'sm:col-span-2'}>
          <label htmlFor="criteria-name" className={LABEL_CLASS}>
            Criteria name
          </label>
          <input
            id="criteria-name"
            className={inputClass}
            placeholder="e.g. Beauty, Talent, Stage Presence"
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
            placeholder="e.g. 25"
            value={form.percentage}
            onChange={(e) => setForm({ ...form, percentage: e.target.value })}
          />
          <p className={HELPER_TEXT}>
            After adding: {previewTotalPct.toFixed(1)}%.
          </p>
        </div>

        <div>
          <label htmlFor="criteria-min-score" className={LABEL_CLASS}>
            Score range
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
                id="criteria-min-score"
                type="number"
                min={0}
                className={inputClass}
                placeholder="Min"
                aria-label="Minimum score"
                value={form.minScore}
                onChange={(e) => setForm({ ...form, minScore: e.target.value })}
              />
              <p className={HELPER_TEXT}>Lowest</p>
            </div>
            <div>
              <input
                type="number"
                min={0}
                className={inputClass}
                placeholder="Max"
                aria-label="Maximum score"
                value={form.maxScore}
                onChange={(e) => setForm({ ...form, maxScore: e.target.value })}
              />
              <p className={HELPER_TEXT}>Highest</p>
            </div>
          </div>
        </div>

        {divisionsEnabled && (
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
          className={`inline-flex items-center justify-center gap-2 rounded-lg bg-v-primary px-4 py-2 text-sm font-medium text-v-sidebar-active hover:bg-v-primary-hover disabled:opacity-50 ${divisionsEnabled ? 'sm:col-span-3' : 'sm:col-span-2'}`}
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          {saving ? 'Adding...' : 'Add criteria'}
        </button>
      </form>
      }
      recordsPanel={
        <ul className="space-y-2 pb-8">
          {list.map((c) => {
          const currentDivisionId = c.divisionId ?? c.division_id
          const divisionName = currentDivisionId ? divisions.find(d => d.id === currentDivisionId)?.name : null

          return (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-v-border bg-v-surface px-4 py-3"
            >
              <div className="min-w-0 flex items-start gap-3">
                <div>
                  <p className="font-medium text-v-text">{c.name}</p>
                  <p className="mt-1 text-xs text-v-text-subtle">
                    Weight: {Number(c.percentage).toFixed(2)}% | Score range: {c.minScore} to {c.maxScore}
                  </p>
                </div>
                {divisionsEnabled && divisionName && (
                  <span className="mt-0.5 rounded-full bg-v-primary/10 px-2 py-0.5 text-[10px] font-medium text-v-primary uppercase tracking-wide">
                    {divisionName}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-v-danger hover:bg-v-danger-bg"
                onClick={async () => {
                  await pageantService.deleteCriteria(eventId, c.id)
                  load()
                }}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                Delete
              </button>
            </li>
          )
        })}
        {!list.length && (
          <li className="rounded-lg border border-dashed border-v-border px-4 py-6 text-center text-sm text-v-text-subtle">
            No criteria yet. Add a criteria name, weight, and score range above.
          </li>
        )}
      </ul>
      }
    />
  )
}
