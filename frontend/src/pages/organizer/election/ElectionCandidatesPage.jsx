import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import { Skeleton, SkeletonGrid } from '@/components/ui/Skeleton'
import ImageUploadField from '@/components/upload/ImageUploadField'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

function CandidateCard({ candidate, positionName, onDelete }) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Delete candidate?')) return
    setDeleting(true)
    try {
      await onDelete(candidate.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-xl border border-v-border bg-v-surface p-4">
      {candidate.photo && (
        <img
          src={candidate.photo}
          alt=""
          className="mb-3 h-32 w-full rounded-lg object-cover"
        />
      )}
      <p className="font-medium text-v-text">{candidate.name}</p>
      <p className="text-xs text-v-text-muted">{positionName}</p>
      {candidate.partylist && (
        <p className="mt-1 text-sm text-v-text-subtle">{candidate.partylist}</p>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="mt-3 text-sm text-v-danger disabled:opacity-50"
      >
        {deleting ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  )
}

function CandidateFormSkeleton() {
  return (
    <div className="space-y-4 v-card p-6">
      <div className="space-y-2">
        <div className="h-4 w-20 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-v-surface-elevated" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-v-surface-elevated" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-20 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-v-surface-elevated" />
      </div>
      <div className="h-10 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
    </div>
  )
}

export default function ElectionCandidatesPage() {
  const { eventId } = useParams()
  const [positions, setPositions] = useState([])
  const [candidates, setCandidates] = useState([])
  const [positionId, setPositionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', description: '', partylist: '' })
  const [photoFile, setPhotoFile] = useState(null)
  const [saving, setSaving] = useState(false)

  // Use delayed loading
  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [posRes, candRes] = await Promise.all([
        electionService.listPositions(eventId),
        electionService.listCandidates(eventId),
      ])
      setPositions(posRes.data.positions ?? [])
      setCandidates(candRes.data.candidates ?? [])
    } catch (err) {
      console.error('Failed to load candidates:', err)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  // Optimistic UI - add candidate immediately
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!positionId) return

    setSaving(true)

    // Optimistically add to list
    const tempId = `temp-${Date.now()}`
    const newCandidate = {
      id: tempId,
      name: form.name,
      description: form.description,
      partylist: form.partylist,
      positionId,
      photo: null,
    }
    setCandidates((prev) => [...prev, newCandidate])

    try {
      const { data } = await electionService.createCandidate(eventId, positionId, form)

      // Replace temp with real data
      if (photoFile) {
        await electionService.uploadCandidatePhoto(eventId, data.candidate.id, photoFile)
      }

      // Refresh to get updated data
      load()

      setForm({ name: '', description: '', partylist: '' })
      setPhotoFile(null)
    } catch (err) {
      // Rollback on error
      setCandidates((prev) => prev.filter((c) => c.id !== tempId))
      console.error('Failed to create candidate:', err)
    } finally {
      setSaving(false)
    }
  }

  // Optimistic UI - delete immediately
  const handleDelete = async (id) => {
    const previousCandidates = [...candidates]

    // Optimistically remove
    setCandidates((prev) => prev.filter((c) => c.id !== id))

    try {
      await electionService.deleteCandidate(eventId, id)
    } catch (err) {
      // Rollback on error
      setCandidates(previousCandidates)
      console.error('Failed to delete candidate:', err)
    }
  }

  const positionName = (id) => positions.find((p) => p.id === id)?.name ?? '—'

  // Show nothing under 300ms
  if (loading && !showLoader) {
    return null
  }

  // Show skeleton after 300ms
  if (loading || showLoader) {
    return (
      <div className="space-y-8">
        <div className="h-7 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
        <CandidateFormSkeleton />
        <SkeletonGrid count={6} />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-v-text">Candidates</h2>

      <form onSubmit={handleCreate} className="space-y-4 v-card p-6">
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Position</label>
          <select
            className={inputClass}
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            required
          >
            <option value="">Select position</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Name</label>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Partylist</label>
          <input
            className={inputClass}
            value={form.partylist}
            onChange={(e) => setForm({ ...form, partylist: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Description</label>
          <textarea
            className={inputClass}
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <ImageUploadField
          label="Candidate photo"
          variant="photo"
          onFileSelect={setPhotoFile}
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-v-primary px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? 'Adding...' : 'Add candidate'}
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        {candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            positionName={positionName(c.positionId)}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {!candidates.length && (
        <p className="text-center text-v-text-subtle">No candidates yet.</p>
      )}
    </div>
  )
}