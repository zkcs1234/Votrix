import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/hooks/useToast'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

export default function ElectionPositionsPage() {
  const { eventId } = useParams()
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [numberOfWinners, setNumberOfWinners] = useState(1)
  const [minVote, setMinVote] = useState(1)
  const [maxVote, setMaxVote] = useState(1)
  const [displayOrder, setDisplayOrder] = useState('')
  const [allowSkip, setAllowSkip] = useState(false)
  const [saving, setSaving] = useState(false)
  const { error: showError } = useToast()

  const load = () => {
    electionService
      .listPositions(eventId)
      .then(({ data }) => setPositions(data.positions ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [eventId])

  const resetForm = () => {
    setName('')
    setDescription('')
    setNumberOfWinners(1)
    setMinVote(1)
    setMaxVote(1)
    setDisplayOrder('')
    setAllowSkip(false)
  }

  const handleCreate = async (e) => {
    e.preventDefault()

    if (Number(minVote) > Number(maxVote)) {
      showError('Minimum votes cannot exceed maximum votes.')
      return
    }

    setSaving(true)
    try {
      await electionService.createPosition(eventId, {
        name,
        description: description || null,
        numberOfWinners: Number(numberOfWinners),
        minVote: Number(minVote),
        maxVote: Number(maxVote),
        displayOrder: displayOrder === '' ? undefined : Number(displayOrder),
        allowSkip,
      })
      resetForm()
      setLoading(true)
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to create position')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this position and all its candidates?')) return
    try {
      await electionService.deletePosition(eventId, id)
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to delete position')
    }
  }

  const handleMove = async (position, delta) => {
    const target = Math.max(0, (position.displayOrder ?? 0) + delta)
    try {
      await electionService.updatePosition(eventId, position.id, { displayOrder: target })
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to reorder position')
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
      <h2 className="text-xl font-semibold text-v-text">Position Builder</h2>

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

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-v-text-muted">Description</label>
          <textarea
            className={`${inputClass} w-full`}
            rows={2}
            placeholder="Optional description shown on the ballot"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Number of winners</label>
          <input
            type="number"
            min={1}
            className={`${inputClass} w-full`}
            value={numberOfWinners}
            onChange={(e) => setNumberOfWinners(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Display order</label>
          <input
            type="number"
            min={0}
            className={`${inputClass} w-full`}
            placeholder="Auto"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
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
          disabled={saving}
          className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white hover:bg-v-primary-hover disabled:opacity-50 sm:col-span-2"
        >
          {saving ? 'Adding...' : 'Add position'}
        </button>
      </form>

      <ul className="space-y-3">
        {positions.map((p, idx) => (
          <li
            key={p.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-v-border bg-v-surface px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-v-text">
                <span className="mr-2 text-v-text-subtle">#{p.displayOrder ?? idx}</span>
                {p.name}
              </p>
              {p.description && (
                <p className="mt-1 text-xs text-v-text-subtle">{p.description}</p>
              )}
              <p className="mt-1 text-xs text-v-text-subtle">
                Winners: {p.numberOfWinners ?? 1} · Vote {p.minVote}–{p.maxVote}
                {p.allowSkip ? ' · skip allowed' : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => handleMove(p, -1)}
                className="rounded-lg border border-v-border px-2 py-1 text-xs text-v-text-muted hover:border-v-border-strong"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => handleMove(p, 1)}
                className="rounded-lg border border-v-border px-2 py-1 text-xs text-v-text-muted hover:border-v-border-strong"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                className="text-sm text-v-danger hover:text-v-danger"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
