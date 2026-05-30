import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { INPUT_CLASS } from '@/utils/uiClasses'

const inputClass = `${INPUT_CLASS} w-full`

export default function PageantCriteriaPage() {
  const { eventId } = useParams()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', percentage: 33.33, minScore: 0, maxScore: 100 })

  const load = () => {
    pageantService
      .listCriteria(eventId)
      .then(({ data }) => setList(data.criteria ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [eventId])

  const totalPct = list.reduce((s, c) => s + c.percentage, 0)

  const handleCreate = async (e) => {
    e.preventDefault()
    await pageantService.createCriteria(eventId, form)
    setForm({ name: '', percentage: 0, minScore: 0, maxScore: 100 })
    setLoading(true)
    load()
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-v-text">Criteria</h2>
        <p className={`text-sm ${Math.abs(totalPct - 100) < 0.1 ? 'text-v-success' : 'text-amber-400'}`}>
          Total: {totalPct.toFixed(1)}% (must equal 100% to open scoring)
        </p>
      </div>

      <form onSubmit={handleCreate} className="grid gap-4 v-card p-6 sm:grid-cols-2">
        <input className={inputClass} placeholder="e.g. Beauty" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input type="number" step="0.01" className={inputClass} placeholder="%" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: Number(e.target.value) })} />
        <input type="number" className={inputClass} placeholder="Min score" value={form.minScore} onChange={(e) => setForm({ ...form, minScore: Number(e.target.value) })} />
        <input type="number" className={inputClass} placeholder="Max score" value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: Number(e.target.value) })} />
        <button type="submit" className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white sm:col-span-2">
          Add criteria
        </button>
      </form>

      <ul className="space-y-2">
        {list.map((c) => (
          <li key={c.id} className="flex justify-between rounded-xl border border-v-border px-4 py-3">
            <span className="text-white">
              {c.name} â€” {c.percentage}% (score {c.minScore}â€“{c.maxScore})
            </span>
            <button
              type="button"
              className="text-v-danger text-sm"
              onClick={async () => {
                await pageantService.deleteCriteria(eventId, c.id)
                load()
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
