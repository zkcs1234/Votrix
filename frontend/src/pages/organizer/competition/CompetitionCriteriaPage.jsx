import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/hooks/useToast'
import { HELPER_TEXT, INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'

const inputClass = `${INPUT_CLASS} w-full`

export default function CompetitionCriteriaPage() {
  const { eventId } = useParams()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', percentage: 33.33, minScore: 0, maxScore: 100 })
  const { error: showError } = useToast()

  const load = useCallback(() => {
    pageantService
      .listCriteria(eventId)
      .then(({ data }) => setList(data.criteria ?? []))
      .finally(() => setLoading(false))
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

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
      })
      setForm({ name: '', percentage: 0, minScore: 0, maxScore: 100 })
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-v-text">Criteria</h2>
          <p className="mt-1 text-sm text-v-text-subtle">
            Create the scoring items judges will use for this competition.
          </p>
        </div>
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
      </div>

      <form onSubmit={handleCreate} className="grid gap-5 v-card p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
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
            How much this counts toward the final score. After adding: {previewTotalPct.toFixed(1)}%.
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
          <p className={HELPER_TEXT}>Most competitions use 0 to 100.</p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-v-primary px-4 py-2 text-sm font-medium text-v-sidebar-active hover:bg-v-primary-hover disabled:opacity-50 sm:col-span-2"
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          {saving ? 'Adding...' : 'Add criteria'}
        </button>
      </form>

      <ul className="space-y-2">
        {list.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-v-border bg-v-surface px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium text-v-text">{c.name}</p>
              <p className="mt-1 text-xs text-v-text-subtle">
                Weight: {Number(c.percentage).toFixed(2)}% | Score range: {c.minScore} to {c.maxScore}
              </p>
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
        ))}
        {!list.length && (
          <li className="rounded-lg border border-dashed border-v-border px-4 py-6 text-center text-sm text-v-text-subtle">
            No criteria yet. Add a criteria name, weight, and score range above.
          </li>
        )}
      </ul>
    </div>
  )
}
