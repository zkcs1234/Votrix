import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

export default function ElectionPositionsPage() {
  const { eventId } = useParams()
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [minVote, setMinVote] = useState(1)
  const [maxVote, setMaxVote] = useState(1)
  const [allowSkip, setAllowSkip] = useState(false)

  const load = () => {
    electionService
      .listPositions(eventId)
      .then(({ data }) => setPositions(data.positions ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [eventId])

  const handleCreate = async (e) => {
    e.preventDefault()
    await electionService.createPosition(eventId, {
      name,
      minVote: Number(minVote),
      maxVote: Number(maxVote),
      allowSkip,
    })
    setName('')
    setLoading(true)
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this position and all its candidates?')) return
    await electionService.deletePosition(eventId, id)
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
      <h2 className="text-xl font-semibold text-v-text">Positions</h2>

      <form
        onSubmit={handleCreate}
        className="grid gap-4 v-card p-6 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-v-text-muted">Position name</label>
          <input
            className={`${inputClass} w-full`}
            placeholder="e.g. President"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Min votes</label>
          <input
            type="number"
            min={0}
            className={`${inputClass} w-full`}
            value={minVote}
            onChange={(e) => setMinVote(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Max votes</label>
          <input
            type="number"
            min={1}
            className={`${inputClass} w-full`}
            value={maxVote}
            onChange={(e) => setMaxVote(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-v-text-muted sm:col-span-2">
          <input type="checkbox" checked={allowSkip} onChange={(e) => setAllowSkip(e.target.checked)} />
          Allow skip (no selection)
        </label>
        <button
          type="submit"
          className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white hover:bg-v-primary-hover sm:col-span-2"
        >
          Add position
        </button>
      </form>

      <ul className="space-y-3">
        {positions.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-xl border border-v-border bg-v-surface px-4 py-3"
          >
            <div>
              <p className="font-medium text-v-text">{p.name}</p>
              <p className="text-xs text-v-text-subtle">
                Vote {p.minVote}â€“{p.maxVote}
                {p.allowSkip ? ' Â· skip allowed' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(p.id)}
              className="text-sm text-v-danger hover:text-v-danger"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
